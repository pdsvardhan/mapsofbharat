// Value-by-alpha: fading a rate map by how many people each region holds (#408, item 1077).
//
// WHAT IT FIXES, AND WHAT IT DOES NOT
//
// Proportional symbols fixed one half of area-size bias: a COUNT drawn as colour lets
// a large district shout, so counts became circles. This is the other half, and it
// bites the metrics symbols never touch — the rates.
//
// A choropleth's visual weight is AREA. The thing a rate is about is PEOPLE. Where
// those two disagree, the impression the map leaves is not the impression the data
// supports. buddhist_pct is the clearest case in this catalogue: Buddhists concentrate
// in Ladakh, Arunachal and Sikkim, which are enormous and nearly empty, so the map
// reads 2.55% by area against 0.69% by population. Nothing about the colours is wrong.
// The map is simply answering "how much of India's SURFACE is Buddhist" while the
// reader is asking "how many of India's PEOPLE are".
//
// research/758 calls the remedy trivial — "one `fill-opacity` expression alongside
// `fill-color`" — degrading gracefully, and unconditionally compliant with the
// boundary rules because it touches no geometry.
//
// WHY IT IS NOT A SWITCH (owner ruling, 2026-08-27, under to-do #575)
//
// "Form is a property of the DATA, not a reader choice." A toggle here would offer
// the reader a version of the map we have already decided misrepresents the subject.
// So the map applies it where the data warrants it and says so, and offers nothing
// where it does not.
//
// WHEN IS IT WARRANTED — AND THE FIRST ANSWER WAS WRONG
//
// The first criterion compared the area-weighted mean of the metric with the
// population-weighted mean and asked whether they fell in different classes. It was
// built around buddhist_pct, which reads 2.55% by surface against 0.69% by people —
// a 3.7x gap, the largest in the catalogue.
//
// Measured, that criterion did not fire for buddhist_pct at all: jenks on so skewed a
// distribution puts both means inside one enormous bottom class. Chasing the
// classification would have been the wrong repair, because the deeper objection is
// that BUDDHIST_PCT IS NOT A CASE FOR THIS REMEDY. A reader looking at that map does
// not conclude "India is 2.55% Buddhist". They conclude "Buddhists are concentrated in
// Ladakh, Sikkim and Arunachal", which is true, is the point of the map, and is
// exactly what fading those districts would erase. Its class-share divergence is
// 0.041 — near the bottom of the catalogue — and that is the correct answer.
//
// So the question is not "do the two averages disagree" but "is the map's COLOUR in
// the same places as the PEOPLE". For each class of the map's own legend, take the
// share of the total surface it covers and the share of the population it holds, and
// sum the differences (total variation distance, halved, so it runs 0 to 1):
//
//     TVD = ½ Σ | areaShare[k] − popShare[k] |
//
// TVD is the fraction of the map's colour sitting in a band that does not describe
// where people live. At 0 the surface and the population are coloured alike and the
// reader's impression is sound. High, and most of what the eye takes in is a band
// that most Indians are not in.
//
// The threshold is 0.15, chosen from the measured distribution over 70 district rates
// (2026-08-27): p50 = 0.075, p90 = 0.169, max = 0.312. It fires for 9 of the 70 —
// pop_density (0.312), work_participation (0.236), mgnrega_active_workers_per_1000
// (0.224), cattle_per_1000 (0.197), st_pct (0.190), cultivators_pct (0.184) — every
// one a metric where the map's surface is dominated by rural districts whose band is
// not the band most people live in. It does not fire for the NFHS health indicators,
// which are spread evenly, nor for the concentrated minority shares, which are not
// misleading anybody.
//
// The criterion moves with the metric's own classification: change the break method
// or the class count and the answer changes with it, correctly, because what is being
// asked is whether THIS map, as drawn, misleads.
//
export const ALPHA_MIN = 0.28;
export const ALPHA_MAX = 0.95;

/** How much of the map's colour has to move before the fade is earned.
 *
 *  0.15, from the measured distribution over 70 district rates (2026-08-27):
 *  p50 = 0.075, p90 = 0.169, max = 0.312. Fires for 9 of the 70. A threshold that
 *  fired for all of them would be a blanket rule wearing a criterion's clothes; one
 *  that fired for none would be dead code. */
export const TVD_THRESHOLD = 0.15;

export type Warrant = {
  warranted: boolean;
  /** Reader-facing, and shown in the legend when it fires. */
  reason: string;
  /** Fraction of the map's colour sitting in a band that is not where people are. */
  tvd: number | null;
  /** Share of the total SURFACE in each class of the legend. */
  areaShare: number[] | null;
  /** Share of the total POPULATION in each class of the legend. */
  popShare: number[] | null;
  /** Regions that carried both a value and a population. */
  n: number;
};

/**
 * Region areas in km², recovered from the two Census series.
 *
 * A zero or missing density is dropped rather than defaulted: a region with no
 * recoverable area must not be given an invented one and then weighted by it.
 */
export function regionAreas(
  pop: Record<string, number>,
  density: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of Object.keys(pop)) {
    const d = density[code];
    const p = pop[code];
    if (!Number.isFinite(d) || !Number.isFinite(p) || d <= 0 || p <= 0) continue;
    out[code] = p / d;
  }
  return out;
}

/** Σ(value × weight) / Σ(weight), or null when nothing carries weight. */
export function weightedMean(
  values: Record<string, number>,
  weights: Record<string, number>,
  codes: string[],
): number | null {
  let num = 0;
  let den = 0;
  for (const c of codes) {
    const w = weights[c];
    const v = values[c];
    if (!Number.isFinite(w) || !Number.isFinite(v) || w <= 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

/**
 * Which class does this value land in, given the legend's inner edges?
 *
 * `edges` is what computeBreaks returns: the k-1 boundaries between k classes. A
 * value equal to an edge belongs to the class ABOVE it, matching colorFor.
 */
export function classIndex(v: number, edges: number[]): number {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i += 1;
  return i;
}

/**
 * Does this map's average impression differ, by a whole class, from its average
 * truth about people?
 *
 * Deliberately conservative about its own inputs. Fewer than 30 regions carrying
 * both a value and a population, or no edges, means the question was not answerable
 * — and an unanswerable question is reported as such, never rounded down to "no".
 */
export function alphaWarrant(args: {
  values: Record<string, number>;
  pop: Record<string, number>;
  area: Record<string, number>;
  edges: number[];
}): Warrant {
  const { values, pop, area, edges } = args;
  const codes = Object.keys(values).filter(
    (c) => Number.isFinite(values[c]) && pop[c] > 0 && area[c] > 0,
  );
  const none = (reason: string): Warrant => ({
    warranted: false, reason, tvd: null, areaShare: null, popShare: null, n: codes.length,
  });

  if (edges.length === 0) return none("no class breaks to compare against");
  if (codes.length < 30) {
    return none(`only ${codes.length} regions carry both a value and a population — too few to weigh`);
  }

  const k = edges.length + 1;
  const areaShare = new Array<number>(k).fill(0);
  const popShare = new Array<number>(k).fill(0);
  let areaTotal = 0;
  let popTotal = 0;
  for (const c of codes) {
    const i = classIndex(values[c], edges);
    areaShare[i] += area[c];
    popShare[i] += pop[c];
    areaTotal += area[c];
    popTotal += pop[c];
  }
  if (areaTotal <= 0 || popTotal <= 0) return none("no weights available");
  for (let i = 0; i < k; i += 1) {
    areaShare[i] /= areaTotal;
    popShare[i] /= popTotal;
  }

  let tvd = 0;
  for (let i = 0; i < k; i += 1) tvd += Math.abs(areaShare[i] - popShare[i]);
  tvd /= 2;

  if (tvd < TVD_THRESHOLD) {
    return {
      warranted: false,
      reason: "The map's colours sit roughly where the people do, so nothing is faded.",
      tvd, areaShare, popShare, n: codes.length,
    };
  }

  // Which way the surface leans, so the sentence can say something true rather than
  // something general: the class holding the most surface against the one holding
  // the most people.
  const loudest = areaShare.indexOf(Math.max(...areaShare));
  const livedIn = popShare.indexOf(Math.max(...popShare));
  const direction = loudest === livedIn
    ? "spread differently across the bands"
    : loudest > livedIn ? "in a higher band" : "in a lower band";

  return {
    warranted: true,
    reason:
      `${Math.round(tvd * 100)}% of this map's colour is in a band that does not describe where `
      + `people live — most of the surface is ${direction} from most of the population. Regions `
      + "are faded by how many people they hold, so the picture reads closer to the country than "
      + "to its acreage.",
    tvd, areaShare, popShare, n: codes.length,
  };
}

/**
 * The opacity for a region holding `pop` people, given the population range.
 *
 * LOG, not linear. District populations here span Thane's 11.06M to Dibang Valley's
 * 8,004 — three orders of magnitude — and a linear ramp would put all but a few dozen
 * districts on the floor, which is not a fade but an erasure.
 *
 * The floor is ALPHA_MIN and not zero on purpose. 758 asks for graceful degradation,
 * and a region faded out of existence cannot be hovered, read or corrected. Carrying
 * few people is a reason to be quieter, never a reason to disappear.
 */
export function alphaFor(pop: number, lo: number, hi: number): number {
  if (!Number.isFinite(pop) || pop <= 0) return ALPHA_MIN;
  if (!(hi > lo) || lo <= 0) return ALPHA_MAX;
  const t = (Math.log(pop) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  const c = Math.min(1, Math.max(0, t));
  return ALPHA_MIN + c * (ALPHA_MAX - ALPHA_MIN);
}

/** The p5/p95 of a population set — the ramp's ends, robust to a single outlier. */
export function alphaBounds(pop: Record<string, number>, codes: string[]): { lo: number; hi: number } {
  const xs = codes.map((c) => pop[c]).filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (xs.length === 0) return { lo: 1, hi: 1 };
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round((xs.length - 1) * q)))];
  return { lo: at(0.05), hi: at(0.95) };
}

/** Per-region opacity for the whole layer. Empty when the warrant did not fire. */
export function alphaByRegion(
  pop: Record<string, number>,
  codes: string[],
): Record<string, number> {
  const { lo, hi } = alphaBounds(pop, codes);
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = alphaFor(pop[c], lo, hi);
  return out;
}
