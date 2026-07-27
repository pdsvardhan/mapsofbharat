import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "mapsofbharat",
    time: new Date().toISOString(),
    // Which commit is serving this response (to-do 344). "unknown" means the image
    // was built without the build args, i.e. the deploy ritual was skipped — the gap
    // is visible rather than merely likely. tree="dirty" means uncommitted edits were
    // in the tree at build time, so the sha does NOT fully describe what is running.
    commit: process.env.GIT_SHA || "unknown",
    tree: process.env.GIT_DIRTY || "unknown",
  });
}
