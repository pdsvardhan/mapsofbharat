"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { interpolateViridis } from "d3-scale-chromatic";

const INDIA_BOUNDS: [number, number, number, number] = [67, 6, 98, 37];
const NEUTRAL = "#1c2530";

type Metric = { id: string; name: string; category: string; unit: string; year: number; source: string };
type MetricData = {
  name: string; unit: string; year: number; source: string;
  decimals: number; min: number; max: number; count: number; values: Record<string, number>;
};

export default function IndiaMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const valuesRef = useRef<Record<string, number>>({});
  const loadedRef = useRef(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sel, setSel] = useState<string>("");
  const [data, setData] = useState<MetricData | null>(null);
  const [hover, setHover] = useState<{ name: string; state: string; value: number | null } | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b0f14" } }] },
      bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 24 }, attributionControl: false, maxZoom: 12, minZoom: 3,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", async () => {
      const [districts, states] = await Promise.all([
        fetch("/geo/districts.geojson").then((r) => r.json()),
        fetch("/geo/states.geojson").then((r) => r.json()),
      ]);
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "dt_code" });
      map.addSource("states", { type: "geojson", data: states });
      map.addLayer({
        id: "district-fill", type: "fill", source: "districts",
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], NEUTRAL],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.85],
        },
      });
      map.addLayer({ id: "district-line", type: "line", source: "districts", paint: { "line-color": "#0b0f14", "line-width": 0.3 } });
      map.addLayer({ id: "state-line", type: "line", source: "states", paint: { "line-color": "#4b5d72", "line-width": 1 } });

      let hoveredId: string | number | undefined;
      map.on("mousemove", "district-fill", (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        if (hoveredId !== undefined) map.setFeatureState({ source: "districts", id: hoveredId }, { hover: false });
        hoveredId = f.id as string;
        map.setFeatureState({ source: "districts", id: hoveredId }, { hover: true });
        const code = String(f.id);
        setHover({
          name: String(f.properties?.district ?? "—"),
          state: String(f.properties?.st_nm ?? ""),
          value: code in valuesRef.current ? valuesRef.current[code] : null,
        });
      });
      map.on("mouseleave", "district-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredId !== undefined) map.setFeatureState({ source: "districts", id: hoveredId }, { hover: false });
        hoveredId = undefined;
        setHover(null);
      });

      loadedRef.current = true;
      const m = await fetch("/api/metrics").then((r) => r.json());
      const list: Metric[] = m.metrics || [];
      setMetrics(list);
      if (list.length) setSel(list.find((x) => x.id === "literacy_rate")?.id ?? list[0].id);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sel || !loadedRef.current) return;
    let cancelled = false;
    (async () => {
      const md: MetricData = await fetch(`/api/metrics/${sel}`).then((r) => r.json());
      if (cancelled || !md.values) return;
      setData(md);
      valuesRef.current = md.values;
      map.removeFeatureState({ source: "districts" });
      const span = md.max - md.min || 1;
      for (const [code, v] of Object.entries(md.values)) {
        const t = Math.max(0, Math.min(1, (Number(v) - md.min) / span));
        map.setFeatureState({ source: "districts", id: code }, { color: interpolateViridis(t) });
      }
    })();
    return () => { cancelled = true; };
  }, [sel]);

  const fmt = (v: number | null) =>
    v == null ? "no data" : v.toLocaleString("en-IN", { maximumFractionDigits: data?.decimals ?? 0 });

  return (
    <div className="relative h-dvh w-full bg-background">
      <div ref={ref} className="absolute inset-0" />

      <div className="absolute left-4 top-4 z-10 w-72 rounded-lg border border-border bg-card/90 p-4 backdrop-blur">
        <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          MapsOf<span className="text-accent-teal">Bharat</span> · districts
        </div>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-teal"
        >
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {data && (
          <div className="mt-3">
            <div
              className="h-2.5 w-full rounded"
              style={{ background: `linear-gradient(90deg, ${interpolateViridis(0)}, ${interpolateViridis(0.25)}, ${interpolateViridis(0.5)}, ${interpolateViridis(0.75)}, ${interpolateViridis(1)})` }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
              <span>{fmt(data.min)}</span>
              <span>{data.unit}</span>
              <span>{fmt(data.max)}</span>
            </div>
            <div className="mt-2 text-[11px] text-foreground-muted">{data.count} districts · Census {data.year}</div>
            <div className="text-[10px] leading-tight text-foreground-muted/70">Source: {data.source} · GODL-India</div>
          </div>
        )}
        {!metrics.length && <div className="mt-2 text-xs text-accent-amber">No metrics loaded yet.</div>}
      </div>

      {hover && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
          <div className="font-medium">{hover.name}<span className="text-foreground-muted"> · {hover.state}</span></div>
          {data && (
            <div className="text-foreground-muted">
              {data.name}: <span className="text-foreground">{fmt(hover.value)}</span> {hover.value != null ? data.unit : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
