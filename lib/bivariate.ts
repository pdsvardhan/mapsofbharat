// Two metrics on one map (#408, item 1080).
//
// A bivariate choropleth colours each region from a 3x3 matrix: one metric across,
// one down. It answers the question a pair of side-by-side maps makes you answer by
// eye — where do these two go together, and where do they come apart — and it answers
// it in one place, on one geography, with no flicking back and forth.
//
// IT IS ALSO THE HARDEST MAP IN THIS ATLAS TO READ, and that is not a reason to skip
// it so much as a set of constraints on how it may be offered.
//
// 3x3 AND NOT 4x4. Nine fills is already at the edge of what a reader can hold. The
// literature that recommends bivariate at all recommends three classes per axis; four
// gives sixteen fills, and the two-axis colour differences stop being nameable. The
// project's own default is five classes for a UNIVARIATE map, where the ramp is
// ordered along a single dimension and a reader only has to place a colour on a line.
// A matrix is not a line.
//
// BOTH AXES MUST BE INTENSIVE, and this is the rule that keeps it honest. A COUNT
// shaded by colour carries the full area-size bias that proportional symbols exist to
// remove — Kutch outweighing Mumbai City by the 291x ratio of their surfaces. Symbols
// fixed that for one metric at a time. A bivariate map has no second channel left to
// escape into: both axes are colour, so an extensive metric on either one brings the
// distortion straight back, and would do it inside a form the reader already finds
// demanding. So bivariate is offered only between two metrics the capability resolver
// already puts on a choropleth, and that decision is made by lib/metric-capabilities,
// never re-derived here.
//
// BOTH MUST COVER THE SAME GROUND. A pair is only as good as its shared set, so the
// coverage floors from lib/metric-pairs apply unchanged: >=690 of 735 districts,
// >=30 of 36 states. Reusing that rule rather than writing a second one is deliberate
// — two rules for "may these two metrics be shown together" would drift, and the
// MGNREGA family sitting just under the district floor is a visible, designed absence
// that both features should agree about.

import { preferredViz } from "@/lib/metric-capabilities";
import { TRANSITION_FLOOR, isTransitionLevel } from "@/lib/coverage-floor";

/** Classes per axis. Nine fills total. */
export const BIVARIATE_K = 3;

/**
 * The 3x3 matrix, indexed [down][across] — [y][x], y being the SECOND metric.
 *
 * Stevens' cyan/magenta scheme. Chosen over the more common purple/green because its
 * two axes separate on different perceptual channels rather than both on hue, which
 * is what gives a red-green-deficient reader any chance at all: one axis moves largely
 * in lightness. Bivariate is inherently hard for colour-vision deficiency and no
 * palette makes it easy — which is why the matrix legend is not optional furniture
 * here, and why the table view remains the equivalent for anyone the colours fail.
 */
export const BIVARIATE_PALETTE: readonly (readonly string[])[] = [
  // Rows run low -> high on the SECOND metric; columns low -> high on the first.
  // Each row carries its own annotation because the rule reads lines, not blocks —
  // which is the point of it: a colour that moves should not be able to hide behind
  // a comment three lines above (#501, #523).
  ["#e8e8e8", "#ace4e4", "#5ac8c8"], // no-token: DATA palette, not a UI role — as lib/breaks.ts ramps
  ["#dfb0d6", "#a5add3", "#5698b9"], // no-token: DATA palette, not a UI role — as lib/breaks.ts ramps
  ["#be64ac", "#8c62aa", "#3b4994"], // no-token: DATA palette, not a UI role — as lib/breaks.ts ramps
] as const;

export type BivariateClass = { x: number; y: number };

/** Which class does a value fall in, given the k-1 inner edges? Edge belongs above. */
export function axisClass(v: number, edges: number[]): number {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i += 1;
  return Math.min(i, BIVARIATE_K - 1);
}

/** The fill for a pair of values. */
export function bivariateColor(
  vx: number, edgesX: number[],
  vy: number, edgesY: number[],
): string {
  const x = axisClass(vx, edgesX);
  const y = axisClass(vy, edgesY);
  return BIVARIATE_PALETTE[y][x];
}

/** Regions carrying a usable value in BOTH metrics. */
export function sharedRegions(
  a: Record<string, number>,
  b: Record<string, number>,
): string[] {
  return Object.keys(a).filter(
    (c) => Number.isFinite(a[c]) && Number.isFinite(b[c]),
  );
}

export type Eligibility = {
  ok: boolean;
  /** Reader-facing. Shown wherever the pair is offered or refused. */
  reason: string;
  shared: number;
  floor: number | null;
};

/**
 * May these two be drawn as one bivariate map?
 *
 * Refuses with a reason rather than returning a bare false: every refusal here is
 * something a reader picked and is entitled to an explanation for, and a picker that
 * silently omits options teaches nothing about why.
 */
export function bivariateEligible(args: {
  level: string;
  xId: string; xUnit: string; xValues: Record<string, number>;
  yId: string; yUnit: string; yValues: Record<string, number>;
}): Eligibility {
  const { level, xId, xUnit, xValues, yId, yUnit, yValues } = args;

  if (xId === yId) {
    return { ok: false, reason: "A metric cannot be paired with itself.", shared: 0, floor: null };
  }
  if (!isTransitionLevel(level)) {
    return {
      ok: false,
      shared: 0,
      floor: null,
      reason: "Pairs are drawn on the current districts and states. The as-reported 2011 view is a different geography.",
    };
  }

  const floor = TRANSITION_FLOOR[level];

  // Extensive on either axis and the area bias is back, with no second channel left
  // to escape into. The resolver decides; this does not re-derive it.
  for (const [id, unit, vals, which] of [
    [xId, xUnit, xValues, "first"],
    [yId, yUnit, yValues, "second"],
  ] as const) {
    if (preferredViz(id, unit, Object.values(vals)) !== "choropleth") {
      return {
        ok: false,
        shared: 0,
        floor,
        reason: `The ${which} metric is a total, and totals are drawn as circles here because shading one lets a large district shout. A pair map has only colour to work with, so both sides have to be rates.`,
      };
    }
  }

  const shared = sharedRegions(xValues, yValues).length;
  if (shared < floor) {
    return {
      ok: false,
      shared,
      floor,
      reason: `These two overlap on only ${shared} regions, below the ${floor} a pair needs. A pair is only as good as the ground both sides cover.`,
    };
  }

  return {
    ok: true,
    shared,
    floor,
    reason: `Both are rates and both cover ${shared} regions, so the pair holds.`,
  };
}
