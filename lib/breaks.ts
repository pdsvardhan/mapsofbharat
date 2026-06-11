// Class-break computation + colour ramps for the choropleth (iter-15 item 164).
// Continuous mode remains the default; class breaks bin values into k classes
// and the legend shows bin edges.

import {
  interpolateViridis,
  interpolateCividis,
  interpolateRdBu,
  interpolateSpectral,
} from "d3-scale-chromatic";

export type BreakMethod = "continuous" | "quantile" | "equal" | "jenks";
export type PaletteId = "viridis" | "cividis" | "rdbu" | "spectral";

export const PALETTES: Record<PaletteId, { name: string; fn: (t: number) => string; note: string }> = {
  viridis: { name: "Viridis", fn: interpolateViridis, note: "colour-blind safe (default)" },
  cividis: { name: "Cividis", fn: interpolateCividis, note: "colour-blind safe" },
  rdbu: { name: "RdBu", fn: (t) => interpolateRdBu(1 - t), note: "diverging" },
  spectral: { name: "Spectral", fn: (t) => interpolateSpectral(1 - t), note: "not CB-safe" },
};

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
