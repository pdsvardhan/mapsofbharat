import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness AND readiness (#545 / 405-B).
//
// WHY THIS DOES REAL WORK NOW. Until 2026-08-20 this route returned a hardcoded
// `status: "ok"` object. It proved exactly one thing: that a Node process was up
// and routing. It could not tell you whether the app could read a single number —
// so if the /data volume failed to mount, or the canonical DB was replaced with a
// truncated file, this endpoint said "ok" while every page on the site 500'd.
//
// That mattered more than it looks, because two things consume it and BOTH were
// therefore blind:
//   * the container HEALTHCHECK in docker-compose.yml, which is how the box knows
//     the service is alive at all; and
//   * any external uptime monitor, which is the entire point of 405-B — putting a
//     monitor on an endpoint that cannot fail buys you a monitor that cannot help.
//
// So it now opens the canonical store and counts the metric catalogue. Cheap
// (COUNT over ~124 rows against a read-only handle), and it exercises the exact
// path every page depends on: the file exists, is readable, is valid SQLite, and
// has content.
//
// AND IT ANSWERS 503 WHEN IT IS NOT OK. Returning 200 with `status: "degraded"` in
// the body would leave every dumb HTTP monitor — and the container healthcheck,
// which only reads `r.ok` — still reporting green. A monitor should not have to
// parse JSON to notice an outage. The body keeps the detail for monitors that do
// look, so a keyword check on `"status":"ok"` is belt-and-braces rather than the
// only line of defence.
//
// Not a restart loop: compose uses `restart: unless-stopped`, and Docker does not
// restart a merely-unhealthy container. Unhealthy is a signal here, not a trigger.

export async function GET() {
  const started = Date.now();

  let metrics = 0;
  let dbOk = false;
  let detail: string | null = null;

  try {
    const d = db();
    if (!d) {
      detail = "canonical store not open (missing, unreadable, or not valid SQLite)";
    } else {
      const row = d.prepare("SELECT COUNT(*) AS n FROM metrics").get() as { n: number };
      metrics = Number(row?.n ?? 0);
      // Zero metrics is a live failure mode, not a hypothetical: a mount that
      // resolves to an empty volume produces a perfectly valid, perfectly empty
      // database, and every page renders its empty state instead of erroring.
      if (metrics > 0) dbOk = true;
      else detail = "canonical store opened but holds no metrics";
    }
  } catch (e) {
    detail = `canonical store query failed: ${(e as Error).message}`;
  }

  const ok = dbOk;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "mapsofbharat",
      time: new Date().toISOString(),
      // Which commit is serving this response (to-do 344). "unknown" means the image
      // was built without the build args, i.e. the deploy ritual was skipped — the gap
      // is visible rather than merely likely. tree="dirty" means uncommitted edits were
      // in the tree at build time, so the sha does NOT fully describe what is running.
      commit: process.env.GIT_SHA || "unknown",
      tree: process.env.GIT_DIRTY || "unknown",
      checks: { db: dbOk, metrics },
      ...(detail ? { detail } : {}),
      took_ms: Date.now() - started,
    },
    {
      status: ok ? 200 : 503,
      // Never let a CDN or the browser hold an outage answer — or a healthy one
      // past the moment it stopped being true.
      headers: { "cache-control": "no-store, max-age=0" },
    }
  );
}
