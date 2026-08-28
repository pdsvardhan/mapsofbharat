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

/** The opacity a fill carries when NOTHING is faded — the flat value this layer used
 *  before value-by-alpha existed. Exported because three things have to agree on it:
 *  the map's paint expression, the legend's key, and the measurement below of how far
 *  a faded fill sits from a region we have no number for. */
export const ALPHA_UNFADED = 0.9;

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
  // FINITE, not merely positive — on the weights as well as the values. `> 0` admits
  // Infinity, and one infinite weight makes every share NaN. NaN then fails
  // `tvd < TVD_THRESHOLD` (every comparison against NaN is false), so the refusal
  // branch was skipped and the legend told the reader "NaN% of this map's colour is in
  // a band that does not describe where people live". This module's stated contract is
  // the opposite: an unanswerable question is reported as such, never rounded down.
  const codes = Object.keys(values).filter(
    (c) => Number.isFinite(values[c])
      && Number.isFinite(pop[c]) && pop[c] > 0
      && Number.isFinite(area[c]) && area[c] > 0,
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

  // A tvd that is not a number is not a "no". The filter above should make this
  // unreachable, and it is kept anyway because the failure mode it guards is silent:
  // `tvd < TVD_THRESHOLD` is FALSE for NaN, so an unguarded fall-through lands in the
  // WARRANTED branch and fades the whole map on a number nobody could compute.
  if (!Number.isFinite(tvd)) return none("the weights did not produce a comparable share");

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
  // AN UNUSABLE POPULATION IS NOT A SMALL ONE. A fade is a claim — "few people live
  // here" — so the safe answer for a count we could not read (NaN, Infinity) is the
  // one that claims nothing: no fade. It used to return the floor, which asserted
  // emptiness about a region on the strength of a broken number. Same answer the
  // degenerate lo/hi paths below already give, for the same reason.
  if (!Number.isFinite(pop)) return ALPHA_MAX;
  // Zero or negative is different: zero people IS the claim the floor makes, and it is
  // the one the ramp cannot express (log 0 is undefined).
  if (pop <= 0) return ALPHA_MIN;
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

// ── WHAT THE FADE COSTS, AND WHAT PAYS FOR IT (item 1077 round 2) ────────────
//
// The fade is an OPACITY, so what a reader actually sees is the class colour
// COMPOSITED over the map's background layer. Measured across the ramp, the floor
// does real damage: adjacent-class contrast on the default navyYellow ramp falls
// from 1.68/1.78/1.77/1.81 at a=0.95 to 1.11/1.15/1.19/1.27 at a=0.28, and
// class 1 against class 5 from 9.60 to 1.94. That is the fade working — a region
// holding 8,004 people is MEANT to recede — and the remedy is not to weaken it but
// to give the reader a key that decodes it (LegendCard's colour x alpha grid).
//
// One consequence is not acceptable and is fixed here. A faded class-5 fill
// composites to rgb(77,71,37) against a no-data tone of rgb(39,37,28): contrast
// 1.64, down from 8.64 unfaded. A region we have a HIGH number for and a region we
// have NO number for became the same warm olive. So no-data stops being a tone at
// all: it carries a hatch, and a flat fill cannot imitate a texture at any opacity.
//
// WHY THIS IS NOT adr-019 WALKING BACK IN. That decision dropped an ambient hatch
// over ESTIMATED districts, on three grounds — it was invisible (1.09:1, and an 8px
// tile at pixelRatio 2 that aliased to flat tone), it was disproportionate (2.7% of
// district data, up to 12% of India hatched), and an estimate's caveat belongs where
// the number is read. None of the three transfers. This marks the ABSENCE of a
// number, which no hover can disclose because there is nothing to hover; it is
// measured rather than assumed (the stripe stands 12.0:1 against its own ground, and
// no fill in this atlas can sit close to both stripe and ground at once — worst case
// 3.47:1, above WCAG's 3:1 floor for non-text); and its tile is pixelRatio 1, so it is
// never downsampled into the flat tone adr-019 measured.

/** The map's background layer — what every fill composites over (india-map's `bg`).
 *  The map imports it, so the paint and the measurements here cannot drift apart. */
export const MAP_GROUND = "#0d0f14"; // token: --background

/** "We have no number for this region." */
export const NO_DATA_FILL = "#2a271d"; // token: --map-nodata

/** The hatch stripe. Full strength on purpose: the separation claimed above holds
 *  because a fill cannot be close to BOTH the stripe and the ground, and the further
 *  apart those two are, the wider that guarantee. */
export const NO_DATA_HATCH = "#e9e3d5"; // token: --foreground
/** Tile edge in px, and the diagonal period inside it. The tile must be a multiple of
 *  the period or the pattern seams at every tile edge. 1 stripe pixel in 4 = 25% of
 *  the patch, enough to read as texture on a district a few pixels across. */
export const NO_DATA_HATCH_TILE = 8;
export const NO_DATA_HATCH_PERIOD = 4;

/** Parse "#rrggbb" or "rgb(r,g,b)" / "rgba(...)" — the two forms the ramps emit. */
function rgbOf(c: string): [number, number, number] {
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = c.replace("#", "").trim();
  if (h.length === 3) {
    return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as [number, number, number];
  }
  return [
    parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
  ];
}

/** `fill` painted at `alpha` over `ground`, as "#rrggbb" — the colour the map ends up
 *  showing, which is the only one worth measuring or keying. */
export function alphaComposite(fill: string, alpha: number, ground: string = MAP_GROUND): string {
  const a = Math.max(0, Math.min(1, alpha));
  const f = rgbOf(fill);
  const g = rgbOf(ground);
  const mix = (i: number) => Math.round(f[i] * a + g[i] * (1 - a));
  return `#${[0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2.1 relative luminance.
 *
 *  Deliberately not lib/breaks.ts's `luminance()`, which is an ungamma-corrected
 *  weighted average — fine for the cheap "is this fill pale?" seam decision it was
 *  written for, wrong for a contrast ratio anyone quotes. */
export function relativeLuminance(c: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two OPAQUE colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CIE L*a*b* (D65), for the questions contrast cannot answer.
 *
 *  Contrast ratio is LUMINANCE ONLY, and half the ramps in this atlas do not encode in
 *  luminance: the two ends of the Red–Blue diverging ramp are a dark red and a dark
 *  blue that measure 1.03:1 apart and are impossible to confuse. Asking "is this fill
 *  still a colour rather than the background" with a luminance ratio would have
 *  demanded a different palette rather than measured the fade. */
function labOf(c: string): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(c).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual distance between two opaque colours (CIE76). ~2.3 is the just-noticeable
 *  difference; 0 means the two are the same colour. */
export function deltaE(a: string, b: string): number {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * The no-data hatch as a raw RGBA tile, for MapLibre's addImage.
 *
 * Built pixel by pixel rather than stroked onto a canvas: an antialiased line has no
 * exact colour, and the separation this file claims is a claim about a MEASURED one.
 * Every pixel here is either the stripe at full strength or fully transparent, so what
 * a test measures is what the GPU uploads.
 */
export function noDataHatchTile(): { width: number; height: number; data: Uint8Array } {
  const s = NO_DATA_HATCH_TILE;
  const [r, g, b] = rgbOf(NO_DATA_HATCH);
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      if ((x + y) % NO_DATA_HATCH_PERIOD !== 0) continue;
      const i = (y * s + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: s, height: s, data };
}

/** The same hatch as a CSS background image, for the legend's key.
 *
 *  Derived from the same two constants as the tile so the key cannot drift from the
 *  map. The stripe is a full pixel here rather than the tile's 1/√2 perpendicular
 *  width: a sub-pixel CSS gradient stop antialiases to a dimmer line, and a key that
 *  renders fainter than the thing it keys is a key that teaches the wrong mark. */
export function noDataHatchCss(): string {
  const gap = (NO_DATA_HATCH_PERIOD / Math.SQRT2).toFixed(2);
  return `repeating-linear-gradient(45deg, ${NO_DATA_HATCH} 0 1px, transparent 1px ${gap}px)`;
}
