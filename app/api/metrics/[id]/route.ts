import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const level = new URL(req.url).searchParams.get("level") === "state" ? "state" : "district";
  const d = db();
  if (!d) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const meta = d.prepare("SELECT * FROM metrics WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!meta) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const rows = d
    .prepare(
      "SELECT region_code, value, estimated FROM metric_values WHERE metric_id = ? AND region_level = ? AND value IS NOT NULL"
    )
    .all(id, level) as { region_code: string; value: number; estimated: number }[];

  const values: Record<string, number> = {};
  // region_code -> 1 when the value is inherited from a parent district (a
  // district created after the source's survey). Rendered with a hatch overlay.
  const estimated: Record<string, 1> = {};
  // class-break stats use REAL values only, so a handful of inherited parent
  // values don't skew the quantile breaks or the legend.
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let realCount = 0;
  for (const r of rows) {
    values[r.region_code] = r.value;
    if (r.estimated) {
      estimated[r.region_code] = 1;
      continue;
    }
    realCount += 1;
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
    sum += r.value;
  }

  return NextResponse.json({
    id,
    level,
    name: meta.name,
    unit: meta.unit,
    year: meta.year,
    source: meta.source,
    source_url: meta.source_url,
    license: meta.license,
    decimals: meta.decimals,
    higher_is_better: meta.higher_is_better,
    count: rows.length,
    estimated_count: rows.length - realCount,
    min: realCount ? min : 0,
    max: realCount ? max : 0,
    mean: realCount ? Math.round((sum / realCount) * 100) / 100 : 0,
    values,
    estimated,
  });
}
