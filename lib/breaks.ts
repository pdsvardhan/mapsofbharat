// Class-break computation + colour ramps for the choropleth.
// Atlas curated ramp set (iter-51 item 392): six editorial ramps with
// Navy–Yellow as the default; all four break methods kept (item 393).
// Continuous ("Smooth") remains the default method.

import {
  interpolateViridis,
  interpolateBlues,
  interpolatePlasma,
  interpolateYlGnBu,
  interpolateRdBu,
  interpolateSpectral,
} from "d3-scale-chromatic";

export type BreakMethod = "continuous" | "quantile" | "equal" | "jenks";
export type PaletteId = "navyYellow" | "blues" | "plasma" | "ylgnbu" | "spectral" | "viridis";

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
  blues: { name: "Blues", fn: interpolateBlues, note: "sequential" },
  plasma: { name: "Plasma", fn: interpolatePlasma, note: "high contrast" },
  ylgnbu: { name: "Yellow–Green–Blue", fn: (t) => interpolateYlGnBu(1 - t), note: "sequential" },
  spectral: { name: "Spectral", fn: (t) => interpolateSpectral(1 - t), note: "diverging, not CB-safe" },
  viridis: { name: "Viridis", fn: interpolateViridis, note: "colour-blind safe" },
};

export const DEFAULT_PALETTE: PaletteId = "navyYellow";

/** Old Observatory palette ids from shared links → nearest Atlas ramp. */
export function normalizePalette(id: string | null): PaletteId {
  if (id && id in PALETTES) return id as PaletteId;
  if (id === "cividis") return "viridis";
  if (id === "rdbu") return "spectral";
  return DEFAULT_PALETTE;
}

/** k-1 inner break points for the chosen method (values sorted ascending). */
export function computeBreaks(values: number[], method: BreakMethod, k = 5): number[] {
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
  return jenksBreaks(v, k);
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

export function fmtBin(edges: number[], min: number, max: number, decimals: number): string[] {
  const f = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  const all = [min, ...edges, max];
  return all.slice(0, -1).map((lo, i) => `${f(lo)}–${f(all[i + 1])}`);
}
