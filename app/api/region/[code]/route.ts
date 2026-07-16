import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All metrics for one region, with rank per metric within that region's level.
// District rids contain "_" (st_dt); bare two-digit codes are states.
// Rank honours higher_is_better: rank 1 is the "best" region for that metric.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const level = code.includes("_") ? "district" : "state";
  const d = db();
  if (!d) return NextResponse.json({ error: "no-data" }, { status: 404 });

  // Ranks and counts are computed over REAL values only (estimated=0): an
  // inherited value carries no rank, and the "of N" denominator reflects only
  // districts the source actually surveyed. The region's own value may itself
  // be estimated, so it is fetched separately and left rankless when so.
  const rows = d
    .prepare(
      `WITH ranked AS (
         SELECT metric_id, region_code, value,
                RANK() OVER (PARTITION BY metric_id ORDER BY value DESC) AS rank_desc,
                RANK() OVER (PARTITION BY metric_id ORDER BY value ASC)  AS rank_asc,
                COUNT(*) OVER (PARTITION BY metric_id) AS cnt
         FROM metric_values
         WHERE region_level = ? AND value IS NOT NULL AND estimated = 0
       ),
       cnts AS (SELECT metric_id, MAX(cnt) AS cnt FROM ranked GROUP BY metric_id),
       mine AS (
         SELECT metric_id, value, estimated FROM metric_values
         WHERE region_level = ? AND region_code = ? AND value IS NOT NULL
       )
       SELECT m.id, m.name, m.category, m.unit, m.year, m.source, m.source_url,
              m.decimals, m.higher_is_better, m.methodology, m.last_updated,
              mine.value, mine.estimated, c.cnt,
              CASE WHEN mine.estimated = 1 THEN NULL
                   WHEN m.higher_is_better = 0 THEN r.rank_asc ELSE r.rank_desc END AS rank
       FROM mine
       JOIN metrics m ON m.id = mine.metric_id
       LEFT JOIN cnts c ON c.metric_id = mine.metric_id
       LEFT JOIN ranked r ON r.metric_id = mine.metric_id AND r.region_code = ?
       ORDER BY m.category, m.name`
    )
    .all(level, level, code, code) as Array<Record<string, unknown>>;

  if (!rows.length) return NextResponse.json({ error: "not-found", code }, { status: 404 });

  const key = d
    .prepare("SELECT name, iso_3166_2 FROM region_keys WHERE level = ? AND code = ?")
    .get(level, code) as { name?: string; iso_3166_2?: string } | undefined;

  // Which district supplied each inherited value. Keyed (region, metric, year) —
  // the same key the fill uses — because a district can inherit different metrics
  // from different siblings: Mancherial takes crime from Nirmal and ASER from
  // Adilabad. A single parent per district cannot state that (adr-020).
  // Guarded: the table only exists once fill_new_districts.py has run.
  const donorOf = new Map<string, string>();
  try {
    const src = d
      .prepare(
        "SELECT metric_id, year, source_name FROM district_estimate_source WHERE region_code = ?"
      )
      .all(code) as { metric_id: string; year: number; source_name: string }[];
    for (const s of src) donorOf.set(`${s.metric_id}|${s.year}`, s.source_name);
  } catch {
    /* pipeline has not run yet — every estimated_from stays null */
  }

  const metrics = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    year: r.year,
    source: r.source,
    source_url: r.source_url,
    decimals: r.decimals,
    higher_is_better: r.higher_is_better,
    methodology: r.methodology,
    last_updated: r.last_updated,
    value: r.value,
    estimated: r.estimated ? 1 : 0,
    rank: r.rank,
    count: r.cnt,
    // the district this specific number came from — null when the value is our own
    estimated_from: r.estimated ? donorOf.get(`${r.id}|${r.year}`) ?? null : null,
  }));

  // Distinct donors across this region's estimates, for the panel's footnote.
  // Replaces the old single `estimated_from`, which could name only one parent
  // and named the wrong one whenever the metric-blind rule disagreed with the fill.
  const estimatedParents = [
    ...new Set(metrics.map((m) => m.estimated_from).filter((n): n is string => !!n)),
  ].sort();

  return NextResponse.json({
    code,
    level,
    name: key?.name ?? null,
    iso_3166_2: key?.iso_3166_2 ?? null,
    estimated_parents: estimatedParents,
    metrics,
  });
}
