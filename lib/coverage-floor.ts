// How much ground two metrics must share before they may be shown together.
//
// ONE RULE, TWO FEATURES. The metric-to-metric transition (#547) and the bivariate
// map (#408 item 1080) ask the same question — may these two be put on the same
// geography — and a second copy of the answer would drift from the first. The
// MGNREGA family sitting just under the district floor is a designed, visible
// absence; both features have to agree about it or it stops being designed.
//
// The floors are R1's, from research/2026-08-20-455-animation-recheck.md.
//
// IT LIVES IN ITS OWN FILE FOR A DULL BUT LOAD-BEARING REASON. lib/metric-pairs.ts
// imports `db`, so anything importing IT is server-only — and the bivariate map runs
// in the browser. Importing the floor from there would drag better-sqlite3 into the
// client bundle. This module imports nothing, so both sides can hold the same number.

export const TRANSITION_FLOOR = { district: 690, state: 30 } as const;

export type TransitionLevel = keyof typeof TRANSITION_FLOOR;

export function isTransitionLevel(v: string): v is TransitionLevel {
  return v in TRANSITION_FLOOR;
}
