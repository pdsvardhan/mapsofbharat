import { NextResponse } from "next/server";
import { getFamilyDetail } from "@/lib/family-data";

// One family's members plus their values on the shared district set (#547 phase
// B, iter-40 item 968) — ONE request for a whole grid rather than one per panel.
//
// An unknown id is a 404, never an empty grid: a family that does not exist and a
// family whose store is missing are different failures, and rendering both as an
// empty page would hide the first behind the second.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const family = getFamilyDetail(id);
  if (!family) {
    return NextResponse.json({ error: `Unknown metric family '${id}'` }, { status: 404 });
  }
  return NextResponse.json({ family });
}
