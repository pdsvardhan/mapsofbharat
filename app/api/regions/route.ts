import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Region name index for search/fly-to (command palette). Small + cacheable.
export async function GET() {
  const d = db();
  if (!d) return NextResponse.json({ regions: [] });
  const regions = d
    .prepare(
      `SELECT rk.level, rk.code, rk.name, rk.st_code,
              (SELECT s.name FROM region_keys s WHERE s.level='state' AND s.code = rk.st_code) AS state
       FROM region_keys rk ORDER BY rk.level DESC, rk.name`
    )
    .all();
  return NextResponse.json(
    { regions },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
