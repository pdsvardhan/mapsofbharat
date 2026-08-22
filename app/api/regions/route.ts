import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchableRegions } from "@/lib/region-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Region name index for search/fly-to (command palette). Small + cacheable.
//
// The query lives in lib/region-search.ts so the vintage exclusion it depends on
// can be tested against a store that actually contains vintage rows (#563).
export async function GET() {
  const d = db();
  if (!d) return NextResponse.json({ regions: [] });
  return NextResponse.json(
    { regions: searchableRegions(d) },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
