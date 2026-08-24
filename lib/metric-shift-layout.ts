// Pure layout math for the metric-to-metric transition (#547 phase C, iter-42
// items 977/978). No DOM, no DB, no React — everything here is testable
// node-side and mutation-provable without a rebuild, which is why it is split
// out of the client component. The phase B lesson: logic that only exists
// inside a component can only be tested through a served build.

export type GridDims = {
  cols: number;
  rows: number;
  cell: number;
  width: number;
  height: number;
};

/**
 * A rank grid for n dots inside a fixed width.
 *
 * The transition renders regions as a GRID ordered by rank, not as a value
 * strip: 735 dots spread by value over ~700px collapse into an unreadable
 * smear wherever the distribution clumps (which is everywhere — that is what
 * distributions do), while a grid gives every region its own cell and makes
 * the re-sort legible as dots swimming to new cells. targetAspect is
 * height/width; 0.55 keeps the grid comfortably inside a metric-page column.
 */
export function gridDims(n: number, width = 700, targetAspect = 0.55): GridDims {
  if (n <= 0) return { cols: 0, rows: 0, cell: 0, width, height: 0 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(n / targetAspect)));
  const rows = Math.ceil(n / cols);
  const cell = width / cols;
  return { cols, rows, cell, width, height: rows * cell };
}

/**
 * Codes ordered by rank under `values`: highest value first, ties broken by
 * code so the order is STABLE. Stability is load-bearing, not cosmetic —
 * object constancy is the entire point of the transition (Heer & Robertson
 * 2007), and an unstable tie-break would make equal-valued dots swap places
 * on every re-render for no data reason.
 */
export function rankOrder(values: Record<string, number>, codes: string[]): string[] {
  return [...codes].sort((a, b) => values[b] - values[a] || (a < b ? -1 : 1));
}

/** Centre of the i-th cell (reading order: left-to-right, top-to-bottom). */
export function cellCentre(i: number, dims: GridDims): { x: number; y: number } {
  const col = i % dims.cols;
  const row = Math.floor(i / dims.cols);
  return { x: (col + 0.5) * dims.cell, y: (row + 0.5) * dims.cell };
}

/** Linear position of v on [min,max] scaled to span px. Degenerate domains
 *  (min === max) land everything mid-span rather than dividing by zero. */
export function linear(v: number, min: number, max: number, span: number): number {
  const d = max - min;
  if (d === 0) return span / 2;
  return ((v - min) / d) * span;
}

/** The region codes both metrics carry a value for, sorted for stability. */
export function sharedCodes(
  a: Record<string, number>,
  b: Record<string, number>
): string[] {
  return Object.keys(a)
    .filter((c) => b[c] != null)
    .sort();
}
