import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { countsInStats } from "@/lib/estimate-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The two vintage levels are the as-reported-2011 view (adr-003, item 671):
// same rows, same shape, different region key space (2011 census codes).
const LEVELS = new Set(["state", "district", "district2011", "state2011"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = new URL(req.url).searchParams.get("level") ?? "district";
  const level = LEVELS.has(raw) ? raw : "district";
  const d = db();
  if (!d) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const meta = d.prepare("SELECT * FROM metrics WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!meta) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // `year` is selected because it varies BETWEEN regions of the same metric — the
  // RBI series carry each state at its own latest fiscal year (25 states at
  // 2024-25 BE, 5 at 2023-24 RE, Gujarat at 2022-23 Actual). The donor citation is
  // keyed on the VALUE's year, so keying on metrics.year instead would silently
  // miss every row whose year differs from the metric's headline year.
  const rows = d
    .prepare(
      "SELECT region_code, value, estimated, estimate_kind, year FROM metric_values WHERE metric_id = ? AND region_level = ? AND value IS NOT NULL"
    )
    .all(id, level) as {
      region_code: string;
      value: number;
      estimated: number;
      estimate_kind: string | null;
      year: number;
    }[];

  // Which district supplied each inherited value, so the rail and the map hover can
  // name it instead of saying "the parent district" while the region panel names
  // Nirmal (item 640). Same (region, metric, year) key the fill wrote (adr-020).
  // Guarded: the table only exists once fill_new_districts.py has run.
  const donorOf = new Map<string, string>();
  // Which inheritances are SHAKY — a weak sibling match flagged by adr-026's gate
  // (divergence >= 1 IQR AND reach >= 1M), keyed like the donor. Tolerates the
  // column's absence on a store graded by an older pipeline: falls back to
  // donors-only, so nothing is flagged shaky rather than the query failing.
  const shakyOf = new Set<string>();
  if (level === "district") {
    const load = (withShaky: boolean) => {
      const cols = withShaky
        ? "region_code, year, source_name, shaky"
        : "region_code, year, source_name";
      const src = d
        .prepare(`SELECT ${cols} FROM district_estimate_source WHERE metric_id = ?`)
        .all(id) as { region_code: string; year: number; source_name: string; shaky?: number }[];
      donorOf.clear();
      shakyOf.clear();
      for (const s of src) {
        donorOf.set(`${s.region_code}|${s.year}`, s.source_name);
        if (withShaky && s.shaky) shakyOf.add(`${s.region_code}|${s.year}`);
      }
    };
    try {
      load(true);
    } catch (err) {
      // Absent table = pipeline not run yet, expected on a fresh DB. Absent column =
      // graded by an older pipeline — retry without it. Anything else is a real
      // fault; degrading every citation to null silently would hide it.
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such column/i.test(msg)) {
        try {
          load(false);
        } catch (e2) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          if (!/no such table/i.test(m2)) console.error(`[metrics/${id}] citation lookup failed:`, m2);
        }
      } else if (!/no such table/i.test(msg)) {
        console.error(`[metrics/${id}] district_estimate_source lookup failed:`, msg);
      }
    }
  }

  const values: Record<string, number> = {};
  // region_code -> 1 when the value is not this region's own measurement.
  const estimated: Record<string, 1> = {};
  // region_code -> WHICH kind of estimate, because `estimated` alone answers two
  // different questions and the caller cannot tell them apart: 'inherited' (copied
  // from a donor district that existed at survey time), 'projected' (an RBI Budget
  // or Revised Estimate for a fiscal year not yet closed — no donor exists),
  // 'aggregated' (an exact sum of real rows). See adr-021.
  const estimateKind: Record<string, string> = {};
  // region_code -> the district that actually supplied this number. Only ever set
  // for 'inherited'; a projected BE/RE figure is copied from nobody (item 640).
  const estimatedFrom: Record<string, string> = {};
  // region_code -> 1 when this inherited value is a SHAKY match (adr-026). Only ever
  // set for 'inherited'; drives the stronger badge and caution wording. Disclosure
  // only — it does not change the value, its rank or the stats.
  const shakyOut: Record<string, 1> = {};
  // Class-break stats exclude COPIES, not projections (adr-022). An inherited
  // value duplicates a real row already counted here; a projected one is its
  // state's only figure, and dropping it collapsed this metric's scale to a
  // single point. countsInStats owns that rule.
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let statsCount = 0;   // rows behind min/max/mean and the class breaks
  let realCount = 0;    // rows that are the region's own measurement (disclosure)
  for (const r of rows) {
    values[r.region_code] = r.value;
    if (r.estimated) {
      estimated[r.region_code] = 1;
      if (r.estimate_kind) estimateKind[r.region_code] = r.estimate_kind;
      const donor = donorOf.get(`${r.region_code}|${r.year}`);
      if (donor) estimatedFrom[r.region_code] = donor;
      if (shakyOf.has(`${r.region_code}|${r.year}`)) shakyOut[r.region_code] = 1;
    } else {
      realCount += 1;
    }
    if (!countsInStats(r.estimated, r.estimate_kind)) continue;
    statsCount += 1;
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
    // How many rows the stats below actually rest on — without it a caller cannot
    // tell a mean over 733 districts from a mean over one.
    stats_count: statsCount,
    min: statsCount ? min : 0,
    max: statsCount ? max : 0,
    mean: statsCount ? Math.round((sum / statsCount) * 100) / 100 : 0,
    values,
    estimated,
    estimate_kind: estimateKind,
    estimated_from: estimatedFrom,
    // region_code -> 1 for a shaky inheritance (adr-026); absent for the rest.
    shaky: shakyOut,
  });
}
