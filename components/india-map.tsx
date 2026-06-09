"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { interpolateViridis, interpolateRdBu } from "d3-scale-chromatic";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#1c2530";

type Metric = { id: string; name: string; category: string; unit: string; year: number; source: string; higher_is_better: number | null };
type MetricData = {
  name: string; unit: string; year: number; source: string; decimals: number;
  min: number; max: number; mean: number; count: number; values: Record<string, number>;
};
type View = { level: "national" | "state"; code?: string; name?: string };
type Pin = { code: string; name: string; state: string };

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

export default function IndiaMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  const rankRef = useRef<Record<string, number>>({});
  const statesRef = useRef<Record<string, any>>({});
  const loadedRef = useRef(false);
  const compareRef = useRef(false);
  const pinsRef = useRef<Pin[]>([]);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sel, setSel] = useState<string>("");
  const [data, setData] = useState<MetricData | null>(null);
  const [mode, setMode] = useState<"value" | "vs_avg">("value");
  const [view, setView] = useState<View>({ level: "national" });
  const [compare, setCompare] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [hover, setHover] = useState<{ name: string; state: string; value: number | null; rank: number | null } | null>(null);

  useEffect(() => { compareRef.current = compare; }, [compare]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b0f14" } }] },
      bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 24 },
      attributionControl: false, maxZoom: 12, minZoom: 3, dragRotate: false,
    });
    mapRef.current = map;
    (window as any).__mob_map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", async () => {
      map.resize();
      const [districts, states] = await Promise.all([
        fetch("/geo/districts.geojson").then((r) => r.json()),
        fetch("/geo/states.geojson").then((r) => r.json()),
      ]);
      (states.features as any[]).forEach((f) => { statesRef.current[String(f.properties?.st_code)] = f; });
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "dt_code" });
      map.addSource("states", { type: "geojson", data: states });
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
        } else {
          drillToState(String(f.properties?.st_code).padStart(2, "0"), String(f.properties?.st_nm ?? ""));
        }
      });

      loadedRef.current = true;
      const m = await fetch("/api/metrics").then((r) => r.json());
      const list: Metric[] = m.metrics || [];
      setMetrics(list);
      if (list.length) setSel(list.find((x) => x.id === "literacy_rate")?.id ?? list[0].id);
    });

    return () => { map.remove(); mapRef.current = null; };
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
  }
  function clearPins() {
    const map = mapRef.current;
    pinsRef.current.forEach((p) => map?.setFeatureState({ source: "districts", id: p.code }, { pinned: false }));
    setPins([]);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sel || !loadedRef.current) return;
    let cancelled = false;
    (async () => {
      const md: MetricData = await fetch(`/api/metrics/${sel}`).then((r) => r.json());
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
  }, [sel]);

  useEffect(() => { if (data) recolor(data, mode); /* eslint-disable-next-line */ }, [mode]);

  function recolor(md: MetricData, m: "value" | "vs_avg") {
    const map = mapRef.current; if (!map) return;
    const pinned = new Set(pinsRef.current.map((p) => p.code));
    map.removeFeatureState({ source: "districts" });
    pinned.forEach((c) => map.setFeatureState({ source: "districts", id: c }, { pinned: true }));
    const span = md.max - md.min || 1;
    const maxDev = Math.max(...Object.values(md.values).map((v) => Math.abs(v - md.mean))) || 1;
    for (const [code, v] of Object.entries(md.values)) {
      const color = m === "vs_avg"
        ? interpolateRdBu(0.5 + Math.max(-0.5, Math.min(0.5, (v - md.mean) / (2 * maxDev))))
        : interpolateViridis(Math.max(0, Math.min(1, (v - md.min) / span)));
      map.setFeatureState({ source: "districts", id: code }, { color });
    }
  }

  const fmt = (v: number | null | undefined) => (v == null ? "no data" : v.toLocaleString("en-IN", { maximumFractionDigits: data?.decimals ?? 0 }));
  const pctRank = (rank: number | null) => (rank == null || !data ? "" : `rank ${rank}/${data.count} · top ${Math.max(1, Math.round((rank / data.count) * 100))}%`);
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
        <select value={sel} onChange={(e) => setSel(e.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-teal">
          {["demographics", "livelihood"].map((cat) => {
            const inCat = metrics.filter((m) => m.category === cat);
            return inCat.length ? <optgroup key={cat} label={cat}>{inCat.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null;
          })}
        </select>
        <div className="mt-2 flex gap-1 text-xs">
          <button onClick={() => setMode("value")} className={`flex-1 rounded px-2 py-1 ${mode === "value" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>Value</button>
          <button onClick={() => setMode("vs_avg")} className={`flex-1 rounded px-2 py-1 ${mode === "vs_avg" ? "bg-accent-teal text-background" : "border border-border text-foreground-muted"}`}>vs avg</button>
          <button onClick={() => { setCompare((c) => { const n = !c; if (!n) clearPins(); return n; }); }}
            className={`flex-1 rounded px-2 py-1 ${compare ? "bg-accent-amber text-background" : "border border-border text-foreground-muted"}`}>compare</button>
        </div>
        {compare && <div className="mt-1 text-[11px] text-accent-amber">Click 2 districts to compare</div>}
        {data && (
          <div className="mt-3">
            <div className="h-2.5 w-full rounded" style={{ background: `linear-gradient(90deg, ${ramp(mode).join(", ")})` }} />
            <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
              <span>{mode === "vs_avg" ? "below" : fmt(data.min)}</span><span>{data.unit}</span><span>{mode === "vs_avg" ? "above" : fmt(data.max)}</span>
            </div>
            {mode === "vs_avg" && <div className="text-center text-[10px] text-foreground-muted">avg {fmt(data.mean)} {data.unit}</div>}
            <div className="mt-2 text-[11px] text-foreground-muted">{data.count} districts · Census {data.year}</div>
            <div className="text-[10px] leading-tight text-foreground-muted/70">Source: {data.source} · GODL-India</div>
          </div>
        )}
        {!metrics.length && <div className="mt-2 text-xs text-accent-amber">No metrics loaded yet.</div>}
      </div>

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
          <div className="font-medium">{hover.name}<span className="text-foreground-muted"> · {hover.state}</span></div>
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
