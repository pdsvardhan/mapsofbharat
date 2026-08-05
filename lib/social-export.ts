// Social export compositor (feat-social-export; layout engine iter-27 item 762).
// Draws an Instagram-ready map card onto an offscreen canvas. Every block
// placement (headline, anchor, rank tables, legend, note, island insets) reads
// from a LAYOUT preset, so the composition can change without touching the
// drawing code — palette, fonts, accent treatment, stroke weights and copy are
// frozen from the original renderer.
//
// How it composes:
//   1. fitProjection reports the rect India actually occupies, so the four empty
//      regions (NW beyond Kashmir, the Tibet band above the north-east, the
//      Arabian Sea, the Bay of Bengal) are real coordinates, not guesses.
//   2. A void allocator hands those regions to blocks top-down (content) and
//      bottom-up (island insets), so a sea carries both without colliding.
//   3. Every placed rect is fed back into the on-map label collision set, so a
//      state card never draws text under a panel.
//
// Shipped default is "v7" (Hero Ledger — owner pick at the 762 round-2 gate):
// the national hero number sits in the Bay above the Andaman inset and the two
// rank tables read abreast in the Tibet band. v0–v6 are the round-1 exploration
// presets, retained so the export layout can be switched or offered as options.
// Pure module: no React, no DB, geometry in, canvas out.

import { BreakMethod, METHOD_LABEL, computeBreaks, colorFor, strokeForFill } from "@/lib/breaks";
import { estimateFootnote } from "@/lib/estimate-kind";
import {
  ProvenanceClass, PROVENANCE_CLASSES, PROVENANCE_COLOR, PROVENANCE_LABEL,
  provenanceOf, coverageCounts as tallyCoverage,
} from "@/lib/coverage";

export type SocialPreset = "portrait" | "square";
export type SocialTheme = "ink" | "paper";
export type LayoutId = "v0" | "v1" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7";
export type VoidId = "nw" | "tibet" | "arabian" | "bay";
export type Slot = VoidId | "band" | "under" | null;

type Box = { x: number; y: number; w: number; h: number };

export type SocialFeature = {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

export type SocialCardSpec = {
  preset: SocialPreset;
  theme: SocialTheme;
  headline: string;
  metric: { name: string; unit: string; year: number; source: string; decimals: number };
  level: "state" | "district";
  focusName: string | null;
  entries: { code: string; name: string; value: number; estimated?: number; estimate_kind?: string | null }[];
  features: SocialFeature[];
  codeOf: (f: SocialFeature) => string;
  paletteFn: (t: number) => string;
  /** Which map view the card mirrors (item 830). "coverage" shades each region by
   *  its DATA PROVENANCE with the categorical provenance palette instead of the
   *  value ramp; "value"/"vs_avg" bin by value as before. Default "value". */
  mode?: "value" | "vs_avg" | "coverage";
  /** Coverage classes toggled off on the map — threaded so the card matches what
   *  the reader sees. Their regions render as no-data on the card. */
  coverageHidden?: ProvenanceClass[];
  breaks?: number[];
  /** The break method behind `breaks`, so the card can NAME the classification it
   *  is painting with rather than guess (item 827). When breaks are the explorer's
   *  live edges this is the map's method; the card falls back to jenks/quantile when
   *  no edges are passed, and cardClassification() resolves which. */
  method?: BreakMethod;
  tableN?: 3 | 5 | 7 | 10;
  markerMode?: "none" | "extremes" | "top3" | "table";
  accentWords?: number[];
  /** Which composition to draw. Default "v7" = shipped Hero Ledger layout. */
  layout?: LayoutId;
};

// Logical layout is 1080-wide; everything renders at 2x for print quality.
const SCALE = 2;
const W = 1080;
const SANS = "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const HANDLE = "@maps_of_bharat";

const INSET_STATES: Record<string, string> = { "35": "Andaman & Nicobar", "31": "Lakshadweep" };

const LAKSHADWEEP_ISLANDS: [number, number][] = [
  [72.18, 11.60], [72.71, 11.70], [73.00, 11.49], [72.78, 11.22], [72.73, 11.12],
  [72.19, 10.86], [72.64, 10.57], [73.68, 10.82], [73.64, 10.08], [73.04, 8.28],
];

type Palette = {
  bg: string; plate: string; text: string; muted: string; dim: string;
  border: string; accent: string; accentInk: string; nodata: string; nodataLine: string;
  mapLine: string; leader: string; halo: string;
};

const THEMES: Record<SocialTheme, Palette> = {
  ink: {
    bg: "#0d0f14", plate: "#101109", text: "#e9e3d5", muted: "#a49d8c", dim: "#6a6455",
    border: "#3b3626", accent: "#d1502f", accentInk: "#16110b", nodata: "#2a271d",
    nodataLine: "rgba(233,227,213,0.16)",
    mapLine: "rgba(233,227,213,0.30)", leader: "rgba(164,157,140,0.65)", halo: "rgba(13,15,20,0.72)",
  },
  paper: {
    bg: "#f4efe3", plate: "#efe9d9", text: "#1c1a14", muted: "#5a5548", dim: "#8a8477",
    border: "#d5ccb6", accent: "#b8431f", accentInk: "#f7f2e6", nodata: "#e4dcc8",
    nodataLine: "rgba(28,26,20,0.16)",
    mapLine: "rgba(28,26,20,0.28)", leader: "rgba(90,85,72,0.6)", halo: "rgba(244,239,227,0.78)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT PRESETS
// ─────────────────────────────────────────────────────────────────────────────
//
// The four empty regions, expressed as fractions of the rect India actually
// draws into (u = across, v = down; u<0 / u>1 is canvas outside India's bbox).
// Measured, not guessed: rasterising the fitted mainland at 61x48 cells shows
// India's silhouette leaves these four blocks clear at every sensible map size.
const VOID_UV: Record<VoidId, [number, number, number, number]> = {
  nw: [-0.20, -0.06, 0.130, 0.272],
  tibet: [0.472, -0.06, 1.20, 0.272],
  arabian: [-0.20, 0.600, 0.130, 1.02],
  bay: [0.668, 0.560, 1.20, 1.02],
};

export type TableStyle = {
  w: number; rows: number; rowH: number; headH: number;
  valueSize: number; nameSize: number; titleSize: number; dotR: number; boxed: boolean;
  /** "inline" = name left / value right (needs ~230px). "stacked" = value over
   *  name, the same order the on-map callouts already use — the only way a
   *  ~178px rail can carry full district names without ellipsis. */
  rowLayout: "inline" | "stacked";
};

export type LayoutPreset = {
  id: LayoutId;
  label: string;
  /** One-line composition idea. */
  idea: string;
  /** Axes this preset was seeded to differ from the others on. */
  differsOn: string[];
  margin: number;
  /** Map plate runs to (near) the card edge; header/footer become thin bands. */
  edgeToEdge: boolean;
  /** Vertical alignment of India inside the map plate. */
  fitAlign: "center" | "top" | "bottom";
  /** Extends the nw/arabian voids leftward to this x, so a left rail can sit
   *  partly in the card margin rather than being crushed to ~150px. */
  railGutter?: number;
  headline: { place: "band" | VoidId; size: number; lines: number; align: "left" | "right" };
  sub: { show: boolean; size: number };
  anchor: { place: "band" | VoidId; value: number; label: number; boxed: boolean; w?: number };
  tables: {
    hi: Slot; lo: Slot;
    /** "side" = two tables abreast, "stack" = one above the other, "key" = one
     *  boxless two-column rank key (used with on-map markers). */
    layout: "side" | "stack" | "key";
    style: TableStyle;
    /** Draw rank tables on state-level (non-dense) cards too. */
    atState: boolean;
  };
  legend: {
    place: "under" | VoidId;
    form: "strip" | "stack" | "bar";
    swatchW: number; swatchH: number; labelSize: number; titleSize: number;
  };
  note: { place: VoidId | null; size: number };
  markers: "none" | "table";
  captionSize: number;
  /** On-map region labels (state cards) — the mobile type-scale axis. */
  onMap: { value: number; name: number };
};

const T = (o: Partial<TableStyle>): TableStyle => ({
  w: 232, rows: 5, rowH: 26, headH: 26, valueSize: 14, nameSize: 13,
  titleSize: 11.5, dotR: 8.5, boxed: true, rowLayout: "inline", ...o,
});

export const LAYOUTS: Record<LayoutId, LayoutPreset> = {
  // ── v0 — BASELINE (shipped composition, for comparison only) ───────────────
  // Everything above the map, nothing in the sea. This is what the owner is
  // complaining about; kept so the six can be judged against it.
  v0: {
    id: "v0", label: "Baseline (shipped)",
    idea: "Header strip holds both rank tables and the anchor; the four voids stay empty.",
    differsOn: [],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "band", size: 54, lines: 2, align: "left" },
    sub: { show: true, size: 20 },
    anchor: { place: "band", value: 30, label: 12.5, boxed: true, w: 236 },
    tables: { hi: "band", lo: "band", layout: "side", style: T({}), atState: false },
    legend: { place: "under", form: "strip", swatchW: 108, swatchH: 14, labelSize: 12.5, titleSize: 13.5 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12.5,
    onMap: { value: 19, name: 13 },
  },

  // ── v1 — "OCEAN LEDGER" ───────────────────────────────────────────────────
  // Idea: the two rank tables sail out into the two seas — LOWEST into the
  // Arabian, HIGHEST into the Bay — which empties the header strip entirely, so
  // the headline gets the full card width and the map gets ~120px more height.
  // The Tibet band takes a wide anchor plate: the one number, sitting where the
  // eye lands after the headline. Legend stays a horizontal strip under the map
  // (held as the control value on axis 4).
  // Differs on: dead-space (both seas + Tibet used, NW deliberately left empty),
  // table placement (split across the two seas), anchor (wide, 64px, in Tibet).
  v1: {
    id: "v1", label: "Ocean Ledger",
    idea: "Rank tables into the two seas; wide anchor plate in the Tibet band; legend stays under the map.",
    differsOn: ["dead-space: seas + Tibet, NW empty", "tables: split Arabian/Bay", "anchor: 64px wide plate in Tibet", "legend: control (strip under map)"],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "band", size: 56, lines: 2, align: "left" },
    sub: { show: true, size: 20 },
    anchor: { place: "tibet", value: 64, label: 14, boxed: true, w: 330 },
    tables: {
      hi: "bay", lo: "arabian", layout: "side",
      style: T({ w: 184, rows: 5, rowH: 27, valueSize: 14, nameSize: 12.5, dotR: 8.5 }),
      atState: true,
    },
    legend: { place: "under", form: "strip", swatchW: 108, swatchH: 14, labelSize: 12.5, titleSize: 13.5 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12.5,
    onMap: { value: 19, name: 13 },
  },

  // ── v2 — "SKY LEDGER" ─────────────────────────────────────────────────────
  // Near-inverse of v1 on every axis. Both rank tables go abreast into the
  // Tibet band (the widest single void, 500px+), the anchor is demoted to a
  // narrow plate in the NW void, the legend becomes a vertical stack in the Bay
  // of Bengal, and the Arabian Sea carries a short how-to-read note. Reading
  // order becomes: headline → ranks → map → legend.
  // Differs on: dead-space (all four voids used), tables (paired in Tibet),
  // anchor (smallest of the six, 28px, NW), legend (vertical stack in the Bay).
  v2: {
    id: "v2", label: "Sky Ledger",
    idea: "Both rank tables abreast in the Tibet band; anchor demoted to the NW void; legend stacks vertically in the Bay; Arabian Sea carries the method note.",
    differsOn: ["dead-space: all four voids used", "tables: paired in Tibet", "anchor: smallest (28px) in NW", "legend: vertical stack in Bay", "type scale: flattest"],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "band", size: 50, lines: 2, align: "left" },
    sub: { show: true, size: 19 },
    anchor: { place: "nw", value: 28, label: 11, boxed: true },
    tables: {
      hi: "tibet", lo: "tibet", layout: "side",
      style: T({ w: 240, rows: 5, rowH: 27, valueSize: 15, nameSize: 13 }),
      atState: false,
    },
    legend: { place: "bay", form: "stack", swatchW: 46, swatchH: 16, labelSize: 13, titleSize: 12.5 },
    note: { place: "arabian", size: 11.5 },
    markers: "none", captionSize: 12,
    onMap: { value: 18, name: 12.5 },
  },

  // ── v3 — "HERO NUMBER" ────────────────────────────────────────────────────
  // Idea: the poster is the statistic, not the map. The headline drops to a
  // 34px kicker and the national average becomes a 110px numeral filling the
  // Tibet band; the map reads as its evidence. Ranks shrink to 3+3 stacked in
  // the Bay; legend is a vertical stack in the Arabian Sea; the NW void is
  // deliberately left empty so the hero has air on its reading diagonal.
  // Differs on: anchor (hero, 110px, unboxed), headline (kicker 34px), tables
  // (3 rows, stacked in one sea), legend (Arabian), most extreme type ratio.
  v3: {
    id: "v3", label: "Hero Number",
    idea: "The national average becomes a 110px hero numeral in the Tibet band; headline drops to a kicker; ranks shrink to 3+3 stacked in the Bay.",
    differsOn: ["anchor: hero 110px unboxed", "headline: 34px kicker", "tables: 3 rows stacked in Bay", "legend: Arabian vertical", "type scale: most extreme (3.2x)"],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "band", size: 34, lines: 2, align: "left" },
    sub: { show: true, size: 17 },
    anchor: { place: "tibet", value: 110, label: 16, boxed: false },
    tables: {
      hi: "bay", lo: "bay", layout: "stack",
      style: T({ w: 316, rows: 3, rowH: 30, valueSize: 17, nameSize: 14, dotR: 9.5 }),
      atState: true,
    },
    legend: { place: "arabian", form: "stack", swatchW: 30, swatchH: 14, labelSize: 12, titleSize: 12 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12,
    onMap: { value: 19, name: 13 },
  },

  // ── v4 — "LEFT RAIL" ──────────────────────────────────────────────────────
  // Idea: stop treating the four voids as four boxes. HIGHEST (NW) and LOWEST
  // (Arabian) stack into one continuous vertical rail down the left flank,
  // interrupted only by the Kutch bulge — so the eye reads one column, not two
  // panels. The legend becomes a horizontal scale bar hanging in the Tibet band
  // just above the Himalaya, and the anchor takes the Bay of Bengal.
  // Differs on: tables (single left rail, 3 rows, narrow), legend (horizontal
  // in Tibet), anchor (Bay, 52px), dead-space (all four, left-weighted).
  v4: {
    id: "v4", label: "Left Rail",
    idea: "HIGHEST and LOWEST stack into one continuous rail down the left flank; legend hangs as a scale bar in the Tibet band; anchor takes the Bay.",
    differsOn: ["tables: one left rail (NW+Arabian), 3 rows, narrow", "legend: horizontal strip in Tibet", "anchor: Bay, 52px plate", "dead-space: left-weighted"],
    margin: 52, edgeToEdge: false, fitAlign: "center", railGutter: 26,
    headline: { place: "band", size: 48, lines: 2, align: "left" },
    sub: { show: true, size: 19 },
    anchor: { place: "bay", value: 52, label: 13, boxed: true, w: 300 },
    tables: {
      hi: "nw", lo: "arabian", layout: "side",
      // stacked rows: a 178px rail cannot hold "Pathanamthitta 96.5%" on one
      // line without ellipsis, so the value sits over the name instead
      style: T({ w: 178, rows: 3, rowH: 42, valueSize: 17, nameSize: 12.5, dotR: 9, rowLayout: "stacked" }),
      atState: false,
    },
    legend: { place: "tibet", form: "strip", swatchW: 92, swatchH: 15, labelSize: 12, titleSize: 12.5 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12,
    onMap: { value: 18, name: 12.5 },
  },

  // ── v5 — "EDGE TO EDGE" ───────────────────────────────────────────────────
  // Idea: the map is the poster. Margins drop to 40, the plate runs the full
  // card width and India is bottom-weighted, which makes it ~27% larger than
  // the shipped card. Nothing gets a plate: the anchor, the rank key and the
  // legend all float over the sea in halo'd text, the same treatment the map's
  // own labels already use. Ranks move ONTO the map as numbered markers, with a
  // boxless two-column key in the Bay to decode them.
  // Differs on: map frame (edge to edge, bottom-aligned), tables (replaced by
  // on-map markers + one key), legend (boxless bar), everything unboxed.
  v5: {
    id: "v5", label: "Edge to Edge",
    idea: "Map runs to the card edge and is bottom-weighted; ranks move onto the map as numbered markers with a boxless key in the Bay; nothing else gets a plate.",
    differsOn: ["map frame: edge-to-edge, bottom-aligned, +27% map area", "tables: on-map markers + single boxless key", "legend: boxless bar in Tibet", "anchor: unboxed 44px in Tibet", "no plates anywhere"],
    margin: 40, edgeToEdge: true, fitAlign: "center",
    headline: { place: "band", size: 46, lines: 2, align: "left" },
    sub: { show: true, size: 18 },
    anchor: { place: "tibet", value: 44, label: 12.5, boxed: false },
    tables: {
      hi: "bay", lo: "bay", layout: "key",
      style: T({ w: 340, rows: 5, rowH: 27, valueSize: 14, nameSize: 12.5, dotR: 9, boxed: false }),
      atState: false,
    },
    legend: { place: "tibet", form: "bar", swatchW: 100, swatchH: 16, labelSize: 12, titleSize: 12 },
    note: { place: null, size: 11 },
    markers: "table", captionSize: 12,
    onMap: { value: 18, name: 12.5 },
  },

  // ── v6 — "FOUR QUARTERS" ──────────────────────────────────────────────────
  // Idea: no header band at all. Each of the four voids takes exactly one thing
  // and takes it big — headline into the Tibet band (right-aligned, where the
  // eye already starts on a phone), anchor naked into the Arabian Sea, a single
  // HIGHEST table into the Bay with rows large enough to actually read at
  // thumbnail size, legend into the NW. LOWEST is dropped on purpose: five
  // legible rows beat ten unreadable ones.
  // Differs on: headline (inside the map, in Tibet), tables (one table only,
  // big rows), anchor (naked 66px in the Arabian), legend (NW), largest type.
  v6: {
    id: "v6", label: "Four Quarters",
    idea: "No header band: headline into Tibet, anchor naked into the Arabian Sea, one big HIGHEST table into the Bay, legend into the NW. LOWEST dropped.",
    differsOn: ["headline: inside the map, Tibet, right-aligned", "tables: HIGHEST only, 20px rows", "anchor: naked 66px in the Arabian Sea", "legend: NW vertical", "type scale: largest minimum (name 15px)"],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "tibet", size: 52, lines: 3, align: "right" },
    sub: { show: true, size: 18 },
    anchor: { place: "arabian", value: 66, label: 13, boxed: false },
    tables: {
      hi: "bay", lo: null, layout: "side",
      style: T({ w: 300, rows: 5, rowH: 36, valueSize: 20, nameSize: 15, titleSize: 12, dotR: 11 }),
      atState: true,
    },
    legend: { place: "nw", form: "stack", swatchW: 30, swatchH: 15, labelSize: 12, titleSize: 12 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12.5,
    onMap: { value: 19, name: 13.5 },
  },

  // ── v7 — "HERO LEDGER" (round-2 owner pick: A/v3 modified, 2026-08-03) ──────
  // Owner picked v3 (Hero Number) then moved two blocks: the 110px hero numeral
  // out of the Tibet band and into the TOP of the Bay (above the Andaman inset,
  // which the allocator lays from the bay's bottom, so they don't collide), and
  // the two rank tables abreast into the wide Tibet band (v2's placement) rather
  // than stacked in the Bay. Net: the hero owns the Bay's upper void, ranks read
  // across the top over Bihar/Nepal, legend stays a vertical stack in the
  // Arabian Sea, and the headline stays a 34px kicker in the band.
  // Differs on: anchor (hero 110px unboxed, Bay-top), tables (paired in Tibet),
  // headline (34px kicker), legend (Arabian vertical).
  v7: {
    id: "v7", label: "Hero Ledger",
    idea: "v3's 110px hero numeral moves to the top of the Bay (above the Andaman inset); the two rank tables go abreast in the Tibet band; kicker headline; legend stacks in the Arabian.",
    differsOn: ["anchor: hero 110px unboxed in Bay-top", "tables: paired in Tibet (side)", "headline: 34px kicker", "legend: Arabian vertical"],
    margin: 52, edgeToEdge: false, fitAlign: "center",
    headline: { place: "band", size: 34, lines: 2, align: "left" },
    sub: { show: true, size: 17 },
    anchor: { place: "bay", value: 110, label: 16, boxed: false },
    tables: {
      hi: "tibet", lo: "tibet", layout: "side",
      style: T({ w: 240, rows: 5, rowH: 27, valueSize: 15, nameSize: 13 }),
      atState: true,
    },
    legend: { place: "arabian", form: "stack", swatchW: 30, swatchH: 14, labelSize: 12, titleSize: 12 },
    note: { place: null, size: 11 },
    markers: "none", captionSize: 12,
    onMap: { value: 19, name: 13 },
  },
};

/** Diagonal-hatch fill for no-data regions — unchanged from the shipped file. */
function hatchPattern(ctx: CanvasRenderingContext2D, base: string, line: string): CanvasPattern | string {
  const t = document.createElement("canvas");
  t.width = 8; t.height = 8;
  const c = t.getContext("2d");
  if (!c) return base;
  c.fillStyle = base;
  c.fillRect(0, 0, 8, 8);
  c.strokeStyle = line;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-2, 6); c.lineTo(6, -2);
  c.moveTo(2, 10); c.lineTo(10, 2);
  c.stroke();
  return ctx.createPattern(t, "repeat") ?? base;
}

export function presetSize(preset: SocialPreset): { w: number; h: number } {
  return preset === "portrait" ? { w: W, h: 1350 } : { w: W, h: 1080 };
}

export function fmtIndianShort(v: number, decimals: number, unit: string): string {
  if (unit === "%") return v.toLocaleString("en-IN", { maximumFractionDigits: decimals }) + "%";
  const a = Math.abs(v);
  const t = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ""));
  if (a >= 1e7) return t(v / 1e7) + " Cr";
  if (a >= 1e5) return t(v / 1e5) + " L";
  if (a >= 1e3) return t(v / 1e3) + "K";
  return v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}

export function anchorStat(spec: SocialCardSpec): { label: string; value: string } {
  const { unit, decimals } = spec.metric;
  const vals = spec.entries.map((e) => e.value);
  // An intensive quantity is averaged, never summed. A compound unit (contains
  // "/", e.g. ₹/person/mo) or an explicit per-/rate word is intensive; summing
  // a per-capita metric produced a meaningless "All-India total" on the card
  // while the map framed it per-person (comment C8, iter-28).
  const rate = unit === "%" || unit.includes("/") ||
    /\bper\b|rate|ratio|index|years|km2|density|capita|score/i.test(unit) || decimals > 0;
  const scopeName = spec.focusName ?? "National";
  if (rate) {
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label: `${scopeName} average`, value: fmtIndianShort(mean, decimals, unit) };
  }
  const sum = vals.reduce((a, b) => a + b, 0);
  return { label: spec.focusName ? `${scopeName} total` : "All-India total", value: fmtIndianShort(sum, decimals, unit) };
}

// ── geometry helpers ────────────────────────────────────────────────────────

type Ring = [number, number][];

function rings(f: SocialFeature): Ring[][] {
  if (f.geometry.type === "Polygon") return [f.geometry.coordinates as Ring[]];
  return f.geometry.coordinates as Ring[][];
}

function geoBounds(fs: SocialFeature[]): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of fs)
    for (const poly of rings(f))
      for (const [x, y] of poly[0]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}

type Proj = (lon: number, lat: number) => [number, number];

/** Equirectangular fit — now also reports the rect India actually occupies,
 *  which is what makes the four void regions addressable. */
function fitProjectionInfo(
  b: [number, number, number, number],
  rect: Box, pad: number, alignY: "center" | "top" | "bottom" = "center",
): { proj: Proj; ox: number; oy: number; dw: number; dh: number } {
  const cos = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180);
  const gw = (b[2] - b[0]) * cos || 1e-9;
  const gh = b[3] - b[1] || 1e-9;
  const s = Math.min((rect.w - pad * 2) / gw, (rect.h - pad * 2) / gh);
  const dw = gw * s, dh = gh * s;
  const ox = rect.x + (rect.w - dw) / 2;
  const oy = alignY === "top" ? rect.y + pad
    : alignY === "bottom" ? rect.y + rect.h - pad - dh
      : rect.y + (rect.h - dh) / 2;
  return { proj: (lon, lat) => [ox + (lon - b[0]) * cos * s, oy + (b[3] - lat) * s], ox, oy, dw, dh };
}

function fitProjection(b: [number, number, number, number], rect: Box, pad: number): Proj {
  return fitProjectionInfo(b, rect, pad).proj;
}

function centroidPx(f: SocialFeature, proj: Proj): { x: number; y: number; areaPx: number; bw: number; bh: number } {
  let best: Ring | null = null, bestA = -1;
  for (const poly of rings(f)) {
    const r = poly[0];
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a = Math.abs(a / 2);
    if (a > bestA) { bestA = a; best = r; }
  }
  if (!best) return { x: 0, y: 0, areaPx: 0, bw: 0, bh: 0 };
  const pts = best.map(([lon, lat]) => proj(lon, lat));
  let a2 = 0, cx = 0, cy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const cross = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    a2 += cross;
    cx += (pts[i][0] + pts[i + 1][0]) * cross;
    cy += (pts[i][1] + pts[i + 1][1]) * cross;
  }
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const area = a2 / 2;
  if (Math.abs(area) < 1e-6) return { x: pts[0][0], y: pts[0][1], areaPx: 0, bw: 0, bh: 0 };
  return { x: cx / (6 * area), y: cy / (6 * area), areaPx: Math.abs(area), bw: maxX - minX, bh: maxY - minY };
}

function tracePath(ctx: CanvasRenderingContext2D, f: SocialFeature, proj: Proj) {
  ctx.beginPath();
  for (const poly of rings(f))
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
}

// ── text helpers ────────────────────────────────────────────────────────────

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const probe = cur ? cur + " " + w : w;
    if (ctx.measureText(probe).width <= maxW || !cur) cur = probe;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.includes(" "))
      last = last.slice(0, last.lastIndexOf(" "));
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

// ── brand mark ──────────────────────────────────────────────────────────────
let brandMark: HTMLImageElement | null = null;
let brandMarkLoad: Promise<HTMLImageElement | null> | null = null;
function loadBrandMark(): Promise<HTMLImageElement | null> {
  if (brandMark) return Promise.resolve(brandMark);
  if (brandMarkLoad) return brandMarkLoad;
  if (typeof Image === "undefined") return Promise.resolve(null);
  brandMarkLoad = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { brandMark = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = "/brand/badge-disc.png";
  });
  return brandMarkLoad;
}

/** The classification the exported card ACTUALLY paints with. A static card has no
 *  continuous or vs-average mode, so it always bins: it uses the explorer's live
 *  edges + method when they were passed (value mode), and falls back to jenks —
 *  quantile below five regions — otherwise. Exported so the export dialog can
 *  describe the card without re-deriving the rule, keeping one source of truth for
 *  the method + class count the card discloses (item 827). */
export function cardClassification(
  spec: Pick<SocialCardSpec, "breaks" | "method" | "entries">,
): { method: BreakMethod; classes: number } {
  const n = spec.entries.length;
  if (spec.breaks?.length) {
    const method = spec.method && spec.method !== "continuous" ? spec.method : "jenks";
    return { method, classes: spec.breaks.length + 1 };
  }
  const k = Math.min(5, Math.max(1, n));
  const method: BreakMethod = n >= 5 ? "jenks" : "quantile";
  return { method, classes: Math.max(1, computeBreaks(spec.entries.map((e) => e.value), method, k).length + 1) };
}

// ── main renderer ───────────────────────────────────────────────────────────

export async function renderSocialCard(spec: SocialCardSpec): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* draw with fallbacks */ }
  }
  const mark = await loadBrandMark();
  const P = THEMES[spec.theme];
  const L = LAYOUTS[spec.layout ?? "v7"];
  const MARGIN = L.margin;
  const { w: LW, h: LH } = presetSize(spec.preset);
  const canvas = document.createElement("canvas");
  canvas.width = LW * SCALE; canvas.height = LH * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, LW, LH);

  const values: Record<string, number> = {};
  for (const e of spec.entries) values[e.code] = e.value;
  const vals = spec.entries.map((e) => e.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const k = Math.min(5, Math.max(1, vals.length));
  const breaks = spec.breaks?.length
    ? spec.breaks
    : computeBreaks(vals, vals.length >= 5 ? "jenks" : "quantile", k);
  const fill = (v: number) => colorFor(v, min, max, breaks, spec.paletteFn);
  // The method the card is actually classing with — resolved from the same rule as
  // the breaks above (via cardClassification) so the disclosed method can never
  // contradict the colours (item 827).
  const usedMethod: BreakMethod = cardClassification(spec).method;

  // COVERAGE view (item 830): shade each region by its DATA PROVENANCE with the
  // categorical provenance palette instead of the value ramp, so a coverage-mode
  // card matches the coverage-mode map. Classes toggled off on the map render as
  // no-data here too.
  const coverage = spec.mode === "coverage";
  const provByCode: Record<string, ProvenanceClass> = {};
  if (coverage) for (const e of spec.entries) provByCode[e.code] = provenanceOf(e.estimated, e.estimate_kind);
  const hiddenCov = new Set(spec.coverageHidden ?? []);
  const covCounts = coverage ? tallyCoverage(spec.entries) : null;
  const covClasses = coverage
    ? PROVENANCE_CLASSES.filter((c) => covCounts![c] > 0 && !hiddenCov.has(c))
    : [];
  /** Fill for one region — provenance colour in coverage mode (null = hidden class
   *  or no value, drawn as hatch), the value ramp otherwise. */
  const regionFill = (code: string, v: number | undefined): string | null => {
    if (v == null) return null;
    if (coverage) {
      const cls = provByCode[code] ?? "measured";
      return hiddenCov.has(cls) ? null : PROVENANCE_COLOR[cls];
    }
    return fill(v);
  };

  // ── rank rows ─────────────────────────────────────────────────────────────
  const dense = spec.level === "district" || spec.entries.length > 40;
  const showTables = (dense || L.tables.atState) && L.tables.hi !== null;
  const TS = L.tables.style;
  // Rows come from the dialog's TABLE ROWS control when set, else the preset's
  // own row count. (The layout engine port had dropped spec.tableN, silently
  // making that control inert — verifier catch, iter-28.)
  const N = Math.max(3, Math.min(10, spec.tableN ?? TS.rows));
  const tops = spec.entries.slice(0, N);
  const bots = spec.entries.length > N
    ? spec.entries.slice(-Math.min(N, spec.entries.length - N)).reverse()
    : [];

  const marker = (x: number, yy: number, n: string, top: boolean, r = 11) => {
    ctx.beginPath();
    ctx.arc(x, yy, r, 0, Math.PI * 2);
    if (top) { ctx.fillStyle = P.accent; ctx.fill(); }
    else {
      ctx.fillStyle = P.plate; ctx.fill();
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = top ? P.accentInk : P.text;
    ctx.font = `700 ${Math.round(r * 1.05)}px ${SANS}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n, x, yy + 0.5);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  };

  const clipTo = (s: string, maxW: number): string => {
    if (ctx.measureText(s).width <= maxW) return s;
    let t = s;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  const tableH = (rows: unknown[]) => TS.headH + rows.length * TS.rowH + 8;

  /** HIGHEST keeps the accent frame + filled dots, LOWEST the plain frame +
   *  outlined dots (iter-101 item 682) — unchanged, only sized from the preset. */
  const drawTable = (px: number, py: number, title: string, top: boolean,
    rows: { code: string; name: string; value: number }[]): number => {
    const ph = tableH(rows);
    if (TS.boxed) {
      ctx.fillStyle = P.plate;
      ctx.fillRect(px, py, TS.w, ph);
      ctx.strokeStyle = top ? P.accent : P.border;
      ctx.lineWidth = top ? 1.5 : 1;
      ctx.strokeRect(px, py, TS.w, ph);
    } else if (top) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + TS.w, py + 1); ctx.stroke();
    } else {
      ctx.strokeStyle = P.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + TS.w, py + 1); ctx.stroke();
    }
    ctx.fillStyle = top ? P.accent : P.muted;
    ctx.font = `600 ${TS.titleSize}px ${MONO}`;
    ctx.fillText(title, px + (TS.boxed ? 12 : 0), py + TS.headH - 9);
    const padL = TS.boxed ? 12 : 0;
    const nx = px + padL + TS.dotR * 2 + 10;
    rows.forEach((e, i) => {
      const rowTop = py + TS.headH + i * TS.rowH;
      const valStr = fmtIndianShort(e.value, spec.metric.decimals, spec.metric.unit);
      if (TS.rowLayout === "stacked") {
        const vy = rowTop + TS.valueSize * 0.9 + 3;
        const ny = vy + TS.nameSize + 5;
        marker(px + padL + TS.dotR + 1, vy - TS.valueSize * 0.32, String(i + 1), top, TS.dotR);
        ctx.textAlign = "left";
        ctx.font = `700 ${TS.valueSize}px ${SANS}`;
        if (!TS.boxed) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(valStr, nx, vy); }
        ctx.fillStyle = P.text;
        ctx.fillText(valStr, nx, vy);
        ctx.font = `500 ${TS.nameSize}px ${SANS}`;
        const nameStr = clipTo(e.name, TS.w - (nx - px) - padL - 2);
        if (!TS.boxed) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(nameStr, nx, ny); }
        ctx.fillStyle = P.muted;
        ctx.fillText(nameStr, nx, ny);
        return;
      }
      const ry = rowTop + TS.rowH * 0.62;
      marker(px + padL + TS.dotR + 1, ry - TS.rowH * 0.18, String(i + 1), top, TS.dotR);
      ctx.textAlign = "right";
      ctx.font = `700 ${TS.valueSize}px ${SANS}`;
      ctx.fillStyle = P.text;
      if (!TS.boxed) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(valStr, px + TS.w - padL, ry); }
      const vw = ctx.measureText(valStr).width;
      ctx.fillText(valStr, px + TS.w - padL, ry);
      ctx.textAlign = "left";
      ctx.font = `500 ${TS.nameSize}px ${SANS}`;
      const nameStr = clipTo(e.name, TS.w - (nx - px) - vw - 10 - padL);
      if (!TS.boxed) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(nameStr, nx, ry); }
      ctx.fillStyle = P.muted;
      ctx.fillText(nameStr, nx, ry);
    });
    return ph;
  };

  // ── headline / anchor text ────────────────────────────────────────────────
  const anchor = anchorStat(spec);
  const headText = spec.headline.trim() || spec.metric.name;
  const headWords = headText.split(/\s+/).filter(Boolean);
  const accentSet = new Set(
    (spec.accentWords ?? [headWords.length - 1]).filter((i) => i >= 0 && i < headWords.length),
  );

  /** Wrap once so a block can be sized to the lines it will actually draw. */
  const headlineMetrics = (maxW: number, size: number, maxLines: number) => {
    let hSize = size;
    ctx.font = `800 ${hSize}px ${SANS}`;
    let lines = wrap(ctx, headText, maxW, maxLines);
    while (lines.length > 1 && hSize > size * 0.74 &&
      ctx.measureText(lines[0]).width > maxW * 1.02) {
      hSize -= 4;
      ctx.font = `800 ${hSize}px ${SANS}`;
      lines = wrap(ctx, headText, maxW, maxLines);
    }
    const lineH = Math.round(hSize * 1.14);
    return { hSize, lines, lineH, height: (lines.length - 1) * lineH + hSize * 1.28 };
  };

  /** Draws the accent-highlighted headline; returns its bottom y. */
  const drawHeadline = (x0: number, yTop: number, maxW: number, size: number,
    maxLines: number, align: "left" | "right"): number => {
    const { hSize, lines, lineH } = headlineMetrics(maxW, size, maxLines);
    let y = yTop + hSize;
    let gw = 0;
    for (const line of lines) {
      ctx.font = `800 ${hSize}px ${SANS}`;
      const lineW = ctx.measureText(line).width;
      let x = align === "right" ? x0 + maxW - lineW : x0;
      for (const word of line.split(" ")) {
        const wpx = ctx.measureText(word).width;
        if (accentSet.has(gw)) {
          ctx.fillStyle = P.accent;
          ctx.fillRect(x - 7, y - hSize * 0.82, wpx + 14, hSize * 1.06);
          ctx.fillStyle = P.accentInk;
        } else ctx.fillStyle = P.text;
        ctx.fillText(word, x, y);
        x += ctx.measureText(word + " ").width;
        gw++;
      }
      y += lineH;
    }
    return y - lineH + hSize * 0.28;
  };

  const scopeNoun = spec.focusName
    ? `districts of ${spec.focusName}`
    : spec.level === "district" ? "districts" : "states & UTs";
  const customHead = spec.headline.trim() && spec.headline.trim().toLowerCase() !== spec.metric.name.toLowerCase();
  const subText = `${customHead ? spec.metric.name + " · " : ""}${spec.entries.length} ${scopeNoun}`;

  // Baselines are derived, not eyeballed: the shipped 30px/12.5px pair sat 22px
  // apart and the first generic formula collapsed them onto each other.
  const anchorPadT = L.anchor.boxed ? 18 : 11;
  const anchorValDy = anchorPadT + L.anchor.value * 0.76;
  const anchorLabDy = anchorValDy + L.anchor.label * 1.05 + 9;
  const anchorBlockH = Math.round(anchorLabDy + (L.anchor.boxed ? 14 : 5));
  const anchorBlockW = (avail: number) => {
    ctx.font = `800 ${L.anchor.value}px ${SANS}`;
    const vw = ctx.measureText(anchor.value).width;
    ctx.font = `600 ${L.anchor.label}px ${SANS}`;
    const lw = ctx.measureText(anchor.label.toUpperCase()).width;
    const need = Math.max(vw, lw) + (L.anchor.boxed ? 34 : 4);
    return Math.min(avail, Math.max(L.anchor.w ?? 0, need));
  };
  const drawAnchor = (x: number, y: number, w: number, align: "left" | "right") => {
    const h = anchorBlockH;
    if (L.anchor.boxed) {
      ctx.fillStyle = P.plate;
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + Math.min(w, 84), y + 1); ctx.stroke();
    }
    const pad = L.anchor.boxed ? 16 : 0;
    ctx.textAlign = align === "right" && !L.anchor.boxed ? "right" : "left";
    const tx = ctx.textAlign === "right" ? x + w : x + pad;
    // an unboxed anchor floats straight over the choropleth, so it takes the
    // same halo the on-map callouts already use
    const overMap = !L.anchor.boxed;
    ctx.font = `800 ${L.anchor.value}px ${SANS}`;
    if (overMap) { ctx.lineWidth = 6; ctx.strokeStyle = P.halo; ctx.strokeText(anchor.value, tx, y + anchorValDy); }
    ctx.fillStyle = P.accent;
    ctx.fillText(anchor.value, tx, y + anchorValDy);
    ctx.font = `600 ${L.anchor.label}px ${SANS}`;
    if (overMap) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(anchor.label.toUpperCase(), tx, y + anchorLabDy); }
    ctx.fillStyle = P.muted;
    ctx.fillText(anchor.label.toUpperCase(), tx, y + anchorLabDy);
    ctx.textAlign = "left";
  };

  // ── brand block ───────────────────────────────────────────────────────────
  const brandInFooter = L.headline.place !== "band";
  const drawBrand = (bxr: number, byTop: number, compact: boolean) => {
    const markSz = compact ? 34 : 46;
    if (mark) {
      ctx.drawImage(mark, bxr - markSz, byTop, markSz, markSz);
      ctx.beginPath();
      ctx.arc(bxr - markSz / 2, byTop + markSz / 2, markSz / 2 - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillStyle = P.text;
      ctx.fillRect(bxr - markSz, byTop, markSz, markSz);
      ctx.fillStyle = P.bg;
      ctx.font = `800 ${Math.round(markSz * 0.41)}px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("MB", bxr - markSz / 2, byTop + markSz * 0.68);
      ctx.textAlign = "left";
    }
    const wordX = bxr - markSz - 12;
    ctx.textAlign = "right";
    ctx.fillStyle = P.text;
    ctx.font = `700 ${compact ? 16 : 19}px ${SANS}`;
    ctx.fillText("Maps of Bharat", wordX, byTop + (compact ? 15 : 19));
    ctx.fillStyle = P.muted;
    ctx.font = `500 ${compact ? 12 : 13.5}px ${MONO}`;
    ctx.fillText(HANDLE, wordX, byTop + (compact ? 31 : 39));
    ctx.textAlign = "left";
    return markSz;
  };

  // ── header band ───────────────────────────────────────────────────────────
  let headerBottom = MARGIN;
  const bandBlocks: Box[] = [];
  if (L.headline.place === "band") {
    const brandW = 268;
    let hw = LW - MARGIN * 2 - brandW;
    if (showTables && L.tables.hi === "band") hw = LW - MARGIN * 2 - (TS.w * 2 + 12) - 28;
    let by = drawHeadline(MARGIN, MARGIN, hw, L.headline.size, L.headline.lines, "left");
    if (L.sub.show) {
      ctx.font = `500 ${L.sub.size}px ${SANS}`;
      ctx.fillStyle = P.muted;
      ctx.fillText(subText, MARGIN, by + L.sub.size + 8);
      by += L.sub.size + 16;
    }
    let leftBottom = by;
    if (L.anchor.place === "band") {
      const aw = anchorBlockW(320);
      drawAnchor(MARGIN, by + 16, aw, "left");
      leftBottom = by + 16 + anchorBlockH;
    }
    let rightBottom = MARGIN + 46;
    drawBrand(LW - MARGIN, MARGIN - 10, false);
    if (showTables && L.tables.hi === "band") {
      const tby = MARGIN + 46 + 6;
      const tx1 = LW - MARGIN - (TS.w * 2 + 12);
      const h1 = tops.length ? drawTable(tx1, tby, "HIGHEST", true, tops) : 0;
      const h2 = bots.length ? drawTable(tx1 + TS.w + 12, tby, "LOWEST", false, bots) : 0;
      rightBottom = tby + Math.max(h1, h2);
      bandBlocks.push({ x: tx1, y: tby, w: TS.w * 2 + 12, h: Math.max(h1, h2) });
    }
    headerBottom = Math.max(leftBottom, rightBottom) + 12;
  } else {
    // No header band: only a slim top rule of breathing room; brand goes to the footer.
    headerBottom = MARGIN - 14;
  }

  // ── frame bottom-up: footer, legend (if under), then the map gets the rest ──
  const footerH = 46;
  const footerTop = LH - MARGIN - footerH + 18;
  const legendUnder = L.legend.place === "under";
  const legendH = 76;
  const legendTop = footerTop - legendH - 6;
  const mapRect: Box = L.edgeToEdge
    ? { x: 0, y: headerBottom + 4, w: LW, h: (legendUnder ? legendTop - 14 : footerTop - 18) - (headerBottom + 4) }
    : { x: MARGIN, y: headerBottom + 8, w: LW - MARGIN * 2, h: (legendUnder ? legendTop - 14 : footerTop - 16) - (headerBottom + 8) };

  const stCode = (f: SocialFeature) => String(Number(String(f.properties?.st_code ?? "")));
  const isNational = !spec.focusName;
  const mainland = isNational ? spec.features.filter((f) => !INSET_STATES[stCode(f)]) : spec.features;
  const insetFs = isNational ? spec.features.filter((f) => INSET_STATES[stCode(f)]) : [];

  const fitPad = L.edgeToEdge ? 20 : 26;
  const FIT = fitProjectionInfo(
    geoBounds(mainland.length ? mainland : spec.features), mapRect, fitPad, L.fitAlign,
  );
  const proj = FIT.proj;

  // ── void allocator ────────────────────────────────────────────────────────
  // Content claims from the top of a void, island insets from the bottom, so a
  // sea can carry a rank table AND its inset without either being guessed at.
  const safe: Box = L.edgeToEdge
    ? { x: 24, y: mapRect.y, w: LW - 48, h: mapRect.h }
    : { x: mapRect.x, y: mapRect.y, w: mapRect.w, h: mapRect.h };
  const voidBox = (id: VoidId): Box => {
    const [u0, v0, u1, v1] = VOID_UV[id];
    let x0 = FIT.ox + u0 * FIT.dw, x1 = FIT.ox + u1 * FIT.dw;
    const y0 = FIT.oy + v0 * FIT.dh, y1 = FIT.oy + v1 * FIT.dh;
    if (L.railGutter != null && (id === "nw" || id === "arabian")) x0 = Math.min(x0, L.railGutter);
    const X0 = Math.max(safe.x, x0), X1 = Math.min(safe.x + safe.w, x1);
    const Y0 = Math.max(safe.y, y0), Y1 = Math.min(safe.y + safe.h, y1);
    return { x: X0, y: Y0, w: Math.max(0, X1 - X0), h: Math.max(0, Y1 - Y0) };
  };
  const VB: Record<VoidId, Box> = { nw: voidBox("nw"), tibet: voidBox("tibet"), arabian: voidBox("arabian"), bay: voidBox("bay") };
  const cursor: Record<VoidId, { top: number; bot: number }> = {
    nw: { top: VB.nw.y + 4, bot: VB.nw.y + VB.nw.h - 4 },
    tibet: { top: VB.tibet.y + 4, bot: VB.tibet.y + VB.tibet.h - 4 },
    arabian: { top: VB.arabian.y + 4, bot: VB.arabian.y + VB.arabian.h - 4 },
    bay: { top: VB.bay.y + 4, bot: VB.bay.y + VB.bay.h - 4 },
  };
  const RIGHT: Record<VoidId, boolean> = { nw: false, arabian: false, tibet: true, bay: true };
  /** Claim h px of a void; returns null if it will not fit (caller falls back). */
  const claim = (id: VoidId, w: number, h: number, from: "top" | "bot" = "top"): Box | null => {
    const c = cursor[id], b = VB[id];
    if (b.w < w - 2 || c.bot - c.top < h) return null;
    const x = RIGHT[id] ? b.x + b.w - w : b.x;
    if (from === "top") { const y = c.top; c.top += h + 14; return { x, y, w, h }; }
    const y = c.bot - h; c.bot -= h + 14; return { x, y, w, h };
  };

  const reserved: Box[] = [...bandBlocks];
  const place = (id: VoidId, w: number, h: number, from: "top" | "bot" = "top"): Box | null => {
    const b = claim(id, w, h, from);
    if (b) reserved.push(b);
    return b;
  };

  // ── legend metrics (needed before claiming) ───────────────────────────────
  const edges = [min, ...breaks, max];
  const nClasses = Math.max(1, edges.length - 1);
  const hasNoData = spec.entries.length < spec.features.length;
  const LG = L.legend;
  // Coverage legend swatch — a fixed categorical key, rendered as a vertical stack
  // in every layout (it is a class list, not a ramp).
  const COV_SW = 26, COV_SH = 13;
  const legendSize = (): { w: number; h: number } => {
    if (coverage) {
      ctx.font = `500 ${LG.labelSize}px ${SANS}`;
      let lw = 0;
      for (const c of covClasses)
        lw = Math.max(lw, ctx.measureText(`${PROVENANCE_LABEL[c]}  ${covCounts![c].toLocaleString("en-IN")}`).width);
      if (hasNoData) lw = Math.max(lw, ctx.measureText("No data").width);
      const rows = covClasses.length + (hasNoData ? 1 : 0);
      return { w: COV_SW + 10 + lw, h: 22 + rows * (COV_SH + 8) };
    }
    if (LG.form === "strip") return { w: nClasses * (LG.swatchW + 12) + (hasNoData ? 42 : 0), h: 62 };
    if (LG.form === "bar") return { w: nClasses * LG.swatchW, h: 56 };
    ctx.font = `500 ${LG.labelSize}px ${MONO}`;
    let lw = 0;
    for (let i = 0; i < nClasses; i++) {
      const s = `${fmtIndianShort(edges[i], spec.metric.decimals, spec.metric.unit)}–${fmtIndianShort(edges[i + 1], spec.metric.decimals, spec.metric.unit)}`;
      lw = Math.max(lw, ctx.measureText(s).width);
    }
    return { w: LG.swatchW + 8 + lw, h: 22 + (nClasses + (hasNoData ? 1 : 0)) * (LG.swatchH + 8) };
  };
  const LSZ = legendSize();

  // ── claim voids in a fixed priority so blocks cannot fight ────────────────
  let headBox: Box | null = null;
  if (L.headline.place !== "band") {
    const v = L.headline.place as VoidId;
    // size to the lines it will really wrap to, not to the worst case — a
    // one-line headline was leaving its subtitle stranded 130px below it
    const hm = headlineMetrics(VB[v].w, L.headline.size, L.headline.lines);
    const hh = hm.height + (L.sub.show ? L.sub.size + 16 : 0);
    headBox = place(v, VB[v].w, Math.min(VB[v].h - 8, hh), "top");
  }

  let hiBox: Box | null = null, loBox: Box | null = null;
  if (showTables) {
    const hH = tableH(tops), lH = tableH(bots);
    if (L.tables.layout === "key" && L.tables.hi && L.tables.hi !== "band") {
      const v = L.tables.hi as VoidId;
      hiBox = place(v, Math.min(VB[v].w, TS.w), Math.max(hH, lH), "top");
    } else if (L.tables.hi === L.tables.lo && L.tables.hi && L.tables.hi !== "band") {
      const v = L.tables.hi as VoidId;
      if (L.tables.layout === "side") {
        const b = place(v, Math.min(VB[v].w, TS.w * 2 + 12), Math.max(hH, lH), "top");
        if (b) { hiBox = { ...b, w: TS.w }; loBox = { x: b.x + TS.w + 12, y: b.y, w: TS.w, h: b.h }; }
      } else {
        hiBox = place(v, Math.min(VB[v].w, TS.w), hH, "top");
        loBox = bots.length ? place(v, Math.min(VB[v].w, TS.w), lH, "top") : null;
      }
    } else {
      if (L.tables.hi && L.tables.hi !== "band") hiBox = place(L.tables.hi as VoidId, Math.min(VB[L.tables.hi as VoidId].w, TS.w), hH, "top");
      if (L.tables.lo && L.tables.lo !== "band" && bots.length) loBox = place(L.tables.lo as VoidId, Math.min(VB[L.tables.lo as VoidId].w, TS.w), lH, "top");
    }
  }

  let anchorBox: Box | null = null;
  if (L.anchor.place !== "band") {
    const v = L.anchor.place as VoidId;
    const aw = anchorBlockW(VB[v].w);
    anchorBox = place(v, aw, anchorBlockH, "top");
  }

  let legendBox: Box | null = null;
  if (!legendUnder) {
    const v = LG.place as VoidId;
    legendBox = place(v, Math.min(VB[v].w, LSZ.w), LSZ.h, LG.form === "stack" ? "top" : "bot");
  }

  let noteBox: Box | null = null;
  if (L.note.place) noteBox = place(L.note.place, VB[L.note.place].w, 150, "top");

  // ── map ───────────────────────────────────────────────────────────────────
  const nodataFill = hatchPattern(ctx, P.nodata, P.nodataLine);
  const drawRegion = (f: SocialFeature, pr: Proj) => {
    const code = spec.codeOf(f);
    const v = values[code];
    tracePath(ctx, f, pr);
    const paint = regionFill(code, v);
    ctx.fillStyle = paint ?? nodataFill;
    ctx.fill("evenodd");
    ctx.strokeStyle = paint ? strokeForFill(paint) : P.nodataLine;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  };
  for (const f of mainland) drawRegion(f, proj);

  // ── island insets — claimed from the BOTTOM of the sea voids ─────────────
  const insetGroups = new Map<string, SocialFeature[]>();
  for (const f of insetFs) {
    const g = insetGroups.get(stCode(f)) ?? [];
    g.push(f);
    insetGroups.set(stCode(f), g);
  }
  const insetRects: Box[] = [];
  for (const [code, fs] of insetGroups) {
    const iw = 128;
    // An inset that will not fit its own sea shrinks before it emigrates: A&N
    // in the Arabian Sea and Lakshadweep in the Bay is worse than either being
    // 30px shorter (v3 hit exactly this once its ranks moved into the Bay).
    const heights = code === "35" ? [176, 152, 132] : [132, 118, 106];
    const homes: VoidId[] = code === "35" ? ["bay", "arabian", "nw"] : ["arabian", "bay", "nw"];
    let slot: Box | null = null;
    outer: for (const h of homes)
      for (const hh of heights) { slot = claim(h, iw, hh, "bot"); if (slot) break outer; }
    if (!slot) continue;
    const bx = slot.x, by = slot.y, ih = slot.h;
    insetRects.push({ x: bx, y: by, w: iw, h: ih });
    reserved.push({ x: bx, y: by, w: iw, h: ih });
    ctx.strokeStyle = P.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, iw, ih);
    const insetVal = spec.level === "state" && values[code] != null
      ? fmtIndianShort(values[code], spec.metric.decimals, spec.metric.unit) : null;
    const geoTop = insetVal ? 38 : 18;
    const irect = { x: bx, y: by + geoTop, w: iw, h: ih - geoTop - 6 };
    if (code === "31") {
      const v = spec.level === "state" ? values[code] : undefined;
      const dotFill = regionFill(code, v) ?? P.nodata;
      const lonLats = LAKSHADWEEP_ISLANDS;
      const b: [number, number, number, number] = [
        Math.min(...lonLats.map((p) => p[0])), Math.min(...lonLats.map((p) => p[1])),
        Math.max(...lonLats.map((p) => p[0])), Math.max(...lonLats.map((p) => p[1])),
      ];
      const ipr = fitProjection(b, irect, 12);
      for (const [lon, lat] of lonLats) {
        const [x, yy] = ipr(lon, lat);
        ctx.beginPath();
        ctx.arc(x, yy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = dotFill; ctx.fill();
        ctx.strokeStyle = P.mapLine; ctx.lineWidth = 0.75; ctx.stroke();
      }
    } else {
      const ipr = fitProjection(geoBounds(fs), irect, 10);
      for (const f of fs) drawRegion(f, ipr);
    }
    ctx.fillStyle = P.muted;
    ctx.font = `600 11.5px ${MONO}`;
    ctx.fillText(INSET_STATES[code].toUpperCase(), bx + 6, by + 14);
    if (insetVal) {
      ctx.fillStyle = P.text;
      ctx.font = `700 15px ${SANS}`;
      ctx.fillText(insetVal, bx + 6, by + 32);
    }
  }

  // ── region callouts ──────────────────────────────────────────────────────
  const nameByCode = new Map(spec.entries.map((e) => [e.code, e.name]));
  const mapCx = mapRect.x + mapRect.w / 2, mapCy = mapRect.y + mapRect.h / 2;

  if (!dense) {
    const labelCodes = new Set(spec.entries.map((e) => e.code));
    const TIERS = [
      { val: `700 ${L.onMap.value}px ${SANS}`, name: `500 ${L.onMap.name}px ${SANS}`, h: 40, dy: 16, minBh: 52, minArea: 6000 },
      { val: `700 ${L.onMap.value - 3}px ${SANS}`, name: `500 ${L.onMap.name - 2}px ${SANS}`, h: 34, dy: 14, minBh: 44, minArea: 3600 },
    ] as const;

    type Mode = "inside" | "near" | "flung";
    type Lbl = {
      code: string; cx: number; cy: number; val: string; name: string;
      mode: Mode; tier: number; side: "l" | "r"; x: number; y: number;
      w: number; bw: number; bh: number; areaPx: number;
    };

    const widthAt = (l: Lbl, tier: number) => {
      ctx.font = TIERS[tier].val;
      const vw = ctx.measureText(l.val).width;
      ctx.font = TIERS[tier].name;
      return Math.max(vw, ctx.measureText(l.name).width);
    };
    const boxOf = (l: Lbl): Box => {
      const h = TIERS[l.tier].h;
      if (l.mode === "inside") return { x: l.cx - l.w / 2, y: l.cy - 18, w: l.w, h };
      const tx = l.x + (l.side === "r" ? 4 : -4);
      return { x: l.side === "r" ? tx : tx - l.w, y: l.y - 18, w: l.w, h };
    };
    const hit = (a: Box, b: Box) =>
      a.x < b.x + b.w + 8 && b.x < a.x + a.w + 8 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3;
    // clamp against the SAFE box, not the plate: an edge-to-edge plate starts at
    // x=0 and would let a long flung name (DNH&DD…) run off the card
    const inMap = (b: Box) =>
      b.x >= safe.x + 4 && b.x + b.w <= safe.x + safe.w - 4 &&
      b.y >= safe.y + 4 && b.y + b.h <= safe.y + safe.h - 4;

    const cand: Lbl[] = [];
    for (const f of mainland) {
      const code = spec.codeOf(f);
      if (!labelCodes.has(code) || values[code] == null) continue;
      const c = centroidPx(f, proj);
      cand.push({
        code, cx: c.x, cy: c.y,
        val: fmtIndianShort(values[code], spec.metric.decimals, spec.metric.unit),
        name: nameByCode.get(code) ?? code,
        mode: "flung", tier: 0, side: c.x >= mapCx ? "r" : "l",
        x: c.x, y: c.y, w: 0, bw: c.bw, bh: c.bh, areaPx: c.areaPx,
      });
    }

    cand.sort((a, b) => b.areaPx - a.areaPx);
    const placed: Lbl[] = [];
    // reserved now carries every composed block, so a label can never be drawn
    // under a rank table / anchor / legend that moved into the ocean.
    const clear = (l: Lbl) => {
      const b = boxOf(l);
      return inMap(b) && !reserved.some((r) => hit(b, r)) && !placed.some((o) => hit(b, boxOf(o)));
    };

    const RING = [
      [1, 0], [-1, 0], [0, -1], [0, 1],
      [0.71, -0.71], [-0.71, -0.71], [0.71, 0.71], [-0.71, 0.71],
    ] as const;

    for (const l of cand) {
      let done = false;
      for (let t = 0; t < TIERS.length && !done; t++) {
        l.tier = t; l.w = widthAt(l, t); l.mode = "inside";
        const TT = TIERS[t];
        if (l.bw * 0.86 > l.w && l.bh > TT.minBh && l.areaPx > TT.minArea && clear(l)) done = true;
      }
      for (const dist of [30, 46, 62]) {
        if (done) break;
        for (const [ux, uy] of RING) {
          if (done) break;
          for (let t = 0; t < TIERS.length; t++) {
            l.tier = t; l.w = widthAt(l, t); l.mode = "near";
            l.side = ux > 0.3 ? "r" : ux < -0.3 ? "l" : l.cx >= mapCx ? "r" : "l";
            l.x = l.cx + ux * dist;
            l.y = l.cy + uy * dist;
            if (clear(l)) { done = true; break; }
          }
        }
      }
      if (!done) {
        l.mode = "flung"; l.tier = 0; l.w = widthAt(l, 0);
        l.side = l.cx >= mapCx ? "r" : "l";
      }
      placed.push(l);
    }

    const flung = placed.filter((l) => l.mode === "flung");
    for (const side of ["l", "r"] as const) {
      const outs = flung.filter((l) => l.side === side).sort((a, b) => a.cy - b.cy);
      outs.forEach((l) => {
        const dx = l.cx - mapCx, dy = l.cy - mapCy;
        const len = Math.hypot(dx, dy) || 1;
        l.x = l.cx + (dx / len) * 74;
        l.y = l.cy + (dy / len) * 74;
        if (side === "l") l.x = Math.max(l.x, safe.x + l.w + 6);
        else l.x = Math.min(l.x, safe.x + safe.w - l.w - 6);
        l.y = Math.max(safe.y + 24, Math.min(safe.y + safe.h - 18, l.y));
      });
      const gap = 42;
      for (let i = 1; i < outs.length; i++)
        if (outs[i].y - outs[i - 1].y < gap) outs[i].y = outs[i - 1].y + gap;
      for (let i = outs.length - 1; i > 0; i--)
        if (outs[i].y > safe.y + safe.h - 18) outs[i].y = safe.y + safe.h - 18 - (outs.length - 1 - i) * gap;
    }

    for (let pass = 0; pass < 5; pass++)
      for (const l of flung) {
        for (const o of placed) {
          if (o === l) continue;
          const B = boxOf(o);
          if (hit(boxOf(l), B)) l.y = B.y + B.h + 23;
        }
        // clear the block by the label's own height, not by a fixed 22px — a
        // 40px-tall callout pushed to r.y-22 still sat on the block's top rule
        for (const r of reserved) if (hit(boxOf(l), r)) l.y = r.y - (TIERS[l.tier].h - 18) - 16;
        l.y = Math.max(safe.y + 24, Math.min(safe.y + safe.h - 18, l.y));
      }

    for (const l of placed) {
      const TT = TIERS[l.tier];
      if (l.mode === "flung") {
        ctx.strokeStyle = P.leader;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(l.cx, l.cy);
        ctx.lineTo(l.x, l.y - 6);
        ctx.stroke();
      }
      ctx.textAlign = l.mode === "inside" ? "center" : l.side === "r" ? "left" : "right";
      const tx = l.mode === "inside" ? l.cx : l.x + (l.side === "r" ? 4 : -4);
      const ty = l.mode === "inside" ? l.cy : l.y;
      ctx.font = TT.val;
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = P.halo;
      ctx.strokeText(l.val, tx, ty);
      ctx.fillStyle = P.text;
      ctx.fillText(l.val, tx, ty);
      ctx.font = TT.name;
      ctx.strokeText(l.name, tx, ty + TT.dy);
      ctx.fillStyle = P.muted;
      ctx.fillText(l.name, tx, ty + TT.dy);
    }
    ctx.textAlign = "left";
  } else {
    const mm = L.markers === "table" ? "table" : (spec.markerMode ?? "none");
    if (mm !== "none") {
      const mtops = tops.slice(0, mm === "extremes" ? 1 : mm === "top3" ? 3 : tops.length);
      const mbots = bots.slice(0, mm === "table" ? bots.length : 1);
      const want = new Set([...mtops, ...mbots].map((e) => e.code));
      const centroids = new Map<string, { x: number; y: number }>();
      for (const f of mainland) {
        const code = spec.codeOf(f);
        if (!want.has(code)) continue;
        const c = centroidPx(f, proj);
        centroids.set(code, { x: c.x, y: c.y });
      }
      type Mk = { x: number; y: number; ox: number; oy: number; n: string; top: boolean };
      const mks: Mk[] = [];
      mtops.forEach((e, i) => {
        const c = centroids.get(e.code);
        if (c) mks.push({ x: c.x, y: c.y, ox: c.x, oy: c.y, n: String(i + 1), top: true });
      });
      mbots.forEach((e, i) => {
        const c = centroids.get(e.code);
        if (c) mks.push({ x: c.x, y: c.y, ox: c.x, oy: c.y, n: String(i + 1), top: false });
      });
      for (let pass = 0; pass < 6; pass++)
        for (let i = 1; i < mks.length; i++)
          for (let j = 0; j < i; j++)
            if (Math.hypot(mks[i].x - mks[j].x, mks[i].y - mks[j].y) < 26)
              mks[i].y = mks[j].y + 26;
      for (const m of mks) {
        // keep markers out of the composed blocks (new — blocks now live on the map)
        for (const r of reserved)
          if (m.x > r.x - 13 && m.x < r.x + r.w + 13 && m.y > r.y - 13 && m.y < r.y + r.h + 13)
            m.y = m.oy < r.y + r.h / 2 ? r.y - 15 : r.y + r.h + 15;
        m.y = Math.max(mapRect.y + 14, Math.min(mapRect.y + mapRect.h - 14, m.y));
        if (Math.hypot(m.x - m.ox, m.y - m.oy) > 6) {
          ctx.strokeStyle = P.leader;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(m.ox, m.oy);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }
        marker(m.x, m.y, m.n, m.top);
      }
    }
  }

  // ── composed blocks, drawn over the map ──────────────────────────────────
  if (headBox) {
    drawHeadline(headBox.x, headBox.y, headBox.w, L.headline.size, L.headline.lines, L.headline.align);
    if (L.sub.show) {
      ctx.font = `500 ${L.sub.size}px ${SANS}`;
      ctx.textAlign = L.headline.align === "right" ? "right" : "left";
      const sx = L.headline.align === "right" ? headBox.x + headBox.w : headBox.x;
      ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo;
      ctx.strokeText(subText, sx, headBox.y + headBox.h - 4);
      ctx.fillStyle = P.muted;
      ctx.fillText(subText, sx, headBox.y + headBox.h - 4);
      ctx.textAlign = "left";
    }
  }

  if (showTables) {
    if (L.tables.layout === "key" && hiBox) {
      // boxless combined key: HIGHEST column then LOWEST column
      const colW = (hiBox.w - 16) / 2;
      const saveW = TS.w;
      (TS as { w: number }).w = colW;
      drawTable(hiBox.x, hiBox.y, "HIGHEST", true, tops);
      if (bots.length) drawTable(hiBox.x + colW + 16, hiBox.y, "LOWEST", false, bots);
      (TS as { w: number }).w = saveW;
    } else {
      if (hiBox) { const s = TS.w; (TS as { w: number }).w = hiBox.w; drawTable(hiBox.x, hiBox.y, "HIGHEST", true, tops); (TS as { w: number }).w = s; }
      if (loBox && bots.length) { const s = TS.w; (TS as { w: number }).w = loBox.w; drawTable(loBox.x, loBox.y, "LOWEST", false, bots); (TS as { w: number }).w = s; }
    }
  }

  if (anchorBox) drawAnchor(anchorBox.x, anchorBox.y, anchorBox.w, RIGHT[L.anchor.place as VoidId] ? "right" : "left");

  if (noteBox) {
    ctx.font = `500 ${L.note.size}px ${SANS}`;
    ctx.fillStyle = P.dim;
    const noteText = coverage
      ? "Coloured by each region's data provenance — measured vs re-aggregated, inherited or projected — not by value. Hatched fill = no value reported for that region."
      : `${nClasses}-class ${METHOD_LABEL[usedMethod].toLowerCase()} breaks — the same cuts the live map is using. Hatched fill = no value reported for that region.`;
    const nl = wrap(ctx, noteText, noteBox.w, 8);
    ctx.strokeStyle = P.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(noteBox.x, noteBox.y); ctx.lineTo(noteBox.x + Math.min(noteBox.w, 60), noteBox.y); ctx.stroke();
    nl.forEach((s, i) => ctx.fillText(s, noteBox.x, noteBox.y + 20 + i * (L.note.size + 5)));
  }

  // ── legend ───────────────────────────────────────────────────────────────
  const drawLegend = (bx: number, by: number, bw: number) => {
    if (coverage) {
      // Categorical provenance key: swatch + class label + region count, one row
      // per class present (item 830). Same colours as the map's coverage legend.
      ctx.font = `600 ${LG.titleSize}px ${SANS}`;
      ctx.fillStyle = P.muted;
      const ctitle = "Data provenance";
      if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(ctitle, bx, by + 2); }
      ctx.fillText(ctitle, bx, by + 2);
      let ly = by + 14;
      const covRow = (swatch: string | CanvasPattern, label: string, muted: boolean) => {
        ctx.fillStyle = swatch;
        ctx.fillRect(bx, ly, COV_SW, COV_SH);
        ctx.strokeStyle = P.border; ctx.lineWidth = 0.5; ctx.strokeRect(bx, ly, COV_SW, COV_SH);
        ctx.font = `500 ${LG.labelSize}px ${SANS}`;
        if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(label, bx + COV_SW + 10, ly + COV_SH - 1); }
        ctx.fillStyle = muted ? P.muted : P.text;
        ctx.fillText(label, bx + COV_SW + 10, ly + COV_SH - 1);
        ly += COV_SH + 8;
      };
      for (const c of covClasses)
        covRow(PROVENANCE_COLOR[c], `${PROVENANCE_LABEL[c]}  ${covCounts![c].toLocaleString("en-IN")}`, false);
      if (hasNoData) covRow(nodataFill, "No data", true);
      return;
    }
    ctx.font = `600 ${LG.titleSize}px ${SANS}`;
    ctx.fillStyle = P.muted;
    const title = spec.metric.unit === "%" ? "Share (%)" : spec.metric.unit;
    if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(title, bx, by + 2); }
    ctx.fillText(title, bx, by + 2);
    if (LG.form === "stack") {
      let ly = by + 14;
      for (let i = 0; i < nClasses; i++) {
        ctx.fillStyle = spec.paletteFn(nClasses === 1 ? 0 : i / (nClasses - 1));
        ctx.fillRect(bx, ly, LG.swatchW, LG.swatchH);
        ctx.strokeStyle = P.border; ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, ly, LG.swatchW, LG.swatchH);
        ctx.font = `500 ${LG.labelSize}px ${MONO}`;
        const s = `${fmtIndianShort(edges[i], spec.metric.decimals, spec.metric.unit)}–${fmtIndianShort(edges[i + 1], spec.metric.decimals, spec.metric.unit)}`;
        if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(s, bx + LG.swatchW + 8, ly + LG.swatchH - 2); }
        ctx.fillStyle = P.muted;
        ctx.fillText(s, bx + LG.swatchW + 8, ly + LG.swatchH - 2);
        ly += LG.swatchH + 8;
      }
      if (hasNoData) {
        ctx.fillStyle = nodataFill;
        ctx.fillRect(bx, ly, LG.swatchW, LG.swatchH);
        ctx.strokeStyle = P.border; ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, ly, LG.swatchW, LG.swatchH);
        ctx.font = `500 ${LG.labelSize}px ${MONO}`;
        if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText("no data", bx + LG.swatchW + 8, ly + LG.swatchH - 2); }
        ctx.fillStyle = P.muted;
        ctx.fillText("no data", bx + LG.swatchW + 8, ly + LG.swatchH - 2);
      }
      return;
    }
    if (LG.form === "bar") {
      const sw = Math.min(LG.swatchW, bw / nClasses);
      for (let i = 0; i < nClasses; i++) {
        ctx.fillStyle = spec.paletteFn(nClasses === 1 ? 0 : i / (nClasses - 1));
        ctx.fillRect(bx + i * sw, by + 12, sw, LG.swatchH);
      }
      ctx.strokeStyle = P.border; ctx.lineWidth = 0.75;
      ctx.strokeRect(bx, by + 12, sw * nClasses, LG.swatchH);
      ctx.font = `500 ${LG.labelSize}px ${MONO}`;
      const lo = fmtIndianShort(edges[0], spec.metric.decimals, spec.metric.unit);
      const hi = fmtIndianShort(edges[nClasses], spec.metric.decimals, spec.metric.unit);
      ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo;
      ctx.strokeText(lo, bx, by + 12 + LG.swatchH + 18);
      ctx.fillStyle = P.muted;
      ctx.fillText(lo, bx, by + 12 + LG.swatchH + 18);
      ctx.textAlign = "right";
      ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo;
      ctx.strokeText(hi, bx + sw * nClasses, by + 12 + LG.swatchH + 18);
      ctx.fillStyle = P.muted;
      ctx.fillText(hi, bx + sw * nClasses, by + 12 + LG.swatchH + 18);
      ctx.textAlign = "left";
      return;
    }
    // strip
    let lx = bx;
    const sw = Math.min(LG.swatchW, (bw - (hasNoData ? 42 : 0)) / nClasses - 12);
    for (let i = 0; i < nClasses; i++) {
      ctx.fillStyle = spec.paletteFn(nClasses === 1 ? 0 : i / (nClasses - 1));
      ctx.fillRect(lx, by + 12, sw, LG.swatchH);
      ctx.strokeStyle = P.border; ctx.lineWidth = 0.5;
      ctx.strokeRect(lx, by + 12, sw, LG.swatchH);
      ctx.font = `500 ${LG.labelSize}px ${MONO}`;
      const s = `${fmtIndianShort(edges[i], spec.metric.decimals, spec.metric.unit)}–${fmtIndianShort(edges[i + 1], spec.metric.decimals, spec.metric.unit)}`;
      if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText(s, lx, by + 46); }
      ctx.fillStyle = P.muted;
      ctx.fillText(s, lx, by + 46);
      lx += sw + 12;
    }
    if (hasNoData) {
      ctx.fillStyle = nodataFill;
      ctx.fillRect(lx, by + 12, 30, LG.swatchH);
      ctx.strokeStyle = P.border; ctx.lineWidth = 0.5;
      ctx.strokeRect(lx, by + 12, 30, LG.swatchH);
      ctx.font = `500 ${LG.labelSize}px ${MONO}`;
      if (!legendUnder) { ctx.lineWidth = 4.5; ctx.strokeStyle = P.halo; ctx.strokeText("no data", lx, by + 46); }
      ctx.fillStyle = P.muted;
      ctx.fillText("no data", lx, by + 46);
    }
  };
  if (legendUnder) drawLegend(MARGIN, legendTop, LW - MARGIN * 2);
  else if (legendBox) drawLegend(legendBox.x, legendBox.y, legendBox.w);

  // ── footer: source citation (+ brand when the headline took the top) ─────
  ctx.strokeStyle = P.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, footerTop);
  ctx.lineTo(LW - MARGIN, footerTop);
  ctx.stroke();

  ctx.font = `500 ${L.captionSize}px ${SANS}`;
  ctx.fillStyle = P.muted;
  const srcText = `Source: ${spec.metric.source} · ${spec.metric.year}`;
  const note = estimateFootnote(spec.entries, spec.level === "district" ? "districts" : "states");
  // The classification is part of the card's provenance and every template draws this
  // footer, so the method + class count is disclosed here consistently even on layouts
  // that place no separate note block. Drawn on its OWN line, never folded into the
  // source wrap, so it can't reflow the estimate footnote — which must stay a single
  // intact string (item 827; keeps item 667's disclosure whole).
  const methodNote = coverage
    ? "coloured by data provenance"
    : `${nClasses}-class ${METHOD_LABEL[usedMethod].toLowerCase()}`;
  // Boundary self-certification, compact (iter-32 item 847): every exported card
  // carries a short "boundaries per Survey of India" note beside the method line,
  // mirroring the methodology page's boundary self-cert. Drawn on the method line
  // (never folded into the source/estimate wrap, which must stay intact — item
  // 827). OWNER-REVIEW copy.
  const boundaryNote = "Boundaries per Survey of India";
  const srcW = LW - MARGIN * 2 - (brandInFooter ? 300 : 20);
  const srcLines = wrap(ctx, note ? `${srcText} · ${note}` : srcText, srcW, 2);
  srcLines.forEach((s, i) => ctx.fillText(s, MARGIN, footerTop + 22 + i * 16));
  ctx.fillText(`${methodNote} · ${boundaryNote}`, MARGIN, footerTop + 22 + srcLines.length * 16);
  if (brandInFooter) drawBrand(LW - MARGIN, footerTop + 8, true);

  return canvas;
}
