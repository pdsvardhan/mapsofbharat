"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { interpolateRdBu } from "d3-scale-chromatic";
import { BreakMethod, PaletteId, PALETTES, computeBreaks, colorFor, fmtBin } from "@/lib/breaks";
import { buildCsv, downloadCsv } from "@/lib/csv";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#1c2530";

type Metric = {
  id: string; name: string; category: string; unit: string; year: number; source: string;
  higher_is_better: number | null; levels?: string[]; methodology?: string | null;
};
type MetricData = {
  name: string; unit: string; year: number; source: string; license?: string; decimals: number;
  min: number; max: number; mean: number; count: number; values: Record<string, number>;
};
type View = { level: "national" | "state"; code?: string; name?: string };
type Pin = { code: string; name: string; state: string };
type Detail = { code: string; name: string; state: string };
type RegionMetric = {
  id: string; name: string; category: string; unit: string; year: number;
  source: string; source_url: string; decimals: number; higher_is_better: number | null;
  methodology?: string | null; value: number; rank: number; count: number;
};
type RegionIdx = { level: "district" | "state"; code: string; name: string; st_code: string; state: string | null };

function bbox(geom: any): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: any): void => {
    if (typeof c[0] === "number") {
      const x = c[0], y = c[1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else { c.forEach(walk); }
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

// ── point-in-polygon (for find-my-district) ─────────────────────────────
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInRingsWithHoles(pt: [number, number], rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(pt, rings[i])) return false;
  return true;
}
function pointInFeature(pt: [number, number], geom: any): boolean {
  if (!geom) return false;
  if (geom.type === "Polygon") return pointInRingsWithHoles(pt, geom.coordinates);
  if (geom.type === "MultiPolygon") return geom.coordinates.some((poly: number[][][]) => pointInRingsWithHoles(pt, poly));
  return false;
}

function readUrl() {
  if (typeof window === "undefined")
    return { m: "", mode: "value" as const, st: "", stn: "", cmp: [] as string[], lvl: "district" as const, brk: "continuous" as const, pal: "viridis" as const };
  const p = new URLSearchParams(window.location.search);
  const brk = (["quantile", "equal", "jenks"].includes(p.get("brk") || "") ? p.get("brk") : "continuous") as BreakMethod;
  const pal = ((p.get("pal") || "viridis") in PALETTES ? p.get("pal") || "viridis" : "viridis") as PaletteId;
  return {
    m: p.get("m") || "",
    mode: (p.get("mode") === "vs_avg" ? "vs_avg" : "value") as "value" | "vs_avg",
    st: p.get("st") || "",
    stn: p.get("stn") || "",
    cmp: (p.get("cmp") || "").split(",").filter(Boolean),
    lvl: (p.get("lvl") === "state" ? "state" : "district") as "district" | "state",
    brk, pal,
  };
}

export default function IndiaMap({ minimal = false }: { minimal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  const rankRef = useRef<Record<string, number>>({});
  const statesRef = useRef<Record<string, any>>({});
  const districtsFCRef = useRef<any>(null);
  const compareRef = useRef(false);
  const pinsRef = useRef<Pin[]>([]);
  const viewRef = useRef<View>({ level: "national" });
  const restoreRef = useRef(readUrl());

  const init = restoreRef.current;
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [regions, setRegions] = useState<RegionIdx[]>([]);
  const [sel, setSel] = useState<string>(init.m || "");
  const [data, setData] = useState<MetricData | null>(null);
  const [mode, setMode] = useState<"value" | "vs_avg">(init.mode);
  const [level, setLevel] = useState<"district" | "state">(init.lvl);
  const levelRef = useRef<"district" | "state">(init.lvl);
  const [brkMethod, setBrkMethod] = useState<BreakMethod>(init.brk);
  const [palette, setPalette] = useState<PaletteId>(init.pal);
  const brkRef = useRef<BreakMethod>(init.brk);
  const palRef = useRef<PaletteId>(init.pal);
  const [range, setRange] = useState<[number, number] | null>(null);
  const rangeRef = useRef<[number, number] | null>(null);
  const [view, setView] = useState<View>({ level: "national" });
  const [compare, setCompare] = useState(init.cmp.length > 0);
  const [pins, setPins] = useState<Pin[]>([]);
  const [hover, setHover] = useState<{ name: string; state: string; value: number | null; rank: number | null } | null>(null);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailData, setDetailData] = useState<RegionMetric[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { compareRef.current = compare; }, [compare]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { brkRef.current = brkMethod; }, [brkMethod]);
  useEffect(() => { palRef.current = palette; }, [palette]);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const openDetail = useCallback((feat: { id?: string | number; properties?: any }) => {
    const code = String(feat.id ?? feat.properties?.rid ?? "");
    if (!code) return;
    const isState = !code.includes("_");
    setDetail({
      code,
      name: String((isState ? feat.properties?.st_nm : feat.properties?.district) ?? "—"),
      state: isState ? "" : String(feat.properties?.st_nm ?? ""),
    });
    setDetailData(null);
    fetch(`/api/region/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => setDetailData(d.metrics || []))
      .catch(() => setDetailData([]));
  }, []);

  // metric list + region name index load on mount, independent of the map
  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((m) => {
        if (cancelled) return;
        const list: Metric[] = m.metrics || [];
        setMetrics(list);
        setSel((cur) => cur || (list.find((x) => x.id === "literacy_rate")?.id ?? list[0]?.id ?? ""));
      })
      .catch(() => {});
    if (!minimal)
      fetch("/api/regions")
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setRegions(d.regions || []); })
        .catch(() => {});
    return () => { cancelled = true; };
  }, [minimal]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b0f14" } }] },
      bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 24 },
      attributionControl: false, maxZoom: 12, minZoom: 3, dragRotate: false,
      preserveDrawingBuffer: true,
    } as maplibregl.MapOptions & { preserveDrawingBuffer?: boolean });
    mapRef.current = map;
    (window as any).__mob_map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", async () => {
      map.resize();
      const [districts, states] = await Promise.all([
        fetch("/geo/districts.geojson").then((r) => r.json()),
        fetch("/geo/states.geojson").then((r) => r.json()),
      ]);
      districtsFCRef.current = districts;
      (states.features as any[]).forEach((f) => { statesRef.current[String(f.properties?.st_code)] = f; });
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "rid" });
      map.addSource("states", { type: "geojson", data: states, promoteId: "st_code" });
      map.addLayer({
        id: "district-fill", type: "fill", source: "districts",
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
          "fill-opacity": ["case",
            ["boolean", ["feature-state", "dim"], false], 0.15,
            ["boolean", ["feature-state", "hover"], false], 1, 0.88],
          "fill-color-transition": { duration: 350 },
          "fill-opacity-transition": { duration: 150 },
        },
      } as any);
      map.addLayer({
        id: "district-line", type: "line", source: "districts",
        paint: {
          "line-color": ["case",
            ["boolean", ["feature-state", "located"], false], "#fbbf24",
            ["boolean", ["feature-state", "pinned"], false], "#f59e0b", "#0b0f14"],
          "line-width": ["case",
            ["boolean", ["feature-state", "located"], false], 3,
            ["boolean", ["feature-state", "pinned"], false], 2.5, 0.3],
        } as any,
      });
      map.addLayer({
        id: "state-fill", type: "fill", source: "states",
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
          "fill-opacity": ["case",
            ["boolean", ["feature-state", "dim"], false], 0.15,
            ["boolean", ["feature-state", "hover"], false], 1, 0.88],
          "fill-color-transition": { duration: 350 },
          "fill-opacity-transition": { duration: 150 },
        },
      } as any);
      map.addLayer({ id: "state-line", type: "line", source: "states", paint: { "line-color": "#4b5d72", "line-width": 1 } });

      let hov: string | number | undefined;
      map.on("mousemove", "district-fill", (e: any) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        if (hov !== undefined) map.setFeatureState({ source: "districts", id: hov }, { hover: false });
        hov = f.id as string;
        map.setFeatureState({ source: "districts", id: hov }, { hover: true });
        const code = String(f.id);
        setHover({
          name: String(f.properties?.district ?? "—"), state: String(f.properties?.st_nm ?? ""),
          value: code in valuesRef.current ? valuesRef.current[code] : null,
          rank: code in rankRef.current ? rankRef.current[code] : null,
        });
      });
      map.on("mouseleave", "district-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hov !== undefined) map.setFeatureState({ source: "districts", id: hov }, { hover: false });
        hov = undefined; setHover(null);
      });
      map.on("click", "district-fill", (e: any) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        if (compareRef.current) {
          const code = String(f.id);
          const cur = pinsRef.current;
          if (cur.find((p) => p.code === code)) {
            map.setFeatureState({ source: "districts", id: code }, { pinned: false });
            setPins(cur.filter((p) => p.code !== code));
          } else {
            if (cur.length >= 2) map.setFeatureState({ source: "districts", id: cur[0].code }, { pinned: false });
            const next = [...cur, { code, name: String(f.properties?.district ?? "—"), state: String(f.properties?.st_nm ?? "") }].slice(-2);
            map.setFeatureState({ source: "districts", id: code }, { pinned: true });
            setPins(next);
          }
        } else if (viewRef.current.level === "state") {
          openDetail({ id: String(f.id), properties: f.properties });
        } else {
          drillToState(String(f.properties?.st_code).padStart(2, "0"), String(f.properties?.st_nm ?? ""));
        }
      });

      let hovSt: string | number | undefined;
      map.on("mousemove", "state-fill", (e: any) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        if (hovSt !== undefined) map.setFeatureState({ source: "states", id: hovSt }, { hover: false });
        hovSt = f.id as string;
        map.setFeatureState({ source: "states", id: hovSt }, { hover: true });
        const code = String(f.id);
        setHover({
          name: String(f.properties?.st_nm ?? "—"), state: "",
          value: code in valuesRef.current ? valuesRef.current[code] : null,
          rank: code in rankRef.current ? rankRef.current[code] : null,
        });
      });
      map.on("mouseleave", "state-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hovSt !== undefined) map.setFeatureState({ source: "states", id: hovSt }, { hover: false });
        hovSt = undefined; setHover(null);
      });
      map.on("click", "state-fill", (e: any) => {
        if (!e.features?.length) return;
        openDetail({ id: String(e.features[0].id), properties: e.features[0].properties });
      });

      setReady(true);

      // restore drill + compare pins from a shared link
      const r = restoreRef.current;
      if (r.st && r.lvl !== "state") drillToState(r.st.padStart(2, "0"), r.stn || "");
      if (r.cmp.length) {
        const restored: Pin[] = [];
        for (const code of r.cmp.slice(0, 2)) {
          const feat = (districts.features as any[]).find((ff) => String(ff.properties?.rid) === code);
          if (feat) {
            restored.push({ code, name: String(feat.properties?.district ?? "—"), state: String(feat.properties?.st_nm ?? "") });
            map.setFeatureState({ source: "districts", id: code }, { pinned: true });
          }
        }
        if (restored.length) { setCompare(true); setPins(restored); }
      }
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drillToState(code: string, name: string) {
    const map = mapRef.current; if (!map) return;
    const f = statesRef.current[String(Number(code))] || statesRef.current[code];
    const flt: any = ["==", ["to-string", ["get", "st_code"]], String(Number(code))];
    map.setFilter("district-fill", flt); map.setFilter("district-line", flt); map.setFilter("state-line", flt);
    if (f) map.fitBounds(bbox(f.geometry) as any, { padding: 50, duration: 750, essential: true });
    setView({ level: "state", code, name });
  }
  function backToNational() {
    const map = mapRef.current; if (!map) return;
    map.setFilter("district-fill", null); map.setFilter("district-line", null); map.setFilter("state-line", null);
    map.fitBounds(INDIA_BOUNDS, { padding: 24, duration: 750, essential: true });
    setView({ level: "national" });
    setDetail(null);
  }
  function clearPins() {
    const map = mapRef.current;
    pinsRef.current.forEach((p) => map?.setFeatureState({ source: "districts", id: p.code }, { pinned: false }));
    setPins([]);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sel || !ready) return;
    let cancelled = false;
    (async () => {
      // metrics existing at only one level force the map to that level
      const meta = metrics.find((x) => x.id === sel);
      if (meta?.levels?.length && !meta.levels.includes(level)) {
        setLevel(meta.levels.includes("district") ? "district" : "state");
        return;
      }
      const md: MetricData = await fetch(`/api/metrics/${sel}?level=${level}`).then((r) => r.json());
      if (cancelled || !md.values) return;
      setData(md); valuesRef.current = md.values;
      const sorted = Object.entries(md.values).sort((a, b) => b[1] - a[1]);
      const ranks: Record<string, number> = {};
      sorted.forEach(([c], i) => (ranks[c] = i + 1));
      rankRef.current = ranks;
      setRange(null); rangeRef.current = null;
      recolor(md, mode);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ready, level, metrics]);

  useEffect(() => { if (data) recolor(data, mode); /* eslint-disable-next-line */ }, [mode, brkMethod, palette, view]);

  // level switch: sync layer visibility; on a real change reset drill/pins/detail
  const prevLevelRef = useRef(init.lvl);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const changed = prevLevelRef.current !== level;
    prevLevelRef.current = level;
    const showState = level === "state";
    map.setLayoutProperty("state-fill", "visibility", showState ? "visible" : "none");
    map.setLayoutProperty("district-fill", "visibility", showState ? "none" : "visible");
    map.setLayoutProperty("district-line", "visibility", showState ? "none" : "visible");
    if (!changed) return;
    clearPins(); setDetail(null); setHover(null);
    if (viewRef.current.level === "state") backToNational();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, ready]);

  // keep the URL in sync so the current view is shareable
  useEffect(() => {
    if (typeof window === "undefined" || minimal) return;
    const p = new URLSearchParams();
    if (sel) p.set("m", sel);
    if (mode !== "value") p.set("mode", mode);
    if (level !== "district") p.set("lvl", level);
    if (brkMethod !== "continuous") p.set("brk", brkMethod);
    if (palette !== "viridis") p.set("pal", palette);
    if (view.level === "state" && view.code) { p.set("st", view.code); if (view.name) p.set("stn", view.name); }
    if (pins.length) p.set("cmp", pins.map((x) => x.code).join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [sel, mode, level, brkMethod, palette, view, pins, minimal]);

  // value-range filter dims regions outside the chosen band
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    const src = levelRef.current === "state" ? "states" : "districts";
    for (const [code, v] of Object.entries(valuesRef.current)) {
      const dim = range ? v < range[0] || v > range[1] : false;
      map.setFeatureState({ source: src, id: code }, { dim });
    }
  }, [range, ready, data]);

  /** mean of the active cohort: drilled-state districts when zoomed, else all */
  function cohortMean(md: MetricData): number {
    const v = viewRef.current;
    if (levelRef.current === "district" && v.level === "state" && v.code) {
      const pref = String(Number(v.code)) + "_";
      const vals = Object.entries(md.values)
        .filter(([c]) => c.startsWith(pref) || c.startsWith(v.code + "_"))
        .map(([, x]) => x);
      if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return md.mean;
  }

  function recolor(md: MetricData, m: "value" | "vs_avg") {
    const map = mapRef.current; if (!map) return;
    const src = levelRef.current === "state" ? "states" : "districts";
    const pinned = new Set(pinsRef.current.map((p) => p.code));
    map.removeFeatureState({ source: "districts" });
    map.removeFeatureState({ source: "states" });
    pinned.forEach((c) => map.setFeatureState({ source: src, id: c }, { pinned: true }));
    const vals = Object.values(md.values);
    const avg = cohortMean(md);
    const maxDev = Math.max(...vals.map((v) => Math.abs(v - avg))) || 1;
    const breaks = m === "value" ? computeBreaks(vals, brkRef.current) : [];
    const fn = PALETTES[palRef.current].fn;
    const rng = rangeRef.current;
    for (const [code, v] of Object.entries(md.values)) {
      const color = m === "vs_avg"
        ? interpolateRdBu(0.5 + Math.max(-0.5, Math.min(0.5, (v - avg) / (2 * maxDev))))
        : colorFor(v, md.min, md.max, breaks, fn);
      const dim = rng ? v < rng[0] || v > rng[1] : false;
      map.setFeatureState({ source: src, id: code }, { color, dim });
    }
  }

  const exportPng = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return;
    const src = map.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const header = Math.round(56 * dpr);
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height + header;
    const ctx = out.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, header);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e6edf3";
    ctx.font = `600 ${Math.round(20 * dpr)}px sans-serif`;
    const title = view.level === "state" && view.name ? `${data.name} · ${view.name}` : data.name;
    ctx.fillText(`${title} (${data.unit})`, 14 * dpr, header * 0.38);
    ctx.fillStyle = "#8b98a5";
    ctx.font = `${Math.round(12 * dpr)}px sans-serif`;
    ctx.fillText(`Source: ${data.source} · ${data.year} · MapsOfBharat`, 14 * dpr, header * 0.74);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    const suffix = view.level === "state" && view.name ? "-" + view.name.replace(/\s+/g, "_") : "";
    a.download = `mapsofbharat-${sel}${suffix}.png`;
    a.click();
  }, [data, sel, view]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const nameOf = new Map(regions.filter((r) => r.level === level).map((r) => [r.code, r]));
    const rows = Object.entries(data.values).map(([code, value]) => ({
      code,
      name: nameOf.get(code)?.name ?? code,
      state: level === "district" ? nameOf.get(code)?.state ?? "" : undefined,
      value,
      rank: rankRef.current[code] ?? null,
    }));
    rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    downloadCsv(
      `mapsofbharat-${sel}-${level}.csv`,
      buildCsv(data.name, data.unit, data.year, data.source, data.license ?? "", level, rows)
    );
  }, [data, regions, level, sel]);

  const copyText = useCallback(async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setGeoMsg("Couldn't copy — copy the address bar manually");
    }
  }, []);

  const copyLink = useCallback(() => copyText(window.location.href, "link"), [copyText]);
  const copyEmbed = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/embed";
    copyText(`<iframe src="${url.toString()}" width="800" height="560" style="border:0;border-radius:8px" loading="lazy" title="MapsOfBharat"></iframe>`, "embed");
  }, [copyText]);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoMsg("Geolocation not supported"); return; }
    setLocating(true); setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const pt: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const fc = districtsFCRef.current;
        const map = mapRef.current;
        if (!fc || !map) { setGeoMsg("Map not ready yet"); return; }
        const feat = (fc.features as any[]).find((f) => pointInFeature(pt, f.geometry));
        if (!feat) { setGeoMsg("You're outside India's mapped districts"); return; }
        const stc = String(feat.properties?.st_code).padStart(2, "0");
        drillToState(stc, String(feat.properties?.st_nm ?? ""));
        map.fitBounds(bbox(feat.geometry) as any, { padding: 80, duration: 900, maxZoom: 9, essential: true });
        const rid = String(feat.properties?.rid);
        openDetail({ id: rid, properties: feat.properties });
        // temporary highlight so "your" district is visually explicit
        map.setFeatureState({ source: "districts", id: rid }, { located: true });
        setTimeout(() => map.setFeatureState({ source: "districts", id: rid }, { located: false }), 5000);
      },
      (err) => {
        setLocating(false);
        setGeoMsg(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [openDetail]);

  // fly to a region from the command palette
  const flyToRegion = useCallback((r: RegionIdx) => {
    const map = mapRef.current; if (!map) return;
    if (r.level === "state") {
      if (levelRef.current === "state") {
        const f = statesRef.current[String(Number(r.code))] || statesRef.current[r.code];
        if (f) map.fitBounds(bbox(f.geometry) as any, { padding: 50, duration: 750, essential: true });
        openDetail({ id: r.code, properties: { st_nm: r.name } });
      } else {
        drillToState(r.code.padStart(2, "0"), r.name);
      }
    } else {
      if (levelRef.current === "state") setLevel("district");
      const feat = (districtsFCRef.current?.features as any[] | undefined)?.find(
        (f) => String(f.properties?.rid) === r.code);
      if (feat) {
        drillToState(String(feat.properties?.st_code).padStart(2, "0"), String(feat.properties?.st_nm ?? ""));
        map.fitBounds(bbox(feat.geometry) as any, { padding: 80, duration: 900, maxZoom: 9, essential: true });
        openDetail({ id: r.code, properties: feat.properties });
      }
    }
  }, [openDetail]);

  const fmt = (v: number | null | undefined, decimals?: number) =>
    v == null ? "no data" : v.toLocaleString("en-IN", { maximumFractionDigits: decimals ?? data?.decimals ?? 0 });
  const pctRank = (rank: number | null, count?: number) => {
    const c = count ?? data?.count;
    return rank == null || !c ? "" : `rank ${rank}/${c} · top ${Math.max(1, Math.round((rank / c) * 100))}%`;
  };

  const categories = useMemo(() => Array.from(new Set(metrics.map((m) => m.category))), [metrics]);
  const breaksForLegend = useMemo(() => {
    if (!data || mode !== "value") return [];
    return computeBreaks(Object.values(data.values), brkMethod);
  }, [data, brkMethod, mode]);
  const rampStops = useMemo(() => {
    const fn = mode === "vs_avg" ? (t: number) => interpolateRdBu(t) : PALETTES[palette].fn;
    return [0, 0.25, 0.5, 0.75, 1].map(fn);
  }, [palette, mode]);

  // ── minimal (embed) chrome: map + legend chip + attribution only ───────
  if (minimal) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <div ref={ref} style={{ position: "absolute", inset: 0 }} />
        {data && (
          <div className="absolute left-3 top-3 z-10 rounded-md border border-border bg-card/90 px-3 py-2 backdrop-blur">
            <div className="text-xs font-semibold">{data.name} <span className="text-foreground-muted">({data.unit})</span></div>
            <div className="mt-1 h-2 w-40 rounded" style={{ background: `linear-gradient(90deg, ${rampStops.join(", ")})` }} />
            <div className="mt-0.5 flex justify-between text-[10px] text-foreground-muted"><span>{fmt(data.min)}</span><span>{fmt(data.max)}</span></div>
          </div>
        )}
        <a href="/explore" target="_blank" rel="noopener noreferrer"
          className="absolute bottom-2 right-2 z-10 rounded bg-card/90 px-2 py-1 text-[10px] text-foreground-muted hover:text-accent-teal">
          MapsOfBharat · {data ? `${data.source} · ${data.year}` : "official data"}
        </a>
        {hover && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
            <div className="font-medium">{hover.name}{hover.state && <span className="text-foreground-muted"> · {hover.state}</span>}</div>
            {data && <div className="text-foreground-muted">{fmt(hover.value)} {hover.value != null ? data.unit : ""}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />

      {/* ── top bar: brand · breadcrumbs · metric chip · ⌘K ─────────────── */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 backdrop-blur">
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
            MapsOf<span className="text-accent-teal">Bharat</span>
          </span>
          <span className="text-foreground-muted">·</span>
          <nav aria-label="Drill trail" className="flex items-center gap-1 text-xs">
            <button onClick={backToNational}
              className={view.level === "state" ? "text-accent-teal hover:underline" : "text-foreground-muted"}>India</button>
            {view.level === "state" && (
              <>
                <span className="text-foreground-muted">›</span>
                <span>{view.name}</span>
                <button onClick={backToNational} aria-label="Back to India" className="ml-1 text-accent-teal hover:underline">← Back to India</button>
              </>
            )}
          </nav>
        </div>
        {data && (
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs backdrop-blur md:flex">
            <span className="font-medium">{data.name}</span>
            <span className="text-foreground-muted">· {data.year}</span>
          </div>
        )}
        <CommandPalette
          metrics={metrics} regions={regions}
          onMetric={(id) => setSel(id)}
          onRegion={flyToRegion}
          onAction={(a) => {
            if (a === "png") exportPng();
            else if (a === "csv") exportCsv();
            else if (a === "link") copyLink();
            else if (a === "embed") copyEmbed();
            else if (a === "locate") locate();
            else if (a === "compare") setCompare((c) => { const n = !c; if (!n) clearPins(); else setDetail(null); return n; })
            else if (a === "methodology") window.open("/methodology", "_blank");
          }}
        />
      </div>

      {/* ── left filter rail ────────────────────────────────────────────── */}
      <div className={`absolute left-4 top-20 z-10 w-72 transition-transform ${railOpen ? "" : "-translate-x-[19.5rem]"}`} aria-label="Filters">
        <button onClick={() => setRailOpen((o) => !o)} aria-label={railOpen ? "Collapse filters" : "Expand filters"} aria-expanded={railOpen}
          className="absolute -right-9 top-0 rounded-md border border-border bg-card/90 px-2 py-1.5 text-sm text-foreground-muted backdrop-blur hover:text-foreground">
          {railOpen ? "‹" : "☰"}
        </button>
        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-lg border border-border bg-card/90 p-4 backdrop-blur">
          {/* category chips */}
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => {
              const active = metrics.find((m) => m.id === sel)?.category === cat;
              return (
                <button key={cat} aria-pressed={active}
                  onClick={() => { const first = metrics.find((m) => m.category === cat); if (first) setSel(first.id); }}
                  className={`rounded-full px-2.5 py-1 text-[11px] capitalize ${active ? "bg-accent-teal text-background" : "border border-border text-foreground-muted hover:border-accent-teal"}`}>
                  {cat}
                </button>
              );
            })}
          </div>

          <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Select metric"
            className="mt-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-teal">
            {categories.map((cat) => {
              const inCat = metrics.filter((m) => m.category === cat);
              return inCat.length ? <optgroup key={cat} label={cat}>{inCat.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null;
            })}
          </select>

          <div className="mt-2 flex gap-1 text-xs">
            <button onClick={() => setLevel("district")} aria-pressed={level === "district"} aria-label="Show district-level map"
              className={`flex-1 rounded px-2 py-1 ${level === "district" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>Districts</button>
            <button onClick={() => setLevel("state")} aria-pressed={level === "state"} aria-label="Show state-level map"
              className={`flex-1 rounded px-2 py-1 ${level === "state" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>States</button>
          </div>

          {/* class breaks + palette (value mode) */}
          {mode === "value" && (
            <>
              <div className="mt-3 text-[11px] font-medium text-foreground-muted">Colour scale</div>
              <div className="mt-1 flex gap-1 text-[11px]">
                {([["continuous", "Smooth"], ["quantile", "Quantile"], ["equal", "Equal"], ["jenks", "Jenks"]] as [BreakMethod, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setBrkMethod(k)} aria-pressed={brkMethod === k}
                    className={`flex-1 rounded px-1.5 py-1 ${brkMethod === k ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                {(Object.keys(PALETTES) as PaletteId[]).map((p) => (
                  <button key={p} onClick={() => setPalette(p)} aria-pressed={palette === p} aria-label={`Palette ${PALETTES[p].name} (${PALETTES[p].note})`} title={`${PALETTES[p].name} — ${PALETTES[p].note}`}
                    className={`h-6 flex-1 rounded border ${palette === p ? "border-accent-teal ring-1 ring-accent-teal" : "border-border"}`}
                    style={{ background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(PALETTES[p].fn).join(",")})` }} />
                ))}
              </div>
            </>
          )}

          {/* value-range filter */}
          {data && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-medium text-foreground-muted">
                <span>Value range</span>
                {range && <button onClick={() => setRange(null)} className="text-accent-teal hover:underline">reset</button>}
              </div>
              <RangeSlider min={data.min} max={data.max} value={range ?? [data.min, data.max]}
                onChange={(lo, hi) => setRange([lo, hi])} fmt={(v) => fmt(v)} />
            </div>
          )}

          {/* legend */}
          {data && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              {mode === "value" && breaksForLegend.length > 0 ? (
                <div className="space-y-0.5">
                  {fmtBin(breaksForLegend, data.min, data.max, data.decimals).map((label, i, arr) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] text-foreground-muted">
                      <span className="h-2.5 w-5 rounded-sm" style={{ background: PALETTES[palette].fn(arr.length <= 1 ? 0 : i / (arr.length - 1)) }} />
                      {label}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="h-2.5 w-full rounded" style={{ background: `linear-gradient(90deg, ${rampStops.join(", ")})` }} />
                  <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
                    <span>{mode === "vs_avg" ? "below" : fmt(data.min)}</span><span>{data.unit}</span><span>{mode === "vs_avg" ? "above" : fmt(data.max)}</span>
                  </div>
                  {mode === "vs_avg" && (
                    <div className="text-center text-[10px] text-foreground-muted">
                      avg {fmt(cohortMean(data))} {data.unit}{view.level === "state" && level === "district" ? " (state avg)" : ""}
                    </div>
                  )}
                </>
              )}
              <div className="mt-2 text-[11px] text-foreground-muted">{data.count} {level === "state" ? "states" : "districts"} · {data.year}</div>
              <div className="text-[10px] leading-tight text-foreground-muted/70">
                Source: {data.source}{data.license ? ` · ${data.license}` : ""}
                {" · "}
                <a href="/methodology" target="_blank" rel="noopener noreferrer" className="text-accent-teal hover:underline">methodology</a>
              </div>
            </div>
          )}
          {!metrics.length && <div className="mt-2 text-xs text-accent-amber">No metrics loaded yet.</div>}
        </div>
      </div>

      {/* ── bottom dock ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur">
        <button onClick={() => setMode("value")} aria-pressed={mode === "value"} className={`rounded-full px-2.5 py-1 ${mode === "value" ? "bg-accent-teal text-background" : "text-foreground-muted hover:text-foreground"}`}>Value</button>
        <button onClick={() => setMode("vs_avg")} aria-pressed={mode === "vs_avg"} className={`rounded-full px-2.5 py-1 ${mode === "vs_avg" ? "bg-accent-teal text-background" : "text-foreground-muted hover:text-foreground"}`}>vs avg</button>
        <button onClick={() => { setCompare((c) => { const n = !c; if (!n) clearPins(); else setDetail(null); return n; }); }} aria-pressed={compare}
          disabled={level === "state"} title={level === "state" ? "Switch to Districts to compare" : undefined}
          className={`rounded-full px-2.5 py-1 disabled:opacity-40 ${compare ? "bg-accent-amber text-background" : "text-foreground-muted hover:text-foreground"}`}>compare</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button onClick={exportPng} disabled={!data} aria-label="Export current map as PNG"
          className="rounded-full px-2.5 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40">PNG</button>
        <button onClick={exportCsv} disabled={!data} aria-label="Download current values as CSV"
          className="rounded-full px-2.5 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40">{copied === "csv" ? "saved!" : "CSV"}</button>
        <button onClick={copyLink} aria-label="Copy shareable link to this view"
          className="rounded-full px-2.5 py-1 text-foreground-muted hover:text-foreground">{copied === "link" ? "copied!" : "Link"}</button>
        <button onClick={copyEmbed} aria-label="Copy iframe embed snippet"
          className="rounded-full px-2.5 py-1 text-foreground-muted hover:text-foreground">{copied === "embed" ? "copied!" : "Embed"}</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button onClick={locate} disabled={locating} aria-label="Find my district using geolocation"
          className="rounded-full px-2.5 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40">{locating ? "…" : "Locate"}</button>
      </div>

      {geoMsg && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-accent-amber shadow-lg">{geoMsg}</div>
      )}
      {compare && pins.length < 2 && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-accent-amber shadow-lg">Click 2 districts to compare</div>
      )}
      {view.level === "state" && !compare && !detail && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-foreground-muted shadow-lg">Click a district for its full profile</div>
      )}

      {/* ── region detail sheet ─────────────────────────────────────────── */}
      {detail && !compare && (
        <div className="absolute right-4 top-4 z-10 max-h-[calc(100dvh-2rem)] w-80 overflow-y-auto rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{detail.name}</div>
              {detail.state && <div className="text-[11px] text-foreground-muted">{detail.state}</div>}
            </div>
            <button onClick={() => setDetail(null)} aria-label="Close region detail" className="text-foreground-muted hover:text-foreground">✕</button>
          </div>
          {detailData === null && <div className="py-4 text-center text-xs text-foreground-muted">Loading profile…</div>}
          {detailData?.length === 0 && <div className="py-4 text-center text-xs text-foreground-muted">No metrics for this region.</div>}
          {detailData && detailData.length > 0 && (
            <div className="space-y-3">
              {Array.from(new Set(detailData.map((m) => m.category))).map((cat) => (
                <div key={cat}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{cat}</div>
                  <div className="space-y-2">
                    {detailData.filter((m) => m.category === cat).map((rm) => (
                      <div key={rm.id} className={`rounded-md border bg-background/40 p-2 ${rm.id === sel ? "border-accent-teal" : "border-border-subtle"}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <button onClick={() => setSel(rm.id)} title="Show on map"
                            className="text-left text-xs text-foreground-muted hover:text-accent-teal">{rm.name}</button>
                          <span className="text-sm font-medium text-foreground">{fmt(rm.value, rm.decimals)} <span className="text-[10px] text-foreground-muted">{rm.unit}</span></span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] text-foreground-muted">
                          <span>{pctRank(rm.rank, rm.count)}</span>
                          <a href={rm.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-teal">{rm.source.split(",")[0]} · {rm.year}</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <a href="/methodology" target="_blank" rel="noopener noreferrer"
                className="block text-center text-[10px] text-foreground-muted hover:text-accent-teal">methodology &amp; caveats →</a>
            </div>
          )}
        </div>
      )}

      {/* ── compare panel ───────────────────────────────────────────────── */}
      {compare && pins.length > 0 && data && (
        <div className="absolute right-4 top-4 z-10 w-64 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-heading)" }}>Compare · {data.name}</span>
            <button onClick={clearPins} className="text-[11px] text-foreground-muted hover:text-foreground">clear</button>
          </div>
          {pins.map((p) => {
            const v = valuesRef.current[p.code];
            const w = v == null ? 0 : Math.max(2, ((v - data.min) / (data.max - data.min || 1)) * 100);
            return (
              <div key={p.code} className="mb-2">
                <div className="flex justify-between text-xs"><span className="truncate">{p.name}</span><span className="text-foreground">{fmt(v)}</span></div>
                <div className="mt-0.5 h-1.5 w-full rounded bg-background"><div className="h-1.5 rounded bg-accent-teal" style={{ width: `${w}%` }} /></div>
                <div className="text-[10px] text-foreground-muted">{p.state} · {pctRank(rankRef.current[p.code] ?? null)}</div>
              </div>
            );
          })}
          {pins.length === 2 && (() => {
            const a = valuesRef.current[pins[0].code], b = valuesRef.current[pins[1].code];
            if (a == null || b == null) return null;
            const diff = a - b;
            return <div className="mt-1 border-t border-border pt-1 text-[11px] text-foreground-muted">Δ {pins[0].name} − {pins[1].name}: <span className="text-foreground">{diff > 0 ? "+" : ""}{fmt(diff)}</span> {data.unit}</div>;
          })()}
        </div>
      )}

      {/* ── hover tooltip ───────────────────────────────────────────────── */}
      {hover && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
          <div className="font-medium">{hover.name}{hover.state && <span className="text-foreground-muted"> · {hover.state}</span>}</div>
          {data && (
            <div className="text-foreground-muted">
              {data.name}: <span className="text-foreground">{fmt(hover.value)}</span> {hover.value != null ? data.unit : ""}
              {hover.rank != null && <span className="ml-1 text-[11px] text-foreground-muted">({pctRank(hover.rank)})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── command palette (⌘K): metrics, places, actions ───────────────────────
function CommandPalette({
  metrics, regions, onMetric, onRegion, onAction,
}: {
  metrics: Metric[]; regions: RegionIdx[];
  onMetric: (id: string) => void; onRegion: (r: RegionIdx) => void; onAction: (a: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o); setQ(""); setActive(0);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  type Item = { kind: "metric" | "region" | "action"; key: string; label: string; sub: string; run: () => void };
  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];
    const actions: [string, string, string][] = [
      ["compare", "Toggle compare mode", "pin two districts side by side"],
      ["png", "Export PNG", "current map with title + source"],
      ["csv", "Download CSV", "current values with citation header"],
      ["link", "Copy shareable link", "this exact view"],
      ["embed", "Copy embed snippet", "iframe for your site"],
      ["locate", "Find my district", "geolocation"],
      ["methodology", "Methodology & caveats", "how every number is computed"],
    ];
    if (!needle) {
      for (const m of metrics.slice(0, 6)) out.push({ kind: "metric", key: m.id, label: m.name, sub: `${m.category} · ${m.year}`, run: () => onMetric(m.id) });
      for (const [a, label, sub] of actions) out.push({ kind: "action", key: a, label, sub, run: () => onAction(a) });
      return out;
    }
    for (const m of metrics) {
      if (m.name.toLowerCase().includes(needle) || m.category.toLowerCase().includes(needle))
        out.push({ kind: "metric", key: m.id, label: m.name, sub: `${m.category} · ${m.year}`, run: () => onMetric(m.id) });
    }
    for (const r of regions) {
      if (r.name.toLowerCase().includes(needle))
        out.push({ kind: "region", key: `${r.level}-${r.code}`, label: r.name, sub: r.level === "state" ? "state" : `district · ${r.state ?? ""}`, run: () => onRegion(r) });
      if (out.length > 40) break;
    }
    for (const [a, label, sub] of actions) {
      if (label.toLowerCase().includes(needle)) out.push({ kind: "action", key: a, label, sub, run: () => onAction(a) });
    }
    return out.slice(0, 14);
  }, [q, metrics, regions, onMetric, onRegion, onAction]);

  return (
    <>
      <button onClick={() => { setOpen(true); setQ(""); setActive(0); }} aria-label="Open search (Ctrl+K)"
        className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-foreground-muted backdrop-blur hover:border-accent-teal hover:text-foreground">
        <span>Search metrics &amp; places</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}
            className="mx-auto mt-[12dvh] w-[min(34rem,92vw)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <input ref={inputRef} value={q} aria-label="Search metrics, states, districts and actions"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter" && items[active]) { items[active].run(); setOpen(false); }
              }}
              placeholder="literacy… Pune… export CSV…"
              className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-foreground-muted/60" />
            <ul className="max-h-[50dvh] overflow-y-auto p-1.5">
              {items.map((it, i) => (
                <li key={`${it.kind}-${it.key}`}>
                  <button onClick={() => { it.run(); setOpen(false); }} onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${i === active ? "bg-elevated text-foreground" : "text-foreground-muted"}`}>
                    <span>{it.label}</span>
                    <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wide text-foreground-muted/70">{it.sub}</span>
                  </button>
                </li>
              ))}
              {!items.length && <li className="px-3 py-4 text-center text-xs text-foreground-muted">Nothing matches.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// ── dual-thumb value-range slider (two native ranges, accessible) ────────
function RangeSlider({
  min, max, value, onChange, fmt,
}: {
  min: number; max: number; value: [number, number];
  onChange: (lo: number, hi: number) => void; fmt: (v: number) => string;
}) {
  const span = max - min || 1;
  const step = span / 200;
  const [lo, hi] = value;
  return (
    <div className="mt-1">
      <div className="relative h-6">
        <input type="range" aria-label="Minimum value" min={min} max={max} step={step} value={lo}
          onChange={(e) => onChange(Math.min(Number(e.target.value), hi), hi)}
          className="pointer-events-none absolute inset-x-0 top-1.5 h-1 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-teal" />
        <input type="range" aria-label="Maximum value" min={min} max={max} step={step} value={hi}
          onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo))}
          className="pointer-events-none absolute inset-x-0 top-1.5 h-1 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-teal" />
        <div className="absolute inset-x-0 top-2.5 h-1 rounded bg-background" />
        <div className="absolute top-2.5 h-1 rounded bg-accent-teal/60"
          style={{ left: `${((lo - min) / span) * 100}%`, right: `${100 - ((hi - min) / span) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-foreground-muted"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
    </div>
  );
}
