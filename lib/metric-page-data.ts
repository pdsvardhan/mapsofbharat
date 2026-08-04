import { db } from "@/lib/db";
import { countsInStats } from "@/lib/estimate-kind";
import { coverageCounts } from "@/lib/coverage";

// Server-side data layer for the canonical per-metric pages (/metric/{id}, item
// 829). These read the same store /api/metrics and /api/metrics/[id] read, so the
// SSR page, its catalogue and its sitemap never HTTP-fetch this app's own API to
// render itself. The aggregation below MIRRORS app/api/metrics/[id]/route.ts — the
// two must stay in lockstep, the way india-map's `entries`/`rankOf` mirror the
// region route's SQL. Kept here (not imported from the route) because a route
// handler returns a NextResponse, not a value a Server Component can await.

const LEVELS = new Set(["state", "district", "district2011", "state2011"]);

export type MetricListItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  year: number;
  source: string;
  source_url: string;
  license: string;
  higher_is_better: number;
  decimals: number;
  default_scale: string | null;
  methodology: string | null;
  last_updated: string | null;
  /** Which region levels this metric carries rows for (e.g. ["district","state"]). */
  levels: string[];
};

const META_SELECT = `SELECT m.id, m.name, m.category, m.unit, m.year, m.source, m.source_url,
              m.license, m.higher_is_better, m.decimals, m.default_scale,
              m.methodology, m.last_updated,
              (SELECT GROUP_CONCAT(DISTINCT v.region_level) FROM metric_values v
                WHERE v.metric_id = m.id) AS levels
       FROM metrics m`;

function toListItem(m: Record<string, unknown>): MetricListItem {
  return {
    id: String(m.id),
    name: String(m.name),
    category: String(m.category ?? ""),
    unit: (m.unit as string) ?? "",
    year: Number(m.year),
    source: (m.source as string) ?? "",
    source_url: (m.source_url as string) ?? "",
    license: (m.license as string) ?? "",
    higher_is_better: Number(m.higher_is_better),
    decimals: Number(m.decimals ?? 0),
    default_scale: (m.default_scale as string) ?? null,
    methodology: (m.methodology as string) ?? null,
    last_updated: (m.last_updated as string) ?? null,
    levels: typeof m.levels === "string" ? (m.levels as string).split(",").sort() : [],
  };
}

/** Every metric, category-then-name ordered — the same list /api/metrics serves.
 *  Empty when the store isn't built yet (build-time, before the volume mounts). */
export function getAllMetrics(): MetricListItem[] {
  const d = db();
  if (!d) return [];
  const rows = d
    .prepare(`${META_SELECT} ORDER BY m.category, m.name`)
    .all() as Array<Record<string, unknown>>;
  return rows.map(toListItem);
}

/** One metric's metadata (no values), for generateMetadata / OG. Null if absent. */
export function getMetricMeta(id: string): MetricListItem | null {
  const d = db();
  if (!d) return null;
  const m = d.prepare(`${META_SELECT} WHERE m.id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return m ? toListItem(m) : null;
}

export type MetricDetail = {
  id: string;
  level: string;
  name: string;
  category: string;
  unit: string;
  year: number;
  source: string;
  source_url: string;
  license: string;
  methodology: string | null;
  last_updated: string | null;
  decimals: number;
  higher_is_better: number;
  /** Rows carrying a value at this level (measured + estimated). */
  count: number;
  /** Rows that are NOT the region's own measurement (adr-021). */
  estimated_count: number;
  /** Rows behind min/max/mean and the class breaks (adr-022). */
  stats_count: number;
  min: number;
  max: number;
  mean: number;
  values: Record<string, number>;
  estimated: Record<string, 1>;
  estimate_kind: Record<string, string>;
  estimated_from: Record<string, string>;
  shaky: Record<string, 1>;
};

/**
 * The full per-metric payload at one level — the value of /api/metrics/[id],
 * plus the category / methodology / last_updated the SSR page also renders.
 * Mirrors that route's aggregation exactly (donor + shaky lookups, the
 * countsInStats stats rule). Returns null for an unknown id or an unbuilt store.
 */
export function getMetricDetail(id: string, requestedLevel = "district"): MetricDetail | null {
  const level = LEVELS.has(requestedLevel) ? requestedLevel : "district";
  const d = db();
  if (!d) return null;

  const meta = d.prepare("SELECT * FROM metrics WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!meta) return null;

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

  // Which district supplied each inherited value, and which inheritances are SHAKY
  // (adr-020, adr-026). Same guarded lookup the metrics/[id] route uses: an absent
  // table means the fill hasn't run (fresh DB); an absent `shaky` column means an
  // older pipeline graded this store — retry without it rather than fail.
  const donorOf = new Map<string, string>();
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
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such column/i.test(msg)) {
        try {
          load(false);
        } catch (e2) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          if (!/no such table/i.test(m2)) console.error(`[metric/${id}] citation lookup failed:`, m2);
        }
      } else if (!/no such table/i.test(msg)) {
        console.error(`[metric/${id}] district_estimate_source lookup failed:`, msg);
      }
    }
  }

  const values: Record<string, number> = {};
  const estimated: Record<string, 1> = {};
  const estimateKind: Record<string, string> = {};
  const estimatedFrom: Record<string, string> = {};
  const shakyOut: Record<string, 1> = {};
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let statsCount = 0;
  let realCount = 0;
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

  return {
    id,
    level,
    name: String(meta.name),
    category: String(meta.category ?? ""),
    unit: (meta.unit as string) ?? "",
    year: Number(meta.year),
    source: (meta.source as string) ?? "",
    source_url: (meta.source_url as string) ?? "",
    license: (meta.license as string) ?? "",
    methodology: (meta.methodology as string) ?? null,
    last_updated: (meta.last_updated as string) ?? null,
    decimals: Number(meta.decimals ?? 0),
    higher_is_better: Number(meta.higher_is_better),
    count: rows.length,
    estimated_count: rows.length - realCount,
    stats_count: statsCount,
    min: statsCount ? min : 0,
    max: statsCount ? max : 0,
    mean: statsCount ? Math.round((sum / statsCount) * 100) / 100 : 0,
    values,
    estimated,
    estimate_kind: estimateKind,
    estimated_from: estimatedFrom,
    shaky: shakyOut,
  };
}

export type MetricRow = {
  code: string;
  name: string;
  sub: string;
  kind: "state" | "district";
  value: number;
  estimated: number;
  estimate_kind: string | null;
  estimated_from: string | null;
  shaky: number;
};

/** code -> { name, state } for one current-day level, so the ranked table can
 *  name each region instead of showing bare codes — the merge india-map does
 *  client-side with /api/regions, done here on the server. */
function regionNameIndex(level: "state" | "district"): Map<string, { name: string; state: string }> {
  const idx = new Map<string, { name: string; state: string }>();
  const d = db();
  if (!d) return idx;
  const rows = d
    .prepare(
      `SELECT rk.code, rk.name, rk.st_code,
              (SELECT s.name FROM region_keys s WHERE s.level='state' AND s.code = rk.st_code) AS state
       FROM region_keys rk WHERE rk.level = ?`
    )
    .all(level) as { code: string; name: string; st_code: string | null; state: string | null }[];
  for (const r of rows) {
    idx.set(String(r.code), { name: String(r.name), state: r.state ? String(r.state) : "" });
  }
  return idx;
}

/**
 * The ranked rows the DataTable renders, assembled exactly like india-map's
 * `entries` memo: named, current-vintage, sorted by value descending. The metric
 * pages only ever show the current-day vintage, so the name index is keyed on the
 * plain state/district level.
 */
export function buildMetricRows(detail: MetricDetail): MetricRow[] {
  const kind: "state" | "district" = detail.level.startsWith("state") ? "state" : "district";
  const idx = regionNameIndex(kind);
  const out: MetricRow[] = [];
  for (const [code, value] of Object.entries(detail.values)) {
    const info = idx.get(code);
    out.push({
      code,
      name: info?.name ?? code,
      sub: kind === "district" ? info?.state ?? "" : "",
      kind,
      value,
      estimated: detail.estimated[code] === 1 ? 1 : 0,
      estimate_kind: detail.estimate_kind[code] ?? null,
      estimated_from: detail.estimated_from[code] ?? null,
      shaky: detail.shaky[code] === 1 ? 1 : 0,
    });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

/**
 * The same rank map india-map feeds the DataTable: positional over the value-desc
 * rows, rank-eligible rows only (countsInStats — an inherited copy holds no rank
 * of its own, adr-023). `rows` must already be sorted value-descending.
 */
export function rankRows(rows: MetricRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  let r = 0;
  for (const e of rows) if (countsInStats(e.estimated, e.estimate_kind)) m[e.code] = ++r;
  return m;
}

export type CoverageMetric = {
  id: string;
  name: string;
  category: string;
  unit: string;
  /** The level the counts are taken at — district where available, else state,
   *  mirroring the per-metric page's level pick. */
  level: "state" | "district";
  total: number;
  measured: number;
  estimated: number;
  inherited: number;
  aggregated: number;
  projected: number;
  /** measured / total, 0..1 — the ranking key. */
  measuredShare: number;
};

/**
 * Per-metric coverage for the /coverage league table (item 830). REUSES
 * getMetricDetail's counts (count / estimated_count) rather than recomputing them,
 * so the /coverage figures always agree with each metric's own page; the estimate
 * kinds are tallied from the same detail via lib/coverage.
 *
 * Sorted by measured share ASCENDING — the metrics that lean most on inherited or
 * projected values surface at the top, which is the point of a coverage/trust
 * surface (the fully-measured majority need no scrutiny). Ties break by size.
 */
export function getCoverageSummary(): CoverageMetric[] {
  const out: CoverageMetric[] = [];
  for (const m of getAllMetrics()) {
    const level: "state" | "district" = m.levels.includes("district") ? "district" : "state";
    const detail = getMetricDetail(m.id, level);
    if (!detail || detail.count === 0) continue;
    const rows = Object.keys(detail.values).map((code) => ({
      estimated: detail.estimated[code] ?? 0,
      estimate_kind: detail.estimate_kind[code] ?? null,
    }));
    const c = coverageCounts(rows);
    const measured = detail.count - detail.estimated_count;
    out.push({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      level,
      total: detail.count,
      measured,
      estimated: detail.estimated_count,
      inherited: c.inherited,
      aggregated: c.aggregated,
      projected: c.projected,
      measuredShare: detail.count ? measured / detail.count : 0,
    });
  }
  out.sort((a, b) => a.measuredShare - b.measuredShare || b.total - a.total);
  return out;
}
