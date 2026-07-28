// Round-1 variant renderer (item 762).
// Bundles the modified compositor with esbuild, loads it into a real Chromium
// page served from the running app (same origin, so /brand/badge-disc.png and
// the site webfonts are the real ones), feeds it a REAL /api/metrics response
// plus the real shipped geojson, and writes v0..v6 PNGs at 4:5 / Dark ink.
//
// Run from the repo dir so node_modules resolves:
//   cd /mnt/storage/websites/mapsofbharat && node /tmp/mob-design/round1/render.mjs

import { build } from "esbuild";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const REPO = "/mnt/storage/websites/mapsofbharat";
const OUT = "/tmp/mob-design/round1";
const ORIGIN = "http://127.0.0.1:8610";

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// ── 1. bundle the variant module to an IIFE the page can eval ──────────────
const entry = path.join(OUT, ".entry.ts");
await fs.writeFile(entry, `
import * as M from "${OUT}/social-export.variants";
import * as B from "@/lib/breaks";
(globalThis as any).__MOB = M;
(globalThis as any).__BRK = B;
`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  alias: { "@": REPO },
  outfile: path.join(OUT, ".bundle.js"),
  logLevel: "warning",
});
const bundle = await fs.readFile(path.join(OUT, ".bundle.js"), "utf8");

// ── 2. real data ───────────────────────────────────────────────────────────
// Both metrics declare default_scale "equal" in the catalogue, so the card is
// fed the same 5 equal-interval edges the explorer would be painting with.
const JOBS = [
  { key: "district", metric: "literacy_rate", level: "district", geo: "districts", scale: "equal" },
  { key: "state", metric: "diet_nonveg_weekly_men", level: "state", geo: "states", scale: "equal" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("  [page]", m.text()); });
await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
await page.addScriptTag({ content: bundle });

// next/font registers the faces but never fetches them until something paints
// with them; canvas 2d would silently fall back to system sans. Force every
// weight the compositor asks for before drawing anything.
console.log("fonts:", await page.evaluate(async () => {
  const want = [];
  for (const w of [500, 600, 700, 800]) want.push(w + " 40px 'Hanken Grotesk'");
  for (const w of [500, 600]) want.push(w + " 14px 'IBM Plex Mono'");
  await Promise.all(want.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  return {
    hanken: document.fonts.check("800 54px 'Hanken Grotesk'"),
    plex: document.fonts.check("500 13px 'IBM Plex Mono'"),
  };
}));

const IDS = ONLY.length ? ONLY : ["v0", "v1", "v2", "v3", "v4", "v5", "v6"];

for (const job of JOBS) {
  const api = await (await fetch(`${ORIGIN}/api/metrics/${job.metric}?level=${job.level}`)).json();
  console.log(`\n${job.key}: ${api.name} — ${Object.keys(api.values).length} values, unit ${api.unit}`);
  await page.evaluate(async ([job, api, origin]) => {
    const geo = await (await fetch(`${origin}/geo/${job.geo}.geojson`)).json();
    window.__geo = geo; window.__api = api; window.__job = job;
  }, [job, api, ORIGIN]);

  for (const id of IDS) {
    const dataUrl = await page.evaluate(async (id) => {
      const M = globalThis.__MOB, B = globalThis.__BRK;
      const { __geo: geo, __api: api, __job: job } = window;
      const isState = job.level === "state";
      // names straight from the shipped geojson, keyed exactly as the API keys are
      const nameOf = new Map();
      for (const f of geo.features) {
        const p = f.properties;
        nameOf.set(isState ? String(p.st_code) : String(p.rid), isState ? p.st_nm : p.district);
      }
      const entries = Object.entries(api.values)
        .map(([code, value]) => ({
          code, value,
          name: nameOf.get(code) ?? nameOf.get(String(Number(code))) ?? code,
          estimated: api.estimated?.[code] === 1 ? 1 : 0,
          estimate_kind: api.estimate_kind?.[code] ?? null,
        }))
        .sort((a, b) => b.value - a.value);

      const breaks = B.computeBreaks(entries.map((e) => e.value), job.scale, 5);

      const spec = {
        preset: "portrait",
        theme: "ink",
        headline: api.name,
        metric: { name: api.name, unit: api.unit, year: api.year, source: api.source, decimals: api.decimals },
        level: job.level,
        focusName: null,
        entries,
        features: geo.features,
        codeOf: (f) => (isState ? String(f.properties.st_code) : String(f.properties.rid)),
        // demographics / lifestyle have no topic suggestion → the atlas default ramp
        paletteFn: B.PALETTES[B.DEFAULT_PALETTE].fn,
        breaks,
        tableN: 5,
        markerMode: "none",
        layout: id,
      };
      const cv = await M.renderSocialCard(spec);
      return cv.toDataURL("image/png");
    }, id);
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    const file = path.join(OUT, `${id}-${job.key}.png`);
    await fs.writeFile(file, buf);
    console.log(`  ${path.basename(file)}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

await browser.close();
console.log("\ndone");
