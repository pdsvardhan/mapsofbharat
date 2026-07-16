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
  computeBreaks, colorFor, interpolateRdBu,
} from "@/lib/breaks";
import { Metric, catAccent } from "@/components/atlas/cats";
import { ChooserModal } from "@/components/atlas/chooser";
import { SearchModal, RegionIdx } from "@/components/atlas/search-modal";
import { ShareMenu } from "@/components/atlas/share-menu";
import { SocialExportDialog } from "@/components/atlas/social-export-dialog";
import type { SocialFeature } from "@/lib/social-export";
import { Crumbs, IndicatorCard, LevelColourCard, LegendCard, ScalePopover } from "@/components/atlas/left-stack";
import { RegionProfile, RankingRail, ComparePanel, Entry, CohortDef } from "@/components/atlas/right-rail";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#26231c"; // no indicator picked
const NODATA = "#2a271d"; // indicator picked, region missing a value

type MetricData = {
  name: string; unit: string; year: number; source: string; license?: string; decimals: number;
  min: number; max: number; mean: number; count: number; values: Record<string, number>;
  // region_code -> 1 when inherited from a parent district (post-source new district)
  estimated?: Record<string, 1>;
};
type Sel = { code: string; name: string; state: string; kind: "state" | "district" };
type Focus = { code: string; name: string };

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
    return { m: "", mode: "value" as const, st: "", stn: "", cmp: [] as string[], lvl: "state" as "state" | "district", brk: "jenks" as BreakMethod, pal: DEFAULT_PALETTE, rev: false, brkPinned: false, palPinned: false };
  const p = new URLSearchParams(window.location.search);
  const m = p.get("m") || "";
  // Jenks is the global default (iter-53 item 404); explicit URL param wins
  const brkParam = p.get("brk");
  const brk = (["continuous", "quantile", "equal", "jenks"].includes(brkParam || "") ? brkParam : "jenks") as BreakMethod;
  // old Observatory links: metric set but no lvl meant the district default
  const lvl = (p.get("lvl") === "state" ? "state" : p.get("lvl") === "district" ? "district" : m ? "district" : "state") as "state" | "district";
  return {
    m,
    mode: (p.get("mode") === "vs_avg" ? "vs_avg" : "value") as "value" | "vs_avg",
    st: p.get("st") || "",
    stn: p.get("stn") || "",
    cmp: (p.get("cmp") || "").split(",").filter(Boolean),
    lvl,
    brk,
    pal: normalizePalette(p.get("pal")),
    rev: p.get("rev") === "1",
    brkPinned: !!brkParam,
    palPinned: !!p.get("pal"),
  };
}

const PREFS_STORE = "mapsofbharat-atlas-v1";

export default function IndiaMap({ minimal = false }: { minimal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  const estimatedRef = useRef<Record<string, 1>>({});
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
  const [mode, setMode] = useState<"value" | "vs_avg">(init.mode);
  const [level, setLevel] = useState<"state" | "district">(init.lvl);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [selected, setSelected] = useState<Sel | null>(null);
  const [hovered, setHovered] = useState<Sel | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [brkMethod, setBrkMethod] = useState<BreakMethod>(init.brk);
  const [palette, setPalette] = useState<PaletteId>(init.pal);
  const [reverse, setReverse] = useState<boolean>(init.rev);
  const [compare, setCompare] = useState(init.cmp.length > 0);
  const [pins, setPins] = useState<Sel[]>([]);
  const [cohort, setCohort] = useState<string>("all");
  const [cohortSets, setCohortSets] = useState<{ pop: Set<string> | null; nsdp: Set<string> | null; area: Set<string> | null }>({ pop: null, nsdp: null, area: null });
  const [rankView, setRankView] = useState<"top" | "bottom">("top");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const levelRef = useRef(level);
  const focusRef = useRef<Focus | null>(null);
  const compareRef = useRef(compare);
  const pinsRef = useRef<Sel[]>([]);
  const selectedRef = useRef<Sel | null>(null);
  const modeRef = useRef(mode);
  const brkRef = useRef(brkMethod);
  const palRef = useRef(palette);
  const revRef = useRef(reverse);
  const cohortRef = useRef(cohort);
  const cohortSetsRef = useRef(cohortSets);
  const dataRef = useRef<MetricData | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  // manual scale/palette picks (or URL pins) suppress per-metric suggestions
  const brkTouchedRef = useRef(init.brkPinned);
  const palTouchedRef = useRef(init.palPinned);

  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { compareRef.current = compare; }, [compare]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { brkRef.current = brkMethod; }, [brkMethod]);
  useEffect(() => { palRef.current = palette; }, [palette]);
  useEffect(() => { revRef.current = reverse; }, [reverse]);
  useEffect(() => { cohortRef.current = cohort; }, [cohort]);
  useEffect(() => { cohortSetsRef.current = cohortSets; }, [cohortSets]);
  useEffect(() => { dataRef.current = data; }, [data]);

  const meta = metrics.find((m) => m.id === sel);

  const showToast = useCallback((m: string) => {
    if (toastT.current) clearTimeout(toastT.current);
    setToast(m);
    toastT.current = setTimeout(() => setToast(null), 3400);
  }, []);

  // persisted display prefs (palette / method / reverse) — metric stays in URL
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PREFS_STORE) || "null");
      if (s && !new URLSearchParams(window.location.search).get("pal")) {
        if (s.palette) { setPalette(normalizePalette(s.palette)); palTouchedRef.current = true; }
        if (s.method && ["continuous", "quantile", "equal", "jenks"].includes(s.method)) { setBrkMethod(s.method); brkTouchedRef.current = true; }
        if (typeof s.reverse === "boolean") setReverse(s.reverse);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    // persist only deliberate picks — suggested defaults stay ephemeral
    if (!brkTouchedRef.current && !palTouchedRef.current) return;
    try {
      localStorage.setItem(PREFS_STORE, JSON.stringify({
        ...(palTouchedRef.current ? { palette } : {}),
        ...(brkTouchedRef.current ? { method: brkMethod } : {}),
        reverse,
      }));
    } catch { /* ignore */ }
  }, [palette, brkMethod, reverse]);

  // per-metric suggested scale + palette (iter-53 items 403/404):
  // metrics.default_scale and topic-suggested ramps apply on pick, but never
  // override a URL pin, a persisted pref, or a manual pick this session
  useEffect(() => {
    if (!meta) return;
    const ds = (meta as { default_scale?: string | null }).default_scale;
    if (!brkTouchedRef.current && ds && ["continuous", "quantile", "equal", "jenks"].includes(ds))
      setBrkMethod(ds as BreakMethod);
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
          "rgba(233,227,213,0.10)"],
        "line-width": ["case",
          ["boolean", ["feature-state", "selected"], false], 2,
          ["boolean", ["feature-state", "pinned"], false], 2,
          ["boolean", ["feature-state", "hover"], false], 1.1, hairline],
      });

      map.addLayer({ id: "district-fill", type: "fill", source: "districts", paint: fillPaint } as any);
      // diagonal-hatch overlay marking districts whose value is ESTIMATED
      // (inherited from a parent — a district formed after the source's survey).
      // Opacity is driven by the per-feature `estimated` state, so the hatch
      // shows only on those districts. Neutral-tone lines read on any fill.
      if (!map.hasImage("estimate-hatch")) {
        const s = 8, cv = document.createElement("canvas");
        cv.width = cv.height = s;
        const g = cv.getContext("2d")!;
        g.strokeStyle = "rgba(20,22,28,0.85)"; g.lineWidth = 1.1;
        for (let o = -s; o < s * 2; o += 4) { g.beginPath(); g.moveTo(o, s); g.lineTo(o + s, 0); g.stroke(); }
        const img = g.getImageData(0, 0, s, s);
        map.addImage("estimate-hatch", { width: s, height: s, data: new Uint8Array(img.data.buffer) }, { pixelRatio: 2 });
      }
      map.addLayer({
        id: "district-estimated", type: "fill", source: "districts",
        paint: {
          "fill-pattern": "estimate-hatch",
          "fill-opacity": ["case", ["boolean", ["feature-state", "estimated"], false], 0.5, 0],
        },
      } as any);
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
      const md: MetricData = await fetch(`/api/metrics/${sel}?level=${level}`).then((r) => r.json());
      if (cancelled || !md.values) return;
      setData(md); dataRef.current = md; valuesRef.current = md.values;
      estimatedRef.current = md.estimated || {};
      const sorted = Object.entries(md.values).sort((a, b) => b[1] - a[1]);
      const ranks: Record<string, number> = {};
      sorted.forEach(([c], i) => (ranks[c] = i + 1));
      rankRef.current = ranks;
      recolor();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ready, level, metrics]);

  useEffect(() => {
    if (dataRef.current) recolor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, brkMethod, palette, reverse, focus, cohort, cohortSets]);

  // level switch: layer visibility; on real change reset drill/pins/selection
  const prevLevelRef = useRef(init.lvl);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const changed = prevLevelRef.current !== level;
    prevLevelRef.current = level;
    const showState = level === "state";
    map.setLayoutProperty("state-fill", "visibility", showState ? "visible" : "none");
    map.setLayoutProperty("state-line", "visibility", showState ? "visible" : "none");
    map.setLayoutProperty("district-fill", "visibility", showState ? "none" : "visible");
    map.setLayoutProperty("district-estimated", "visibility", showState ? "none" : "visible");
    map.setLayoutProperty("district-line", "visibility", showState ? "none" : "visible");
    if (!changed) return;
    if (drillingRef.current) { drillingRef.current = false; return; }
    clearPins(); clearSelected(); setHovered(null);
    if (focusRef.current) exitFocus(false);
    if (showState) { map.setFilter("state-outline", null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, ready]);

  // URL sync (shareable views)
  useEffect(() => {
    if (typeof window === "undefined" || minimal) return;
    const p = new URLSearchParams();
    if (sel) { p.set("m", sel); p.set("lvl", level); }
    if (mode !== "value") p.set("mode", mode);
    if (brkMethod !== "jenks") p.set("brk", brkMethod);
    if (palette !== DEFAULT_PALETTE) p.set("pal", palette);
    if (reverse) p.set("rev", "1");
    if (focus) { p.set("st", focus.code); p.set("stn", focus.name); }
    if (pins.length) p.set("cmp", pins.map((x) => x.code).join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [sel, mode, level, brkMethod, palette, reverse, focus, pins, minimal]);

  // ── colouring ────────────────────────────────────────────────────────────
  function allCodes(source: "districts" | "states"): string[] {
    if (source === "states") return Object.keys(statesRef.current).map((c) => String(c));
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
    map.removeFeatureState({ source: "districts" });
    map.removeFeatureState({ source: "states" });
  }

  function recolor() {
    const map = mapRef.current;
    const md = dataRef.current;
    if (!map || !md) return;
    const source = levelRef.current === "state" ? "states" : "districts";
    map.removeFeatureState({ source: "districts" });
    map.removeFeatureState({ source: "states" });
    // re-apply persistent highlight states
    pinsRef.current.forEach((p) => map.setFeatureState({ source: p.kind === "state" ? "states" : "districts", id: p.code }, { pinned: true }));
    const s = selectedRef.current;
    if (s) map.setFeatureState({ source: s.kind === "state" ? "states" : "districts", id: s.code }, { selected: true });

    const codes = scopeCodes();
    // class breaks + min/max use REAL values only, so inherited (estimated)
    // parent values don't distort the scale or the legend
    const vals = codes.filter((c) => !estimatedRef.current[c]).map((c) => valuesRef.current[c]);
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    if (!vals.length) { min = 0; max = 1; }
    const mean = vals.length ? sum / vals.length : 0;
    const scope = new Set(codes);
    const breaks = modeRef.current === "value" ? computeBreaks(vals, brkRef.current) : [];
    const basePal = PALETTES[palRef.current].fn;
    const pal = revRef.current ? (t: number) => basePal(1 - t) : basePal;
    const maxDev = Math.max(...vals.map((v) => Math.abs(v - mean))) || 1;

    // cohort dimming (states level only)
    const ck = cohortRef.current;
    const cs = cohortSetsRef.current;
    const cohortSet = levelRef.current === "state" && ck !== "all"
      ? (ck === "pop" ? cs.pop : ck === "nsdp" ? cs.nsdp : cs.area)
      : null;

    for (const code of allCodes(source)) {
      const v = valuesRef.current[code];
      const inScope = scope.has(code);
      if (v == null || !inScope) {
        map.setFeatureState({ source, id: code }, { color: NODATA, dim: false, estimated: false });
        continue;
      }
      const color = modeRef.current === "vs_avg"
        ? interpolateRdBu(0.5 + Math.max(-0.5, Math.min(0.5, (v - mean) / (2 * maxDev))))
        : colorFor(v, min, max, breaks, pal);
      const dim = cohortSet ? !cohortSet.has(code) : false;
      const est = source === "districts" && estimatedRef.current[code] === 1;
      map.setFeatureState({ source, id: code }, { color, dim, estimated: est });
    }
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
    // An inherited value carries its parent's number, not this district's own
    // measurement, so the ranking list must be able to mark it (item 611).
    const est = data.estimated ?? {};
    const out: Entry[] = [];
    for (const [code, value] of Object.entries(data.values)) {
      if (f && !code.startsWith(f) && !code.startsWith((focus?.code ?? "") + "_")) continue;
      const idx = nameIdx.get(code);
      out.push({
        code,
        name: idx?.name ?? code,
        sub: level === "district" ? idx?.state ?? "" : "",
        kind: level === "district" ? "district" : "state",
        value,
        estimated: est[code] === 1 ? 1 : 0,
      });
    }
    out.sort((a, b) => b.value - a.value);
    return out;
  }, [data, nameIdx, level, focusActive, focus]);

  // Inherited values carry no rank — the same rule /api/region/[code] already
  // applies (it ranks over estimated=0 only). A district that was never surveyed
  // holds its parent's number, so ranking it would assert a standing it never
  // earned. Real districts rank 1..N consecutively; estimated codes are absent
  // from this map and render as "—".
  const rankOf = useMemo(() => {
    const m: Record<string, number> = {};
    let r = 0;
    for (const e of entries) if (!e.estimated) m[e.code] = ++r;
    return m;
  }, [entries]);

  // Denominator for every rank sentence: only districts the source surveyed.
  const realCount = useMemo(() => entries.reduce((n, e) => n + (e.estimated ? 0 : 1), 0), [entries]);
  const estCount = entries.length - realCount;

  const scopeMin = entries.length ? entries[entries.length - 1].value : 0;
  const scopeMax = entries.length ? entries[0].value : 1;
  const scopeMean = entries.length ? entries.reduce((a, e) => a + e.value, 0) / entries.length : 0;

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
  const copyLink = useCallback(() => copyText(window.location.href, "link"), [copyText]);
  const copyEmbed = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/embed";
    copyText(`<iframe src="${url.toString()}" width="800" height="560" style="border:0" loading="lazy" title="Maps of Bharat"></iframe>`, "embed");
  }, [copyText]);

  // Legacy viewport-screenshot PNG export removed (iter-72 item 568) — the
  // social CARD dialog is the sole image export now.

  // search: pick a place
  const onSearchRegion = useCallback((r: RegionIdx) => {
    const map = mapRef.current; if (!map) return;
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
  const activeCohortDef = cohortDefs.find((c) => c.key === cohort);
  const cohortActive = level === "state" && cohort !== "all" && !!activeCohortDef?.codes;

  const hoverValue = hovered ? valuesRef.current[hovered.code] : null;
  const hoverRank = hovered ? rankOf[hovered.code] : null;
  const hoverEst = !!(hovered && estimatedRef.current[hovered.code] === 1);

  const fmtHover = (v: number | null | undefined) =>
    v == null ? "no data" : fmtFull(v) + (hoverEst ? " · est." : "");

  // ── minimal (embed) chrome ───────────────────────────────────────────────
  if (minimal) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <div ref={ref} style={{ position: "absolute", inset: 0 }} />
        {data && (
          <div className="absolute left-3 top-3 z-10 border border-border px-3 py-2" style={{ background: "var(--panel)" }}>
            <div className="text-xs font-bold text-bright">{data.name} <span className="font-normal text-faint">({data.unit})</span></div>
            <div className="mt-1.5 h-2 w-40" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => PALETTES[palette].fn(reverse ? 1 - t : t)).join(", ")})` }} />
            <div className="mt-0.5 flex justify-between font-mono text-[10px] text-faint"><span>{fmtVal(data.min)}</span><span>{fmtVal(data.max)}</span></div>
          </div>
        )}
        <a href="/" target="_blank" rel="noopener noreferrer"
          className="absolute bottom-2 right-2 z-10 border border-border px-2 py-1 text-[10px] text-faint hover:text-accent" style={{ background: "var(--panel)" }}>
          Maps of Bharat · {data ? `${data.source.split(",")[0]} · ${data.year}` : "official data"}
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
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-sm bg-bright text-[13px] font-extrabold" style={{ color: "#14120d" }}>MB</span>
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
        <div className="flex w-[300px] flex-none items-center justify-end">
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
          <div
            className="relative h-full border border-border"
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
              />
            </div>

            {/* LEGEND */}
            {data && meta && (
              <div className="absolute bottom-3.5 left-3.5 z-[5] w-[300px]">
                <LegendCard
                  metricName={data.name} unit={data.unit} decimals={data.decimals}
                  min={scopeMin} max={scopeMax} values={entries.map((e) => e.value)}
                  method={brkMethod} paletteFn={PALETTES[palette].fn} reverse={reverse}
                  mode={mode} onMode={setMode}
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
                method={brkMethod} onMethod={(m) => { brkTouchedRef.current = true; setBrkMethod(m); }}
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
                aria-pressed={compare}
                className="flex items-center gap-2 px-[15px] py-2.5 text-[11.5px] font-semibold tracking-[.05em] transition-colors"
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
                onClick={() => setSocialOpen(true)} disabled={!data}
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
                  {hovered.kind === "district"
                    ? `${hovered.state}${hoverEst ? " · estimated from parent" : hoverRank != null ? ` · #${hoverRank} of ${realCount}` : ""}`
                    : hoverRank != null ? `#${hoverRank} of ${realCount} ${scopeNoun}` : ""}
                </div>
              </div>
            )}
          </div>
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
          entries={entries.map((e) => ({ code: e.code, name: e.name, value: e.value }))}
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
          paletteFn={reverse ? (t: number) => PALETTES[palette].fn(1 - t) : PALETTES[palette].fn}
          fileBase={`mapsofbharat-${sel}`}
        />
      )}
      {chooserOpen && (
        <ChooserModal
          metrics={metrics} selected={sel}
          onPick={(id) => { setSel(id); setChooserOpen(false); }}
          onClose={() => setChooserOpen(false)}
        />
      )}
      <SearchModal
        open={searchOpen}
        metrics={metrics} regions={regions}
        valueOf={(code) => { const v = valuesRef.current[code]; return v == null ? null : fmtFull(v); }}
        onMetric={(id) => setSel(id)}
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
