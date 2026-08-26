#!/usr/bin/env node
// TEC-20 — the performance baseline #405-F has to prove itself against.
//
// WHY A BASELINE COMES FIRST. Moving geometry to a CDN is only worth doing if the
// numbers move, and "it feels faster" is not a number. Without a recorded before,
// the after is a claim. So this exists before the CDN work rather than alongside it.
//
// WHAT IT MEASURES, AND WHY THESE THINGS
//
// BYTES ON THE WIRE, from the Chrome DevTools Protocol (`encodedDataLength`), not
// from `performance.getEntriesByType("resource").transferSize`. The Resource Timing
// number is zeroed for a cross-origin response that does not send
// Timing-Allow-Origin — which is exactly what an R2 bucket will be. Measuring the
// before with an instrument that reads 0 for the after would have produced a
// spectacular and completely fake improvement. CDP reports the real transfer for
// every origin.
//
// TIME TO THE GEOMETRY LANDING, per asset. The atlas fetches districts.geojson
// (825 KB) and states.geojson (377 KB) on mount, and that is the payload #405-F is
// about. Page-level `load` is recorded too, but it is the noisier signal and the
// per-asset one is the honest comparison.
//
// A SPREAD, NOT A SINGLE RUN. Every route is measured N times (default 3) with a
// cold context each time, and the report carries median AND min/max. A single
// number invites reading a 40 ms difference as an improvement when the run-to-run
// spread is 200 ms.
//
// FAIL CLOSED. If a route does not return a 2xx document, or fewer than two runs
// completed, this writes NOTHING and exits 1. A baseline with a hole in it is worse
// than no baseline: the hole becomes the thing the after is compared against.
//
//   node scripts/perf-baseline.mjs --base-url http://127.0.0.1:8630 --runs 3 \
//        --label "pre-405F" --out planning/perf-baseline-2026-08-27.json
//
// Point --base-url at a scratch instance (scripts/test-isolated.sh prints one) for a
// deterministic origin measurement, or at the public site to include the tunnel.
// Compare like with like: a baseline taken against localhost cannot be compared to
// an after taken over the network.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE_URL = arg("base-url", "http://127.0.0.1:8630").replace(/\/$/, "");
const RUNS = Number(arg("runs", "3"));
const LABEL = arg("label", "baseline");
const OUT = arg("out", "");

/** The routes that carry the weight. `/` is the atlas and the reason this file
 *  exists; the rest are the heaviest of what a reader actually opens. Kept in step
 *  with the route list tests/a11y.spec.ts scans, so the two agree on what "every
 *  page" means. */
const ROUTES = (arg("routes", "") || [
  "/",
  "/metric",
  "/metric/literacy_rate",
  "/family",
  "/family/religion",
  "/coverage",
].join(",")).split(",");

if (!Number.isFinite(RUNS) || RUNS < 2) {
  console.error(`perf-baseline: --runs must be at least 2 (got ${arg("runs", "3")}) — one run cannot show a spread, and a number without a spread cannot be compared`);
  process.exit(1);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const kb = (n) => Math.round(n / 102.4) / 10;

/** One cold load of one route. Returns bytes by origin/type, per-asset rows, and
 *  navigation timings. Throws on a non-2xx document, which fails the whole run. */
async function measure(browser, route) {
  const context = await browser.newContext();

  // The analytics BEACON is blocked; the analytics SCRIPT is not.
  //
  // Measuring against the live container means these page loads are real page loads,
  // and Umami would count every one of them. To-do #433 is waiting on a clean
  // four-week baseline, and a perf run that quietly inflates it would corrupt the
  // measurement another to-do depends on. Only POSTs to /stats/api/send are dropped,
  // so /stats/script.js is still fetched and still counted in the byte totals — the
  // payload stays representative, the numbers stay uncontaminated.
  await context.route("**/stats/api/send", (route) => route.abort());

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  const byRequestId = new Map();
  const finished = [];
  cdp.on("Network.requestWillBeSent", (e) => {
    byRequestId.set(e.requestId, { url: e.request.url, type: e.type });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = byRequestId.get(e.requestId);
    if (r) {
      r.status = e.response.status;
      r.mimeType = e.response.mimeType;
      r.encoding = e.response.headers?.["content-encoding"] ?? e.response.headers?.["Content-Encoding"] ?? "identity";
      r.fromCache = e.response.fromDiskCache === true;
    }
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = byRequestId.get(e.requestId);
    if (r) finished.push({ ...r, bytes: e.encodedDataLength });
  });

  const started = Date.now();
  const response = await page.goto(BASE_URL + route, { waitUntil: "load", timeout: 60_000 });
  const status = response?.status() ?? 0;
  if (status < 200 || status >= 300) {
    await context.close();
    throw new Error(`${route} returned ${status} — refusing to record a baseline over a broken route`);
  }

  // Settle, so the geometry the atlas fetches on mount is counted. networkidle is
  // capped rather than trusted: if it never settles the run still reports, and the
  // spread across runs is what says whether that mattered.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  const wall = Date.now() - started;

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    if (!n) return null;
    return {
      ttfb_ms: Math.round(n.responseStart),
      dom_content_loaded_ms: Math.round(n.domContentLoadedEventEnd),
      load_ms: Math.round(n.loadEventEnd),
    };
  });

  await context.close();

  const total = finished.reduce((a, r) => a + (r.bytes || 0), 0);
  // BOTH URL SHAPES, and this is a scar. The geometry moved from the static /geo/*
  // path to the negotiating /geodata/* route in the same iteration this harness was
  // written, and a filter that knew only about /geo/ reported the "after" run as
  // 0 KB of geometry — a 288 KB column silently reading zero, which would have been
  // read as the CDN work having removed the geometry entirely. A measurement that
  // stops measuring is worse than no measurement, because it still prints a number.
  const geo = finished.filter((r) => /\/geo(data)?\//.test(r.url));
  const byType = {};
  for (const r of finished) byType[r.type || "other"] = (byType[r.type || "other"] || 0) + (r.bytes || 0);

  return {
    wall_ms: wall,
    nav,
    requests: finished.length,
    total_bytes: total,
    geo_bytes: geo.reduce((a, r) => a + (r.bytes || 0), 0),
    by_type: byType,
    assets: finished
      .filter((r) => (r.bytes || 0) > 20_000)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 12)
      .map((r) => ({ url: r.url.replace(BASE_URL, ""), bytes: r.bytes, encoding: r.encoding, type: r.type })),
  };
}

const browser = await chromium.launch();
const results = {};
let failed = null;

for (const route of ROUTES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      runs.push(await measure(browser, route));
    } catch (err) {
      failed = `${route}: ${err.message}`;
      break;
    }
  }
  if (failed) break;
  results[route] = {
    runs: runs.length,
    total_bytes: {
      median: median(runs.map((r) => r.total_bytes)),
      min: Math.min(...runs.map((r) => r.total_bytes)),
      max: Math.max(...runs.map((r) => r.total_bytes)),
    },
    geo_bytes: {
      median: median(runs.map((r) => r.geo_bytes)),
      min: Math.min(...runs.map((r) => r.geo_bytes)),
      max: Math.max(...runs.map((r) => r.geo_bytes)),
    },
    ttfb_ms: { median: median(runs.map((r) => r.nav?.ttfb_ms ?? 0)) },
    load_ms: {
      median: median(runs.map((r) => r.nav?.load_ms ?? 0)),
      min: Math.min(...runs.map((r) => r.nav?.load_ms ?? 0)),
      max: Math.max(...runs.map((r) => r.nav?.load_ms ?? 0)),
    },
    wall_ms: {
      median: median(runs.map((r) => r.wall_ms)),
      min: Math.min(...runs.map((r) => r.wall_ms)),
      max: Math.max(...runs.map((r) => r.wall_ms)),
    },
    requests: median(runs.map((r) => r.requests)),
    by_type: runs[runs.length - 1].by_type,
    heaviest: runs[runs.length - 1].assets,
  };
}

await browser.close();

if (failed) {
  console.error(`perf-baseline: ${failed}`);
  console.error("perf-baseline: nothing written — a baseline with a hole in it becomes the hole the after is compared against");
  process.exit(1);
}

const report = {
  label: LABEL,
  measured_at: new Date().toISOString(),
  base_url: BASE_URL,
  runs_per_route: RUNS,
  node: process.version,
  routes: results,
};

console.log(`perf-baseline: ${LABEL} against ${BASE_URL}, ${RUNS} cold runs per route\n`);
console.log("  route                     total KB (min-max)      geo KB    TTFB   load ms (min-max)   reqs");
for (const [route, r] of Object.entries(results)) {
  console.log(
    `  ${route.padEnd(24)}  ${String(kb(r.total_bytes.median)).padStart(7)} (${kb(r.total_bytes.min)}-${kb(r.total_bytes.max)})`.padEnd(60) +
      `${String(kb(r.geo_bytes.median)).padStart(7)}  ${String(r.ttfb_ms.median).padStart(5)}  ${String(r.load_ms.median).padStart(6)} (${r.load_ms.min}-${r.load_ms.max})`.padEnd(40) +
      `  ${r.requests}`
  );
}

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nperf-baseline: wrote ${OUT}`);
} else {
  console.log("\nperf-baseline: no --out given, nothing written");
}
