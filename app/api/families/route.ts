import { NextResponse } from "next/server";
import { getFamilyList } from "@/lib/family-data";

// Every family a grid may render (#547 phase B, iter-40 item 968). Metadata only,
// no values: one small id lookup per family (nine today) rather than the district
// values, which are what actually cost anything. The per-family payload — members
// plus every value on the shared set — lives at /api/families/[id].
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ families: getFamilyList() });
}
