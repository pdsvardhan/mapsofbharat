import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const d = db();
  if (!d) return NextResponse.json({ metrics: [] });
  const metrics = d
    .prepare(
      "SELECT id, name, category, unit, year, source, source_url, license, higher_is_better, decimals, default_scale FROM metrics ORDER BY category, name"
    )
    .all();
  return NextResponse.json({ metrics });
}
