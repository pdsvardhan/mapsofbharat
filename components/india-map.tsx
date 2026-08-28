"use client";

// Atlas explorer (iter-51, adr-015): MapLibre choropleth re-skinned to the
// dark editorial "living almanac" design, with masthead, framed map plate,
// floating left stack, right rail (profile / ranking / compare / cohort),
// editorial chooser, Ctrl-K search and a unified Share menu.
// The map engine and real geometry stay per adr-007 — only the skin changed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BreakMethod, PaletteId, PALETTES, DEFAULT_PALETTE, SUGGESTED_PALETTE, normalizePalette,
  computeBreaks, selectMethod, isBreakMethod, applicableMethods, describe, classCounts,
  METRIC_REFERENCE, colorFor, strokeForFill, fillLuminance, outlineForBackdrop, interpolateRdBu,
} from "@/lib/breaks";
import { Metric, catAccent } from "@/components/atlas/cats";
import { track, embedHost } from "@/lib/analytics";
import { countsInStats, estimateFootnote, estimateShort } from "@/lib/estimate-kind";
import {
  ProvenanceClass, PROVENANCE_COLOR, PROVENANCE_MUTED,
  provenanceOf, coverageCounts, coverageStat,
} from "@/lib/coverage";
import { ChooserModal } from "@/components/atlas/chooser";
import { SearchModal, RegionIdx } from "@/components/atlas/search-modal";
import { ShareMenu } from "@/components/atlas/share-menu";
import { SocialExportDialog } from "@/components/atlas/social-export-dialog";
import type { SocialFeature } from "@/lib/social-export";
import { additionalSourceCredits } from "@/lib/metric-raw-source";
import { Crumbs, IndicatorCard, LevelColourCard, LegendCard, ScalePopover } from "@/components/atlas/left-stack";
import { floorShare, symbolRadius, type SymbolLevel } from "@/lib/symbols";
import {
  regionAreas, alphaWarrant, alphaByRegion, alphaBounds,
  ALPHA_UNFADED, MAP_GROUND, NO_DATA_FILL, noDataHatchTile, type Warrant,
} from "@/lib/value-by-alpha";
import {
  BIVARIATE_K, bivariateColor, sharedRegions, bivariateEligible, axisBreaks, bivariateScope,
  type Eligibility,
} from "@/lib/bivariate";
// The single resolver for which forms a metric may honestly take (#575).
import { canRender, preferredViz } from "@/lib/metric-capabilities";
import { RegionProfile, RankingRail, ComparePanel, Entry, CohortDef } from "@/components/atlas/right-rail";
import { DataTable } from "@/components/atlas/data-table";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#26231c"; // no indicator picked. token: --map-neutral (MapLibre paint takes a colour, not a var())
// Indicator picked, region missing a value (token: --map-nodata). Imported rather
// than declared here since item 1077 round 2: the tone, the ground it composites
// over and the hatch drawn on top are one contract — a faded fill must never be
// mistakable for a region we have no number for — and that contract is measured in
// lib/value-by-alpha against these exact values.
const NODATA = NO_DATA_FILL;
// ── the no-data hatch (item 1077 round 2) ────────────────────────────────────
// A region with no number is marked by TEXTURE, not by tone, because tone is exactly
// what the fade eats: a faded class-5 fill composites to rgb(77,71,37) against a
// no-data rgb(39,37,28) — contrast 1.64, the same warm olive, where unfaded the two
// stand 8.64 apart. No opacity can imitate a stripe, so the separation survives every
// alpha from the 0.28 floor to 0.95. The tile, its measurement and the reason this is
// not adr-019's dropped estimate hatch are all in lib/value-by-alpha.
//
// A PATTERN LAYER over the fill, not a data-driven `fill-pattern`: the pattern is
// constant and it is the per-region SWITCH that must be data-driven, which
// fill-opacity does natively from feature-state. Each sits directly above its fill and
// below the seam, so boundaries stay on top; each honours `dim`, so cohort dimming
// does not leave a hatch shouting over a dimmed state.
/** The MapLibre image id for the no-data hatch. */
const NODATA_HATCH_IMG = "nodata-hatch";
/** Paint for a hatch layer. A function, because the four of them (two levels x two
 *  vintages) are added from two places and a shared object literal would be one
 *  mutable style object handed to four layers. */
const hatchPaint = () => ({
  "fill-pattern": NODATA_HATCH_IMG,
  "fill-opacity": ["case",
    ["!", ["boolean", ["feature-state", "nodata"], false]], 0,
    ["boolean", ["feature-state", "dim"], false], 0.15,
    1],
});
/** Every hatch layer, paired with the fill whose visibility and filter it follows. */
const NODATA_LAYERS: Record<string, string> = {
  "district-fill": "district-nodata",
  "state-fill": "state-nodata",
  "d2011-fill": "d2011-nodata",
  "s2011-fill": "s2011-nodata",
};

// ── a state code is ZERO-PADDED, everywhere (iter-46 item 1091) ───────────────
// "01".."38", and not incidentally: districts.geojson's st_code carries the pad, so
// does the rid built from it ("09_75"), so does region_keys.code, so does every
// metric_values.region_code at state level — and `states` is promoteId'd on st_code,
// which makes the padded string a MapLibre feature id as well. Five key spaces, one
// spelling.
//
// This file kept normalising the pad away with String(Number(code)) — "09" -> "9" —
// and one of those call sites was a live production defect. applyFocus built its
// MapLibre drill filter from the normalised form while the geojson property kept the
// pad, so for the nine states coded 01..09 the filter matched NOTHING. Measured on
// the deployed 57581ac: drilling Maharashtra (27) admitted 35 district polygons and
// rendered them; Uttar Pradesh (09) admitted 0 and rendered 0, Jammu & Kashmir (01)
// 0 of 22, Delhi (07) 0 of 1. Nine states drew an empty map, India's most populous
// among them.
//
// It hid for as long as it did because the surroundings were TOLERANT: scopeCodes(),
// the ranking rail and the region counts all accepted either spelling, so every
// number on the page stayed correct while the map drew nothing — and every drill
// spec in the suite happened to use a high-numbered state.
//
// So the tolerance is gone and these three are what replaces it: one canonical form,
// applied at the boundary (applyFocus) rather than remembered at each call site, and
// a filter that compares NUMBERS so it cannot care about the pad on either side —
// including on the day the geometry is rebuilt by something that does not pad.
// tests/drill-state-codes.spec.ts sweeps every state code the geometry carries.

/** The canonical form of a state code here: zero-padded to two digits. */
function stCode(code: string | number): string {
  return String(code).padStart(2, "0");
}

/** The district-rid prefix for a state — "09_", the key space districts live in. */
function ridPrefix(code: string | number): string {
  return stCode(code) + "_";
}

/** "this feature belongs to state <code>", as a MapLibre filter.
 *
 *  Numeric on BOTH sides, which is the whole point: "09" and "9" are the same state
 *  and neither spelling can miss the other. The `-1` fallback is to-number's second
 *  candidate — a feature with no st_code, or an unconvertible one, would otherwise
 *  make the whole expression an ERROR rather than a non-match, and an erroring filter
 *  takes the layer down instead of one feature. */
function stateFilter(code: string | number): maplibregl.FilterSpecification {
  return ["==", ["to-number", ["get", "st_code"], -1], Number(stCode(code))];
}

type MetricData = {
  /** Which metric this payload is for. The previous metric's rows stay painted
   *  while the next one loads, so anything that reasons about the DATA (not just
   *  paints it) must check this against `sel` first — judging one metric's
   *  default scale against another's distribution is exactly the cross-metric
   *  leak item 756 exists to remove. */
  id: string;
  name: string; unit: string; year: number; source: string; license?: string; decimals: number;
  min: number; max: number; mean: number; count: number; values: Record<string, number>;
  /** How many rows min/max/mean actually rest on (adr-022). */
  stats_count?: number;
  // region_code -> 1 when the value is not this region's own measurement
  estimated?: Record<string, 1>;
  /** region_code -> which kind of estimate: 'inherited' | 'projected' | 'aggregated' (adr-021). */
  estimate_kind?: Record<string, string>;
  /** region_code -> the district that supplied the number; 'inherited' only (item 640). */
  estimated_from?: Record<string, string>;
  /** region_code -> 1 for a SHAKY inheritance — a weak sibling match (adr-026). */
  shaky?: Record<string, 1>;
};
type Sel = { code: string; name: string; state: string; kind: "state" | "district" };
type Focus = { code: string; name: string };
/** Legend view mode: shade by VALUE, by distance from the scope average, or by
 *  each region's DATA PROVENANCE (coverage view, item 830). */
type Mode = "value" | "vs_avg" | "coverage";
/** Boundary vintage: current-day (default, adr-003 main path) or the
 *  as-reported Census 2011 view (adr-003's toggle, iter-98 item 671). */
type Vintage = "current" | "2011";

function bbox(geom: { coordinates: unknown }): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown): void => {
    const arr = c as number[] | unknown[];
    if (typeof arr[0] === "number") {
      const x = arr[0] as number, y = arr[1] as number;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else (arr as unknown[]).forEach(walk);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function readUrl() {
  if (typeof window === "undefined")
    return { m: "", mode: "value" as const, st: "", stn: "", cmp: [] as string[], lvl: "state" as "state" | "district", brk: "jenks" as BreakMethod, pal: DEFAULT_PALETTE, rev: false, brkPinned: false, palPinned: false, vin: "current" as Vintage, sym: null as boolean | null, bi: "" };
  const p = new URLSearchParams(window.location.search);
  const m = p.get("m") || "";
  // Jenks is the global default (iter-53 item 404); explicit URL param wins
  const brkParam = p.get("brk");
  const brk = (isBreakMethod(brkParam) ? brkParam : "jenks") as BreakMethod;
  // old Observatory links: metric set but no lvl meant the district default
  const lvl = (p.get("lvl") === "state" ? "state" : p.get("lvl") === "district" ? "district" : m ? "district" : "state") as "state" | "district";
  return {
    m,
    mode: (p.get("mode") === "vs_avg" ? "vs_avg" : p.get("mode") === "coverage" ? "coverage" : "value") as Mode,
    // The metric this map is PAIRED with (#408 item 1080). A second metric id, or
    // empty. It is a first-class part of the view, so it travels in the link.
    bi: p.get("bi") || "",
    st: p.get("st") || "",
    stn: p.get("stn") || "",
    cmp: (p.get("cmp") || "").split(",").filter(Boolean),
    lvl,
    brk,
    pal: normalizePalette(p.get("pal")),
    rev: p.get("rev") === "1",
    brkPinned: !!brkParam,
    palPinned: !!p.get("pal"),
    vin: (p.get("vin") === "2011" ? "2011" : "current") as Vintage,
    // Render mode override (#408). Absent means "let the metric decide", which is
    // the normal case — the param only appears once the reader has deliberately
    // flipped it, so a plain shared link still shows each metric in its honest form
    // rather than pinning whatever the sharer happened to be looking at.
    sym: p.get("sym") === "1" ? true : p.get("sym") === "0" ? false : null,
  };
}

const PREFS_STORE = "mapsofbharat-atlas-v1";

export default function IndiaMap({ minimal = false }: { minimal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  // Value-by-alpha inputs (#408 item 1077). Cached per LEVEL, not per metric: these
  // are two Census 2011 series and they are the same for every map drawn at that
  // level, so the fetch happens once and every later metric reuses it.
  const weightRef = useRef<Record<string, { pop: Record<string, number>; area: Record<string, number> }>>({});
  const alphaRef = useRef<Record<string, number>>({});
  /** Signature of the last published fade verdict — warranted, reason and the two
   *  population bounds. recolor() runs on every repaint and the legend must not
   *  re-render unless one of those actually moved. */
  const warrantSigRef = useRef<string>("");
  const [warrant, setWarrant] = useState<Warrant | null>(null);
  /** The p5/p95 populations the fade ramp ran between, for the legend's fade key. */
  const [fadeBounds, setFadeBounds] = useState<{ lo: number; hi: number } | null>(null);
  /** How many regions this paint HATCHED and actually drew. Published for the
   *  legend, which keys the hatch, so the key can stand down on a map that has no
   *  absentees (iter-46 polish, N3). Signature-guarded like the warrant above:
   *  recolor() runs on every repaint and the legend must not re-render unless the
   *  number moved. */
  const [hatchedCount, setHatchedCount] = useState(0);
  const hatchedSigRef = useRef<number>(-1);
  const estimatedRef = useRef<Record<string, 1>>({});
  const estimateKindRef = useRef<Record<string, string>>({});
  const estimatedFromRef = useRef<Record<string, string>>({});
  const shakyRef = useRef<Record<string, 1>>({});
  const rankRef = useRef<Record<string, number>>({});
  const statesRef = useRef<Record<string, any>>({});
  const statesFCRef = useRef<{ features: SocialFeature[] } | null>(null);
  const districtsFCRef = useRef<any>(null);
  const restoreRef = useRef(readUrl());

  const init = restoreRef.current;
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [regions, setRegions] = useState<RegionIdx[]>([]);
  const [sel, setSel] = useState<string>(init.m);
  const [data, setData] = useState<MetricData | null>(null);
  const [mode, setMode] = useState<Mode>(init.mode);
  // The pair (#408 item 1080). `pairValues` is the second metric at the current
  // level; `pairElig` is the resolver's verdict, kept even when it REFUSES so the
  // legend can say why rather than the pair silently doing nothing.
  const [pairId, setPairId] = useState<string>(init.bi);
  const pairIdRef = useRef(pairId);
  const pairValuesRef = useRef<Record<string, number>>({});
  /** The pair's unit and decimals, for the axis that is not the base metric's: the
   *  matrix key prints real class boundaries now, and a boundary printed with the
   *  wrong precision is a number the map never used. */
  const pairUnitRef = useRef<string>("");
  const pairDecimalsRef = useRef<number>(0);
  const [pairElig, setPairElig] = useState<Eligibility | null>(null);
  const pairEligRef = useRef<Eligibility | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  /** What the PAINT decided about the pair, published for the legend: whether the
   *  matrix is what is on the map, why not when it is not, and the bands it cut.
   *  One source, because the legend saying "matrix" over a univariately-painted map
   *  is the whole of item 1080's D1. */
  type PairView = { drawn: boolean; refusal: Eligibility | null; edgesX: number[]; edgesY: number[] };
  const [pairView, setPairView] = useState<PairView>({ drawn: false, refusal: null, edgesX: [], edgesY: [] });
  const pairSigRef = useRef<string>("");
  // Coverage view: which provenance classes are hidden (toggled off in the legend),
  // so a reader can e.g. show only inherited districts (item 830). A hidden class'
  // regions recede to the neutral no-data tone.
  const [coverageHidden, setCoverageHidden] = useState<ProvenanceClass[]>([]);
  const [level, setLevel] = useState<"state" | "district">(init.lvl);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [selected, setSelected] = useState<Sel | null>(null);
  const [hovered, setHovered] = useState<Sel | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [brkMethod, setBrkMethod] = useState<BreakMethod>(init.brk);
  /** Bumped on every deliberate scale pick, including re-picking the method that is
   *  already active — that produces no brkMethod change, so without this the URL and
   *  localStorage never learn the choice was deliberate. */
  const [pickTick, setPickTick] = useState(0);
  const [palette, setPalette] = useState<PaletteId>(init.pal);
  const [reverse, setReverse] = useState<boolean>(init.rev);
  const [compare, setCompare] = useState(init.cmp.length > 0);
  const [pins, setPins] = useState<Sel[]>([]);
  const [cohort, setCohort] = useState<string>("all");
  const [cohortSets, setCohortSets] = useState<{ pop: Set<string> | null; nsdp: Set<string> | null; area: Set<string> | null }>({ pop: null, nsdp: null, area: null });
  const [rankView, setRankView] = useState<"top" | "bottom">("top");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [vintage, setVintage] = useState<Vintage>(init.vin);
  // bumped when the lazily-added 2011 layers finish loading, so visibility
  // and entries recompute once the sources exist
  const [vintageTick, setVintageTick] = useState(0);
  // Map vs a semantic sortable table of the SAME view (iter-131 item 826). A view
  // preference, not shareable state: kept out of the URL so the readUrl/URL-sync
  // contract is untouched. The map engine is never unmounted (that would orphan
  // MapLibre), so every toggle preserves metric / vintage / drill / selection.
  const [view, setView] = useState<"map" | "table">("map");
  // Render mode (#408). Proportional symbols instead of a choropleth, for metrics
  // whose unit is a COUNT. Not a taste setting: a count on a choropleth is read as
  // area, so Kutch outweighs Mumbai City by its 291x area ratio whatever the colour
  // says. It is `null` until a metric is picked, then defaults to symbols for an
  // eligible metric and choropleth for everything else — the reader gets the honest
  // form without asking, and can still flip to compare the two.
  const [symbolOn, setSymbolOn] = useState(false);
  const [symbolable, setSymbolable] = useState(false);
  const symbolOnRef = useRef(false);
  symbolOnRef.current = symbolOn;
  // null = "no deliberate choice yet, let this metric decide".
  //
  // SCOPED TO ONE METRIC (#567, owner ruling 2026-08-22). It used to persist across
  // metric changes, and the comment here argued that was deliberate — while the
  // comment at the read site said the opposite, "a choice the reader has already
  // made for this same metric". Two comments, two behaviours, one of them wrong.
  //
  // Per-metric is the right one, because which forms are honest is decided per
  // metric: carrying a judgement made about Population onto Rice Production is
  // carrying it onto different data. The asymmetry made it worse — forcing symbols
  // ON was already capped by eligibility, so only forcing them OFF ever persisted,
  // and one click quietly turned every subsequent count map back into the
  // area-biased choropleth this layer exists to replace.
  const symbolForcedRef = useRef<boolean | null>(init.sym);
  /** Which metric the flip above applies to. A shared ?sym= link applies to the
   *  metric it was shared with, hence seeding from the restored metric id. */
  const symbolForcedForRef = useRef<string | null>(init.sym === null ? null : init.m);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // ── phone / small-tablet chrome (to-do 424) ──────────────────────────────
  // Below the lg desktop breakpoint the atlas cannot hold three fixed columns
  // (300px controls + map + 322px rail) — at 390px that left the map a 34px
  // sliver. Sub-desktop it reflows to ONE full-bleed map with two collapsible
  // docks: the controls stack behind a bar at the top of the plate, the ranking
  // rail as a bottom sheet. Both default closed so the map owns the screen.
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  // The two dock HANDLES are the only mobile-only DOM, and they are rendered
  // rather than merely CSS-hidden on desktop. `lg:hidden` would leave them in
  // the tree, and this suite reaches for controls with raw CSS selectors that do
  // not skip display:none — `aside button` filtered by /\d/ (iter26-regressions)
  // would have matched the rail handle instead of a ranking row at 1280px.
  // Layout itself stays CSS-driven (`max-lg:` variants), so nothing reflows on
  // this state; only the two toggles wait for mount.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    // 1023.98 not 1023: matches Tailwind's `max-lg` (`width < 64rem`) exactly, so
    // the handles appear on precisely the widths whose layout the variants change.
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const levelRef = useRef(level);
  const vintageRef = useRef(vintage);
  // 2011 sources are added lazily on first toggle; these hold their FCs + a
  // code -> {name, state} index (vintage codes are 2011 census codes, which the
  // /api/regions palette index does not and should not carry).
  const vintageLoadedRef = useRef(false);
  const d2011FCRef = useRef<any>(null);
  const vintageIdxRef = useRef<Map<string, { name: string; state: string | null }>>(new Map());
  const focusRef = useRef<Focus | null>(null);
  const compareRef = useRef(compare);
  const pinsRef = useRef<Sel[]>([]);
  /** The last browser click already dispatched, so a second delegated layer
   *  listener for the SAME click is ignored (verifier report 822). */
  const lastClickRef = useRef<unknown>(null);
  /** The same, for hover (#571). The click got this guard from report 822 and
   *  mousemove — twenty lines above it, with the identical double-dispatch —
   *  did not. Each wire() closure keeps its own `hov`, so where a circle
   *  overlaps a neighbouring polygon BOTH handlers ran: two regions lit at once
   *  and setHovered fired twice, leaving the tooltip naming whichever listener
   *  happened to run last. Measured before the fix: hovering the Bihar circle
   *  over Jharkhand left [10, 20] both highlighted. */
  const lastHoverRef = useRef<unknown>(null);
  const selectedRef = useRef<Sel | null>(null);
  // the selected METRIC id, for the analytics events fired from map click
  // handlers (item 938) — those are registered once, so reading `sel` directly
  // from the closure would report whichever metric was current at mount.
  const selRef = useRef(sel);
  const modeRef = useRef(mode);
  const coverageHiddenRef = useRef<ProvenanceClass[]>(coverageHidden);
  const brkRef = useRef(brkMethod);
  // the `reference` method needs the pivot inside the imperative paint too (item 757)
  const metricRefRef = useRef<number | null>(null);
  // to-do 348: the state-outline overlay adapts its colour to the backdrop by
  // default (item-760 rule extended to the overlay); ?outline=fixed opts back to
  // the old fixed warm-white.
  const outlineModeRef = useRef<"fixed" | "adaptive">("adaptive");
  const palRef = useRef(palette);
  const revRef = useRef(reverse);
  const cohortRef = useRef(cohort);
  const cohortSetsRef = useRef(cohortSets);
  const dataRef = useRef<MetricData | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A deliberate scale pick (or a URL pin) suppresses the per-metric suggestion —
  // but only for the metric it was made on. Before iter-26 item 756 this was one
  // global latch: a single click pinned that method across every metric forever
  // and wrote it into every share link, which is how a heavily skewed metric
  // ended up rendered on equal-interval with 93% of districts in one class.
  const pickedForMetricRef = useRef(init.brkPinned);
  /** Persisted across sessions (localStorage) — what this browser remembers. */
  const methodByMetricRef = useRef<Record<string, BreakMethod>>({});
  /** Picked BY HAND during this session. Kept separate from the persisted map
   *  because the two rank differently against a URL pin: a pin should outrank a
   *  stale stored preference, but must never outrank a choice the user just made
   *  (`init` is frozen at mount, so a pin that wins unconditionally keeps winning
   *  all session and silently undoes every later pick on that metric). */
  const sessionPickRef = useRef<Record<string, BreakMethod>>({});
  /** The metric a URL `brk` pin belongs to — the pin must not follow the user
   *  to the next metric they open. */
  const pinnedMetricRef = useRef(init.m);
  const palTouchedRef = useRef(init.palPinned);

  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { vintageRef.current = vintage; }, [vintage]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { compareRef.current = compare; }, [compare]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { coverageHiddenRef.current = coverageHidden; }, [coverageHidden]);
  useEffect(() => { brkRef.current = brkMethod; }, [brkMethod]);
  useEffect(() => { pairIdRef.current = pairId; }, [pairId]);
  useEffect(() => { metricRefRef.current = METRIC_REFERENCE[sel] ?? null; }, [sel]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    outlineModeRef.current =
      new URLSearchParams(window.location.search).get("outline") === "fixed" ? "fixed" : "adaptive";
    // test hook (parallels window.__mob_map): expose the resolved outline mode so the
    // to-do 348 default can be asserted directly, without depending on a metric being
    // pale enough for the adaptive colour to visibly diverge from the warm-white.
    (window as unknown as { __mob_outline?: string }).__mob_outline = outlineModeRef.current;
  }, []);
  useEffect(() => { palRef.current = palette; }, [palette]);
  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { revRef.current = reverse; }, [reverse]);
  useEffect(() => { cohortRef.current = cohort; }, [cohort]);
  useEffect(() => { cohortSetsRef.current = cohortSets; }, [cohortSets]);
  useEffect(() => { dataRef.current = data; }, [data]);

  // embed_loaded: fire once when the chrome-less /embed view mounts (item 825). The
  // metric comes straight off the URL (init is frozen at mount) — /embed has no
  // chooser, so it never changes after this.
  // The host of the embedding page rides along (item 938, MSR-12): off-site reach
  // is the one thing no other event can tell us, and it is only answerable from
  // inside the iframe. Host only, never the full referrer — see embedHost().
  // Guarded so ONE embed load is ONE event. Without the ref this effect fires
  // twice under React's double-mount, which tests/analytics-events.spec.ts caught
  // — and embed_loaded is the single number MSR-12 exists for, so a silent 2x on
  // it would have overstated off-site reach with no way to notice from the
  // dashboard. Pre-existing since item 825; the rename is just what surfaced it.
  const embedFiredRef = useRef(false);
  useEffect(() => {
    if (!minimal || embedFiredRef.current) return;
    embedFiredRef.current = true;
    track("embed_loaded", { metric: init.m, domain: embedHost() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimal]);

  const meta = metrics.find((m) => m.id === sel);

  const showToast = useCallback((m: string) => {
    if (toastT.current) clearTimeout(toastT.current);
    setToast(m);
    toastT.current = setTimeout(() => setToast(null), 3400);
  }, []);

  // viz_customised: one event for "the reader changed how the data is drawn"
  // (item 938, MSR-02), carrying WHICH control moved as a dimension — the plan
  // names a single event, and the knob is the interesting part of it.
  // Deliberately wired to the handlers rather than to the state: level, vintage
  // and view are all also set programmatically (a metric that has no district
  // series forces the level; sharing a 2011 link forces the vintage), and an
  // effect watching the state would report those machine changes as reader
  // choices, which is the opposite of what the funnel is asking.
  const trackViz = useCallback((control: string, value: string) => {
    track("viz_customised", { control, value, metric: selRef.current });
  }, []);

  const trackCompare = useCallback(() => {
    track("compare_used", { metric: selRef.current, level: levelRef.current });
  }, []);

  // persisted display prefs (palette / per-metric method / reverse) — metric stays in URL
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PREFS_STORE) || "null");
      if (!s) return;
      // The legacy global `method` key is deliberately NOT restored (item 756):
      // it is the latch that stuck one method across every metric. Anyone
      // carrying one keeps their palette and drops the stale global scale.
      if (s.methodByMetric && typeof s.methodByMetric === "object")
        methodByMetricRef.current = Object.fromEntries(
          Object.entries(s.methodByMetric as Record<string, string>)
            .filter(([, m]) => isBreakMethod(m)),
        ) as Record<string, BreakMethod>;
      if (!new URLSearchParams(window.location.search).get("pal")) {
        if (s.palette) { setPalette(normalizePalette(s.palette)); palTouchedRef.current = true; }
        if (typeof s.reverse === "boolean") setReverse(s.reverse);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    // persist only deliberate picks — suggested defaults stay ephemeral
    const methods = methodByMetricRef.current;
    if (!palTouchedRef.current && !Object.keys(methods).length) return;
    try {
      localStorage.setItem(PREFS_STORE, JSON.stringify({
        ...(palTouchedRef.current ? { palette } : {}),
        ...(Object.keys(methods).length ? { methodByMetric: methods } : {}),
        reverse,
      }));
    } catch { /* ignore */ }
  }, [palette, brkMethod, reverse, pickTick]);

  // per-metric suggested scale + palette (iter-53 items 403/404):
  // metrics.default_scale and topic-suggested ramps apply on pick, but never
  // override a URL pin, a persisted pref, or a manual pick this session
  useEffect(() => {
    if (!meta) return;
    // Four sources, ranked — two-way ordering is what produced two separate leaks
    // in this item (memory-over-pin, then pin-over-live-pick):
    //   1. what the user picked BY HAND this session   — always wins, it is the
    //      most recent thing they actually said
    //   2. a URL pin for this metric                   — the sender's instruction
    //   3. this browser's stored pick                  — a preference, not an order
    //   4. the metric's own default_scale              — else jenks
    const sessionPick = sessionPickRef.current[sel];
    const remembered = methodByMetricRef.current[sel];
    const ds = (meta as { default_scale?: string | null }).default_scale;
    // Restoring a deliberate method can be a NO-OP state write — a stored pick of
    // "jenks" equals readUrl()'s default, so React bails out, no re-render happens,
    // and the URL-sync effect never learns the choice was deliberate. The sender
    // then sees JENKS while the link they copy renders the metric's default to
    // everyone else. Nudge the tick in the three DELIBERATE branches only: bumping
    // it in the else branch would stamp every automatic default into every share
    // link, which is the original item-756 bug restored.
    if (sessionPick) {
      setBrkMethod(sessionPick);
      pickedForMetricRef.current = true;
      setPickTick((t) => t + 1);
    } else if (init.brkPinned && sel === pinnedMetricRef.current) {
      // The URL pinned a method for THIS metric. Re-APPLY it, don't just flag it as
      // picked: on a return visit brkMethod still holds whatever the metric we came
      // from left there, and flagging that as "picked" stamped a method the user
      // never chose into the share link.
      //
      // Checked BEFORE stored memory: a pin is the sender's explicit instruction
      // about what the link should show, so a recipient's stale stored pick must not
      // silently override it (and then overwrite it in the address bar). It is checked
      // AFTER the session pick for the mirror-image reason.
      setBrkMethod(init.brk);
      pickedForMetricRef.current = true;
      setPickTick((t) => t + 1);
    } else if (remembered) {
      setBrkMethod(remembered);
      pickedForMetricRef.current = true;
      setPickTick((t) => t + 1);
    } else {
      // no deliberate pick for this metric: clear the flag so the previous
      // metric's choice cannot follow the user around (the item-756 latch).
      // default_scale is only the PLACEHOLDER until this metric's own values land —
      // the data-driven selector (item 757) refines it in the effect below, where
      // the distribution is actually known.
      pickedForMetricRef.current = false;
      setBrkMethod(isBreakMethod(ds) ? ds : "jenks");
    }
    if (!palTouchedRef.current)
      setPalette(SUGGESTED_PALETTE[meta.category] ?? DEFAULT_PALETTE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, metrics.length]);


  // metric list + region name index
  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((m) => { if (!cancelled) setMetrics(m.metrics || []); })
      .catch(() => {});
    if (!minimal)
      fetch("/api/regions")
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setRegions(d.regions || []); })
        .catch(() => {});
    return () => { cancelled = true; };
  }, [minimal]);

  const nameIdx = useMemo(() => {
    const m = new Map<string, { name: string; state: string | null }>();
    for (const r of regions) m.set(r.code, { name: r.name, state: r.state });
    return m;
  }, [regions]);

  // ── map init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      // MAP_GROUND, not a repeated literal: this is the colour every faded fill
      // composites over, so the legend's fade key and the separation measured in
      // lib/value-by-alpha are only right while they agree with it.
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": MAP_GROUND /* token: --background */ } }] },
      bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 24 },
      attributionControl: false, maxZoom: 12, minZoom: 3, dragRotate: false,
      // MapLibre v5 moved this under canvasContextAttributes — the old
      // top-level option was silently ignored, which made PNG exports blank
      // (iter-53 item 402).
      canvasContextAttributes: { preserveDrawingBuffer: true },
    } as maplibregl.MapOptions);
    mapRef.current = map;
    (window as any).__mob_map = map;
    // test hook (parallels window.__mob_map and window.__mob_outline): the drill
    // filter BUILDER, so one page load can put every state code the geometry carries
    // through the same function applyFocus uses and compare the polygons it admits
    // against the source's own rid prefixes. Item 1091 was a filter that matched
    // nothing for nine states; a sweep that reconstructs the expression in the spec
    // would only be testing a copy of it, and a sweep that reloads the page 38 times
    // is a sweep nobody runs. The spec still asserts, on a real drill, that
    // getFilter("district-fill") is exactly what this returns.
    (window as any).__mob_state_filter = stateFilter;

    // ── symbol-layer feature-state parity (#408 S5) ───────────────────────────
    // The proportional-symbol layer cannot read the polygon sources: a `circle`
    // layer over a polygon source draws one circle per VERTEX, so symbols need
    // their own point source of representative points. That split is the whole
    // risk in this feature — feature-state is per-source, so every hover, select
    // and pin would light the polygon and leave its circle untouched.
    //
    // There are two dozen setFeatureState call sites and more will be added, so
    // "remember to write it twice" is a convention that decays into exactly the
    // half-working mode the build plan calls a demo. Wrapping the setter once
    // makes parity STRUCTURAL: a call site cannot forget, because it is not
    // asked to do anything. New state keys (`r` below) ride the same path free.
    const PT_SOURCE: Record<string, string> = {
      districts: "districts-pts",
      states: "states-pts",
      districts2011: "districts2011-pts",
      states2011: "states2011-pts",
    };
    type SetFS = typeof map.setFeatureState;
    const rawSetFeatureState: SetFS = map.setFeatureState.bind(map);
    map.setFeatureState = ((target: Parameters<SetFS>[0], state: Parameters<SetFS>[1]) => {
      rawSetFeatureState(target, state);
      const pt = PT_SOURCE[target?.source];
      // getSource guards the window before the point sources are added, and the
      // 2011 pair which only exist once the vintage toggle has been used.
      if (pt && map.getSource(pt)) rawSetFeatureState({ ...target, source: pt }, state);
    }) as SetFS;

    // removeFeatureState needs the same treatment, and missing it would be worse
    // than missing a set. recolor() and paintNeutral() both wipe every source
    // before repainting; if only the polygons were cleared, the point sources would
    // keep the PREVIOUS metric's radii for any region the new metric has no value
    // for — circles from the last indicator left sitting on the map, sized by data
    // that is no longer on screen.
    type RmFS = typeof map.removeFeatureState;
    const rawRemoveFeatureState: RmFS = map.removeFeatureState.bind(map);
    map.removeFeatureState = ((target: Parameters<RmFS>[0], key?: Parameters<RmFS>[1]) => {
      rawRemoveFeatureState(target, key);
      const pt = PT_SOURCE[target?.source];
      if (pt && map.getSource(pt)) rawRemoveFeatureState({ ...target, source: pt }, key);
    }) as RmFS;

    map.on("load", async () => {
      map.resize();
      const [districts, states] = await Promise.all([
        fetch("/geodata/districts.geojson").then((r) => r.json()),
        fetch("/geodata/states.geojson").then((r) => r.json()),
      ]);
      districtsFCRef.current = districts;
      statesFCRef.current = states;
      (states.features as any[]).forEach((f) => { statesRef.current[String(f.properties?.st_code)] = f; });
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "rid" });
      map.addSource("states", { type: "geojson", data: states, promoteId: "st_code" });

      // Representative points for the symbol layer, built offline by
      // pipeline/build_centroids.py and asserted to fall inside their own polygon
      // (a naive centroid lands OUTSIDE for 7 of 735 districts — Lakshadweep,
      // Dhubri, the Dadra and Yanam exclaves — which would put a district's
      // quantity in the sea or on top of its neighbour). promoteId matches the
      // polygon source so the mirrored feature-state lands on the same ids.
      const [dPts, sPts] = await Promise.all([
        fetch("/geodata/centroids-districts.geojson").then((r) => r.json()),
        fetch("/geodata/centroids-states.geojson").then((r) => r.json()),
      ]);
      map.addSource("districts-pts", { type: "geojson", data: dPts, promoteId: "rid" });
      map.addSource("states-pts", { type: "geojson", data: sPts, promoteId: "st_code" });

      const fillPaint = {
        "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
        // The last arm is value-by-alpha (#408 item 1077): per-region opacity from
        // how many people the region holds, defaulting to the flat 0.9 this layer
        // always used when no fade is warranted. dim and hover still win — a reader
        // pointing at a region must see it fully whatever its population.
        "fill-opacity": ["case",
          ["boolean", ["feature-state", "dim"], false], 0.15,
          ["boolean", ["feature-state", "hover"], false], 1,
          ["coalesce", ["feature-state", "alpha"], ALPHA_UNFADED]],
        "fill-color-transition": { duration: 400 },
        "fill-opacity-transition": { duration: 160 },
      };
      map.addImage(NODATA_HATCH_IMG, noDataHatchTile(), { pixelRatio: 1 });
      const linePaint = (hairline: number) => ({
        "line-color": ["case",
          ["boolean", ["feature-state", "selected"], false], "#d1502f", // token: --accent
          ["boolean", ["feature-state", "pinned"], false], "#e6b34a", // token: --gold
          ["boolean", ["feature-state", "hover"], false], "#e9e3d5", // token: --foreground
          // item 760: per-region seam, falling back to a flat hairline before any
          // metric is picked (no feature-state has been set yet). The fallback is
          // 0.20, not the original 0.10: at state level state-outline used to draw
          // a second stroke over this one, and suppressing that double-stroke left
          // the neutral START HERE map — the only view with no derived seam to
          // replace it — measurably fainter than before.
          ["coalesce", ["feature-state", "stroke"], "rgba(233,227,213,0.20)"]],
        "line-width": ["case",
          ["boolean", ["feature-state", "selected"], false], 2,
          ["boolean", ["feature-state", "pinned"], false], 2,
          ["boolean", ["feature-state", "hover"], false], 1.1, hairline],
      });

      // EVERY LAYER DECLARES ITS VISIBILITY, INCLUDING THE ONES THAT START ON
      // (item 1077 round 3). These four used to be added with no `layout` at all,
      // so MapLibre stored `visibility: undefined` and the level/vintage effect's
      // first pass — which writes "visible" to all of them unconditionally — was a
      // REAL change as far as Style.setLayoutProperty's deepEqual guard could tell.
      // A real change calls _updateLayer, which marks the source 'reload' and
      // re-parses every tile it has.
      //
      // That cost nothing visible until item 1077, and stopped being free the moment
      // `district-nodata` put a `fill-pattern` on this source. A pattern makes the
      // worker's tile parse ASYNCHRONOUS — it has to ask the main thread for the
      // image and await the answer — so the worker yields mid-parse and starts
      // reading the reload messages queued behind it. MapLibre keeps exactly ONE
      // copy of the raw tile data for that case (GeoJSONWorkerSource._reloadLoadedTile
      // consumes it and never puts it back), so the SECOND reload to land during one
      // parse returns a tile with no rawTileData at all. On the main thread that
      // leaves tile.latestFeatureIndex.rawTileData undefined, loadVTLayers() returns
      // {}, and every queryRenderedFeatures / querySourceFeatures against the source
      // answers with nothing — silently. Measured on the item-1077 build at
      // /?m=pop_total&lvl=district under load: district-symbol answered 735 features
      // and district-fill answered 0, so the polygons were still painted and still
      // unclickable. Nothing errored; the map simply stopped responding to clicks.
      // Two reloads landed inside one parse there (t+21ms and t+100ms, against a
      // parse that only returned at t+100ms); with the declaration below it is one.
      // Declaring the visibility here removes the phantom change, and with it the
      // first of the two reloads. What is left is one real change per load
      // (fill-color going neutral when a count opens as circles), which is the case
      // MapLibre does handle.
      map.addLayer({ id: "district-fill", type: "fill", source: "districts", layout: { visibility: "visible" }, paint: fillPaint } as any);
      // No estimate hatch here by design (adr-019). The overlay that used to mark
      // inherited districts was measured at 1.09:1 against the dark end of the
      // ramp — below WCAG's 3:1 floor for non-text UI, and its 8px tile at
      // pixelRatio 2 aliased to flat tone, so it communicated nothing. It was also
      // disproportionate: inheritance is 2.7% of district data, yet an ASER map
      // would hatch 12% of India, and we render NFHS sampling error perfectly
      // flat. Estimates are disclosed where the number is read instead — rail
      // badge, map hover, region panel, export footnote.
      map.addLayer({ id: "district-nodata", type: "fill", source: "districts", layout: { visibility: "visible" }, paint: hatchPaint() } as unknown as maplibregl.AddLayerObject);
      map.addLayer({ id: "district-line", type: "line", source: "districts", layout: { visibility: "visible" }, paint: linePaint(0.3) as any });
      map.addLayer({ id: "state-fill", type: "fill", source: "states", layout: { visibility: "none" }, paint: fillPaint } as any);
      map.addLayer({ id: "state-nodata", type: "fill", source: "states", layout: { visibility: "none" }, paint: hatchPaint() } as unknown as maplibregl.AddLayerObject);
      map.addLayer({
        id: "state-outline", type: "line", source: "states", layout: { visibility: "visible" },
        paint: { "line-color": "rgba(233,227,213,0.26)", "line-width": 0.8 },
      });
      map.addLayer({ id: "state-line", type: "line", source: "states", layout: { visibility: "none" }, paint: linePaint(0.4) as any });

      // ── the proportional-symbol layer (#408) ────────────────────────────────
      // Radius comes from feature-state `r`, computed in recolor() by
      // lib/symbols.ts. Deliberately NOT a MapLibre interpolate expression on a
      // raw value: the sqrt-area rule is the one piece of this feature that is
      // easy to get wrong and catastrophic when wrong (radius-proportional
      // sizing overstates a 4x value as 16x the ink), so it lives in a pure
      // function a unit test can pin, not in a style expression nothing can.
      //
      // One colour, not the ramp. Size already carries the value; colouring it
      // too would encode one quantity twice and leave the nested-circle legend
      // explaining a scale the reader does not need.
      const symbolPaint = {
        "circle-radius": ["coalesce", ["feature-state", "r"], 0],
        "circle-color": "#d1502f", // token: --accent
        "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.72],
        "circle-stroke-color": ["case",
          ["boolean", ["feature-state", "selected"], false], "#e9e3d5", // token: --foreground
          ["boolean", ["feature-state", "pinned"], false], "#e6b34a", // token: --gold
          "rgba(13,15,20,0.85)"],
        "circle-stroke-width": ["case",
          ["boolean", ["feature-state", "selected"], false], 2,
          ["boolean", ["feature-state", "pinned"], false], 2,
          ["boolean", ["feature-state", "hover"], false], 1.2, 0.5],
        "circle-radius-transition": { duration: 400 },
      };
      map.addLayer({ id: "district-symbol", type: "circle", source: "districts-pts", layout: { visibility: "none" }, paint: symbolPaint } as unknown as maplibregl.AddLayerObject);
      map.addLayer({ id: "state-symbol", type: "circle", source: "states-pts", layout: { visibility: "none" }, paint: symbolPaint } as unknown as maplibregl.AddLayerObject);

      // `source` is always the POLYGON source, even when `layer` is a symbol layer:
      // the wrapper above mirrors every write onto the matching point source, so
      // both light up from one call. The centroid features carry `name` rather than
      // `district`/`st_nm`, hence the fallback — a symbol hover has to name the same
      // region the polygon hover would, or the tooltip contradicts the mark.
      const wire = (layer: string, source: "districts" | "states", kind: "district" | "state") => {
        const nameOf = (p: Record<string, unknown> | undefined) =>
          String((kind === "state" ? p?.st_nm : p?.district) ?? p?.name ?? "—");
        let hov: string | number | undefined;
        map.on("mousemove", layer, (e: any) => {
          if (!e.features?.length) return;
          // ONE POINTER, ONE HOVER (#571) — the click guard's twin, and it must
          // still CLEAR on the way out. Registration order puts the symbol layer
          // first, so it claims the pointer and the fill beneath yields. A bare
          // "return" would not be enough: the fill's own `hov` may still hold the
          // region highlighted a moment ago, and leaving it set is the same two-
          // regions-lit bug arriving one mousemove later.
          const oe = e.originalEvent;
          if (oe && lastHoverRef.current === oe) {
            if (hov !== undefined) {
              map.setFeatureState({ source, id: hov }, { hover: false });
              hov = undefined;
            }
            return;
          }
          lastHoverRef.current = oe ?? null;
          map.getCanvas().style.cursor = "pointer";
          const f = e.features[0];
          if (hov !== undefined) map.setFeatureState({ source, id: hov }, { hover: false });
          hov = f.id as string;
          map.setFeatureState({ source, id: hov }, { hover: true });
          setHovered({
            code: String(f.id),
            name: nameOf(f.properties),
            state: kind === "state" ? "" : String(f.properties?.st_nm ?? statesRef.current[stCode(String(f.id).split("_")[0])]?.properties?.st_nm ?? ""),
            kind,
          });
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          if (hov !== undefined) map.setFeatureState({ source, id: hov }, { hover: false });
          hov = undefined; setHovered(null);
        });
        map.on("click", layer, (e: any) => {
          if (!e.features?.length) return;
          // ONE CLICK, ONE DISPATCH. MapLibre delegated listeners do not stop
          // propagation — each queries its own layers and fires — and a circle sits
          // on a point inside its own polygon, so every symbol click matches the
          // symbol layer AND the fill beneath it. Without this guard clickFeature
          // ran twice per click: region_opened double-fired, and over a neighbouring
          // polygon the two runs disagreed and left two regions selected.
          const oe = e.originalEvent;
          if (oe && lastClickRef.current === oe) return;
          lastClickRef.current = oe ?? null;
          const f = e.features[0];
          const s: Sel = {
            code: String(f.id),
            name: nameOf(f.properties),
            state: String(f.properties?.st_nm ?? statesRef.current[stCode(String(f.id).split("_")[0])]?.properties?.st_nm ?? ""),
            kind,
          };
          clickFeature(s, source);
        });
      };
      // ORDER IS LOAD-BEARING, and not for the reason the old comment gave.
      // Delegated dispatch ignores layer stacking completely; listeners run in
      // REGISTRATION order, and the guard in wire() lets only the first one through.
      // So the symbol layers must be registered BEFORE the fills, or a click on a
      // circle drawn over a neighbouring polygon would select the neighbour.
      // Do not reorder these four lines.
      wire("district-symbol", "districts", "district");
      wire("state-symbol", "states", "state");
      wire("district-fill", "districts", "district");
      wire("state-fill", "states", "state");

      setReady(true);

      // restore drill + compare pins from a shared link
      const r = restoreRef.current;
      if (r.st && r.lvl === "district") {
        // A shared link's `st` is whatever the sender's address bar held. This writer
        // emits the canonical padded form, but links from before that, and links typed
        // by hand, carry "9" — so the lookup canonicalises and applyFocus does the
        // same to what it stores (item 1091).
        const nm = r.stn || statesRef.current[stCode(r.st)]?.properties?.st_nm || "";
        applyFocus(r.st, String(nm));
      }
      if (r.cmp.length) {
        const restored: Sel[] = [];
        for (const code of r.cmp.slice(0, 2)) {
          if (code.includes("_")) {
            const feat = (districts.features as any[]).find((ff) => String(ff.properties?.rid) === code);
            if (feat) restored.push({ code, name: String(feat.properties?.district ?? "—"), state: String(feat.properties?.st_nm ?? ""), kind: "district" });
          } else {
            // The CANONICAL code goes into the pin, not the one the link happened to
            // spell (item 1091): `code` becomes the MapLibre feature id in the
            // setFeatureState below and the key into valuesRef, and both are padded.
            const feat = statesRef.current[stCode(code)];
            if (feat) restored.push({ code: stCode(code), name: String(feat.properties?.st_nm ?? "—"), state: "", kind: "state" });
          }
        }
        if (restored.length) {
          setCompare(true);
          setPins(restored);
          restored.forEach((p) => map.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: true }));
        }
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── vintage (as-reported 2011) sources — added lazily on first toggle ────
  // View-only by design: hover + legend + ranking read the vintage entries,
  // but drill/select/compare stay current-day features (their region panel and
  // crosswalk citations have no 2011 counterpart). Clicks are not wired here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || vintage !== "2011" || vintageLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      const [d2011, s2011] = await Promise.all([
        fetch("/geodata/districts-2011.geojson").then((r) => r.json()),
        fetch("/geodata/states-2011.geojson").then((r) => r.json()),
      ]);
      if (cancelled || vintageLoadedRef.current) return;
      d2011FCRef.current = d2011;
      const idx = vintageIdxRef.current;
      (d2011.features as any[]).forEach((f) => {
        idx.set(String(f.properties?.rid), { name: String(f.properties?.district ?? "—"), state: String(f.properties?.st_nm ?? "") });
      });
      // Key on the RAW zero-padded st_code ("01".."35") — the canonical form stCode()
      // names at the top of this file (to-do 346, and the same class of defect as item
      // 1091). Three things must agree on this key and all three are padded: the
      // source's promoteId below, the /api/metrics?level=state2011 value keys, and this
      // index. Normalising to "1".."35" here desynchronised all of them —
      // allCodes("states2011") reads these keys, so every state looked up as
      // undefined and the whole 2011 state map painted no-data, while the ranking
      // rail fell back to showing the bare code instead of the state name.
      (s2011.features as any[]).forEach((f) => {
        idx.set(String(f.properties?.st_code), { name: String(f.properties?.st_nm ?? "—"), state: null });
      });
      map.addSource("districts2011", { type: "geojson", data: d2011, promoteId: "rid" });
      map.addSource("states2011", { type: "geojson", data: s2011, promoteId: "st_code" });
      // Vintage symbol sources, so a count metric stays a count metric across the
      // as-reported toggle instead of silently reverting to a choropleth — which
      // would show the same number honestly in one view and with area bias in the
      // other, the worst of both.
      const [d2011Pts, s2011Pts] = await Promise.all([
        fetch("/geodata/centroids-districts-2011.geojson").then((r) => r.json()),
        fetch("/geodata/centroids-states-2011.geojson").then((r) => r.json()),
      ]);
      map.addSource("districts2011-pts", { type: "geojson", data: d2011Pts, promoteId: "rid" });
      map.addSource("states2011-pts", { type: "geojson", data: s2011Pts, promoteId: "st_code" });
      const fillPaint = {
        "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, ALPHA_UNFADED],
        "fill-color-transition": { duration: 400 },
      };
      const linePaint = (w: number) => ({
        "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#e9e3d5", "rgba(233,227,213,0.10)"], // token: --foreground (and its 10% wash)
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.1, w],
      });
      map.addLayer({ id: "d2011-fill", type: "fill", source: "districts2011", layout: { visibility: "none" }, paint: fillPaint } as any);
      // The hatch travels to the as-reported view too. The fade never runs here (no
      // density series to recover an area from), so this is not the confusion above —
      // it is that "no number for this region" must mean one thing on every map in the
      // atlas, or the mark teaches nothing.
      map.addLayer({ id: "d2011-nodata", type: "fill", source: "districts2011", layout: { visibility: "none" }, paint: hatchPaint() } as unknown as maplibregl.AddLayerObject);
      map.addLayer({ id: "d2011-line", type: "line", source: "districts2011", layout: { visibility: "none" }, paint: linePaint(0.3) as any });
      map.addLayer({ id: "s2011-fill", type: "fill", source: "states2011", layout: { visibility: "none" }, paint: fillPaint } as any);
      map.addLayer({ id: "s2011-nodata", type: "fill", source: "states2011", layout: { visibility: "none" }, paint: hatchPaint() } as unknown as maplibregl.AddLayerObject);
      map.addLayer({ id: "s2011-line", type: "line", source: "states2011", layout: { visibility: "none" }, paint: linePaint(0.4) as any });
      const vinSymbolPaint = {
        "circle-radius": ["coalesce", ["feature-state", "r"], 0],
        "circle-color": "#d1502f", // token: --accent
        "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.72],
        "circle-stroke-color": "rgba(13,15,20,0.85)",
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.2, 0.5],
      };
      map.addLayer({ id: "d2011-symbol", type: "circle", source: "districts2011-pts", layout: { visibility: "none" }, paint: vinSymbolPaint } as unknown as maplibregl.AddLayerObject);
      map.addLayer({ id: "s2011-symbol", type: "circle", source: "states2011-pts", layout: { visibility: "none" }, paint: vinSymbolPaint } as unknown as maplibregl.AddLayerObject);
      const wireHover = (layer: string, source: "districts2011" | "states2011", kind: "district" | "state") => {
        let hov: string | number | undefined;
        map.on("mousemove", layer, (e: any) => {
          if (!e.features?.length) return;
          map.getCanvas().style.cursor = "";
          const f = e.features[0];
          if (hov !== undefined) map.setFeatureState({ source, id: hov }, { hover: false });
          hov = f.id as string;
          map.setFeatureState({ source, id: hov }, { hover: true });
          setHovered({
            code: String(f.id),
            // `?? name` covers the centroid sources, whose features carry `name`
            // rather than the polygon property — a symbol hover must name the same
            // region the polygon hover would.
            name: String((kind === "state" ? f.properties?.st_nm : f.properties?.district) ?? f.properties?.name ?? "—"),
            state: kind === "state" ? "" : String(f.properties?.st_nm ?? vintageIdxRef.current.get(String(f.id))?.state ?? ""),
            kind,
          });
        });
        map.on("mouseleave", layer, () => {
          if (hov !== undefined) map.setFeatureState({ source, id: hov }, { hover: false });
          hov = undefined; setHovered(null);
        });
      };
      wireHover("d2011-fill", "districts2011", "district");
      wireHover("s2011-fill", "states2011", "state");
      wireHover("d2011-symbol", "districts2011", "district");
      wireHover("s2011-symbol", "states2011", "state");
      vintageLoadedRef.current = true;
      setVintageTick((t) => t + 1); // re-run visibility + entries now that layers exist
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vintage, ready]);

  // ── selection / compare click routing ───────────────────────────────────
  function clickFeature(s: Sel, source: "districts" | "states") {
    const map = mapRef.current; if (!map) return;
    if (compareRef.current) {
      const cur = pinsRef.current;
      const existing = cur.find((p) => p.code === s.code);
      let next: Sel[];
      if (existing) {
        map.setFeatureState({ source, id: s.code }, { pinned: false });
        next = cur.filter((p) => p.code !== s.code);
      } else if (cur.length >= 2) {
        cur.forEach((p) => map.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: false }));
        map.setFeatureState({ source, id: s.code }, { pinned: true });
        next = [s];
      } else {
        map.setFeatureState({ source, id: s.code }, { pinned: true });
        next = [...cur, s];
      }
      pinsRef.current = next;   // same-tick readers must not see the stale pin set
      setPins(next);
      return;
    }
    const prev = selectedRef.current;
    if (prev) map.setFeatureState({ source: prev.kind === "state" ? "states" : "districts", id: prev.code }, { selected: false });
    // The ref is written here as well as in its useEffect. React state does not
    // settle until after this tick, so anything else reading selectedRef in the same
    // tick would otherwise see the PREVIOUS selection — which is precisely how the
    // double-dispatch above left two regions outlined.
    if (prev && prev.code === s.code) { selectedRef.current = null; setSelected(null); return; }
    map.setFeatureState({ source, id: s.code }, { selected: true });
    selectedRef.current = s;
    setSelected(s);
    setScaleOpen(false);
    // region_opened: a region's profile panel is now on screen (item 938). Fired
    // here and not in the compare branch above, which is compare_used — clicking
    // to PIN a comparison region is a different act from opening one to read it.
    // The early return on re-clicking the same region means a deselect (which
    // closes the panel) correctly does not count as an open.
    track("region_opened", { level: s.kind, region: s.name, metric: selRef.current });
  }

  function clearSelected() {
    const map = mapRef.current;
    const prev = selectedRef.current;
    if (map && prev) map.setFeatureState({ source: prev.kind === "state" ? "states" : "districts", id: prev.code }, { selected: false });
    setSelected(null);
  }
  function clearPins() {
    const map = mapRef.current;
    pinsRef.current.forEach((p) => map?.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: false }));
    setPins([]);
  }

  // ── drill (focus a state's districts) ───────────────────────────────────
  // THE ONE PLACE A STATE CODE IS CANONICALISED (item 1091). Everything downstream —
  // the MapLibre filter, the rid prefixes scopeCodes() and the ranking rail cut with,
  // the `st` param in the share link — reads focus.code, so it is padded here once
  // instead of at each of the five call sites. Four of them used to do it by hand and
  // the fifth did not have to think about it, which is the shape a sixth call site
  // gets wrong.
  function applyFocus(rawCode: string, name: string) {
    const map = mapRef.current; if (!map) return;
    const code = stCode(rawCode);
    const f = statesRef.current[code];
    // Numeric, so the pad cannot break it in either direction. This line used to read
    // ["==", ["to-string", ["get","st_code"]], String(Number(code))] — "9" against a
    // geojson that stores "09" — and it is the whole of item 1091: nine states drilled
    // to a filter that matched no polygon at all.
    const flt = stateFilter(code);
    // district-nodata rides with district-fill, and must: every district outside the
    // drilled state is out of scope, so recolor marks it no-data — an unfiltered hatch
    // would paint the rest of the country while its fills stayed hidden.
    map.setFilter("district-fill", flt); map.setFilter("district-nodata", flt);
    map.setFilter("district-line", flt); map.setFilter("state-outline", flt);
    if (f) map.fitBounds(bbox(f.geometry) as any, { padding: 50, duration: 750, essential: true });
    setFocus({ code, name });
    focusRef.current = { code, name };
  }
  const drillingRef = useRef(false);
  function drillIntoState(code: string, name: string) {
    clearSelected();
    applyFocus(code, name);
    if (levelRef.current !== "district") {
      drillingRef.current = true; // level effect must not tear down this focus
      setLevel("district");
    }
    // India→state→district: the canonical drill into a state's districts (item 825).
    track("drill_in", { level: "district", region: name });
  }
  function exitFocus(toStates: boolean) {
    const map = mapRef.current; if (!map) return;
    map.setFilter("district-fill", null); map.setFilter("district-nodata", null);
    map.setFilter("district-line", null); map.setFilter("state-outline", null);
    map.fitBounds(INDIA_BOUNDS, { padding: 24, duration: 750, essential: true });
    setFocus(null);
    focusRef.current = null;
    clearSelected();
    if (toStates) setLevel("state");
  }

  // ── metric data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!sel) { setData(null); dataRef.current = null; paintNeutral(); return; }
    let cancelled = false;
    (async () => {
      const m = metrics.find((x) => x.id === sel);
      if (m?.levels?.length && !m.levels.includes(level)) {
        setLevel(m.levels.includes("district") ? "district" : "state");
        return;
      }
      // The as-reported view only exists for metrics ingested at 2011 vintage
      // (the census set). Fall back rather than show an empty map.
      const effLevel = vintage === "2011" ? (level === "state" ? "state2011" : "district2011") : level;
      if (vintage === "2011" && m?.levels?.length && !m.levels.includes(effLevel)) {
        setVintage("current");
        return;
      }
      const md: MetricData = await fetch(`/api/metrics/${sel}?level=${effLevel}`).then((r) => r.json());
      if (cancelled || !md.values) return;
      setData(md); dataRef.current = md; valuesRef.current = md.values;
      estimatedRef.current = md.estimated || {};
      estimateKindRef.current = md.estimate_kind || {};
      estimatedFromRef.current = md.estimated_from || {};
      shakyRef.current = md.shaky || {};
      const sorted = Object.entries(md.values).sort((a, b) => b[1] - a[1]);
      const ranks: Record<string, number> = {};
      sorted.forEach(([c], i) => (ranks[c] = i + 1));
      rankRef.current = ranks;

      // Route this metric (#408 S4), through the single resolver (#575). The forms
      // a metric may honestly take are a property of the DATA — decided on the unit
      // AND the values, per research/531. A rate that merely looks skewed
      // (crime_cyber_rate, pop_density) must NOT get circles: normalisation already
      // solved its area problem and symbols would re-introduce one.
      const unit = m?.unit ?? md.unit;
      const vals = Object.values(md.values);
      const eligible = canRender(sel, unit, vals, "symbol");
      setSymbolable(eligible);
      // Default to the form this metric should open in, and honour a deliberate
      // flip only if it was made ON THIS METRIC (#567). A flip made elsewhere is a
      // judgement about different data and does not travel.
      const forced = symbolForcedForRef.current === sel ? symbolForcedRef.current : null;
      const on = forced === null ? preferredViz(sel, unit, vals) === "symbol" : forced && eligible;
      symbolOnRef.current = on;
      setSymbolOn(on);
      // Before the first paint, so the map does not draw once un-faded and then
      // visibly reflow into the faded version a moment later.
      await ensureWeights(effLevel);
      if (cancelled) return;
      recolor();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ready, level, metrics, vintage, vintageTick]);

  useEffect(() => {
    if (dataRef.current) recolor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, brkMethod, palette, reverse, focus, cohort, cohortSets, coverageHidden, symbolOn]);

  // The pair's own values, and the resolver's verdict on the pairing (#408 item
  // 1080). Re-run when the pair, the base metric or the level changes: eligibility
  // is a property of the two series AT A LEVEL, not of the ids.
  useEffect(() => {
    let cancelled = false;
    if (!pairId || !sel) {
      pairValuesRef.current = {};
      pairUnitRef.current = "";
      pairDecimalsRef.current = 0;
      pairEligRef.current = null;
      setPairElig(null);
      if (dataRef.current) recolor();
      return;
    }
    (async () => {
      const effLevel = vintage === "2011" ? (level === "state" ? "state2011" : "district2011") : level;
      try {
        const md = await fetch(`/api/metrics/${pairId}?level=${effLevel}`).then((r) => r.json());
        if (cancelled) return;
        const base = dataRef.current;
        if (!md?.values || !base) return;
        const verdict = bivariateEligible({
          level: effLevel,
          xId: sel, xUnit: base.unit ?? "", xValues: valuesRef.current,
          yId: pairId, yUnit: md.unit ?? "", yValues: md.values,
        });
        pairValuesRef.current = verdict.ok ? md.values : {};
        pairUnitRef.current = String(md.unit ?? "");
        pairDecimalsRef.current = Number.isFinite(md.decimals) ? Number(md.decimals) : 0;
        pairEligRef.current = verdict;
        setPairElig(verdict);
        recolor();
      } catch {
        if (cancelled) return;
        // A failed fetch is no pair, never a half-drawn one.
        pairValuesRef.current = {};
        pairUnitRef.current = "";
        pairDecimalsRef.current = 0;
        pairEligRef.current = null;
        setPairElig(null);
        recolor();
      }
    })();
    return () => { cancelled = true; };
    // `data` is in here on purpose. Eligibility is computed against the BASE metric's
    // values, and this effect can fire before those land — it bails when they have
    // not, and without a dependency on the load it would never come back, leaving a
    // ?bi= link silently univariate. Depending on the loaded data rather than a
    // timer is what makes the pair deterministic on a cold open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, sel, level, vintage, ready, data]);

  // The MapLibre host is display:none while the table view is up (the plate around
  // it stays), so MapLibre holds its last canvas size until the host is shown
  // again. Resize on the way back so the choropleth fills the plate instead of
  // rendering at the stale size it had when it was hidden.
  useEffect(() => {
    if (view !== "map") return;
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(id);
  }, [view]);

  // level/vintage switch: layer visibility; on real change reset drill/pins/selection
  const prevLevelRef = useRef(init.lvl);
  const prevVintageRef = useRef(init.vin);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const changed = prevLevelRef.current !== level;
    const vinChanged = prevVintageRef.current !== vintage;
    prevLevelRef.current = level;
    prevVintageRef.current = vintage;
    const showState = level === "state";
    const vin = vintage === "2011" && vintageLoadedRef.current;
    map.setLayoutProperty("state-fill", "visibility", !vin && showState ? "visible" : "none");
    map.setLayoutProperty("state-line", "visibility", !vin && showState ? "visible" : "none");
    map.setLayoutProperty("district-fill", "visibility", !vin && !showState ? "visible" : "none");
    map.setLayoutProperty("district-line", "visibility", !vin && !showState ? "visible" : "none");
    // keep the current-day state outline as national context only outside vintage
    // state-outline is national CONTEXT over the district map. At state level
    // state-line already draws the same geometry, so leaving both on stacked two
    // strokes on every boundary — half the reason they read as heavy white (760).
    if (map.getLayer("state-outline"))
      map.setLayoutProperty("state-outline", "visibility", !vin && !showState ? "visible" : "none");
    for (const [lyr, on] of [["d2011-fill", vin && !showState], ["d2011-line", vin && !showState],
                             ["s2011-fill", vin && showState], ["s2011-line", vin && showState]] as const) {
      if (map.getLayer(lyr)) map.setLayoutProperty(lyr, "visibility", on ? "visible" : "none");
    }
    // Each hatch follows the fill it marks, read off that fill rather than re-derived
    // — a second copy of this level/vintage logic is a second thing to forget. Last,
    // so it reads the visibility just set above rather than the previous repaint's.
    for (const [fill, hatch] of Object.entries(NODATA_LAYERS)) {
      if (map.getLayer(fill) && map.getLayer(hatch))
        map.setLayoutProperty(hatch, "visibility", map.getLayoutProperty(fill, "visibility") ?? "visible");
    }
    if (vinChanged) {
      // vintage is view-only: drop every current-day interaction artefact so
      // the panel/compare never describe a region the map no longer shows
      clearPins(); clearSelected(); setHovered(null); setCompare(false);
      if (focusRef.current) exitFocus(false);
      return;
    }
    if (!changed) return;
    if (drillingRef.current) { drillingRef.current = false; return; }
    clearPins(); clearSelected(); setHovered(null);
    if (focusRef.current) exitFocus(false);
    if (showState) { map.setFilter("state-outline", null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, ready, vintage, vintageTick]);

  // ── symbol-mode visibility (#408) ────────────────────────────────────────
  // The polygons STAY, drawn neutral, and the circles sit on top. Two reasons,
  // and the first is not aesthetic: research/758's boundary-compliance verdict
  // depends on the basemap being unmodified, so the country must still read as
  // India with its Survey-of-India boundaries intact. The second is that the
  // polygons remain the drill and hover surface for regions whose value is null
  // and therefore have no circle at all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const showState = level === "state";
    const vin = vintage === "2011" && vintageLoadedRef.current;
    const vis = (id: string, show: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    };
    vis("district-symbol", symbolOn && !vin && !showState);
    vis("state-symbol", symbolOn && !vin && showState);
    vis("d2011-symbol", symbolOn && vin && !showState);
    vis("s2011-symbol", symbolOn && vin && showState);

    // Drop the data-driven fill while symbols carry the value. Leaving both on
    // would encode one quantity twice — and the choropleth half of that pair is
    // the area-biased reading this mode exists to replace, so it would not merely
    // be redundant, it would keep telling the lie underneath the fix.
    for (const id of ["district-fill", "state-fill", "d2011-fill", "s2011-fill"]) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "fill-color",
        (symbolOn ? NEUTRAL : ["coalesce", ["feature-state", "color"], NEUTRAL]) as unknown as maplibregl.StyleSpecification["layers"][number]);
    }
  }, [symbolOn, level, vintage, ready, vintageTick]);

  // URL sync (shareable views)
  useEffect(() => {
    if (typeof window === "undefined" || minimal) return;
    const p = new URLSearchParams();
    if (sel) { p.set("m", sel); p.set("lvl", level); }
    if (mode !== "value") p.set("mode", mode);
    // Only a deliberate pick travels in the link (item 756). An automatic method
    // does not need pinning — the recipient derives the same one from the metric —
    // and pinning it was how one stray click followed every share URL.
    if (pickedForMetricRef.current) p.set("brk", brkMethod);
    if (palette !== DEFAULT_PALETTE) p.set("pal", palette);
    if (reverse) p.set("rev", "1");
    // Same rule as `brk` (item 756): only a DELIBERATE flip travels. The default is
    // derived from the metric, so the recipient computes the same one; pinning it
    // on every share would make one stray click follow every link.
    // Only a deliberate flip MADE ON THIS METRIC travels (#567). Pinning one made
    // on a different indicator would ship a judgement about other data.
    if (symbolForcedRef.current !== null && symbolForcedForRef.current === sel)
      p.set("sym", symbolOn ? "1" : "0");
    if (focus) { p.set("st", focus.code); p.set("stn", focus.name); }
    if (pins.length) p.set("cmp", pins.map((x) => x.code).join(","));
    if (vintage === "2011") p.set("vin", "2011");
    // The pair is half of what this map shows, so unlike `brk` or `sym` it is not a
    // preference that should stay behind — a shared link without it is a different
    // map (#408 item 1080).
    if (pairId) p.set("bi", pairId);
    // to-do 348: adaptive is the outline default, so only the fixed ESCAPE HATCH needs
    // to travel. Preserving it here keeps a shared/reloaded "fixed" view fixed — and
    // stops this writer from stripping the param out from under the mount-time reader.
    if (outlineModeRef.current === "fixed") p.set("outline", "fixed");
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [sel, mode, level, brkMethod, palette, reverse, focus, pins, minimal, vintage, pickTick, symbolOn, pairId]);

  // ── colouring ────────────────────────────────────────────────────────────
  type PaintSource = "districts" | "states" | "districts2011" | "states2011";
  function allCodes(source: PaintSource): string[] {
    if (source === "states") return Object.keys(statesRef.current).map((c) => String(c));
    if (source === "states2011")
      return [...vintageIdxRef.current.keys()].filter((c) => !c.includes("_"));
    if (source === "districts2011") {
      const fc = d2011FCRef.current;
      return fc ? (fc.features as any[]).map((f) => String(f.properties?.rid)) : [];
    }
    const fc = districtsFCRef.current;
    return fc ? (fc.features as any[]).map((f) => String(f.properties?.rid)) : [];
  }

  function scopeCodes(): string[] {
    const f = focusRef.current;
    const values = valuesRef.current;
    if (levelRef.current === "district" && f) {
      // ONE prefix (item 1091). This used to accept "9_" alongside "09_" because
      // applyFocus spoke the unpadded form and the geometry spoke the padded one; the
      // filter is numeric now and focus.code is canonical, so the padded prefix is the
      // only spelling the rid key space has ever had.
      const pref = ridPrefix(f.code);
      return Object.keys(values).filter((c) => c.startsWith(pref));
    }
    return Object.keys(values);
  }

  function paintNeutral() {
    const map = mapRef.current; if (!map) return;
    for (const s of ["districts", "states", "districts2011", "states2011"])
      if (map.getSource(s)) map.removeFeatureState({ source: s });
  }

  /** Population and recovered area for a level — fetched once, then cached.
   *
   *  area = pop_total / pop_density, both Census 2011, both already in the store.
   *  Not an approximation of the published area: the recovery of the very figure the
   *  source divided by. Kutch comes back 45,486 km² against a published 45,674 — the
   *  0.4% is the rounding in the printed density.
   *
   *  Only the current-day layers carry a density series, so only they can have an
   *  area recovered at all. The 2011 vintages are cached as EMPTY and the warrant
   *  then refuses on its own terms rather than this silently skipping — a skip that
   *  looks like a pass is the shape this repo keeps finding in its own guards. */
  async function ensureWeights(level: string): Promise<void> {
    if (weightRef.current[level]) return;
    if (level !== "district" && level !== "state") {
      weightRef.current[level] = { pop: {}, area: {} };
      return;
    }
    try {
      const [p, d] = await Promise.all([
        fetch(`/api/metrics/pop_total?level=${level}`).then((r) => r.json()),
        fetch(`/api/metrics/pop_density?level=${level}`).then((r) => r.json()),
      ]);
      const pop = (p?.values ?? {}) as Record<string, number>;
      const den = (d?.values ?? {}) as Record<string, number>;
      weightRef.current[level] = { pop, area: regionAreas(pop, den) };
    } catch {
      // A failed fetch means no fade, never a wrong fade.
      weightRef.current[level] = { pop: {}, area: {} };
    }
  }

  function recolor() {
    const map = mapRef.current;
    const md = dataRef.current;
    if (!map || !md) return;
    const vin = vintageRef.current === "2011" && vintageLoadedRef.current;
    const source: PaintSource = vin
      ? (levelRef.current === "state" ? "states2011" : "districts2011")
      : (levelRef.current === "state" ? "states" : "districts");
    if (!map.getSource(source)) return; // vintage layers still loading
    for (const s of ["districts", "states", "districts2011", "states2011"])
      if (map.getSource(s)) map.removeFeatureState({ source: s });
    // re-apply persistent highlight states
    pinsRef.current.forEach((p) => map.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: true }));
    const s = selectedRef.current;
    if (s) map.setFeatureState({ source: s.kind === "state" ? "states" : "districts", id: s.code }, { selected: true });

    const codes = scopeCodes();
    // Class breaks + min/max exclude COPIES, not projections (adr-022). An
    // inherited value duplicates a real district already counted here; a projected
    // one (RBI BE/RE) is its state's only figure. Excluding projections is what
    // collapsed fiscal_deficit_pct_gsdp to min == max == 0.7645 — one real row
    // scaling 31 states whose values run 0.54–6.92.
    const vals = codes
      .filter((c) => countsInStats(estimatedRef.current[c], estimateKindRef.current[c]))
      .map((c) => valuesRef.current[c]);
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    if (!vals.length) { min = 0; max = 1; }
    const mean = vals.length ? sum / vals.length : 0;
    const scope = new Set(codes);

    // Symbol radii scale to the largest value ACTUALLY DRAWN, which is not the same
    // set the statistics use: countsInStats() excludes inherited and projected values
    // from the mean and the breaks, but those regions still get a circle. Scaling to
    // the statistical max would clamp any estimated outlier to the same radius as the
    // real maximum and quietly claim two different quantities are equal.
    let symMax = 0;
    for (const code of codes) {
      const v = valuesRef.current[code];
      if (v != null && Number.isFinite(v) && v > symMax) symMax = v;
    }
    const symLevel: SymbolLevel = levelRef.current === "state" ? "state" : "district";
    const symOn = symbolOnRef.current;
    let lumSum = 0, lumN = 0; // backdrop mean for the state-outline overlay (to-do 348)
    const breaks = modeRef.current === "value"
      ? computeBreaks(vals, brkRef.current, 5, metricRefRef.current) : [];
    // Value-by-alpha (#408 item 1077, owner ruling under #575: the form follows the
    // DATA). A choropleth's visual weight is AREA; a rate is about PEOPLE. Where the
    // map's colour is not where the people are, regions are faded by how many people
    // they hold. Not offered in symbol mode — a count already has circles — nor on
    // the 2011 vintages, which have no density series to recover an area from, nor
    // in coverage or vs-average mode, where the colour is not the metric at all.
    // BIVARIATE (#408 item 1080). Two metrics, one geography, a 3x3 matrix. Bands are
    // cut over the SHARED regions IN SCOPE only — a region the pair does not both
    // cover, or that this drill is not showing, is not part of this map's population
    // and must not stretch its bands. The METHOD is no longer hardcoded to quantile:
    // lib/bivariate's axisBreaks runs the repo's own degeneracy guard per axis, which
    // is what stops the 445 districts reporting zero Buddhist population landing in
    // the middle band of three. Never in symbol mode, coverage or vs-average, and
    // never on the 2011 vintage — the resolver refuses that level outright.
    const pairOk = !!pairEligRef.current?.ok
      && modeRef.current === "value" && !symOn && !vin && Object.keys(pairValuesRef.current).length > 0;
    let biEdgesX: number[] = [];
    let biEdgesY: number[] = [];
    let biScope: Eligibility | null = null;
    if (pairOk) {
      const shared = sharedRegions(valuesRef.current, pairValuesRef.current)
        .filter((c) => scope.has(c));
      if (shared.length >= BIVARIATE_K) {
        biEdgesX = axisBreaks(shared.map((c) => valuesRef.current[c]), { isPct: md.unit === "%" }).edges;
        biEdgesY = axisBreaks(shared.map((c) => pairValuesRef.current[c]), { isPct: pairUnitRef.current === "%" }).edges;
      }
      biScope = bivariateScope({
        shared: shared.length,
        edgesX: biEdgesX,
        edgesY: biEdgesY,
        scopeLabel: focusRef.current?.name ?? "this view",
      });
    }
    // ONE CONDITION FOR THE PAINT AND FOR THE KEY (#408 item 1080, round 2). The
    // legend used to derive `pairActive` from the national verdict alone, so focusing
    // Goa (2 shared districts) or Chandigarh (1) drew a 3x3 matrix key over a map
    // painted with the univariate ramp — and refused nothing, because as far as the
    // resolver was concerned the pair held. It does hold; it just cannot be DRAWN
    // here, which is a different sentence and the reader is owed it.
    const biOn = pairOk && !!biScope?.ok;
    const biRefusal = biScope && !biScope.ok ? biScope : null;
    const pairSig = `${biOn}|${biRefusal?.reason ?? ""}|${biEdgesX.join(",")}|${biEdgesY.join(",")}`;
    if (pairSigRef.current !== pairSig) {
      pairSigRef.current = pairSig;
      setPairView({ drawn: biOn, refusal: biRefusal, edgesX: biEdgesX, edgesY: biEdgesY });
    }

    const wts = weightRef.current[levelRef.current] ?? { pop: {}, area: {} };
    const warr = (!vin && !symOn && !biOn && modeRef.current === "value" && breaks.length > 0)
      ? alphaWarrant({ values: valuesRef.current, pop: wts.pop, area: wts.area, edges: breaks })
      : null;
    const fadeCodes = codes.filter((c) => wts.pop[c] > 0);
    alphaRef.current = warr?.warranted ? alphaByRegion(wts.pop, fadeCodes) : {};
    // The p5/p95 the ramp actually ran between. Handed to the legend so its fade key
    // can label the rows with the POPULATIONS that produce those opacities — an
    // opacity on its own decodes nothing, and a floored district's rendered colour
    // appeared nowhere in the key before this.
    const fadeBounds = warr?.warranted ? alphaBounds(wts.pop, fadeCodes) : null;
    const warrSig = `${warr?.warranted ?? ""}|${warr?.reason ?? ""}|${fadeBounds?.lo ?? ""}|${fadeBounds?.hi ?? ""}`;
    if (warrantSigRef.current !== warrSig) {
      warrantSigRef.current = warrSig;
      setWarrant(warr);
      setFadeBounds(fadeBounds);
    }

    const basePal = PALETTES[palRef.current].fn;
    const pal = revRef.current ? (t: number) => basePal(1 - t) : basePal;
    const maxDev = Math.max(...vals.map((v) => Math.abs(v - mean))) || 1;

    // cohort dimming (states level only)
    const ck = cohortRef.current;
    const cs = cohortSetsRef.current;
    // cohort sets are current-day state codes; the 2011 view has AP-undivided,
    // no Telangana/Ladakh — dimming by today's cohorts would lie there
    const cohortSet = !vin && levelRef.current === "state" && ck !== "all"
      ? (ck === "pop" ? cs.pop : ck === "nsdp" ? cs.nsdp : cs.area)
      : null;

    // ── how many hatches this map actually DRAWS (iter-46 polish, N3) ─────────
    // Marked is not the same as drawn. Drilling into a state marks every district
    // outside it no-data — that is what keeps the rest of the country from painting
    // over the drill — but applyFocus also FILTERS those polygons off the map, so
    // they are marks nobody can see. The legend keys the hatch, and a key is owed the
    // marks on screen, so the count below is over the drawn ones only.
    //
    // The drill test is ONE prefix, and it used to be two (item 1091). The tolerance
    // here documented a live defect rather than a real ambiguity: applyFocus built its
    // MapLibre filter from String(Number(code)) while the geojson's st_code — and so
    // the rid prefix — is zero-padded, so for the nine states coded 01..09 that filter
    // matched nothing at all. Measured on the deployed 57581ac: drilling Maharashtra
    // passed 35 district polygons, Uttar Pradesh 0 of 75 and Jammu & Kashmir 0 of 22.
    // With the filter numeric and focus.code canonicalised by applyFocus, the padded
    // prefix is the only spelling the rid key space carries and there is nothing left
    // for a second arm to tolerate — so the count below and the polygons on screen are
    // now the same set for every state, not just the twenty-nine that read as drawn.
    const drill = levelRef.current === "district" ? focusRef.current : null;
    const drillPrefix = drill ? ridPrefix(drill.code) : null;
    const drawnHere = (code: string) => !drillPrefix || code.startsWith(drillPrefix);
    let hatched = 0;

    for (const code of allCodes(source)) {
      const v = valuesRef.current[code];
      const inScope = scope.has(code);
      if (v == null || !inScope) {
        // `nodata` switches the hatch layer on for this region. It is written
        // explicitly rather than inferred from the colour because coverage view mutes
        // a HIDDEN class to the very same tone, and those regions do have a number —
        // hatching them would say the opposite of what is true.
        //
        // `alpha` IS WRITTEN HERE, and the omission it replaces was a real defect
        // (iter-46 polish, N2). setFeatureState MERGES; it does not replace. The wipe
        // at the top of recolor() queues a whole-source delete, and MapLibre's
        // SourceFeatureState.updateState converts that queued delete into a per-feature
        // one on the FIRST write that follows — excluding the feature being written.
        // So the first region painted after every wipe keeps whatever state it already
        // carried for any key the new write does not mention. Measured on the pre-fix
        // build: open /?m=pop_density&lvl=district (the fade fires), then change to
        // Forest cover in the chooser. 35_639 North and Middle Andaman is the first
        // feature in districts.geojson, has no forest figure, and came back
        // {nodata: true, alpha: 0.3299} — its pop_density fade, on a no-data region.
        // The tone then composites to rgb(23,23,23) where the no-data tone is
        // rgb(39,37,28), and the whole sweep found exactly one such region, which is
        // the first-write exemption and nothing else.
        //
        // ALPHA_UNFADED and not the region's own fade weight: a region with no figure
        // has nothing to weigh, and left-stack's no-data key draws its swatch as
        // NO_DATA_FILL composited at exactly this opacity. Writing it here is what
        // makes the key and the map the same colour.
        map.setFeatureState({ source, id: code }, { color: NODATA, dim: false, stroke: strokeForFill(NODATA), r: 0, alpha: ALPHA_UNFADED, nodata: true });
        if (drawnHere(code)) hatched++;
        continue;
      }
      // COVERAGE view (item 830): shade by DATA PROVENANCE, not value. A class
      // toggled off in the legend recedes to the neutral no-data tone so the
      // classes left on stand out (e.g. inherited-only).
      let color: string;
      /** Has this region a number for the map AS DRAWN? A paired map asks for two. */
      let noValue = false;
      if (modeRef.current === "coverage") {
        const cls = provenanceOf(estimatedRef.current[code], estimateKindRef.current[code]);
        color = coverageHiddenRef.current.includes(cls) ? PROVENANCE_MUTED : PROVENANCE_COLOR[cls];
      } else if (biOn) {
        const pv = pairValuesRef.current[code];
        // A region the pair does not cover gets the no-data tone rather than a
        // corner of the matrix. Painting it low-low would invent a reading. It is
        // hatched with the rest of the no-data, because on THIS map that is what it
        // is — the pair needs both numbers and this region has one.
        noValue = pv == null || !Number.isFinite(pv);
        color = noValue ? NODATA : bivariateColor(v, biEdgesX, pv, biEdgesY);
      } else if (modeRef.current === "vs_avg") {
        color = interpolateRdBu(0.5 + Math.max(-0.5, Math.min(0.5, (v - mean) / (2 * maxDev))));
      } else {
        color = colorFor(v, min, max, breaks, pal);
      }
      const dim = cohortSet ? !cohortSet.has(code) : false;
      // No `estimated` feature-state: adr-019 dropped ambient hatching, so nothing
      // consumes it. Estimates are disclosed where the number is read.
      // `stroke` is the item-760 boundary: derived from this region's own fill so
      // the seam stays legible at both ends of every ramp instead of reading as
      // harsh white over the saturated end.
      // `r` rides the same write: the wrapper mirrors it onto the centroid source,
      // where the circle layer reads it. Zero when symbol mode is off, so switching
      // back to a choropleth cannot leave stale circles behind.
      // `alpha` rides the same write as `color` (#408 item 1077). 0.9 is the
      // unfaded default the fill layer used before this existed, so a map with no
      // warrant paints exactly as it always did.
      map.setFeatureState({ source, id: code }, { color, dim, stroke: strokeForFill(color), r: symOn ? symbolRadius(v, symMax, symLevel) : 0, alpha: alphaRef.current[code] ?? ALPHA_UNFADED, nodata: noValue });
      // A paired map hatches the regions the SECOND metric misses (`noValue` above).
      // Those are in scope by construction, so they are always drawn.
      if (noValue) hatched++;
      lumSum += fillLuminance(color);
      lumN++;
    }

    // Published for the legend's no-data key, the same way the paint publishes its
    // pair verdict and its fade warrant: ONE condition for the mark and for the key.
    // Deriving "does this map hatch anything" in the legend instead would be the same
    // shape as item 1080's D1 — a key describing a mark the paint is not making.
    //
    // A stale count can only ever be too HIGH, never too low: the transient this
    // component has is the previous metric's values against the next metric's source
    // (the state -> district swap holds them for a frame), and codes the values do not
    // cover are exactly what counts as no-data. So the key can appear a frame early on
    // a map that has no absentees; it cannot vanish from a map that is hatching.
    if (hatchedSigRef.current !== hatched) {
      hatchedSigRef.current = hatched;
      setHatchedCount(hatched);
    }

    // to-do 348 — the state-outline overlay. District boundaries have been adaptive
    // since item 760, but state-outline is a separate layer on the `states` source
    // drawn OVER district fills, and it used to keep a fixed warm-white. Item 760's
    // rule ("derive from the fill it borders") is undefined here: a state boundary
    // runs past dozens of districts with different values. So this derives ONE colour
    // per repaint from the mean luminance of what is actually painted underneath.
    // Adaptive is now the DEFAULT (the fixed warm-white washed out over a pale map);
    // ?outline=fixed opts back to the fixed warm-white, set explicitly here so opting
    // out is unambiguous regardless of any prior repaint.
    if (map.getLayer("state-outline"))
      map.setPaintProperty(
        "state-outline", "line-color",
        outlineModeRef.current === "adaptive"
          ? (lumN ? outlineForBackdrop(lumSum / lumN) : "rgba(233,227,213,0.26)")
          : "rgba(233,227,213,0.26)",
      );
  }

  // ── cohorts (real top-10 lists from our own state-level metrics) ────────
  const ensureCohorts = useCallback(() => {
    if (cohortSetsRef.current.pop && cohortSetsRef.current.nsdp && cohortSetsRef.current.area) return;
    const top10 = (values: Record<string, number>) =>
      new Set(Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c));
    Promise.all([
      fetch("/api/metrics/pop_total?level=state").then((r) => r.json()).catch(() => null),
      fetch("/api/metrics/econ_percapita_nsdp_rbi?level=state").then((r) => r.json()).catch(() => null),
      fetch("/api/metrics/area_km2?level=state").then((r) => r.json()).catch(() => null),
    ]).then(([pop, nsdp, area]) => {
      setCohortSets({
        pop: pop?.values ? top10(pop.values) : new Set(),
        nsdp: nsdp?.values ? top10(nsdp.values) : new Set(),
        area: area?.values ? top10(area.values) : new Set(),
      });
    });
  }, []);

  const cohortDefs: CohortDef[] = useMemo(() => [
    { key: "all", name: "All states", note: "", codes: null },
    { key: "pop", name: "Top 10 · Population", note: "Top 10 states by population (Census 2011)", codes: cohortSets.pop },
    { key: "nsdp", name: "Top 10 · Per-capita NSDP", note: "Top 10 states by per-capita NSDP (RBI)", codes: cohortSets.nsdp },
    { key: "area", name: "Top 10 · Area", note: "Top 10 states by area (Census 2011)", codes: cohortSets.area },
  ], [cohortSets]);

  // ── derived rail data ────────────────────────────────────────────────────
  const focusActive = level === "district" && !!focus;
  const districtsAll = level === "district" && !focus;

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    // One canonical prefix (item 1091) — see scopeCodes(), which cuts the same scope.
    const f = focusActive && focus ? ridPrefix(focus.code) : null;
    // An estimated value is not this region's own measurement, so the ranking list
    // must be able to mark it (item 611) — and estimate_kind travels with it so the
    // rail can say WHICH kind without guessing from the flag (adr-021).
    const est = data.estimated ?? {};
    const kinds = data.estimate_kind ?? {};
    const donors = data.estimated_from ?? {};
    const shak = data.shaky ?? {};
    const out: Entry[] = [];
    for (const [code, value] of Object.entries(data.values)) {
      if (f && !code.startsWith(f)) continue;
      // vintage codes are 2011 census codes named by the vintage geojson, not
      // the /api/regions palette index (same code can mean a different region)
      const idx = vintage === "2011" ? vintageIdxRef.current.get(code) : nameIdx.get(code);
      out.push({
        code,
        name: idx?.name ?? code,
        sub: level === "district" ? idx?.state ?? "" : "",
        kind: level === "district" ? "district" : "state",
        value,
        estimated: est[code] === 1 ? 1 : 0,
        estimate_kind: kinds[code] ?? null,
        estimated_from: donors[code] ?? null,
        shaky: shak[code] === 1 ? 1 : 0,
      });
    }
    out.sort((a, b) => b.value - a.value);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, nameIdx, level, focusActive, focus, vintage, vintageTick]);

  // Rank membership follows stats membership (adr-023): a value ranks iff it
  // counts in the stats. An inherited COPY holds its donor's number — ranking it
  // would assert a standing it never earned, and its donor already occupies that
  // slot. A projected (BE/RE) value is its state's only figure, copied from
  // nobody: excluding it left fiscal metrics with an em dash on 30 of 31 states
  // (question 244, resolved 2026-07-18 — ranked, badge kept). /api/region/[code]
  // applies the same rule; unranked codes are absent here and render as "—".
  const rankOf = useMemo(() => {
    const m: Record<string, number> = {};
    let r = 0;
    for (const e of entries) if (countsInStats(e.estimated, e.estimate_kind)) m[e.code] = ++r;
    return m;
  }, [entries]);

  // Denominator for every rank sentence: exactly the rank-eligible rows above.
  const rankedCount = useMemo(
    () => entries.reduce((n, e) => n + (countsInStats(e.estimated, e.estimate_kind) ? 1 : 0), 0),
    [entries]
  );
  // Disclosure count stays over ALL estimates — a ranked projection is still
  // not this region's own measurement, and the "N estimated" line must say so.
  const estCount = entries.reduce((n, e) => n + (e.estimated ? 1 : 0), 0);

  // Per-metric coverage breakdown over the SAME rows the rail/legend show (item
  // 830). Drives the coverage legend's per-class counts, the trust-surface stat
  // and the coverage-view shading — one tally so they can never disagree.
  const coverCounts = useMemo(() => coverageCounts(entries), [entries]);

  // The legend's floor, ceiling and average must describe the scale that coloured
  // the map, or the legend contradicts the picture it labels (item 639): recolor()
  // builds its breaks over countsInStats values only. Averaging ALL entries here
  // put Arunachal at ~66.485 under a legend reading "avg 64.9" — and min/max over
  // all entries (item 655) could likewise print a range no colour on the map
  // spans, once an estimate falls outside the real values' envelope. One
  // membership rule for all three; entries stay sorted desc, so first/last of the
  // filtered list are max/min.
  const statsEntries = useMemo(
    () => entries.filter((e) => countsInStats(e.estimated, e.estimate_kind)),
    [entries]
  );
  const scopeMin = statsEntries.length ? statsEntries[statsEntries.length - 1].value : 0;
  const scopeMax = statsEntries.length ? statsEntries[0].value : 1;
  const scopeMean = statsEntries.length
    ? statsEntries.reduce((a, e) => a + e.value, 0) / statsEntries.length
    : 0;

  /** External reference value for this metric, if its scale has a meaningful pivot
   *  (sex_ratio / child_sex_ratio → 1000 = parity). Drives the `reference` method. */
  const metricRef = METRIC_REFERENCE[sel] ?? null;

  // Data-driven method selection (item 757) — AUTOMATIC path only. Replaces the
  // item-756 degeneracy guard, which could only ladder jenks→quantile and so could
  // not fix a tie mass: buddhist_pct left 78.3% of districts in one class, and
  // because binning is `v >= edge`, all four collapsed edges cleared at once and the
  // 445 districts reporting ZERO Buddhist population were painted class 4 of 5 —
  // three-quarters up the ramp — while the three lowest colours rendered for nobody.
  //
  // A deliberate pick is still never silently overridden: substituting what the user
  // asked for is precisely the failure this codebase exists to avoid. Evaluated over
  // statsEntries — the same rows the paint classifies (adr-022).
  const [autoReason, setAutoReason] = useState<string | null>(null);
  useEffect(() => {
    if (pickedForMetricRef.current || mode !== "value" || !statsEntries.length) {
      if (pickedForMetricRef.current) setAutoReason(null);
      return;
    }
    // The outgoing metric's rows stay loaded while the incoming one fetches. Judging
    // metric B against metric A's distribution substituted a method that then stuck
    // (B's data arrives, the substitute is no longer lopsided, nothing corrects it) —
    // the same cross-metric leak item 756 removed, relocated into the selector.
    if (data?.id !== sel) return;
    const choice = selectMethod(
      statsEntries.map((e) => e.value),
      { isPct: data?.unit === "%", reference: metricRef },
    );
    setAutoReason(choice.reason);
    if (choice.method !== brkMethod) setBrkMethod(choice.method);
  }, [statsEntries, mode, brkMethod, data, sel, metricRef]);

  // Nudge for a MANUAL pick that collapses the map (comment C7). Fires only when
  // the current method buries >60% of regions in one class AND the auto-selector
  // would do better — so it never nags on a reasonable pick or the auto-default.
  const collapseWarn = useMemo(() => {
    if (mode !== "value" || !statsEntries.length || data?.id !== sel) return null;
    const vals = statsEntries.map((e) => e.value);
    const edges = computeBreaks(vals, brkMethod, 5, metricRef);
    if (!edges.length) return null; // SMOOTH has no classes to collapse
    const share = Math.max(...classCounts(vals, edges)) / vals.length;
    if (share <= 0.6) return null;
    const better = selectMethod(vals, { isPct: data?.unit === "%", reference: metricRef }).method;
    return better === brkMethod ? null : { share, better };
  }, [statsEntries, brkMethod, metricRef, data, sel, mode]);

  /** The exact class edges the map is painting with — same rows, same rule as the
   *  paint (adr-022 stats membership). Handed to the social card so an export can
   *  never class the data differently from the map it was taken from (item 759). */
  const mapBreaks = useMemo(
    () => (mode === "value"
      ? computeBreaks(statsEntries.map((e) => e.value), brkMethod, 5, metricRef)
      : []),
    [statsEntries, mode, brkMethod, metricRef],
  );

  const fmtVal = useCallback((v: number) =>
    v.toLocaleString("en-IN", { maximumFractionDigits: data?.decimals ?? 0 }), [data]);
  const fmtFull = useCallback((v: number) =>
    fmtVal(v) + (data?.unit === "%" ? "%" : ""), [fmtVal, data]);

  const selectedValue = selected ? valuesRef.current[selected.code] ?? null : null;
  const selectedRank = selected ? rankOf[selected.code] ?? null : null;

  const districtCountOf = useCallback((stateCode: string): number => {
    const fc = districtsFCRef.current;
    if (!fc) return 0;
    // Both sides through stCode(), which was already true of this one — it normalised
    // both ends and so was never part of item 1091. Moved onto the shared helper so
    // the file has ONE spelling of a state code rather than two that happen to agree.
    const n = stCode(stateCode);
    return (fc.features as any[]).filter((f) => stCode(String(f.properties?.st_code)) === n).length;
  }, []);

  // compare derived
  const pinVal = (p: Sel | undefined) => (p ? valuesRef.current[p.code] ?? null : null);
  const va = pinVal(pins[0]), vb = pinVal(pins[1]);
  const cmpMax = Math.max(va ?? 0, vb ?? 0, scopeMax) || 1;
  const cmpReady = va != null && vb != null && !!data;
  let gapStr: string | null = null, gapSentence = "";
  if (cmpReady && data) {
    const diff = Math.abs(va! - vb!);
    gapStr = fmtVal(diff) + (data.unit === "%" ? " pts" : "");
    const hi = va! >= vb! ? pins[0] : pins[1];
    const lo = va! >= vb! ? pins[1] : pins[0];
    const lo_ = Math.min(va!, vb!), hi_ = Math.max(va!, vb!);
    const ratio = lo_ > 0 ? hi_ / lo_ : 0;
    gapSentence = `${hi.name} leads ${lo.name}${ratio >= 1.15 ? ` by ${ratio.toFixed(1)}×` : " narrowly"} on ${data.name.toLowerCase()}.`;
  }

  // ── actions ──────────────────────────────────────────────────────────────
  const copyText = useCallback(async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      showToast("Couldn't copy — copy the address bar manually");
    }
  }, [showToast]);
  const copyLink = useCallback(() => {
    track("permalink_copied", { metric: sel });
    return copyText(window.location.href, "link");
  }, [copyText, sel]);
  const copyEmbed = useCallback(() => {
    track("embed_copied", { metric: sel });
    const url = new URL(window.location.href);
    url.pathname = "/embed";
    // Name the frame after the indicator on view — a meaningful title helps the
    // embedding page and assistive tech, and the src is absolute so it renders
    // the same view from any origin. Params ride along untouched.
    const title = `Maps of Bharat${data ? ` — ${data.name.replace(/"/g, "")}` : ""}`;
    copyText(`<iframe src="${url.toString()}" width="800" height="560" style="border:0" loading="lazy" title="${title}"></iframe>`, "embed");
  }, [copyText, data, sel]);

  // Neutral, sourced caption for the WhatsApp share (item 883): it names the
  // indicator and, when one is selected, the region — no verdict, per the
  // does-not-claim fence. The deep link itself is added inside the share menu
  // (the live permalink), so this is only the framing text.
  const shareCaption = data
    ? `${data.name}${selected ? ` — ${selected.name}` : " — India"} · Maps of Bharat`
    : "Maps of Bharat — India's official statistics, mapped";

  // Legacy viewport-screenshot PNG export removed (iter-72 item 568) — the
  // social CARD dialog is the sole image export now.

  // search: pick a place
  const onSearchRegion = useCallback((r: RegionIdx) => {
    const map = mapRef.current; if (!map) return;
    // search targets current-day regions; a pick pops the vintage view
    if (vintageRef.current === "2011") setVintage("current");
    if (r.level === "state") {
      if (levelRef.current === "state") {
        const f = statesRef.current[stCode(r.code)];
        if (f) map.fitBounds(bbox(f.geometry) as any, { padding: 50, duration: 750, essential: true });
        // THE CANONICAL CODE, not String(Number(r.code)) (item 1091). This one is a
        // second, quieter face of the same defect: `code` becomes the MapLibre feature
        // id in clickFeature's setFeatureState, and `states` is promoteId'd on the
        // padded st_code — so "9" set selection on a feature that does not exist and
        // picking any of the nine low-numbered states out of search left it unpainted.
        // valuesRef is keyed padded too, so the profile that opened alongside read
        // "No data for this region on the current indicator" for Uttar Pradesh.
        clickFeature({ code: stCode(r.code), name: r.name, state: "", kind: "state" }, "states");
      } else {
        drillIntoState(r.code, r.name);
      }
    } else {
      if (levelRef.current === "state") setLevel("district");
      const feat = (districtsFCRef.current?.features as any[] | undefined)?.find((f) => String(f.properties?.rid) === r.code);
      if (feat) {
        applyFocus(String(feat.properties?.st_code), String(feat.properties?.st_nm ?? ""));
        map.fitBounds(bbox(feat.geometry) as any, { padding: 80, duration: 900, maxZoom: 9, essential: true });
        clickFeature({ code: r.code, name: r.name, state: String(feat.properties?.st_nm ?? ""), kind: "district" }, "districts");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: Ctrl/Cmd-K search, Escape closes overlays
  useEffect(() => {
    if (minimal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o); setChooserOpen(false); setScaleOpen(false);
      } else if (e.key === "Escape") {
        // socialOpen belongs in this list and was missing (iter-44, found by the
        // feature verifier). The export dialog closes itself through its own
        // window listener, so Escape LOOKED right — but this handler then fell
        // through to the branch below and silently threw away the reader's
        // drill-down. Measured: drill into Jharkhand, open CARD, press Escape,
        // and the breadcrumb goes from "India | Jharkhand" back to "India".
        //
        // This is the contract use-dismiss.ts spells out — Escape dismisses the
        // TOPMOST layer only — and the same trap it warns about: "anything new
        // that listens for Escape on window while a popover can sit above it will
        // be starved here, and nothing enforces that contract but this comment."
        // A fourth overlay was added and nothing made it join the guard.
        if (searchOpen || chooserOpen || scaleOpen || socialOpen) {
          setSearchOpen(false); setChooserOpen(false); setScaleOpen(false);
        } else if (selectedRef.current || focusRef.current) {
          // Escape steps all the way back to the national view (item 405)
          clearSelected();
          if (focusRef.current) exitFocus(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // socialOpen IS LOAD-BEARING IN THIS ARRAY, not incidental. Without it the
    // effect does not re-run when the export dialog opens, so this listener is
    // still the one registered before the dialog existed — and on Escape the
    // dialog's own window handler runs first, onClose flushes, and this effect's
    // cleanup removes the listener mid-dispatch, so the guard above never
    // executes. Dropping it from the deps re-opens the defect with the condition
    // still in place, which is why tests/a11y.spec.ts only goes red on a complete
    // revert of both.
  }, [minimal, searchOpen, chooserOpen, scaleOpen, socialOpen]);

  // ── breadcrumb model ────────────────────────────────────────────────────
  const crumbs = useMemo(() => {
    const items: { label: string; on: boolean; onClick: () => void }[] = [];
    const stateCtx = focus?.name ?? (selected?.kind === "district" ? selected.state : selected?.kind === "state" ? selected.name : null);
    items.push({ label: "India", on: !stateCtx, onClick: () => exitFocus(true) });
    if (stateCtx) {
      const leaf = selected?.kind === "district";
      items.push({
        label: stateCtx, on: !leaf,
        onClick: () => {
          const codeGuess = focus?.code ?? (selected?.kind === "state" ? selected.code : null);
          if (codeGuess) drillIntoState(codeGuess, stateCtx);
        },
      });
      if (leaf && selected) items.push({ label: selected.name, on: true, onClick: () => {} });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, selected]);

  const hasBack = !!(selected || focus || level === "district");
  const onBack = () => {
    if (selected) { clearSelected(); return; }
    if (focus) { exitFocus(false); return; }
    if (level === "district") setLevel("state");
  };

  const levelLock: "state" | "district" | null = meta?.levels?.length
    ? meta.levels.includes("state") && meta.levels.includes("district") ? null
      : meta.levels.includes("district") ? "district" : "state"
    : null;

  const scopeNoun = focusActive && focus ? `districts in ${focus.name}` : level === "district" ? "districts" : "states";
  // "612 of 730 districts measured · 118 inherited" — the trust-surface coverage
  // stat, over the same rows as coverCounts (item 830). Suppressed when the scope
  // is momentarily empty (the state->district focus swap holds stale data for a
  // frame, which would otherwise flash a meaningless "0 of 0 ... measured").
  const coverageStatText =
    data && entries.length > 0 ? coverageStat(coverCounts, entries.length, scopeNoun) : null;
  const toggleCoverageClass = useCallback((cls: ProvenanceClass) => {
    setCoverageHidden((h) => (h.includes(cls) ? h.filter((c) => c !== cls) : [...h, cls]));
  }, []);
  const activeCohortDef = cohortDefs.find((c) => c.key === cohort);
  const cohortActive = level === "state" && cohort !== "all" && !!activeCohortDef?.codes;

  // What the rail is ranking, in words. Hoisted out of the rail's props because
  // the mobile bottom-sheet handle (to-do 424) shows the SAME line while the rail
  // itself is collapsed — a sheet you must open to find out what is in it is a
  // sheet nobody opens. One expression, so the two can never drift.
  const railScopeSub = data
    ? focusActive && focus
      ? `${entries.length} districts in ${focus.name}${estCount ? ` · ${estCount} estimated` : ""}`
      : districtsAll
        ? `${entries.length} districts nationwide${estCount ? ` · ${estCount} estimated` : ""}`
        : `${entries.length} states${cohortActive ? ` · ${activeCohortDef!.name}` : ""}`
    : "Pick an indicator to rank";

  const hoverValue = hovered ? valuesRef.current[hovered.code] : null;
  const hoverRank = hovered ? rankOf[hovered.code] : null;
  const hoverEst = !!(hovered && estimatedRef.current[hovered.code] === 1);
  const hoverKind = hovered ? estimateKindRef.current[hovered.code] : null;
  const hoverDonor = hovered ? estimatedFromRef.current[hovered.code] : null;
  const hoverShaky = hovered ? shakyRef.current[hovered.code] === 1 : false;
  // Name the district the number actually came from, rather than "estimated from
  // parent" while the region panel names Nirmal for the same cell (item 640).
  // Falls back per kind — a projected figure has no donor to name. A shaky
  // inheritance adds "(weak match)" so the hover carries the caveat too (adr-026).
  const hoverEstNote = hoverEst ? estimateShort(hoverKind, hoverDonor, hoverShaky) : "";

  const fmtHover = (v: number | null | undefined) =>
    v == null ? "no data" : fmtFull(v) + (hoverEst ? " · est." : "");

  const embedEstimateNote = estimateFootnote(entries, scopeNoun);

  // ── minimal (embed) chrome ───────────────────────────────────────────────
  if (minimal) {
    // The embed links back to the metric's canonical page (/metric/{id}, item
    // 829) — its permanent, cited, indexable home — rather than to a query-string
    // view of the atlas. Falls back to the atlas root only when no metric is on
    // view. Relative on purpose so it resolves to this app's origin even when the
    // frame is hosted on a third-party page.
    const shareBackHref = sel ? `/metric/${encodeURIComponent(sel)}` : "/";
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <div ref={ref} style={{ position: "absolute", inset: 0 }} />
        {data && (
          <div className="absolute left-3 top-3 z-10 border border-border px-3 py-2" style={{ background: "var(--panel)" }}>
            <div className="text-xs font-bold text-bright">{data.name} <span className="font-normal text-faint">({data.unit})</span></div>
            <div className="mt-1.5 h-2 w-40" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => PALETTES[palette].fn(reverse ? 1 - t : t)).join(", ")})` }} />
            <div className="mt-0.5 flex justify-between font-mono text-[10px] text-faint"><span>{fmtVal(data.min)}</span><span>{fmtVal(data.max)}</span></div>
            {/* An iframe travels without rail, panel or methodology, so the caveat
                has to be on the embed itself — hovering is not a disclosure for a
                reader who never hovers (item 643). */}
            {embedEstimateNote && (
              <div className="mt-1 max-w-40 text-[9px] leading-snug text-muted">{embedEstimateNote}</div>
            )}
          </div>
        )}
        {/* Brand mark + source citation + a link home. An iframe travels with
            no masthead or rail, so the embed itself carries attribution and a
            way back to the same view on the full Atlas (item 828). */}
        <a href={shareBackHref} target="_blank" rel="noopener noreferrer"
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 border border-border px-2 py-1 text-[10px] text-faint hover:text-accent-text" style={{ background: "var(--panel)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 14px inline logo */}
          <img src="/brand/mark.png" alt="" aria-hidden="true" width={14} height={14} className="h-3.5 w-3.5 flex-none object-contain" />
          <span>Maps of Bharat · {data ? `${data.source.split(",")[0]} · ${data.year}` : "official data"}</span>
        </a>
        {hovered && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 border border-border px-3 py-2 text-sm" style={{ background: "var(--panel)" }}>
            <div className="font-semibold text-bright">{hovered.name}{hovered.state && <span className="text-faint"> · {hovered.state}</span>}</div>
            {data && <div className="font-mono text-xs text-muted">{fmtHover(hoverValue)}</div>}
          </div>
        )}
      </div>
    );
  }

  // ── full Atlas chrome ────────────────────────────────────────────────────
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 120% at 50% -10%, #15140f, #0b0c10 60%)" /* no-token: a one-off vignette gradient, not a palette role */ }} />

      {/* MASTHEAD
          The three fixed tracks (300 + 360 + 300 = 960 minimum) put the search
          box and both links off a phone screen: measured at 390px, the search
          button's box started at x=320 and the METHODOLOGY link ran to x=980,
          i.e. 590px past the right edge, clipped away by the root's
          overflow-hidden rather than scrollable to (to-do 424).
          Sub-desktop the side tracks size to their content and the search takes
          the slack; the two links keep their glyph and drop their label, in a
          26px square — the size right-rail.tsx:150 already settled on for a
          touch target here, over WCAG 2.2's 24px floor. */}
      <header className="relative z-10 flex h-16 flex-none items-center gap-3 border-b px-5 max-lg:gap-2 max-lg:px-3" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex flex-none items-center gap-3 lg:w-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 30px inline logo */}
          <img src="/brand/mark.png" alt="" aria-hidden="true" width={30} height={30} className="h-[30px] w-[30px] flex-none object-contain max-lg:h-6 max-lg:w-6" />
          {/* The wordmark is the one thing here a phone can spare: the mark
              beside it carries the same identity in 24px. Below sm only — at
              640-1023px the row still has room for it. */}
          <span className="text-[17px] font-bold leading-none tracking-tight text-bright max-sm:hidden">Maps of Bharat</span>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <button
            onClick={() => setSearchOpen(true)} aria-label="Search places and indicators (Ctrl+K)"
            className="flex w-[360px] max-w-full items-center gap-2.5 rounded-sm border border-border px-3 py-2 text-left hover:border-faint"
            style={{ background: "rgba(18,19,15,.5)" }}
          >
            <span className="h-[13px] w-[13px] flex-none rounded-full border-[1.5px] border-faint" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-faint">Search a place or indicator…</span>
            {/* A phone has no Ctrl key — the hint is only ever noise there, and
                it is the widest thing in the box after the placeholder. */}
            <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] text-faint max-lg:hidden">CTRL K</kbd>
          </button>
        </div>
        <div className="flex flex-none items-center justify-end gap-4 max-lg:gap-2 lg:w-[300px]">
          {/* Corrections / report an error (iter-32 item 848), beside Methodology */}
          <a
            href="/corrections" target="_blank" rel="noopener noreferrer"
            // Spelled out because the glyph stands alone below lg. It OPENS with
            // the visible desktop label, so the accessible name still contains it
            // (WCAG 2.5.3) and is one stable name at every width.
            aria-label="CORRECTIONS — report an error"
            className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[.05em] text-muted hover:text-foreground max-lg:h-[26px] max-lg:w-[26px] max-lg:justify-center max-lg:rounded-sm max-lg:border max-lg:border-border"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lg:hidden">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span className="max-lg:hidden">CORRECTIONS</span>
          </a>
          <a
            href="/methodology" target="_blank" rel="noopener noreferrer"
            aria-label="METHODOLOGY &amp; SOURCES"
            className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[.05em] text-muted hover:text-foreground max-lg:h-[26px] max-lg:w-[26px] max-lg:justify-center max-lg:rounded-sm max-lg:border max-lg:border-border"
          >
            <span aria-hidden="true" className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border-[1.5px] border-current text-[9px]">i</span>
            <span className="max-lg:hidden">METHODOLOGY &amp; SOURCES</span>
          </a>
        </div>
      </header>

      {/* BODY */}
      <div className="relative flex min-h-0 flex-1">
        {/* PLATE — ONE framed region for BOTH views (items 909 / 910).
            The table used to be a SECOND plate that stood in for this one while it
            was display:none, which took the whole left column down with it: the
            table then sprawled the full plate width with none of the atlas
            furniture framing it (measured at 1440x900: the table ran x=17..1101,
            where the map keeps x<331 clear for the controls column), and the VIEW
            toggle had to be redrawn inside the table's own header — so the control
            JUMPED from (127,356) to (980,97) the moment it was used. One plate
            keeps the table inside the map's bounds, keeps the left stack and the
            right rail framing it, and leaves the toggle in the single place it
            already lives: the VIEW row of the left stack. */}
        {/* Sub-desktop the rail leaves the flow for a bottom sheet, so the plate
            is the only column and takes the whole width. The bottom padding is
            the sheet's collapsed handle (46px) plus the 8px gutter, so the plate
            ends where the handle starts instead of hiding the map under it. */}
        <div className="relative min-w-0 flex-1 p-4 max-lg:p-2 max-lg:pb-[54px]">
          <div
            className="relative h-full border border-border"
            style={{ background: "radial-gradient(80% 80% at 50% 42%, #12130f, #0b0c10)" /* no-token: one-off vignette gradient */ }}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
          >
            {/* The MapLibre host stays MOUNTED in table view (display:none) —
                unmounting would orphan the map and lose the drill / selection it
                holds. Only the HOST hides now, not the plate around it; the resize
                effect above restores the canvas size on the way back. */}
            <div ref={ref} className={view === "table" ? "hidden" : undefined} style={{ position: "absolute", inset: 0 }} />

            {/* LEFT COLUMN — the controls stack and the legend share ONE bounded
                column so they cannot overlap. They used to be two independent
                absolutes, one pinned to the top and one to the bottom, which
                collided the moment their combined height exceeded the plate: at
                1280x720 the legend covered the VIEW row and the table view became
                unreachable altogether (found by the iter-35 feature verifier;
                the palette swatches were already being covered before that).
                Shaving pixels off the cards only moves the cliff, so the column
                is bounded instead and the controls scroll when they must.
                pointer-events-none on the wrapper keeps the map draggable in the
                gap between the two. */}
            {/* SCRIM behind the expanded mobile controls. The cards are
                var(--panel) — rgba(...,.93) — which is invisible over the map
                plate it was designed against, but at 390px the panel spans the
                full plate and in table view that 7% put the table's rows through
                the cards as legible ghost text. It doubles as the dismissal a
                sheet is expected to have: tap off the panel to close it. */}
            {narrow && ctrlOpen && (
              <div
                data-controls-scrim
                className="absolute inset-0 z-[4]"
                style={{ background: "rgba(11,12,16,.92)" }}
                onClick={() => setCtrlOpen(false)}
                aria-hidden
              />
            )}
            {/* top-3.5/bottom-3.5 rather than inset-y-3.5, and the same for the
                mobile overrides: `inset-y-*` compiles to the LOGICAL
                `inset-block`, `top-*` to physical `top`, and a variant of one
                does not reliably beat the base of the other. Every edge here is
                one property with one override. */}
            {/* max-lg:pb-14 reserves the sheet's DISMISSAL STRIP (to-do 424 /
                item 1077 round 3). Below lg the dock scrolls as one surface, so
                without this it would run edge to edge and there would be nowhere
                left on the plate that belongs to the scrim — "tap off the panel
                to close it" is the only dismissal a bottom-anchored sheet has on
                a phone, and it has to be somewhere a thumb can reach. 56px is the
                same order as the sheet handle below it. */}
            <div className="pointer-events-none absolute bottom-3.5 left-3.5 top-3.5 z-[5] flex w-[300px] flex-col gap-2.5 max-lg:bottom-2 max-lg:left-2 max-lg:right-2 max-lg:top-2 max-lg:w-auto max-lg:gap-2 max-lg:pb-14">
            {/* MOBILE CONTROLS BAR (to-do 424) — the always-visible head of the
                controls stack below lg. A 300px column over a 374px plate is the
                same defect as the rail: it leaves no map. Collapsed, this bar is
                all the stack shows, and it earns its 44px by carrying the two
                things a reader needs without opening anything — WHICH indicator
                is on view, and the ramp to read its colours by. Everything
                operable stays in the cards below, rendered exactly once. */}
            {narrow && (
              <button
                type="button"
                onClick={() => setCtrlOpen((o) => !o)}
                aria-expanded={ctrlOpen}
                aria-label={ctrlOpen ? "Hide map controls" : "Show map controls"}
                className="pointer-events-auto flex min-h-[44px] w-full flex-none items-center gap-3 border border-border px-3 py-2 text-left"
                style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[9.5px] font-bold tracking-[.12em] text-faint">
                    {ctrlOpen ? "CONTROLS" : meta ? "SHOWING" : "START HERE"}
                  </span>
                  <span className="block truncate text-[13px] font-extrabold leading-tight text-bright">
                    {meta?.name ?? "Choose an indicator"}
                  </span>
                </span>
                {/* Map-only, value-mode-only. A ramp beside a table would key
                    nothing, and vs-avg / coverage paint scales this gradient is
                    not — the same reason the MAP COLOUR row is gated on view. */}
                {view === "map" && data && !ctrlOpen && (
                  mode === "value" ? (
                    <span className="flex w-[84px] flex-none flex-col gap-0.5">
                      <span
                        className="h-1.5 w-full"
                        style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => PALETTES[palette].fn(reverse ? 1 - t : t)).join(", ")})` }}
                      />
                      <span className="flex justify-between font-mono text-[9px] leading-none text-faint">
                        <span>{fmtVal(scopeMin)}</span><span>{fmtVal(scopeMax)}</span>
                      </span>
                    </span>
                  ) : (
                    <span className="flex-none font-mono text-[9px] tracking-[.1em] text-faint">
                      {mode === "vs_avg" ? "VS AVG" : "COVERAGE"}
                    </span>
                  )
                )}
                <span aria-hidden className="flex-none text-[11px] text-muted">{ctrlOpen ? "▲" : "▼"}</span>
              </button>
            )}
            {/* ONE SHEET BELOW lg, TWO BOXES ABOVE IT (to-do 424 / item 1077 round 3).
                Desktop keeps what item 1077 found working: the cards scroll inside
                their own box and the legend is pinned to the bottom of the column,
                with the slack between them belonging to nobody so the map stays
                draggable through it.
                On a phone that arrangement has a cliff. The cards' box shrinks and
                the legend does not, so every pixel the legend gains comes straight
                out of the controls' scroll viewport — and item 1077's fade key plus
                the permanent no-data swatch added enough of them to push the
                STATES / DISTRICTS row below the fold. Nothing overlapped and nothing
                errored: the row still reported a box at y=445 and still answered
                toBeVisible, but it was clipped by the scroll container, so a tap at
                its centre landed on the legend painted over that spot. A control
                that is present, sized and unhittable is the defect item 910 named.
                So below lg the two boxes become ONE scroll surface: the whole dock
                moves together, the legend stops competing with the controls for a
                fixed slice, and further legend content costs scroll rather than
                reach. This wrapper is that surface; above lg it is flex-1 and
                pointer-events-none, which reproduces the column's own geometry
                exactly and keeps the drag-through gap.
                Collapsed sub-desktop = display:none, not opacity or a zero height:
                the cards must leave the tab order and the a11y tree with the pixels,
                and this is also what keeps the mobile-only branch out of every
                desktop-width selector in the suite. It sits on this wrapper now
                rather than on each box, so one condition hides the whole sheet. */}
            <div
              className={`atl-scroll pointer-events-none flex min-h-0 flex-1 flex-col gap-2.5 max-lg:pointer-events-auto max-lg:gap-2 max-lg:overflow-y-auto max-lg:overscroll-contain ${ctrlOpen ? "" : "max-lg:hidden"}`}
            >
            {/* Content-sized, NOT flex-1. flex-1 stretched this box to the full
                column even when the cards were short, and since it is the box
                that carries pointer-events-auto, the empty slack below the last
                card became an invisible 300px-wide trap that swallowed map drags
                — 35px tall at 900px viewport height, 235px at 1100px, growing
                1:1 with the window. The default flex-initial keeps the box on
                its content while min-h-0 still lets it shrink and scroll when
                the column is tight.
                max-lg:flex-none / max-lg:overflow-visible: below lg the scrolling
                belongs to the sheet above, and a scroll container nested in a
                scroll container is two places for the same gesture to go. */}
            <div className="atl-scroll pointer-events-auto flex min-h-0 flex-col gap-2.5 overflow-y-auto max-lg:flex-none max-lg:gap-2 max-lg:overflow-visible">
              <Crumbs items={crumbs} hasBack={hasBack} onBack={onBack} />
              <IndicatorCard
                metricName={meta?.name ?? null}
                metricDesc={meta ? `${meta.category[0].toUpperCase()}${meta.category.slice(1)} · ${meta.year}` : ""}
                srcShort={meta?.source.split(",")[0] ?? ""}
                onOpenChooser={() => { setChooserOpen(true); setScaleOpen(false); setSearchOpen(false); }}
              />
              <LevelColourCard
                level={level} onLevel={(l) => { trackViz("level", l); setLevel(l); }} levelLock={levelLock}
                palette={palette} onPalette={(p) => { trackViz("palette", p); palTouchedRef.current = true; setPalette(p); }}
                vintage={vintage} onVintage={(v) => { trackViz("boundaries", v); setVintage(v); }}
                vintageAvailable={!!meta?.levels?.some((l) => l === "district2011" || l === "state2011")}
                view={view} onView={(v) => { trackViz("view", v); setView(v); }}
                symbolOn={symbolOn}
                  />
            </div>

            {/* LEGEND — flex-none so it keeps its natural height and the stack
                above yields instead; mt-auto pins it to the bottom of the column
                now that the stack no longer stretches to fill it.
                Map-only, unlike the controls stack above it: the legend is the KEY
                to a colour ramp, and its mode / coverage rows drive the paint. With
                the table up there is no ramp on screen and those rows would be
                controls that provably do nothing — the line item 908 already drew
                when it dropped REVERSE from vs-avg mode. It is pinned to the BOTTOM
                of the column, so dropping it moves nothing above it: the VIEW
                toggle keeps its position across the swap.
                max-lg:mt-0 — on a phone there is no bottom to pin to any more, the
                legend is simply the last section of the sheet. */}
            {view === "map" && data && meta && (
              <div className="pointer-events-auto mt-auto flex-none max-lg:mt-0">
                <LegendCard
                  metricName={data.name} unit={data.unit} decimals={data.decimals}
                  min={scopeMin} max={scopeMax} values={entries.map((e) => e.value)}
                  method={brkMethod} mapEdges={mapBreaks}
                  paletteFn={PALETTES[palette].fn} reverse={reverse}
                  mode={mode} onMode={(m) => { trackViz("mode", m); setMode(m); }}
                  coverageCounts={coverCounts} coverageHidden={coverageHidden}
                  onToggleCoverageClass={(c) => { trackViz("coverage-class", String(c)); toggleCoverageClass(c); }}
                  coverageStat={coverageStatText}
                  avgNote={`avg ${fmtVal(scopeMean)}${focusActive ? " (state avg)" : ""}`}
                  scope={focusActive ? "within state" : level === "district" ? "districts" : "states"}
                  countLabel={`${entries.length} ${level === "district" ? "districts" : "states"}`}
                  source={data.source} license={data.license ?? ""}
                  cohortNote={cohortActive ? `${activeCohortDef!.name} · dimming others` : null}
                  scaleOpen={scaleOpen} onToggleScale={() => setScaleOpen((o) => !o)}
                  onReverse={() => { trackViz("reverse", String(!reverse)); setReverse((r) => !r); }}
                  symbolable={symbolable} symbolOn={symbolOn}
                  onSymbol={() => {
                    const next = !symbolOn;
                    symbolForcedRef.current = next;
                    symbolForcedForRef.current = sel;
                    trackViz("symbol", String(next));
                    setSymbolOn(next);
                  }}
                  // The legend must key off the SAME domain the circles are drawn
                  // from, or the reference circles label sizes the map never draws
                  // — the single-source rule item 759 applied to the ramp.
                  symbolMax={entries.reduce((mx, e) => (e.value != null && e.value > mx ? e.value : mx), 0)}
                  symbolLevel={level === "state" ? "state" : "district"}
                  // How much of this metric the minimum radius flattens (#566).
                  // Computed here because this is where the values are; the legend
                  // only has the maximum, and a share cannot be derived from that.
                  symbolFloor={floorShare(
                    entries.map((e) => e.value),
                    level === "state" ? "state" : "district"
                  )}
                  // Why this map is faded, in the reader's words (#408 item 1077).
                  // Present only when the fade actually fired.
                  alphaNote={warrant?.warranted ? warrant.reason : null}
                  // ...and the populations the fade ramp ran between, so the key can
                  // show what each opacity MEANS. Without it the legend showed only
                  // full-strength swatches and a floored district's rendered colour
                  // appeared nowhere in the key at all.
                  alphaBounds={warrant?.warranted ? fadeBounds : null}
                  // How many regions this map is HATCHING (iter-46 polish, N3). The
                  // hatch itself is unconditional and stays that way — "no number
                  // here" has to mean one thing on every map — but the KEY for it was
                  // drawn even where the map marks nobody: crime_ipc_rate at state
                  // level hatches 0 of 36 and still carried the line. Straight from
                  // the paint, so the key can never describe a mark that is not there.
                  nodataCount={hatchedCount}
                  // The pair (#408 item 1080): names for the two axes, the
                  // resolver's verdict (shown even when it refuses), and the two
                  // controls. Passing the verdict rather than a boolean is what
                  // lets a refused pair say why instead of quietly doing nothing.
                  pairName={pairId ? (metrics.find((m) => m.id === pairId)?.name ?? pairId) : null}
                  baseName={data?.name ?? ""}
                  // A scope refusal outranks the national verdict: "these two may be
                  // paired" is true and useless while the drilled state has two
                  // districts to cut three bands from. The reader is told the one
                  // that explains the map in front of them.
                  pairElig={pairView.refusal ?? pairElig}
                  // Straight from the paint (#408 item 1080, round 2) — this used to
                  // be a second, looser condition that never consulted the bands.
                  pairActive={pairView.drawn}
                  // The bands themselves, so the matrix key carries numbers like the
                  // univariate legend does.
                  pairEdgesX={pairView.edgesX} pairEdgesY={pairView.edgesY}
                  pairDecimals={pairDecimalsRef.current} pairUnit={pairUnitRef.current}
                  onOpenPair={() => { setPairOpen(true); setChooserOpen(false); setScaleOpen(false); setSearchOpen(false); }}
                  onClearPair={() => setPairId("")}
                />
              </div>
            )}
            </div>
            </div>
            {/* Opened from the legend's gear, so it follows the legend out of the
                table view rather than floating over the table alone. */}
            {view === "map" && scaleOpen && (
              <ScalePopover
                method={brkMethod} onMethod={(m) => {
                  // The class-break method is the most explicit "how the data is
                  // drawn" control on the page — it is the whole subject of
                  // adr-025 — so it belongs in viz_customised more than the
                  // palette does.
                  trackViz("break-method", m);
                  pickedForMetricRef.current = true;
                  if (sel) {
                    // session ref drives precedence, persisted map drives localStorage
                    sessionPickRef.current = { ...sessionPickRef.current, [sel]: m };
                    methodByMetricRef.current = { ...methodByMetricRef.current, [sel]: m };
                  }
                  setBrkMethod(m);
                  setAutoReason(null); // the choice is theirs now, not the selector's
                  setPickTick((t) => t + 1); // re-picking the active method is still a pick
                }}
                applicable={applicableMethods(
                  describe(statsEntries.map((e) => e.value)), metricRef,
                )}
                autoReason={autoReason}
                collapseWarn={collapseWarn}
                reverse={reverse} onReverse={() => { trackViz("reverse", String(!reverse)); setReverse((r) => !r); }}
                onClose={() => setScaleOpen(false)}
              />
            )}

            {/* ACTION TOOLBAR
                ≤480px reachability (item #419): the bar is anchored bottom-right of
                the map PLATE, but on a phone the fixed-width right rail squeezes the
                plate to a sliver, so a right-anchored bar lands off the left edge
                (the Share trigger measured at x≈-150 at 390px) — every action, incl.
                the mobile-first WhatsApp share, was unreachable. Below the lg
                desktop breakpoint (≤1023px) it re-anchors to the VIEWPORT (fixed) and
                docks bottom-centre, keeping the intact Atlas segmented look but
                decoupled from the squeezed plate so the whole bar + its share menu
                stay on-screen. The cutoff is lg, not a narrower value: the fixed-width
                right rail keeps the plate too narrow for a right-anchored bar well past
                640px, so earlier 480/640 thresholds left an off-screen dead band
                (#419 fix-loop). Desktop (≥1024px) keeps the exact original layout —
                the max-lg overrides simply don't apply.
                Compare picks regions ON the map and CARD renders the map, so the
                bar is map furniture and hides with the map. It used to get that
                for free by riding the plate's display:none; the plate now stays up
                for the table, so it opts out explicitly.

                NEVER close this template literal's class list with `${...}` glued
                straight onto the last class. Doing exactly that is what broke the
                bar earlier today: the string ended `...max-[1024px]:-translate-x-1/2${view`,
                Tailwind's source scanner read the candidate as running into the
                `$`, and that ONE utility was never emitted — verified absent from
                the built stylesheet while every other class in the same list was
                present. Without the counter-translate the bar kept `left:50%` and
                ran right from the viewport centre: CARD's right edge measured 477
                at a 390px viewport (+87 off-screen) and 561 at 559px (+2), which
                is precisely the four widths tests/mobile-toolbar.spec.ts failed
                at. The interpolations below are preceded by a space, so the last
                literal class always terminates. */}
            <div
              className={`absolute bottom-3.5 right-3.5 z-[6] flex items-stretch overflow-visible rounded-sm border max-lg:fixed max-lg:left-1/2 max-lg:right-auto max-lg:z-20 max-lg:max-w-[calc(100vw-1rem)] max-lg:-translate-x-1/2 ${
                // Clears the bottom sheet's 46px collapsed handle. With EITHER
                // dock open it stands down: the sheet covers it outright, and the
                // controls panel pins its legend to the same bottom edge. A
                // trigger a hit-test cannot reach is worse than an absent one,
                // and both docks are one tap from closed.
                narrow && (railOpen || ctrlOpen) ? "max-lg:hidden" : "max-lg:bottom-[54px]"
              } ${view === "table" ? "hidden" : ""}`}
              style={{ background: "rgba(16,17,13,.96)", borderColor: compare ? "var(--accent-border)" : "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}
            >
              <button
                onClick={() => {
                  // compare_used counts ENTERING compare mode (item 938) — leaving
                  // it is not a use of the feature. Read off `compare` in the
                  // render closure, not from inside the updater: React may invoke
                  // an updater twice, which would double-count the funnel step.
                  if (!compare) trackCompare();
                  setCompare((c) => { const n = !c; if (!n) clearPins(); else clearSelected(); return n; });
                }}
                aria-pressed={compare} disabled={vintage === "2011"}
                title={vintage === "2011" ? "Compare works on current-day boundaries — switch BOUNDARIES back to TODAY" : undefined}
                className="flex items-center gap-2 px-[15px] py-2.5 text-[11.5px] font-semibold tracking-[.05em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: compare ? "var(--accent)" : "transparent", color: compare ? "var(--accent-ink)" : "var(--text-warm)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <rect x="3" y="3" width="13" height="13" rx="1.5" /><rect x="8" y="8" width="13" height="13" rx="1.5" />
                </svg>
                {compare ? "Comparing" : "Compare"}
              </button>
              <span className="w-px flex-none" style={{ background: "var(--border-soft)" }} />
              <ShareMenu disabled={false} onCopyLink={copyLink} onCopyEmbed={copyEmbed} copied={copied} shareCaption={shareCaption} />
              <span className="w-px flex-none" style={{ background: "var(--border-soft)" }} />
              <button
                onClick={() => setSocialOpen(true)} disabled={!data || vintage === "2011"}
                title={vintage === "2011" ? "Cards render current-day boundaries — switch BOUNDARIES back to TODAY" : undefined}
                aria-label="Export a social media card"
                className="flex items-center gap-2 bg-accent px-[17px] py-2.5 text-[11.5px] font-bold tracking-[.06em] text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="15.5" cy="8.5" r="1.5" />
                </svg>
                CARD
              </button>
            </div>

            {/* COMPARE HINT — map-only: it asks for clicks on the map. */}
            {view === "map" && compare && pins.length < 2 && (
              <div
                className="atl-pop absolute left-1/2 top-3.5 z-[6] -translate-x-1/2 rounded-sm border px-3.5 py-2 text-[12px] font-semibold max-lg:top-[60px] max-lg:max-w-[calc(100%-1rem)] max-lg:text-[11.5px]"
                style={{ background: "rgba(26,23,14,.96)", borderColor: "var(--accent-border)", color: "#eecdb8" /* no-token: warm ink for the pinned-region chip, single use */ }}
              >
                {!data ? "Pick an indicator, then click two regions" : pins.length === 0 ? "Click the first region to compare" : "Now click a second region"}
              </div>
            )}

            {/* FLOATING REGION PROFILE (iter-53 item 407 — lives on the plate, not
                the rail). Map-only: the plate is the table's ground in table view
                and a floating card would sit on top of the rows.
                Sub-desktop it spans the plate and drops BELOW the controls bar
                rather than over it — the bar is how you get back to the controls,
                and this card appears from a map tap, which is the middle of the
                drill journey, not the end of it. Capped and scrollable so a tall
                profile cannot run past the plate. */}
            {view === "map" && selected && !compare && (
              <div className="atl-pop absolute right-3.5 top-3.5 z-[6] w-[300px] border border-border max-lg:left-2 max-lg:right-2 max-lg:top-[60px] max-lg:max-h-[calc(100%-68px)] max-lg:w-auto max-lg:overflow-y-auto" style={{ background: "var(--panel)", boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
                <RegionProfile
                  sel={{
                    code: selected.code, name: selected.name,
                    sub: selected.kind === "district"
                      ? `${selected.state} · district`
                      : `${districtCountOf(selected.code) || "—"} districts`,
                    kind: selected.kind, value: selectedValue,
                  }}
                  unit={data?.unit ?? ""} hasMetric={!!data}
                  entries={entries} min={scopeMin} max={scopeMax}
                  fmtVal={fmtVal} fmtFull={fmtFull}
                  rank={selectedRank} scopeNoun={scopeNoun}
                  drillLabel={selected.kind === "state" && !focusActive ? `View ${districtCountOf(selected.code) || ""} districts`.replace("  ", " ") : null}
                  onDrill={() => drillIntoState(selected.code, selected.name)}
                  onClear={clearSelected}
                />
              </div>
            )}

            {/* TOOLTIP — map-only: it follows the cursor over the choropleth, and
                it is `fixed`, so with the plate up for the table a stale hover
                would float it over the rows. */}
            {view === "map" && hovered && tip && (
              <div
                className="pointer-events-none fixed z-[60] whitespace-nowrap border px-2.5 py-1.5"
                style={{ left: tip.x + 14, top: tip.y + 14, background: "rgba(13,15,20,.96)", borderColor: "var(--border-strong)" }}
              >
                <span className="text-[12px] font-bold text-bright">{hovered.name}</span>
                {data && <span className="ml-2 font-mono text-[10.5px] text-muted">{fmtHover(hoverValue)}</span>}
                <div className="mt-px text-[9.5px] text-faint">
                  {/* Rank and estimate note are independent since adr-023: a
                      projected state is ranked AND badged, so neither line may
                      swallow the other. Unranked estimates keep note-only. */}
                  {[
                    hovered.kind === "district" ? hovered.state : "",
                    hoverRank != null ? `#${hoverRank} of ${rankedCount}${hovered.kind === "district" ? "" : ` ${scopeNoun}`}` : "",
                    hoverEst ? hoverEstNote : "",
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}

            {/* TABLE — the same view as a semantic, sortable table (item 826), fed
                the same computed `entries` + `rankOf` the ranking rail renders so
                the two can never disagree.
                It sits INSIDE the map's plate (item 909) and starts past the
                controls column — 14px gutter + 300px column + 14px gutter = 328 —
                so it fills exactly the region the map keeps clear, framed by the
                same left stack and right rail rather than sprawling the full plate
                width. No border or ground of its own: the plate it is standing in
                is already the framed plate, and a second border inside it would
                read as a second surface.
                Sub-desktop there is no controls column to clear — the stack is
                collapsed behind its bar — so the table takes the full plate width
                and starts below that bar (44px + the 8px gutter + 8px of air).
                It must start below rather than under it: the bar holds the VIEW
                row, and it is the only way back to the map from here.
                `isolate` contains the table's OWN z-indexes. Its sticky column
                headers carry z-10, and neither this box nor the plate nor
                anything above them creates a stacking context — so that 10 was
                competing directly with the controls column's z-5, and winning.
                Harmless while the table sat to the RIGHT of the column on
                desktop; sub-desktop the table is full-width beneath it, and the
                header row painted straight through the controls panel. */}
            {view === "table" && (
              <div className="absolute bottom-0 left-[328px] right-0 top-0 isolate flex flex-col overflow-hidden max-lg:left-0 max-lg:top-[60px]">
                <div className="flex flex-none items-center border-b border-border-soft px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-[.12em] text-faint">DATA TABLE</div>
                    <div className="truncate text-[15px] font-extrabold leading-tight text-bright">
                      {data ? data.name : "No indicator selected"}
                    </div>
                  </div>
                </div>
                <DataTable
                  metricLabel={data?.name ?? ""}
                  unit={data?.unit ?? ""}
                  year={data?.year}
                  scopeNoun={scopeNoun}
                  boundaryNote={vintage === "2011" ? "2011 boundaries, as reported" : null}
                  entries={entries}
                  rankOf={rankOf}
                  fmtVal={fmtVal}
                  // to-do 503: DataTable has always declared these two, and until now
                  // NEITHER mount passed them, so its row hover, selected and click
                  // states were dead code shipped on every row. Wired here and not on
                  // the /metric/{id} mount for a reason: that page is server-rendered
                  // and has no selection concept, so the props are correctly absent
                  // there. Selecting from the table goes through the SAME clickFeature
                  // the map and the ranking rail use, so a row click paints the map
                  // feature, re-clicking the selected row deselects, and region_opened
                  // fires once — three behaviours a private handler here would have
                  // had to reimplement and would have drifted from.
                  selectedCode={selected?.code ?? null}
                  onRowClick={(e) => {
                    const source = e.kind === "state" ? "states" : "districts";
                    clickFeature({ code: e.code, name: e.name, state: e.sub, kind: e.kind }, source);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT RAIL — a docked column on desktop, a BOTTOM SHEET below lg
            (to-do 424). 322px of flex-none beside a phone screen is what left the
            map a 34px sliver at 390px and a 4px one at 360px; the rail is the
            wider of the two offenders, and a fluid width would only have made it
            an unreadable rail beside an unreadable map. Off the flow it goes, and
            the map gets the whole plate.
            A sheet rather than a drawer behind a button because the handle is its
            own signpost: it names the scope it holds, so the rankings stay
            discoverable at rest instead of hiding behind an icon.
            Collapsed = display:none on the CONTENT, so the rail leaves the tab
            order and the a11y tree while the handle keeps its place. */}
        <aside
          className={`relative z-[2] flex w-[322px] flex-none flex-col border-l max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:w-auto max-lg:overflow-hidden max-lg:border-l-0 max-lg:border-t max-lg:bg-background ${
            // 47 = the handle's 46px target + the sheet's own 1px top border,
            // border-box, so the handle is not clipped by a pixel of its own edge.
            railOpen ? "max-lg:h-[62dvh]" : "max-lg:h-[47px]"
          }`}
          style={{ borderColor: "var(--border-faint)" }}
          aria-label="Rankings and profile"
        >
          {narrow && (
            <button
              type="button"
              onClick={() => setRailOpen((o) => !o)}
              aria-expanded={railOpen}
              aria-label={railOpen ? "Hide rankings" : "Show rankings"}
              className="flex h-[46px] w-full flex-none items-center gap-2 border-b border-border-soft px-4 text-left"
            >
              <span className="flex-none text-[10px] font-bold tracking-[.12em] text-faint">
                {compare ? "COMPARE" : "RANKINGS"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                {compare ? "Two regions, side by side" : railScopeSub}
              </span>
              <span aria-hidden className="flex-none text-[11px] text-muted">{railOpen ? "▼" : "▲"}</span>
            </button>
          )}
          <div className={`flex min-h-0 flex-1 flex-col ${railOpen ? "" : "max-lg:hidden"}`}>
          {compare ? (
            <ComparePanel
              hasMetric={!!data}
              metricLabel={data?.name ?? ""}
              scopeSub={focusActive && focus ? `${focus.name} districts` : level === "district" ? "districts" : "states"}
              slots={[
                {
                  label: "SLOT A", accent: "#e6b34a", // token: --gold (a value handed to ComparePanel, not a CSS context here)
                  entry: pins[0] && data ? {
                    name: pins[0].name, sub: pins[0].kind === "district" ? pins[0].state : "state",
                    val: va != null ? fmtFull(va) : "no data",
                    barPct: va != null ? Math.max(4, Math.round((va / cmpMax) * 100)) : 0,
                  } : null,
                  hint: !data ? "Pick an indicator first." : "Click a region on the map.",
                  onClear: () => { const p = pins[0]; if (p) { mapRef.current?.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: false }); setPins(pins.slice(1)); } },
                },
                {
                  label: "SLOT B", accent: "#d1502f", // token: --accent
                  entry: pins[1] && data ? {
                    name: pins[1].name, sub: pins[1].kind === "district" ? pins[1].state : "state",
                    val: vb != null ? fmtFull(vb) : "no data",
                    barPct: vb != null ? Math.max(4, Math.round((vb / cmpMax) * 100)) : 0,
                  } : null,
                  hint: !data ? "Pick an indicator first." : "Then click a second region.",
                  onClear: () => { const p = pins[1]; if (p) { mapRef.current?.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: false }); setPins(pins.slice(0, 1)); } },
                },
              ]}
              gap={gapStr} sentence={gapSentence}
              onExit={() => { setCompare(false); clearPins(); }}
            />
          ) : (
            <RankingRail
                hasMetric={!!data}
                metricLabel={data?.name ?? ""}
                entries={entries} rankOf={rankOf}
                selectedCode={selected?.code ?? null}
                hoveredCode={hovered?.code ?? null}
                districtsAll={districtsAll}
                rankView={rankView} onToggleRankView={() => setRankView((v) => (v === "top" ? "bottom" : "top"))}
                sortDir={sortDir} onToggleSortDir={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                cohorts={cohortDefs} cohort={cohort}
                onCohort={(k) => { trackViz("cohort", String(k)); ensureCohorts(); setCohort(k); }}
                cohortEnabled={level === "state" && !!data}
                scopeSub={railScopeSub}
                fmtVal={fmtVal}
                onRowClick={(e) => {
                  const source = e.kind === "state" ? "states" : "districts";
                  clickFeature({ code: e.code, name: e.name, state: e.sub, kind: e.kind }, source);
                }}
                onRowEnter={(e) => {
                  const source = e.kind === "state" ? "states" : "districts";
                  mapRef.current?.setFeatureState({ source, id: e.code }, { hover: true });
                  setHovered({ code: e.code, name: e.name, state: e.sub, kind: e.kind });
                  setTip(null);
                }}
                onRowLeave={() => {
                  if (hovered) {
                    const source = hovered.kind === "state" ? "states" : "districts";
                    mapRef.current?.setFeatureState({ source, id: hovered.code }, { hover: false });
                  }
                  setHovered(null);
                }}
              />
          )}
          </div>
        </aside>
      </div>

      {/* OVERLAYS */}
      {socialOpen && data && (
        <SocialExportDialog
          onClose={() => setSocialOpen(false)}
          // `sources` credits any additional dataset the number is built from — a
          // per-capita metric's population denominator, etc. (item 850). Keyed off
          // data.id so it matches the same payload that supplies name/source.
          metric={{ name: data.name, unit: data.unit, year: data.year, source: data.source, decimals: data.decimals, sources: additionalSourceCredits(data.id) }}
          level={level} focusName={focus?.name ?? null}
          entries={entries.map((e) => ({
            code: e.code, name: e.name, value: e.value,
            // Keep the estimate flag on the row — narrowing to {code,name,value}
            // here is what left exported cards with no disclosure (item 643).
            estimated: e.estimated, estimate_kind: e.estimate_kind,
          }))}
          features={
            (level === "state"
              ? statesFCRef.current?.features ?? []
              : focus
                ? ((districtsFCRef.current?.features ?? []) as SocialFeature[]).filter(
                    (f) => stCode(String(f.properties?.st_code)) === stCode(focus.code))
                : districtsFCRef.current?.features ?? []) as SocialFeature[]
          }
          codeOf={(f) =>
            level === "state" ? String(f.properties?.st_code) : String(f.properties?.rid)}
          // The map's live palette/direction/mode/filters are threaded in so the
          // exported card matches what is on screen (item 830). The card owns its
          // own copy of palette + direction from here, so its colour-scheme
          // selector can re-colour the preview without touching the map.
          palette={palette}
          reverse={reverse}
          mode={mode}
          coverageHidden={coverageHidden}
          breaks={mapBreaks}
          method={brkMethod}
          fileBase={`mapsofbharat-${sel}`}
        />
      )}
      {chooserOpen && (
        <ChooserModal
          metrics={metrics} selected={sel}
          onPick={(id) => { track("metric_selected", { metric: id }); setSel(id); setChooserOpen(false); }}
          onClose={() => setChooserOpen(false)}
        />
      )}
      {/* Picking the PAIR (#408 item 1080). The same chooser, minus the metric
          already on the map — pairing a metric with itself is the one refusal a
          picker can prevent instead of explaining. Everything else is offered and
          the resolver explains its verdict in the legend, because a picker that
          silently omits options teaches a reader nothing about why. */}
      {pairOpen && (
        <ChooserModal
          metrics={metrics.filter((m) => m.id !== sel)} selected={pairId}
          onPick={(id) => { track("metric_selected", { metric: id, pair: "1" }); setPairId(id); setPairOpen(false); }}
          onClose={() => setPairOpen(false)}
        />
      )}
      <SearchModal
        open={searchOpen}
        metrics={metrics} regions={regions}
        valueOf={(code) => { const v = valuesRef.current[code]; return v == null ? null : fmtFull(v); }}
        onMetric={(id) => { track("metric_selected", { metric: id }); setSel(id); }}
        onRegion={onSearchRegion}
        onClose={() => setSearchOpen(false)}
      />
      {toast && (
        <div
          className="atl-pop fixed bottom-6 left-1/2 z-[70] max-w-[520px] -translate-x-1/2 border px-4 py-2.5 text-[12px] font-medium"
          style={{ background: "var(--elevated)", borderColor: "var(--border-strong)", borderLeft: "2px solid var(--accent)", color: "var(--text-soft)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
