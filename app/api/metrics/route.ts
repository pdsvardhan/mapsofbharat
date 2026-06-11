import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const d = db();
  if (!d) return NextResponse.json({ metrics: [] });
  const metrics = d
    .prepare(
      `SELECT m.id, m.name, m.category, m.unit, m.year, m.source, m.source_url,
              m.license, m.higher_is_better, m.decimals, m.default_scale,
              m.methodology, m.last_updated,
              (SELECT GROUP_CONCAT(DISTINCT v.region_level) FROM metric_values v
                WHERE v.metric_id = m.id) AS levels
       FROM metrics m ORDER BY m.category, m.name`
    )
    .all() as Array<Record<string, unknown>>;
  return NextResponse.json({
    metrics: metrics.map((m) => ({
      ...m,
      levels: typeof m.levels === "string" ? (m.levels as string).split(",").sort() : [],
    })),
  });
}
