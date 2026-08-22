import { NextResponse } from "next/server";
import { getFamilyList } from "@/lib/family-data";

// Every family a grid may render (#547 phase B, iter-40 item 968). Metadata only
// — no values — so this stays one cheap query even as the catalogue grows. The
// per-family payload lives at /api/families/[id].
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ families: getFamilyList() });
}
