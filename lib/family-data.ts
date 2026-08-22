import { db } from "@/lib/db";
import {
  DEFAULT_PALETTE,
  METRIC_REFERENCE,
  SUGGESTED_PALETTE,
  computeBreaks,
  selectMethod,
  type BreakMethod,
  type PaletteId,
} from "@/lib/breaks";
import { countsInStats } from "@/lib/estimate-kind";
import {
  FAMILY_BY_ID,
  SHIPPABLE_FAMILIES,
  type FamilyAxis,
  type MetricFamily,
  type PartToWhole,
} from "@/lib/metric-families";

// Server-side data layer for metric families (#547 phase B, iter-40 item 968).
//
// Same shape as lib/metric-page-data.ts and the same reason for existing: the
// SSR family page must not HTTP-fetch this app's own API to render itself. The
// route handlers under app/api/families/ are thin wrappers over these functions,
// so the page and the API cannot drift apart.
//
// THE CLASSIFICATION HERE IS THE ATLAS'S, NOT A SECOND ONE (adr-033). The stats
// set, the method selection and the break edges all come from lib/breaks.ts with
// the same inputs components/india-map.tsx uses. A panel therefore classifies a
// metric exactly the way the main map classifies it, which is the whole reason a
// small multiple can be read next to the atlas at all.

/** Families are declared and measured on district coverage; phase B renders that
 *  level only. The artefact carries a state layer too — deliberately unused here
 *  rather than half-wired, because no family's sharedDistricts was measured on it. */
export const FAMILY_LEVEL = "district" as const;

/** Class count, fixed at the atlas's k. */
const K = 5;

export type FamilyMemberMeta = {
  id: string;
  name: string;
  category: string;
  unit: string;
  year: number;
  decimals: number;
  source: string;
  source_url: string;
  higher_is_better: number;
};

/** One member's numbers on the family's shared district set. */
export type FamilyMemberValues = FamilyMemberMeta & {
  /** Values on the shared codes only — the set every member covers. */
  values: Record<string, number>;
  /** Codes carrying a value that is NOT the region's own measurement (adr-021). */
  estimated: Record<string, 1>;
  /** Rows behind min/max/mean and the breaks (adr-022 — copies excluded). */
  statsCount: number;
  min: number;
  max: number;
  mean: number;
  /** Class edges for THIS member. Empty on a shared axis, where the family's
   *  edges apply instead, and empty for the continuous method. */
  breaks: number[];
  /** Method chosen for this member, and why. Null on a shared axis. */
  method: BreakMethod | null;
  methodWhy: string | null;
};

export type FamilySummary = {
  id: string;
  label: string;
  blurb: string;
  source: string;
  unit: string;
  axis: FamilyAxis;
  axisWhy: string;
  partToWhole: PartToWhole | false;
  /** What lib/metric-families.ts declares, measured 2026-08-21 and asserted by
   *  tests/metric-families.spec.ts. */
  declaredSharedDistricts: number;
  declaredMembers: number;
  /** Declared members actually present in the store right now. */
  resolvedMembers: number;
  /** Declared members absent from the store. Non-empty means the family is
   *  drifting from its declaration — surfaced, never quietly dropped. Always empty
   *  when the store is absent, because then nothing is known to be missing. */
  missingMembers: string[];
  /** The declared member ids, from lib/metric-families.ts. Available with or
   *  without a store — it is the declaration, not a query — so a page can still
   *  list what the family CONTAINS when the volume is not mounted. */
  memberIds: string[];
};

export type FamilyDetail = FamilySummary & {
  level: typeof FAMILY_LEVEL;
  /** True when the canonical store is mounted. False in the image at build time,
   *  where the page renders a no-data state rather than an empty grid. */
  storeAvailable: boolean;
  /** Districts on which EVERY resolved member carries a value. */
  sharedCodes: string[];
  /** Measured now, against the store. Compare with declaredSharedDistricts. */
  measuredSharedDistricts: number;
  members: FamilyMemberValues[];
  /** One ramp for the whole grid. Panels differ by fill VALUE, never by hue —
   *  a free axis already breaks cross-panel comparison of magnitude, and giving
   *  each panel its own palette on top of that would read as a second variable. */
  palette: PaletteId;
  /** Family-wide domain + edges. Set on a shared axis, null on a free one. */
  shared: { min: number; max: number; mean: number; breaks: number[]; method: BreakMethod; methodWhy: string } | null;
};

type ValueRow = {
  metric_id: string;
  region_code: string;
  value: number;
  estimated: number;
  estimate_kind: string | null;
};

function metaOf(m: Record<string, unknown>): FamilyMemberMeta {
  return {
    id: String(m.id),
    name: String(m.name),
    category: String(m.category ?? ""),
    unit: (m.unit as string) ?? "",
    year: Number(m.year),
    decimals: Number(m.decimals ?? 0),
    source: (m.source as string) ?? "",
    source_url: (m.source_url as string) ?? "",
    higher_is_better: Number(m.higher_is_better),
  };
}

function placeholders(n: number): string {
  return new Array(n).fill("?").join(",");
}

/** Which of a family's declared members exist in the store. One query, no values.
 *
 *  With NO store, `missing` is EMPTY rather than every member. An absent volume and
 *  a retired metric are different facts, and reporting the first as the second made
 *  the page accuse itself of drift ("3 declared indicators are missing from the
 *  store") when nothing had drifted at all — the store simply was not mounted. */
function resolveMembers(family: MetricFamily): { present: string[]; missing: string[] } {
  const d = db();
  if (!d) return { present: [], missing: [] };
  const rows = d
    .prepare(`SELECT id FROM metrics WHERE id IN (${placeholders(family.members.length)})`)
    .all(...family.members) as { id: string }[];
  const have = new Set(rows.map((r) => r.id));
  return {
    // Declaration order, not query order: the declared order is editorial (the
    // grid reads left to right in the order lib/metric-families.ts lists).
    present: family.members.filter((m) => have.has(m)),
    missing: family.members.filter((m) => !have.has(m)),
  };
}

function summarize(family: MetricFamily): FamilySummary {
  const { present, missing } = resolveMembers(family);
  return {
    id: family.id,
    label: family.label,
    blurb: family.blurb,
    source: family.source,
    unit: family.unit,
    axis: family.axis,
    axisWhy: family.axisWhy,
    partToWhole: family.partToWhole,
    declaredSharedDistricts: family.sharedDistricts,
    declaredMembers: family.members.length,
    resolvedMembers: present.length,
    missingMembers: missing,
    memberIds: [...family.members],
  };
}

/** Every family a grid may render today, in declaration order. */
export function getFamilyList(): FamilySummary[] {
  return SHIPPABLE_FAMILIES.map(summarize);
}

/** One family's ramp: the modal category among its members, mapped through the
 *  atlas's per-topic suggestion so a crime grid reads in the same colours the
 *  crime map does. */
function paletteFor(members: FamilyMemberMeta[]): PaletteId {
  const tally = new Map<string, number>();
  for (const m of members) tally.set(m.category, (tally.get(m.category) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [cat, n] of tally) {
    if (n > bestN) {
      best = cat;
      bestN = n;
    }
  }
  return (best && SUGGESTED_PALETTE[best]) || DEFAULT_PALETTE;
}

/**
 * What is knowable about a family with no store: the declaration, and nothing else.
 *
 * `members` is empty because a member row carries values, a name and a vintage, and
 * all three live in the store. `memberIds` is NOT empty, because the family's
 * contents are declared in code — which is what lets the page keep the promise it
 * makes ("the family and its N indicators are listed below") instead of printing a
 * heading above an empty list, as it did before iteration 41.
 */
export function noStoreDetail(family: MetricFamily, base = summarize(family)): FamilyDetail {
  return {
    ...base,
    level: FAMILY_LEVEL,
    storeAvailable: false,
    sharedCodes: [],
    measuredSharedDistricts: 0,
    members: [],
    palette: DEFAULT_PALETTE,
    shared: null,
  };
}

/**
 * One family, with every resolved member's values on the shared district set.
 *
 * Returns null ONLY for an id no family declares — that is a 404. A known family
 * with an absent store comes back with `storeAvailable: false` and no members,
 * because the family still exists; it is the data that is missing, and the two
 * cases must not render the same way.
 */
export function getFamilyDetail(id: string): FamilyDetail | null {
  const family = FAMILY_BY_ID.get(id);
  if (!family || family.blockedBy) return null;

  const base = summarize(family);
  const d = db();
  if (!d) return noStoreDetail(family, base);

  const present = family.members.filter((m) => !base.missingMembers.includes(m));
  if (!present.length) {
    return {
      ...base,
      level: FAMILY_LEVEL,
      storeAvailable: true,
      sharedCodes: [],
      measuredSharedDistricts: 0,
      members: [],
      palette: DEFAULT_PALETTE,
      shared: null,
    };
  }

  const metaRows = d
    .prepare(`SELECT * FROM metrics WHERE id IN (${placeholders(present.length)})`)
    .all(...present) as Array<Record<string, unknown>>;
  const metaById = new Map(metaRows.map((m) => [String(m.id), metaOf(m)]));

  const rows = d
    .prepare(
      `SELECT metric_id, region_code, value, estimated, estimate_kind
         FROM metric_values
        WHERE metric_id IN (${placeholders(present.length)})
          AND region_level = ?
          AND value IS NOT NULL`
    )
    .all(...present, FAMILY_LEVEL) as ValueRow[];

  const byMetric = new Map<string, ValueRow[]>();
  const coverage = new Map<string, Set<string>>();
  for (const r of rows) {
    let bucket = byMetric.get(r.metric_id);
    if (!bucket) byMetric.set(r.metric_id, (bucket = []));
    bucket.push(r);
    let seen = coverage.get(r.region_code);
    if (!seen) coverage.set(r.region_code, (seen = new Set()));
    seen.add(r.metric_id);
  }

  // The shared set: districts where EVERY resolved member has a value. This is
  // what makes the panels one grid rather than N maps of different Indias — a
  // district missing from one member is missing from all of them here.
  const sharedCodes: string[] = [];
  for (const [code, seen] of coverage) {
    if (seen.size === present.length) sharedCodes.push(code);
  }
  sharedCodes.sort();
  const shared = new Set(sharedCodes);

  const isPct = family.unit === "%";
  const members: FamilyMemberValues[] = [];
  const pooled: number[] = [];
  // Kept beside the members rather than recomputed later: the stats set is NOT
  // `values` filtered — it is `values` minus the copies adr-022 excludes, and
  // rebuilding it from the rendered values would silently classify over rows the
  // atlas leaves out.
  const statsByMember = new Map<string, number[]>();

  for (const memberId of present) {
    const meta = metaById.get(memberId);
    if (!meta) continue;
    const values: Record<string, number> = {};
    const estimated: Record<string, 1> = {};
    const statsValues: number[] = [];
    for (const r of byMetric.get(memberId) ?? []) {
      if (!shared.has(r.region_code)) continue;
      values[r.region_code] = r.value;
      if (r.estimated) estimated[r.region_code] = 1;
      // adr-022: breaks and min/max/mean exclude COPIES, not projections — the
      // same membership rule the atlas paints with.
      if (countsInStats(r.estimated, r.estimate_kind)) statsValues.push(r.value);
    }
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const v of statsValues) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const has = statsValues.length > 0;
    members.push({
      ...meta,
      values,
      estimated,
      statsCount: statsValues.length,
      min: has ? min : 0,
      max: has ? max : 0,
      mean: has ? Math.round((sum / statsValues.length) * 100) / 100 : 0,
      breaks: [],
      method: null,
      methodWhy: null,
    });
    statsByMember.set(memberId, statsValues);
    if (family.axis === "shared") pooled.push(...statsValues);
  }

  let sharedScale: FamilyDetail["shared"] = null;
  if (family.axis === "shared" && pooled.length) {
    // ONE domain and ONE set of edges across the whole family. That is what a
    // shared axis means: the panels are read against each other, so they cannot
    // each be classified on their own spread.
    const choice = selectMethod(pooled, { isPct, reference: null }, K);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const v of pooled) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    sharedScale = {
      min,
      max,
      mean: Math.round((sum / pooled.length) * 100) / 100,
      breaks: computeBreaks(pooled, choice.method, K, null),
      method: choice.method,
      methodWhy: choice.reason,
    };
  } else {
    // Free axis: each member classifies on its own values, exactly as the atlas
    // would classify that metric alone — same stats set, same selector, same ref.
    for (const m of members) {
      const statsVals = statsByMember.get(m.id) ?? [];
      if (!statsVals.length) continue;
      const ref = METRIC_REFERENCE[m.id] ?? null;
      const choice = selectMethod(statsVals, { isPct: m.unit === "%", reference: ref }, K);
      m.method = choice.method;
      m.methodWhy = choice.reason;
      m.breaks = computeBreaks(statsVals, choice.method, K, ref);
    }
  }

  return {
    ...base,
    level: FAMILY_LEVEL,
    storeAvailable: true,
    sharedCodes,
    measuredSharedDistricts: sharedCodes.length,
    members,
    palette: paletteFor(members),
    shared: sharedScale,
  };
}
