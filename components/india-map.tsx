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
import { track } from "@/lib/analytics";
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
import { Crumbs, IndicatorCard, LevelColourCard, LegendCard, ScalePopover } from "@/components/atlas/left-stack";
import { RegionProfile, RankingRail, ComparePanel, Entry, CohortDef } from "@/components/atlas/right-rail";
import { DataTable, ViewToggle } from "@/components/atlas/data-table";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#26231c"; // no indicator picked
const NODATA = "#2a271d"; // indicator picked, region missing a value

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
    return { m: "", mode: "value" as const, st: "", stn: "", cmp: [] as string[], lvl: "state" as "state" | "district", brk: "jenks" as BreakMethod, pal: DEFAULT_PALETTE, rev: false, brkPinned: false, palPinned: false, vin: "current" as Vintage };
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
  };
}

const PREFS_STORE = "mapsofbharat-atlas-v1";

export default function IndiaMap({ minimal = false }: { minimal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
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
  const [chooserOpen, setChooserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
  const selectedRef = useRef<Sel | null>(null);
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
  useEffect(() => { revRef.current = reverse; }, [reverse]);
  useEffect(() => { cohortRef.current = cohort; }, [cohort]);
  useEffect(() => { cohortSetsRef.current = cohortSets; }, [cohortSets]);
  useEffect(() => { dataRef.current = data; }, [data]);

  // embed-load: fire once when the chrome-less /embed view mounts (item 825). The
  // metric comes straight off the URL (init is frozen at mount) — /embed has no
  // chooser, so it never changes after this.
  useEffect(() => {
    if (!minimal) return;
    track("embed-load", { metric: init.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimal]);

  const meta = metrics.find((m) => m.id === sel);

  const showToast = useCallback((m: string) => {
    if (toastT.current) clearTimeout(toastT.current);
    setToast(m);
    toastT.current = setTimeout(() => setToast(null), 3400);
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
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0d0f14" } }] },
      bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 24 },
      attributionControl: false, maxZoom: 12, minZoom: 3, dragRotate: false,
      // MapLibre v5 moved this under canvasContextAttributes — the old
      // top-level option was silently ignored, which made PNG exports blank
      // (iter-53 item 402).
      canvasContextAttributes: { preserveDrawingBuffer: true },
    } as maplibregl.MapOptions);
    mapRef.current = map;
    (window as any).__mob_map = map;

    map.on("load", async () => {
      map.resize();
      const [districts, states] = await Promise.all([
        fetch("/geo/districts.geojson").then((r) => r.json()),
        fetch("/geo/states.geojson").then((r) => r.json()),
      ]);
      districtsFCRef.current = districts;
      statesFCRef.current = states;
      (states.features as any[]).forEach((f) => { statesRef.current[String(f.properties?.st_code)] = f; });
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "rid" });
      map.addSource("states", { type: "geojson", data: states, promoteId: "st_code" });

      const fillPaint = {
        "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
        "fill-opacity": ["case",
          ["boolean", ["feature-state", "dim"], false], 0.15,
          ["boolean", ["feature-state", "hover"], false], 1, 0.9],
        "fill-color-transition": { duration: 400 },
        "fill-opacity-transition": { duration: 160 },
      };
      const linePaint = (hairline: number) => ({
        "line-color": ["case",
          ["boolean", ["feature-state", "selected"], false], "#d1502f",
          ["boolean", ["feature-state", "pinned"], false], "#e6b34a",
          ["boolean", ["feature-state", "hover"], false], "#e9e3d5",
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

      map.addLayer({ id: "district-fill", type: "fill", source: "districts", paint: fillPaint } as any);
      // No estimate hatch here by design (adr-019). The overlay that used to mark
      // inherited districts was measured at 1.09:1 against the dark end of the
      // ramp — below WCAG's 3:1 floor for non-text UI, and its 8px tile at
      // pixelRatio 2 aliased to flat tone, so it communicated nothing. It was also
      // disproportionate: inheritance is 2.7% of district data, yet an ASER map
      // would hatch 12% of India, and we render NFHS sampling error perfectly
      // flat. Estimates are disclosed where the number is read instead — rail
      // badge, map hover, region panel, export footnote.
      map.addLayer({ id: "district-line", type: "line", source: "districts", paint: linePaint(0.3) as any });
      map.addLayer({ id: "state-fill", type: "fill", source: "states", layout: { visibility: "none" }, paint: fillPaint } as any);
      map.addLayer({
        id: "state-outline", type: "line", source: "states",
        paint: { "line-color": "rgba(233,227,213,0.26)", "line-width": 0.8 },
      });
      map.addLayer({ id: "state-line", type: "line", source: "states", layout: { visibility: "none" }, paint: linePaint(0.4) as any });

      const wire = (layer: string, source: "districts" | "states", kind: "district" | "state") => {
        let hov: string | number | undefined;
        map.on("mousemove", layer, (e: any) => {
          if (!e.features?.length) return;
          map.getCanvas().style.cursor = "pointer";
          const f = e.features[0];
          if (hov !== undefined) map.setFeatureState({ source, id: hov }, { hover: false });
          hov = f.id as string;
          map.setFeatureState({ source, id: hov }, { hover: true });
          setHovered({
            code: String(f.id),
            name: String((kind === "state" ? f.properties?.st_nm : f.properties?.district) ?? "—"),
            state: kind === "state" ? "" : String(f.properties?.st_nm ?? ""),
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
          const f = e.features[0];
          const s: Sel = {
            code: String(f.id),
            name: String((kind === "state" ? f.properties?.st_nm : f.properties?.district) ?? "—"),
            state: kind === "state" ? String(f.properties?.st_nm ?? "") : String(f.properties?.st_nm ?? ""),
            kind,
          };
          clickFeature(s, source);
        });
      };
      wire("district-fill", "districts", "district");
      wire("state-fill", "states", "state");

      setReady(true);

      // restore drill + compare pins from a shared link
      const r = restoreRef.current;
      if (r.st && r.lvl === "district") {
        const nm = r.stn || statesRef.current[String(Number(r.st))]?.properties?.st_nm || "";
        applyFocus(r.st.padStart(2, "0"), String(nm));
      }
      if (r.cmp.length) {
        const restored: Sel[] = [];
        for (const code of r.cmp.slice(0, 2)) {
          if (code.includes("_")) {
            const feat = (districts.features as any[]).find((ff) => String(ff.properties?.rid) === code);
            if (feat) restored.push({ code, name: String(feat.properties?.district ?? "—"), state: String(feat.properties?.st_nm ?? ""), kind: "district" });
          } else {
            const feat = statesRef.current[String(Number(code))];
            if (feat) restored.push({ code, name: String(feat.properties?.st_nm ?? "—"), state: "", kind: "state" });
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
        fetch("/geo/districts-2011.geojson").then((r) => r.json()),
        fetch("/geo/states-2011.geojson").then((r) => r.json()),
      ]);
      if (cancelled || vintageLoadedRef.current) return;
      d2011FCRef.current = d2011;
      const idx = vintageIdxRef.current;
      (d2011.features as any[]).forEach((f) => {
        idx.set(String(f.properties?.rid), { name: String(f.properties?.district ?? "—"), state: String(f.properties?.st_nm ?? "") });
      });
      // Key on the RAW zero-padded st_code ("01".."35"), not String(Number(...))
      // (to-do 346). Three things must agree on this key and all three are padded:
      // the source's promoteId below, the /api/metrics?level=state2011 value keys,
      // and this index. Normalising to "1".."35" here desynchronised all of them —
      // allCodes("states2011") reads these keys, so every state looked up as
      // undefined and the whole 2011 state map painted no-data, while the ranking
      // rail fell back to showing the bare code instead of the state name.
      (s2011.features as any[]).forEach((f) => {
        idx.set(String(f.properties?.st_code), { name: String(f.properties?.st_nm ?? "—"), state: null });
      });
      map.addSource("districts2011", { type: "geojson", data: d2011, promoteId: "rid" });
      map.addSource("states2011", { type: "geojson", data: s2011, promoteId: "st_code" });
      const fillPaint = {
        "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.9],
        "fill-color-transition": { duration: 400 },
      };
      const linePaint = (w: number) => ({
        "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#e9e3d5", "rgba(233,227,213,0.10)"],
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.1, w],
      });
      map.addLayer({ id: "d2011-fill", type: "fill", source: "districts2011", layout: { visibility: "none" }, paint: fillPaint } as any);
      map.addLayer({ id: "d2011-line", type: "line", source: "districts2011", layout: { visibility: "none" }, paint: linePaint(0.3) as any });
      map.addLayer({ id: "s2011-fill", type: "fill", source: "states2011", layout: { visibility: "none" }, paint: fillPaint } as any);
      map.addLayer({ id: "s2011-line", type: "line", source: "states2011", layout: { visibility: "none" }, paint: linePaint(0.4) as any });
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
            name: String((kind === "state" ? f.properties?.st_nm : f.properties?.district) ?? "—"),
            state: kind === "state" ? "" : String(f.properties?.st_nm ?? ""),
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
      setPins(next);
      return;
    }
    const prev = selectedRef.current;
    if (prev) map.setFeatureState({ source: prev.kind === "state" ? "states" : "districts", id: prev.code }, { selected: false });
    if (prev && prev.code === s.code) { setSelected(null); return; }
    map.setFeatureState({ source, id: s.code }, { selected: true });
    setSelected(s);
    setScaleOpen(false);
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
  function applyFocus(code: string, name: string) {
    const map = mapRef.current; if (!map) return;
    const f = statesRef.current[String(Number(code))] || statesRef.current[code];
    const flt: any = ["==", ["to-string", ["get", "st_code"]], String(Number(code))];
    map.setFilter("district-fill", flt); map.setFilter("district-line", flt); map.setFilter("state-outline", flt);
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
    track("drill", { level: "district", region: name });
  }
  function exitFocus(toStates: boolean) {
    const map = mapRef.current; if (!map) return;
    map.setFilter("district-fill", null); map.setFilter("district-line", null); map.setFilter("state-outline", null);
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
      recolor();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ready, level, metrics, vintage, vintageTick]);

  useEffect(() => {
    if (dataRef.current) recolor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, brkMethod, palette, reverse, focus, cohort, cohortSets, coverageHidden]);

  // The map lives in a plate that is display:none while the table view is up, so
  // MapLibre holds its last canvas size until the plate is shown again. Resize on
  // the way back so the choropleth fills the plate instead of rendering at the
  // stale size it had when it was hidden.
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
    if (focus) { p.set("st", focus.code); p.set("stn", focus.name); }
    if (pins.length) p.set("cmp", pins.map((x) => x.code).join(","));
    if (vintage === "2011") p.set("vin", "2011");
    // to-do 348: adaptive is the outline default, so only the fixed ESCAPE HATCH needs
    // to travel. Preserving it here keeps a shared/reloaded "fixed" view fixed — and
    // stops this writer from stripping the param out from under the mount-time reader.
    if (outlineModeRef.current === "fixed") p.set("outline", "fixed");
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [sel, mode, level, brkMethod, palette, reverse, focus, pins, minimal, vintage, pickTick]);

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
      const pref = String(Number(f.code)) + "_";
      return Object.keys(values).filter((c) => c.startsWith(pref) || c.startsWith(f.code + "_"));
    }
    return Object.keys(values);
  }

  function paintNeutral() {
    const map = mapRef.current; if (!map) return;
    for (const s of ["districts", "states", "districts2011", "states2011"])
      if (map.getSource(s)) map.removeFeatureState({ source: s });
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
    let lumSum = 0, lumN = 0; // backdrop mean for the state-outline overlay (to-do 348)
    const breaks = modeRef.current === "value"
      ? computeBreaks(vals, brkRef.current, 5, metricRefRef.current) : [];
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

    for (const code of allCodes(source)) {
      const v = valuesRef.current[code];
      const inScope = scope.has(code);
      if (v == null || !inScope) {
        map.setFeatureState({ source, id: code }, { color: NODATA, dim: false, stroke: strokeForFill(NODATA) });
        continue;
      }
      // COVERAGE view (item 830): shade by DATA PROVENANCE, not value. A class
      // toggled off in the legend recedes to the neutral no-data tone so the
      // classes left on stand out (e.g. inherited-only).
      let color: string;
      if (modeRef.current === "coverage") {
        const cls = provenanceOf(estimatedRef.current[code], estimateKindRef.current[code]);
        color = coverageHiddenRef.current.includes(cls) ? PROVENANCE_MUTED : PROVENANCE_COLOR[cls];
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
      map.setFeatureState({ source, id: code }, { color, dim, stroke: strokeForFill(color) });
      lumSum += fillLuminance(color);
      lumN++;
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
    const f = focusActive && focus ? String(Number(focus.code)) + "_" : null;
    // An estimated value is not this region's own measurement, so the ranking list
    // must be able to mark it (item 611) — and estimate_kind travels with it so the
    // rail can say WHICH kind without guessing from the flag (adr-021).
    const est = data.estimated ?? {};
    const kinds = data.estimate_kind ?? {};
    const donors = data.estimated_from ?? {};
    const shak = data.shaky ?? {};
    const out: Entry[] = [];
    for (const [code, value] of Object.entries(data.values)) {
      if (f && !code.startsWith(f) && !code.startsWith((focus?.code ?? "") + "_")) continue;
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
    const n = String(Number(stateCode));
    return (fc.features as any[]).filter((f) => String(Number(f.properties?.st_code)) === n).length;
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
    track("share", { action: "link", metric: sel });
    return copyText(window.location.href, "link");
  }, [copyText, sel]);
  const copyEmbed = useCallback(() => {
    track("share", { action: "embed", metric: sel });
    const url = new URL(window.location.href);
    url.pathname = "/embed";
    // Name the frame after the indicator on view — a meaningful title helps the
    // embedding page and assistive tech, and the src is absolute so it renders
    // the same view from any origin. Params ride along untouched.
    const title = `Maps of Bharat${data ? ` — ${data.name.replace(/"/g, "")}` : ""}`;
    copyText(`<iframe src="${url.toString()}" width="800" height="560" style="border:0" loading="lazy" title="${title}"></iframe>`, "embed");
  }, [copyText, data, sel]);

  // Legacy viewport-screenshot PNG export removed (iter-72 item 568) — the
  // social CARD dialog is the sole image export now.

  // search: pick a place
  const onSearchRegion = useCallback((r: RegionIdx) => {
    const map = mapRef.current; if (!map) return;
    // search targets current-day regions; a pick pops the vintage view
    if (vintageRef.current === "2011") setVintage("current");
    if (r.level === "state") {
      if (levelRef.current === "state") {
        const f = statesRef.current[String(Number(r.code))] || statesRef.current[r.code];
        if (f) map.fitBounds(bbox(f.geometry) as any, { padding: 50, duration: 750, essential: true });
        clickFeature({ code: String(Number(r.code)), name: r.name, state: "", kind: "state" }, "states");
      } else {
        drillIntoState(r.code.padStart(2, "0"), r.name);
      }
    } else {
      if (levelRef.current === "state") setLevel("district");
      const feat = (districtsFCRef.current?.features as any[] | undefined)?.find((f) => String(f.properties?.rid) === r.code);
      if (feat) {
        applyFocus(String(feat.properties?.st_code).padStart(2, "0"), String(feat.properties?.st_nm ?? ""));
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
        if (searchOpen || chooserOpen || scaleOpen) {
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
  }, [minimal, searchOpen, chooserOpen, scaleOpen]);

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
          if (codeGuess) drillIntoState(codeGuess.padStart(2, "0"), stateCtx);
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
              <div className="mt-1 max-w-40 text-[9px] leading-snug text-dim">{embedEstimateNote}</div>
            )}
          </div>
        )}
        {/* Brand mark + source citation + a link home. An iframe travels with
            no masthead or rail, so the embed itself carries attribution and a
            way back to the same view on the full Atlas (item 828). */}
        <a href={shareBackHref} target="_blank" rel="noopener noreferrer"
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 border border-border px-2 py-1 text-[10px] text-faint hover:text-accent" style={{ background: "var(--panel)" }}>
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
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 120% at 50% -10%, #15140f, #0b0c10 60%)" }} />

      {/* MASTHEAD */}
      <header className="relative z-10 flex h-16 flex-none items-center border-b px-5" style={{ borderColor: "#2a2619" }}>
        <div className="flex w-[300px] flex-none items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 30px inline logo */}
          <img src="/brand/mark.png" alt="" aria-hidden="true" width={30} height={30} className="h-[30px] w-[30px] flex-none object-contain" />
          <span className="text-[17px] font-bold leading-none tracking-tight text-bright">Maps of Bharat</span>
        </div>
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setSearchOpen(true)} aria-label="Search places and indicators (Ctrl+K)"
            className="flex w-[360px] items-center gap-2.5 rounded-sm border border-border px-3 py-2 text-left hover:border-faint"
            style={{ background: "rgba(18,19,15,.5)" }}
          >
            <span className="h-[13px] w-[13px] flex-none rounded-full border-[1.5px] border-faint" />
            <span className="flex-1 text-[13.5px] text-faint">Search a place or indicator…</span>
            <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] text-dim">CTRL K</kbd>
          </button>
        </div>
        <div className="flex w-[300px] flex-none items-center justify-end gap-4">
          {/* Corrections / report an error (iter-32 item 848), beside Methodology */}
          <a
            href="/corrections" target="_blank" rel="noopener noreferrer"
            className="text-[11.5px] font-semibold tracking-[.05em] text-muted hover:text-foreground"
          >
            CORRECTIONS
          </a>
          <a
            href="/methodology" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[.05em] text-muted hover:text-foreground"
          >
            <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border-[1.5px] border-current text-[9px]">i</span>
            METHODOLOGY &amp; SOURCES
          </a>
        </div>
      </header>

      {/* BODY */}
      <div className="relative flex min-h-0 flex-1">
        {/* MAP PLATE */}
        <div className="relative min-w-0 flex-1 p-4">
          {/* The map plate stays MOUNTED in table view (display:none) — unmounting
              would orphan MapLibre and lose the drill/selection it holds. The table
              plate below reads the same computed entries, so the swap is view-only. */}
          <div
            className={`relative h-full border border-border${view === "table" ? " hidden" : ""}`}
            style={{ background: "radial-gradient(80% 80% at 50% 42%, #12130f, #0b0c10)" }}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
          >
            <div ref={ref} style={{ position: "absolute", inset: 0 }} />

            {/* LEFT STACK */}
            <div className="absolute left-3.5 top-3.5 z-[5] flex w-[300px] flex-col gap-2.5">
              <Crumbs items={crumbs} hasBack={hasBack} onBack={onBack} />
              <IndicatorCard
                metricName={meta?.name ?? null}
                metricDesc={meta ? `${meta.category[0].toUpperCase()}${meta.category.slice(1)} · ${meta.year}` : ""}
                srcShort={meta?.source.split(",")[0] ?? ""}
                onOpenChooser={() => { setChooserOpen(true); setScaleOpen(false); setSearchOpen(false); }}
              />
              <LevelColourCard
                level={level} onLevel={(l) => setLevel(l)} levelLock={levelLock}
                palette={palette} onPalette={(p) => { palTouchedRef.current = true; setPalette(p); }}
                vintage={vintage} onVintage={setVintage}
                vintageAvailable={!!meta?.levels?.some((l) => l === "district2011" || l === "state2011")}
                view={view} onView={setView}
              />
            </div>

            {/* LEGEND */}
            {data && meta && (
              <div className="absolute bottom-3.5 left-3.5 z-[5] w-[300px]">
                <LegendCard
                  metricName={data.name} unit={data.unit} decimals={data.decimals}
                  min={scopeMin} max={scopeMax} values={entries.map((e) => e.value)}
                  method={brkMethod} mapEdges={mapBreaks}
                  paletteFn={PALETTES[palette].fn} reverse={reverse}
                  mode={mode} onMode={setMode}
                  coverageCounts={coverCounts} coverageHidden={coverageHidden}
                  onToggleCoverageClass={toggleCoverageClass}
                  coverageStat={coverageStatText}
                  avgNote={`avg ${fmtVal(scopeMean)}${focusActive ? " (state avg)" : ""}`}
                  scope={focusActive ? "within state" : level === "district" ? "districts" : "states"}
                  countLabel={`${entries.length} ${level === "district" ? "districts" : "states"}`}
                  source={data.source} license={data.license ?? ""}
                  cohortNote={cohortActive ? `${activeCohortDef!.name} · dimming others` : null}
                  scaleOpen={scaleOpen} onToggleScale={() => setScaleOpen((o) => !o)}
                />
              </div>
            )}
            {scaleOpen && (
              <ScalePopover
                method={brkMethod} onMethod={(m) => {
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
                reverse={reverse} onReverse={() => setReverse((r) => !r)}
                onClose={() => setScaleOpen(false)}
              />
            )}

            {/* ACTION TOOLBAR */}
            <div
              className="absolute bottom-3.5 right-3.5 z-[6] flex items-stretch overflow-visible rounded-sm border"
              style={{ background: "rgba(16,17,13,.96)", borderColor: compare ? "#6b3020" : "#3b3626", boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}
            >
              <button
                onClick={() => {
                  setCompare((c) => { const n = !c; if (!n) clearPins(); else clearSelected(); return n; });
                }}
                aria-pressed={compare} disabled={vintage === "2011"}
                title={vintage === "2011" ? "Compare works on current-day boundaries — switch BOUNDARIES back to TODAY" : undefined}
                className="flex items-center gap-2 px-[15px] py-2.5 text-[11.5px] font-semibold tracking-[.05em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: compare ? "#d1502f" : "transparent", color: compare ? "#16110b" : "#d8ccbe" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <rect x="3" y="3" width="13" height="13" rx="1.5" /><rect x="8" y="8" width="13" height="13" rx="1.5" />
                </svg>
                {compare ? "Comparing" : "Compare"}
              </button>
              <span className="w-px flex-none" style={{ background: "#2a2619" }} />
              <ShareMenu disabled={false} onCopyLink={copyLink} onCopyEmbed={copyEmbed} copied={copied} />
              <span className="w-px flex-none" style={{ background: "#2a2619" }} />
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

            {/* COMPARE HINT */}
            {compare && pins.length < 2 && (
              <div
                className="atl-pop absolute left-1/2 top-3.5 z-[6] -translate-x-1/2 rounded-sm border px-3.5 py-2 text-[12px] font-semibold"
                style={{ background: "rgba(26,23,14,.96)", borderColor: "#6b3020", color: "#eecdb8" }}
              >
                {!data ? "Pick an indicator, then click two regions" : pins.length === 0 ? "Click the first region to compare" : "Now click a second region"}
              </div>
            )}

            {/* FLOATING REGION PROFILE (iter-53 item 407 — lives on the plate, not the rail) */}
            {selected && !compare && (
              <div className="atl-pop absolute right-3.5 top-3.5 z-[6] w-[300px] border border-border" style={{ background: "var(--panel)", boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
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
                  onDrill={() => drillIntoState(selected.code.padStart(2, "0"), selected.name)}
                  onClear={clearSelected}
                />
              </div>
            )}

            {/* TOOLTIP */}
            {hovered && tip && (
              <div
                className="pointer-events-none fixed z-[60] whitespace-nowrap border px-2.5 py-1.5"
                style={{ left: tip.x + 14, top: tip.y + 14, background: "rgba(13,15,20,.96)", borderColor: "#4a4433" }}
              >
                <span className="text-[12px] font-bold text-bright">{hovered.name}</span>
                {data && <span className="ml-2 font-mono text-[10.5px] text-muted">{fmtHover(hoverValue)}</span>}
                <div className="mt-px text-[9.5px] text-dim">
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
          </div>

          {/* TABLE PLATE — the same view as a semantic, sortable table (item 826).
              Fed the same computed `entries` + `rankOf` the ranking rail renders, so
              the two can never disagree. Its own VIEW toggle + caption stand in for
              the left stack, which is display:none with the map plate. */}
          {view === "table" && (
            <div
              className="relative flex h-full flex-col overflow-hidden border border-border"
              style={{ background: "radial-gradient(80% 80% at 50% 42%, #12130f, #0b0c10)" }}
            >
              <div className="flex flex-none items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[.12em] text-faint">DATA TABLE</div>
                  <div className="truncate text-[15px] font-extrabold leading-tight text-bright">
                    {data ? data.name : "No indicator selected"}
                  </div>
                </div>
                <ViewToggle view={view} onView={setView} />
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
              />
            </div>
          )}
        </div>

        {/* RIGHT RAIL */}
        <aside className="relative z-[2] flex w-[322px] flex-none flex-col border-l" style={{ borderColor: "#211e14" }} aria-label="Rankings and profile">
          {compare ? (
            <ComparePanel
              hasMetric={!!data}
              metricLabel={data?.name ?? ""}
              scopeSub={focusActive && focus ? `${focus.name} districts` : level === "district" ? "districts" : "states"}
              slots={[
                {
                  label: "SLOT A", accent: "#e6b34a",
                  entry: pins[0] && data ? {
                    name: pins[0].name, sub: pins[0].kind === "district" ? pins[0].state : "state",
                    val: va != null ? fmtFull(va) : "no data",
                    barPct: va != null ? Math.max(4, Math.round((va / cmpMax) * 100)) : 0,
                  } : null,
                  hint: !data ? "Pick an indicator first." : "Click a region on the map.",
                  onClear: () => { const p = pins[0]; if (p) { mapRef.current?.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: false }); setPins(pins.slice(1)); } },
                },
                {
                  label: "SLOT B", accent: "#d1502f",
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
                onCohort={(k) => { ensureCohorts(); setCohort(k); }}
                cohortEnabled={level === "state" && !!data}
                scopeSub={
                  data
                    ? focusActive && focus
                      ? `${entries.length} districts in ${focus.name}${estCount ? ` · ${estCount} estimated` : ""}`
                      : districtsAll
                        ? `${entries.length} districts nationwide${estCount ? ` · ${estCount} estimated` : ""}`
                        : `${entries.length} states${cohortActive ? ` · ${activeCohortDef!.name}` : ""}`
                    : "Pick an indicator to rank"
                }
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
        </aside>
      </div>

      {/* OVERLAYS */}
      {socialOpen && data && (
        <SocialExportDialog
          onClose={() => setSocialOpen(false)}
          metric={{ name: data.name, unit: data.unit, year: data.year, source: data.source, decimals: data.decimals }}
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
                    (f) => String(Number(String(f.properties?.st_code))) === String(Number(focus.code)))
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
          onPick={(id) => { track("metric-select", { metric: id }); setSel(id); setChooserOpen(false); }}
          onClose={() => setChooserOpen(false)}
        />
      )}
      <SearchModal
        open={searchOpen}
        metrics={metrics} regions={regions}
        valueOf={(code) => { const v = valuesRef.current[code]; return v == null ? null : fmtFull(v); }}
        onMetric={(id) => { track("metric-select", { metric: id }); setSel(id); }}
        onRegion={onSearchRegion}
        onClose={() => setSearchOpen(false)}
      />
      {toast && (
        <div
          className="atl-pop fixed bottom-6 left-1/2 z-[70] max-w-[520px] -translate-x-1/2 border px-4 py-2.5 text-[12px] font-medium"
          style={{ background: "#1a1712", borderColor: "#4a4433", borderLeft: "2px solid #d1502f", color: "#ccc4b2" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
