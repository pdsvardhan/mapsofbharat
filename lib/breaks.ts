// Class-break computation + colour ramps for the choropleth.
// Atlas curated ramp set (iter-51 item 392): six editorial ramps with
// Navy–Yellow as the default; all four break methods kept (item 393).
// Continuous ("Smooth") remains the default method.

import {
  interpolateViridis,
  interpolateYlOrBr,
  interpolateRdBu,
  interpolateSpectral,
} from "d3-scale-chromatic";

export type BreakMethod =
  | "continuous" | "quantile" | "equal" | "jenks"
  // item 757, from the choropleth research brief (research/758-*.md):
  | "zeroFloor"    // tie mass at the floor gets its own class; jenks the remainder
  | "reference"    // diverging, critical break pinned at an EXTERNAL reference
  | "log";         // equal-interval in LOG space — spreads a positive right-skew tail (item C7)

/** Methods a user may pick for any metric. zeroFloor, reference and log are
 *  omitted deliberately: each is only meaningful for a metric whose distribution
 *  (or metadata) warrants it, so the picker offers them conditionally — see
 *  applicableMethods(). log needs strictly-positive values (undefined at <=0). */
export const UNIVERSAL_METHODS: BreakMethod[] = ["continuous", "quantile", "equal", "jenks"];

export const ALL_METHODS: BreakMethod[] = [...UNIVERSAL_METHODS, "zeroFloor", "reference", "log"];

export function isBreakMethod(v: unknown): v is BreakMethod {
  return typeof v === "string" && (ALL_METHODS as string[]).includes(v);
}

/** External reference values for metrics whose scale has a meaningful pivot.
 *
 *  These cannot be inferred from the data — a reference is a fact about what the
 *  number MEANS, and centring on the median instead would silently normalise away
 *  the very deficit the map exists to show (1000 = parity; India's 2011 census
 *  sex ratio was 943, i.e. below it). Keyed by metric id. */
export const METRIC_REFERENCE: Record<string, number> = {
  sex_ratio: 1000,        // females per 1000 males — 1000 is parity
  child_sex_ratio: 1000,  // same unit, same pivot
};
export type PaletteId = "navyYellow" | "sunset" | "rdbuDiv" | "earth" | "spectral" | "viridis";

export { interpolateRdBu }; // used for the vs-avg diverging mode

/** Piecewise-linear interpolation through fixed hex stops. */
function rampFromStops(stops: string[]): (t: number) => string {
  const rgb = stops.map((h) => {
    const s = h.replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  });
  return (t: number) => {
    const c = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(c));
    const f = c - i;
    const mix = (k: number) => Math.round(rgb[i][k] + (rgb[i + 1][k] - rgb[i][k]) * f);
    return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
  };
}

export const PALETTES: Record<PaletteId, { name: string; fn: (t: number) => string; note: string }> = {
  navyYellow: {
    name: "Navy – Yellow",
    fn: rampFromStops(["#16263e", "#3d4b66", "#6e7280", "#ab9f68", "#f0d64f"]),
    note: "editorial default",
  },
  sunset: {
    name: "Sunset",
    fn: rampFromStops(["#fad873", "#f2a167", "#e17a8b", "#c25390", "#9c3492", "#6f2382"]),
    note: "gold → violet",
  },
  rdbuDiv: { name: "Red – Blue", fn: (t) => interpolateRdBu(1 - t), note: "diverging, blue low" },
  earth: { name: "Earth", fn: interpolateYlOrBr, note: "browns — burden/pollution" },
  spectral: { name: "Spectral", fn: (t) => interpolateSpectral(1 - t), note: "diverging, not CB-safe" },
  viridis: { name: "Viridis", fn: interpolateViridis, note: "colour-blind safe" },
};

export const DEFAULT_PALETTE: PaletteId = "navyYellow";

/** Suggested palette per topic (iter-53 item 403) — applied on metric pick
    unless the user has manually chosen a ramp. */
export const SUGGESTED_PALETTE: Record<string, PaletteId> = {
  crime: "rdbuDiv",
  health: "sunset",
  // iter-58 item 431: safety = burden metrics (suicide/road deaths) like crime;
  // infrastructure (tap water / power / connectivity) reads well on the
  // colour-blind-safe viridis ramp.
  safety: "rdbuDiv",
  infrastructure: "viridis",
};

/** Old palette ids from shared links → nearest current Atlas ramp. */
export function normalizePalette(id: string | null): PaletteId {
  if (id && id in PALETTES) return id as PaletteId;
  if (id === "cividis" || id === "ylgnbu") return "viridis";
  if (id === "rdbu") return "rdbuDiv";
  if (id === "plasma") return "sunset";
  if (id === "blues") return "navyYellow";
  return DEFAULT_PALETTE;
}

/** k-1 inner break points for the chosen method (values sorted ascending). */
export function computeBreaks(values: number[], method: BreakMethod, k = 5, ref?: number | null): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length < k || method === "continuous") return [];
  if (method === "quantile") {
    const out: number[] = [];
    for (let i = 1; i < k; i++) out.push(v[Math.floor((i * v.length) / k)]);
    return out;
  }
  if (method === "equal") {
    const min = v[0], max = v[v.length - 1], step = (max - min) / k;
    return Array.from({ length: k - 1 }, (_, i) => min + step * (i + 1));
  }
  if (method === "zeroFloor") return zeroFloorBreaks(v, k);
  if (method === "reference") return referenceBreaks(v, k, ref ?? null);
  if (method === "log") return logBreaks(v, k);
  return jenksBreaks(v, k);
}

/** Equal-interval breaks in LOG space (item C7). On a right-skewed positive
 *  series this spreads the crowded low tail across classes while preserving
 *  orders of magnitude — the thing quantile flattens. Undefined at <=0, so it
 *  falls back to jenks if any value is non-positive (the picker only offers it
 *  for strictly-positive series, but guard anyway). */
function logBreaks(sorted: number[], k: number): number[] {
  if (sorted[0] <= 0) return jenksBreaks(sorted, k);
  const lmin = Math.log(sorted[0]), lmax = Math.log(sorted[sorted.length - 1]);
  const step = (lmax - lmin) / k;
  return Array.from({ length: k - 1 }, (_, i) => Math.exp(lmin + step * (i + 1)));
}

/** Tie-mass-at-the-floor classing (item 757).
 *
 *  When a large share of regions sit at exactly the minimum — 60.7% of districts
 *  report 0% Buddhist population, 51.4% report 0% Sikh — every quantile
 *  breakpoint collapses onto that one value. The result is not merely lopsided:
 *  because binning is `v >= edge`, all four collapsed edges are cleared at once
 *  and the FLOOR regions land in class 4 of 5, painted three-quarters of the way
 *  up the ramp. Districts with none of the thing were rendered as if they had a
 *  lot of it, and the three lowest colours rendered for nobody.
 *
 *  Evans (1977) is the named remedy: give the floor its own class and subdivide
 *  the remainder. The floor class is class 0, so it sits at the BOTTOM of the
 *  ramp where it belongs, and jenks runs over the strictly-greater values only. */
function zeroFloorBreaks(sorted: number[], k: number): number[] {
  const floor = sorted[0];
  const rest = sorted.filter((x) => x > floor);
  // Not enough distinct values above the floor to subdivide — one floor class and
  // one "everything else" class is the honest maximum.
  if (rest.length < k - 1) return rest.length ? [rest[0]] : [];
  // First edge = the smallest value above the floor, so exactly the tied floor
  // regions fall in class 0. Remaining k-2 edges come from jenks over the rest.
  const inner = jenksBreaks(rest, k - 1).filter((e) => e > rest[0]);
  return [rest[0], ...inner];
}

/** Diverging classing pinned at an external reference (item 757).
 *
 *  The reference is an edge, never a class centre, so the map cannot imply that a
 *  band straddling parity is "at parity". With k=5 the split is asymmetric (three
 *  classes below the pivot, two at or above it) — the research brief anticipates
 *  this and prefers it to moving the pivot.
 *
 *  Classes are allocated to each side IN PROPORTION to how many regions actually
 *  sit there, and cut by quantile within that side. Fixed symmetric steps either
 *  side of the pivot do not survive real data: every district's child sex ratio is
 *  below 1000, so symmetric bands put the whole country in one class and the
 *  method disqualified itself. Proportional allocation is what the brief's
 *  "asymmetric" actually requires. */
function referenceBreaks(sorted: number[], k: number, ref: number | null): number[] {
  if (ref == null) return jenksBreaks(sorted, k);
  const lo = sorted.filter((x) => x < ref);
  const hi = sorted.filter((x) => x >= ref);
  // Every non-empty side earns at least one class; the rest are shared out by
  // population so the busy side gets the resolution.
  const inner = k - 1;                       // edges available, one of which is ref
  if (!lo.length || !hi.length) {
    // One-sided: the pivot is still an edge (so "at or past the reference" stays
    // visually distinct even when almost nobody is), and the populated side is cut
    // by quantile.
    const side = lo.length ? lo : hi;
    const cuts = inner - 1;
    const qs = Array.from({ length: cuts }, (_, i) =>
      side[Math.floor(((i + 1) * side.length) / (cuts + 1))]);
    return [...new Set(lo.length ? [...qs, ref] : [ref, ...qs])].sort((a, b) => a - b);
  }
  let nLo = Math.max(1, Math.round(((inner - 1) * lo.length) / sorted.length));
  nLo = Math.min(nLo, inner - 2);             // leave at least one edge above ref
  const nHi = inner - 1 - nLo;
  const cut = (side: number[], m: number) =>
    Array.from({ length: m }, (_, i) => side[Math.floor(((i + 1) * side.length) / (m + 1))]);
  return [...new Set([...cut(lo, nLo), ref, ...cut(hi, nHi)])].sort((a, b) => a - b);
}

/** Jenks natural breaks via the classic Fisher dynamic-programming matrices. */
function jenksBreaks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  const mat1: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const mat2: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  for (let i = 1; i <= k; i++) {
    mat1[1][i] = 1;
    for (let j = 2; j <= n; j++) mat2[j][i] = Infinity;
  }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = sorted[i3 - 1];
      s2 += val * val;
      s1 += val;
      w++;
      const variance = s2 - (s1 * s1) / w;
      if (i3 !== 1) {
        for (let j = 2; j <= k; j++) {
          if (mat2[l][j] >= variance + mat2[i3 - 1][j - 1]) {
            mat1[l][j] = i3;
            mat2[l][j] = variance + mat2[i3 - 1][j - 1];
          }
        }
      }
    }
    mat1[l][1] = 1;
    mat2[l][1] = s2 - (s1 * s1) / w;
  }
  const breaks: number[] = [];
  let count = n;
  for (let j = k; j >= 2; j--) {
    const idx = mat1[count][j] - 2;
    breaks.unshift(sorted[idx]);
    count = mat1[count][j] - 1;
  }
  return breaks;
}

/** Relative luminance of an "rgb(r,g,b)" or "#rrggbb" colour, 0..1 (Rec. 709). */
function luminance(c: string): number {
  let r: number, g: number, b: number;
  const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
  else {
    const h = c.replace("#", "");
    if (h.length < 6) return 0;
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Boundary stroke derived from the fill it borders (iter-26 item 760).
 *
 *  A single fixed light stroke reads as harsh white wherever the ramp is
 *  saturated, and vanishes wherever it is pale — the owner's complaint was the
 *  first case, on the Red-Blue state map. Deriving the stroke per region keeps
 *  the seam legible at both ends of every ramp. Chosen from three treatments in
 *  the iter-26 design round; the alphas are that variant's, unchanged. */
export function strokeForFill(fill: string): string {
  return luminance(fill) > 0.55
    ? "rgba(13,15,20,0.75)"        // dark seam cut into a pale fill
    : "rgba(233,227,213,0.41)";    // soft light seam over a saturated one
}

/** Relative luminance of a fill, exported for callers that need to reason about a
 *  backdrop rather than a single bordering fill (to-do 348). */
export function fillLuminance(c: string): number {
  return luminance(c);
}

/** Outline colour for a boundary drawn OVER many differently-coloured fills.
 *
 *  item 760 derives each seam from the one fill it borders. A state outline over a
 *  DISTRICT map has no such fill — it runs past dozens of districts with different
 *  values — so the item-760 rule is undefined for it. This is the honest analogue:
 *  pick from the MEAN luminance of what is actually painted underneath, so the
 *  national context lines stop reading as harsh white over a saturated ramp without
 *  pretending to be derived per-region.
 *
 *  Deliberately a single colour per repaint, not per state: a per-state value would
 *  imply the outline encodes that state's data, which at district level it does not. */
export function outlineForBackdrop(meanLuminance: number): string {
  return meanLuminance > 0.55
    ? "rgba(13,15,20,0.42)"        // dark context line over a pale map
    : "rgba(233,227,213,0.26)";    // the original warm-white, over a dark map
}

/** How many values land in each class. Mirrors colorFor's binning exactly, so a
 *  legend built from this can never disagree with the colours on the map. */
export function classCounts(values: number[], edges: number[]): number[] {
  const out = new Array(edges.length + 1).fill(0) as number[];
  for (const v of values) {
    let bin = 0;
    while (bin < edges.length && v >= edges[bin]) bin++;
    out[bin]++;
  }
  return out;
}

/** A class swallowing more than this share of the regions makes a map that reads
 *  as one flat colour. Measured on upi_value_per_capita (skew 4.37): equal-interval
 *  put 682 of 731 districts — 93% — in class 1 (iter-26 item 756). */
export const MAX_CLASS_SHARE = 0.45;

/** Shape statistics the method selector keys on (item 757). */
export type DistShape = {
  n: number;
  /** bias-corrected Fisher-Pearson G1, matching scipy.stats.skew(bias=False) */
  skew: number;
  /** excess kurtosis (g2) */
  kurtosis: number;
  /** Sarle's bimodality coefficient; > 0.555 flags possible multimodality.
   *  Advisory only — skewed-unimodal data false-positives here, and there is no
   *  mature JS Hartigan dip test to check it against. */
  bimodality: number;
  /** Share of values sitting at exactly the minimum. This — not a near-zero
   *  fraction — is the statistic that predicts quantile tie-collapse, which bites
   *  once the tie mass reaches 1/k. */
  tieAtMin: number;
  /** Share within 1% of the range of the minimum. */
  nearMin: number;
  min: number;
  max: number;
};

export function describe(values: number[]): DistShape | null {
  const n = values.length;
  if (n < 5) return null;
  const mu = values.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of values) {
    const d = x - mu;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = m2 > 0 ? Math.sqrt(m2) : 0;
  const g1 = sd > 0 ? m3 / (sd * sd * sd) : 0;
  const skew = n > 2 ? g1 * Math.sqrt(n * (n - 1)) / (n - 2) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  const bimodality = n > 3
    ? (skew * skew + 1) / (kurtosis + (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3)))
    : 0;
  let min = Infinity, max = -Infinity;
  for (const x of values) { if (x < min) min = x; if (x > max) max = x; }
  const span = max - min || 1;
  let tie = 0, near = 0;
  for (const x of values) {
    if (x === min) tie++;
    if (x - min <= 0.01 * span) near++;
  }
  return { n, skew, kurtosis, bimodality, tieAtMin: tie / n, nearMin: near / n, min, max };
}

export type MethodChoice = {
  method: BreakMethod;
  /** Why the selector landed here — rendered in the scale popover so an automatic
   *  choice is never silent. */
  reason: string;
  /** Largest share of regions in any one class under the chosen method. */
  maxShare: number;
};

/** Which methods make sense to OFFER for this series. zeroFloor is meaningless
 *  without a tie mass to split off, and reference without a reference value. */
export function applicableMethods(shape: DistShape | null, ref: number | null, k = 5): BreakMethod[] {
  const out = [...UNIVERSAL_METHODS];
  if (shape && shape.tieAtMin >= 1 / k) out.push("zeroFloor");
  if (ref != null) out.push("reference");
  if (shape && shape.min > 0) out.push("log"); // log is undefined at <=0
  return out;
}

/** Data-driven method choice (item 757) — "choose the method from the data".
 *
 *  Deliberately NOT the static skew-threshold table from the research brief. That
 *  table routes |skew| >= 1 to jenks, and measured against this project's own
 *  series jenks degenerates exactly where the brief expects it to help:
 *  christian_pct/district puts 86.6% in one class under jenks against 35.3% under
 *  quantile, and muslim_pct, hindu_pct and pop_density regress the same way.
 *  Jenks minimises within-class variance, which on a heavy tail means one vast low
 *  class — the owner's original complaint, reintroduced by the fix for it.
 *
 *  So the ladder is preference-ordered but OCCUPANCY-CHECKED: take the most
 *  value-faithful method that does not collapse the map. Because the check is on
 *  the realised class counts rather than on a proxy statistic, this cannot regress
 *  a metric relative to a method further down the ladder.
 *
 *  Class count stays fixed at k=5 (brief: no citable threshold justifies varying
 *  it, and 5 matches modal cartographic practice). */
export function selectMethod(
  values: number[],
  opts: { isPct: boolean; reference?: number | null },
  k = 5,
): MethodChoice {
  const shape = describe(values);
  const ref = opts.reference ?? null;
  const share = (m: BreakMethod) => {
    const e = computeBreaks(values, m, k, ref);
    if (!e.length) return 1;
    return Math.max(...classCounts(values, e)) / values.length;
  };
  if (!shape) return { method: "quantile", reason: "too few regions to profile", maxShare: 1 };

  const ladder: { method: BreakMethod; when: boolean; reason: string }[] = [
    {
      method: "reference", when: ref != null,
      reason: `pinned at ${ref} — the scale has an external reference, so the pivot is not the median`,
    },
    {
      method: "zeroFloor", when: shape.tieAtMin >= 1 / k,
      reason: `${Math.round(shape.tieAtMin * 100)}% of regions sit at ${shape.min}${
        ""}, which collapses every quantile break onto one value — the floor gets its own class`,
    },
    {
      method: "equal", when: opts.isPct && Math.abs(shape.skew) < 0.5 && shape.bimodality <= 0.555,
      reason: "near-symmetric bounded percentage — round, evenly-spaced edges read most easily",
    },
    {
      // Preferred over quantile for a positive right-skew because it BOTH spreads
      // the low tail AND preserves orders of magnitude (quantile flattens them).
      // Occupancy-checked below, so it is only taken when it actually declusters.
      method: "log", when: shape.min > 0 && shape.skew > 1,
      reason: `right-skewed and strictly positive (skew ${shape.skew.toFixed(1)}) — log spacing spreads the low tail while keeping orders of magnitude`,
    },
    // Quantile sits ABOVE jenks deliberately, and this order is measured rather
    // than assumed. Preferring jenks raised the dominant-class share on 21 series
    // (household_industry_pct/district 23% -> 39%, poverty_mpi/district 21% -> 44%)
    // because jenks minimises within-class variance, which on a heavy tail means one
    // vast low class. Every one of those is a step TOWARDS the complaint this item
    // exists to fix. Brewer & Pickle (2002) also found quantile most accurate for
    // single-map reading, which is how this atlas is overwhelmingly used.
    { method: "quantile", when: true, reason: `skew ${shape.skew.toFixed(1)} — rank-balanced classes keep the map legible` },
    { method: "jenks", when: true, reason: "quantile collapses on this distribution; natural gaps carry the classes instead" },
  ];

  let best: MethodChoice | null = null;
  for (const c of ladder) {
    if (!c.when) continue;
    const s = share(c.method);
    if (s <= MAX_CLASS_SHARE) return { method: c.method, reason: c.reason, maxShare: s };
    if (!best || s < best.maxShare) best = { method: c.method, reason: c.reason, maxShare: s };
  }
  // Nothing clears the threshold: keep the least-collapsed candidate and say so,
  // rather than pretending a lopsided map is a balanced one.
  return best
    ? { ...best, reason: `${best.reason} · no method avoids a dominant class here (${Math.round(best.maxShare * 100)}%)` }
    : { method: "quantile", reason: "fallback", maxShare: 1 };
}

// computeBreaksGuarded() lived here until item 757. Its two-rung ladder
// (jenks, then quantile) was a narrower version of selectMethod() above, and its
// own comment recorded the case it could not fix: buddhist_pct left 78.3% in one
// class because neither rung can split a tie mass. selectMethod supersedes it —
// same occupancy test, wider ladder, and it reports WHY it chose. Callers keep the
// contract the guard documented: only run it on the automatic path, never over a
// deliberate pick.

/** Colour for a value given breaks (binned) or min/max span (continuous). */
export function colorFor(
  v: number, min: number, max: number, breaks: number[], palette: (t: number) => string
): string {
  if (!breaks.length) {
    const span = max - min || 1;
    return palette(Math.max(0, Math.min(1, (v - min) / span)));
  }
  let bin = 0;
  while (bin < breaks.length && v >= breaks[bin]) bin++;
  return palette(breaks.length === 0 ? 0 : bin / breaks.length);
}

export function fmtBin(
  edges: number[], min: number, max: number, decimals: number, method?: BreakMethod,
): string[] {
  const f = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  const all = [min, ...edges, max];
  const out = all.slice(0, -1).map((lo, i) => `${f(lo)}–${f(all[i + 1])}`);
  // The floor class holds exactly one value, so a range label ("0–0.1") would
  // overstate it: every region in that class reads precisely the floor (item 757).
  if (method === "zeroFloor" && out.length) out[0] = f(min);
  return out;
}
