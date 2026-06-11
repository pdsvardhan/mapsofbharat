"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { interpolateViridis, interpolateRdBu } from "d3-scale-chromatic";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#1c2530";

type Metric = { id: string; name: string; category: string; unit: string; year: number; source: string; higher_is_better: number | null; levels?: string[] };
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
  value: number; rank: number; count: number;
};

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
    return { m: "", mode: "value" as const, st: "", stn: "", cmp: [] as string[], lvl: "district" as const };
  const p = new URLSearchParams(window.location.search);
  return {
    m: p.get("m") || "",
    mode: (p.get("mode") === "vs_avg" ? "vs_avg" : "value") as "value" | "vs_avg",
    st: p.get("st") || "",
    stn: p.get("stn") || "",
    cmp: (p.get("cmp") || "").split(",").filter(Boolean),
    lvl: (p.get("lvl") === "state" ? "state" : "district") as "district" | "state",
  };
}

export default function IndiaMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  const rankRef = useRef<Record<string, number>>({});
  const statesRef = useRef<Record<string, any>>({});
  const districtsFCRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const compareRef = useRef(false);
  const pinsRef = useRef<Pin[]>([]);
  const viewRef = useRef<View>({ level: "national" });
  const restoreRef = useRef(readUrl());

  const init = restoreRef.current;
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sel, setSel] = useState<string>(init.m || "");
  const [data, setData] = useState<MetricData | null>(null);
  const [mode, setMode] = useState<"value" | "vs_avg">(init.mode);
  const [level, setLevel] = useState<"district" | "state">(init.lvl);
  const levelRef = useRef<"district" | "state">(init.lvl);
  const [view, setView] = useState<View>({ level: "national" });
  const [compare, setCompare] = useState(init.cmp.length > 0);
  const [pins, setPins] = useState<Pin[]>([]);
  const [hover, setHover] = useState<{ name: string; state: string; value: number | null; rank: number | null } | null>(null);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailData, setDetailData] = useState<RegionMetric[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { compareRef.current = compare; }, [compare]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { levelRef.current = level; }, [level]);

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

  // F1: metric list loads on mount, independent of the map render.
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
    return () => { cancelled = true; };
  }, []);

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
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.88],
          "fill-color-transition": { duration: 350 },
          "fill-opacity-transition": { duration: 150 },
        },
      } as any);
      map.addLayer({
        id: "district-line", type: "line", source: "districts",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "pinned"], false], "#f59e0b", "#0b0f14"],
          "line-width": ["case", ["boolean", ["feature-state", "pinned"], false], 2.5, 0.3],
        } as any,
      });
      map.addLayer({
        id: "state-fill", type: "fill", source: "states",
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.88],
          "fill-color-transition": { duration: 350 },
          "fill-opacity-transition": { duration: 150 },
        },
      } as any);
      map.addLayer({ id: "state-line", type: "line", source: "states", paint: { "line-color": "#4b5d72", "line-width": 1 } });

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

      loadedRef.current = true;
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
      // metrics existing at only one level (state-only economy, district-only
      // NFHS) force the map to that level instead of rendering empty
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
      recolor(md, mode);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ready, level, metrics]);

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

  useEffect(() => { if (data) recolor(data, mode); /* eslint-disable-next-line */ }, [mode]);

  // keep the URL in sync so the current view is shareable
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams();
    if (sel) p.set("m", sel);
    if (mode !== "value") p.set("mode", mode);
    if (level !== "district") p.set("lvl", level);
    if (view.level === "state" && view.code) { p.set("st", view.code); if (view.name) p.set("stn", view.name); }
    if (pins.length) p.set("cmp", pins.map((x) => x.code).join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [sel, mode, level, view, pins]);

  function recolor(md: MetricData, m: "value" | "vs_avg") {
    const map = mapRef.current; if (!map) return;
    const src = levelRef.current === "state" ? "states" : "districts";
    const pinned = new Set(pinsRef.current.map((p) => p.code));
    map.removeFeatureState({ source: "districts" });
    map.removeFeatureState({ source: "states" });
    pinned.forEach((c) => map.setFeatureState({ source: src, id: c }, { pinned: true }));
    const span = md.max - md.min || 1;
    const maxDev = Math.max(...Object.values(md.values).map((v) => Math.abs(v - md.mean))) || 1;
    for (const [code, v] of Object.entries(md.values)) {
      const color = m === "vs_avg"
        ? interpolateRdBu(0.5 + Math.max(-0.5, Math.min(0.5, (v - md.mean) / (2 * maxDev))))
        : interpolateViridis(Math.max(0, Math.min(1, (v - md.min) / span)));
      map.setFeatureState({ source: src, id: code }, { color });
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

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setGeoMsg("Couldn't copy — copy the address bar manually");
    }
  }, []);

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
        openDetail({ id: String(feat.properties?.rid), properties: feat.properties });
      },
      (err) => {
        setLocating(false);
        setGeoMsg(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [openDetail]);

  const fmt = (v: number | null | undefined, decimals?: number) =>
    v == null ? "no data" : v.toLocaleString("en-IN", { maximumFractionDigits: decimals ?? data?.decimals ?? 0 });
  const pctRank = (rank: number | null, count?: number) => {
    const c = count ?? data?.count;
    return rank == null || !c ? "" : `rank ${rank}/${c} · top ${Math.max(1, Math.round((rank / c) * 100))}%`;
  };
  const ramp = (m: "value" | "vs_avg") => (m === "vs_avg" ? [interpolateRdBu(0), interpolateRdBu(0.5), interpolateRdBu(1)] : [interpolateViridis(0), interpolateViridis(0.5), interpolateViridis(1)]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />

      <div className="absolute left-4 top-4 z-10 w-72 rounded-lg border border-border bg-card/90 p-4 backdrop-blur">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          MapsOf<span className="text-accent-teal">Bharat</span>
          <span className="truncate text-foreground-muted">· {view.level === "state" ? view.name : "all districts"}</span>
        </div>
        {view.level === "state" && <button onClick={backToNational} className="mt-2 text-xs text-accent-teal hover:underline">← Back to India</button>}
        <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Select metric"
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-teal">
          {Array.from(new Set(metrics.map((m) => m.category))).map((cat) => {
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
        <div className="mt-1 flex gap-1 text-xs">
          <button onClick={() => setMode("value")} aria-pressed={mode === "value"} className={`flex-1 rounded px-2 py-1 ${mode === "value" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>Value</button>
          <button onClick={() => setMode("vs_avg")} aria-pressed={mode === "vs_avg"} className={`flex-1 rounded px-2 py-1 ${mode === "vs_avg" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>vs avg</button>
          <button onClick={() => { setCompare((c) => { const n = !c; if (!n) clearPins(); else setDetail(null); return n; }); }} aria-pressed={compare}
            disabled={level === "state"} title={level === "state" ? "Switch to Districts to compare" : undefined}
            className={`flex-1 rounded px-2 py-1 disabled:opacity-40 ${compare ? "bg-accent-amber text-background" : "border border-border text-foreground-muted"}`}>compare</button>
        </div>
        <div className="mt-1 flex gap-1 text-xs">
          <button onClick={exportPng} disabled={!data} aria-label="Export current map as PNG"
            className="flex-1 rounded border border-border px-2 py-1 text-foreground-muted hover:border-accent-teal disabled:opacity-40">PNG</button>
          <button onClick={copyLink} aria-label="Copy shareable link to this view"
            className="flex-1 rounded border border-border px-2 py-1 text-foreground-muted hover:border-accent-teal">{copied ? "copied!" : "Link"}</button>
          <button onClick={locate} disabled={locating} aria-label="Find my district using geolocation"
            className="flex-1 rounded border border-border px-2 py-1 text-foreground-muted hover:border-accent-teal disabled:opacity-40">{locating ? "…" : "Locate"}</button>
        </div>
        {geoMsg && <div className="mt-1 text-[11px] text-accent-amber">{geoMsg}</div>}
        {compare && <div className="mt-1 text-[11px] text-accent-amber">Click 2 districts to compare</div>}
        {view.level === "state" && !compare && <div className="mt-1 text-[11px] text-foreground-muted">Click a district for its full profile</div>}
        {data && (
          <div className="mt-3">
            <div className="h-2.5 w-full rounded" style={{ background: `linear-gradient(90deg, ${ramp(mode).join(", ")})` }} />
            <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
              <span>{mode === "vs_avg" ? "below" : fmt(data.min)}</span><span>{data.unit}</span><span>{mode === "vs_avg" ? "above" : fmt(data.max)}</span>
            </div>
            {mode === "vs_avg" && <div className="text-center text-[10px] text-foreground-muted">avg {fmt(data.mean)} {data.unit}</div>}
            <div className="mt-2 text-[11px] text-foreground-muted">{data.count} {level === "state" ? "states" : "districts"} · {data.year}</div>
            <div className="text-[10px] leading-tight text-foreground-muted/70">Source: {data.source}{data.license ? ` · ${data.license}` : ""}</div>
          </div>
        )}
        {!metrics.length && <div className="mt-2 text-xs text-accent-amber">No metrics loaded yet.</div>}
      </div>

      {/* region detail panel */}
      {detail && !compare && (
        <div className="absolute right-4 top-4 z-10 max-h-[calc(100dvh-2rem)] w-72 overflow-y-auto rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{detail.name}</div>
              <div className="text-[11px] text-foreground-muted">{detail.state}</div>
            </div>
            <button onClick={() => setDetail(null)} aria-label="Close region detail" className="text-foreground-muted hover:text-foreground">✕</button>
          </div>
          {detailData === null && <div className="py-4 text-center text-xs text-foreground-muted">Loading profile…</div>}
          {detailData?.length === 0 && <div className="py-4 text-center text-xs text-foreground-muted">No metrics for this district.</div>}
          {detailData && detailData.length > 0 && (
            <div className="space-y-2">
              {detailData.map((rm) => (
                <div key={rm.id} className="rounded-md border border-border-subtle bg-background/40 p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-foreground-muted">{rm.name}</span>
                    <span className="text-sm font-medium text-foreground">{fmt(rm.value, rm.decimals)} <span className="text-[10px] text-foreground-muted">{rm.unit}</span></span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-foreground-muted">
                    <span>{pctRank(rm.rank, rm.count)}</span>
                    <a href={rm.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-teal">{rm.source} ·{rm.year}</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* compare panel */}
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
