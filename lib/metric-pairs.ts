import { db } from "@/lib/db";

// Which metric pairs the transition may offer (#547 phase C, iter-42 item 977).
//
// DERIVED FROM THE STORE, NEVER HAND-LISTED — the same discipline as
// lib/metric-families and lib/metric-capabilities. A hand-written pair list is
// a copy of the catalogue, and copies drift.
//
// The rule: two metrics may transition when both sit at the SAME region level
// and both meet that level's coverage floor. The floors are R1's
// (research/2026-08-20-455-animation-recheck.md): >=690 of 735 districts, and
// >=30 of 36 states. Measured against today's 125-metric store that admits 74
// district metrics sharing 576 districts, and 80 of 83 state metrics.
//
// A CONSEQUENCE WORTH SAYING OUT LOUD: the whole MGNREGA family (678-683
// districts) sits just under the district floor and gets NO transition. That is
// the floor working as designed — a pair is only as good as its shared set —
// but it is a visible absence, not an accident, and lowering the floor is a
// deliberate decision for whoever next wants MGNREGA in here.

export const TRANSITION_FLOOR = { district: 690, state: 30 } as const;

export type TransitionLevel = keyof typeof TRANSITION_FLOOR;

export function isTransitionLevel(v: string): v is TransitionLevel {
  return v in TRANSITION_FLOOR;
}

export type TransitionPartner = {
  id: string;
  name: string;
  category: string;
  unit: string;
  year: number;
  decimals: number;
  /** Regions this partner carries a value for at the level — shown so the
   *  picker can disclose thinner partners rather than hiding the difference. */
  count: number;
};

/**
 * Every metric this one may transition against at `level`, category-then-name
 * ordered for the picker. Empty when the store is absent, when the level has no
 * floor (the 2011 vintage levels are geometry variants, not transition
 * geographies), or when the BASE metric itself misses the floor — a transition
 * needs both ends, so an under-covered base gets no partners rather than a
 * picker full of pairs that would all be as thin as it is.
 */
export function transitionPartners(metricId: string, level: string): TransitionPartner[] {
  if (!isTransitionLevel(level)) return [];
  const d = db();
  if (!d) return [];
  const floor = TRANSITION_FLOOR[level];

  const rows = d
    .prepare(
      `SELECT m.id, m.name, m.category, m.unit, m.year, m.decimals,
              COUNT(v.value) AS count
         FROM metrics m
         JOIN metric_values v
           ON v.metric_id = m.id AND v.region_level = ? AND v.value IS NOT NULL
        GROUP BY m.id
       HAVING count >= ?
        ORDER BY m.category, m.name`
    )
    .all(level, floor) as Array<Record<string, unknown>>;

  const eligible = rows.map((m) => ({
    id: String(m.id),
    name: String(m.name),
    category: String(m.category ?? ""),
    unit: (m.unit as string) ?? "",
    year: Number(m.year),
    decimals: Number(m.decimals ?? 0),
    count: Number(m.count),
  }));

  if (!eligible.some((m) => m.id === metricId)) return [];
  return eligible.filter((m) => m.id !== metricId);
}
