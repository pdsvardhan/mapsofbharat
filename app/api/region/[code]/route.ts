import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All metrics for one region (district rid), with national rank per metric.
// Rank honours higher_is_better: rank 1 is the "best" district for that metric.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const d = db();
  if (!d) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const rows = d
    .prepare(
      `WITH ranked AS (
         SELECT metric_id, region_code, value,
                RANK() OVER (PARTITION BY metric_id ORDER BY value DESC) AS rank_desc,
                RANK() OVER (PARTITION BY metric_id ORDER BY value ASC)  AS rank_asc,
                COUNT(*) OVER (PARTITION BY metric_id) AS cnt
         FROM metric_values
         WHERE region_level = 'district' AND value IS NOT NULL
       )
       SELECT m.id, m.name, m.category, m.unit, m.year, m.source, m.source_url,
              m.decimals, m.higher_is_better, r.value, r.cnt,
              CASE WHEN m.higher_is_better = 0 THEN r.rank_asc ELSE r.rank_desc END AS rank
       FROM ranked r
       JOIN metrics m ON m.id = r.metric_id
       WHERE r.region_code = ?
       ORDER BY m.category, m.name`
    )
    .all(code) as Array<Record<string, unknown>>;

  if (!rows.length) return NextResponse.json({ error: "not-found", code }, { status: 404 });

  return NextResponse.json({
    code,
    metrics: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      year: r.year,
      source: r.source,
      source_url: r.source_url,
      decimals: r.decimals,
      higher_is_better: r.higher_is_better,
      value: r.value,
      rank: r.rank,
      count: r.cnt,
    })),
  });
}
