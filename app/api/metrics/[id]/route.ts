import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  if (!d) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const meta = d.prepare("SELECT * FROM metrics WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!meta) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const rows = d
    .prepare(
      "SELECT region_code, value FROM metric_values WHERE metric_id = ? AND region_level = 'district' AND value IS NOT NULL"
    )
    .all(id) as { region_code: string; value: number }[];

  const values: Record<string, number> = {};
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    values[r.region_code] = r.value;
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
  }

  return NextResponse.json({
    id,
    name: meta.name,
    unit: meta.unit,
    year: meta.year,
    source: meta.source,
    source_url: meta.source_url,
    license: meta.license,
    decimals: meta.decimals,
    higher_is_better: meta.higher_is_better,
    count: rows.length,
    min: rows.length ? min : 0,
    max: rows.length ? max : 0,
    values,
  });
}
