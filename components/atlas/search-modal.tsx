"use client";

// Ctrl/Cmd-K search (Atlas): indicators + places. Actions moved to the
// visible toolbar/chooser in the Atlas layout (iter-51 item 384).

import { useEffect, useMemo, useRef, useState } from "react";
import { Metric } from "./cats";

export type RegionIdx = { level: "district" | "state"; code: string; name: string; st_code: string; state: string | null };

export function SearchModal({
  open, metrics, regions, valueOf, onMetric, onRegion, onClose,
}: {
  open: boolean; metrics: Metric[]; regions: RegionIdx[];
  valueOf: (code: string) => string | null;
  onMetric: (id: string) => void; onRegion: (r: RegionIdx) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  type Item = { kind: "metric" | "region"; key: string; label: string; tag: string; meta: string; run: () => void };
  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];
    if (!needle) {
      for (const m of metrics.slice(0, 7))
        out.push({ kind: "metric", key: m.id, label: m.name, tag: "", meta: `${m.category.toUpperCase()} · ${m.year}`, run: () => onMetric(m.id) });
      return out;
    }
    for (const m of metrics) {
      if (m.name.toLowerCase().includes(needle) || m.category.toLowerCase().includes(needle))
        out.push({ kind: "metric", key: m.id, label: m.name, tag: "", meta: `${m.category.toUpperCase()} · ${m.source.split(",")[0]}`, run: () => onMetric(m.id) });
      if (out.length > 8) break;
    }
    let places = 0;
    for (const r of regions) {
      if (r.name.toLowerCase().includes(needle)) {
        out.push({
          kind: "region", key: `${r.level}-${r.code}`, label: r.name,
          tag: r.level === "state" ? "state" : r.state ?? "district",
          meta: valueOf(r.code) ?? "", run: () => onRegion(r),
        });
        if (++places > 8) break;
      }
    }
    return out;
  }, [q, metrics, regions, valueOf, onMetric, onRegion]);

  if (!open) return null;
  const metricItems = items.filter((i) => i.kind === "metric");
  const placeItems = items.filter((i) => i.kind === "region");

  const row = (it: Item, i: number) => (
    <button
      key={`${it.kind}-${it.key}`}
      onClick={() => { it.run(); onClose(); }} onMouseEnter={() => setActive(items.indexOf(it))}
      className="flex w-full items-baseline justify-between border-b border-border-faint px-2 py-2 text-left hover:bg-elevated"
      style={{ background: items.indexOf(it) === active ? "#1a1712" : undefined }}
    >
      <span className="text-[14px] font-semibold text-bright">
        {it.label} {it.tag && <span className="text-[10px] font-medium text-dim">{it.tag}</span>}
      </span>
      <span className="font-mono text-[10px] text-muted">{it.meta}</span>
    </button>
  );

  return (
    <div className="atl-fade fixed inset-0 z-50 flex justify-center pt-[14vh]" style={{ background: "rgba(7,8,11,.72)" }} onClick={onClose}>
      <div
        role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}
        className="atl-pop flex h-fit max-h-[66vh] w-[500px] max-w-[92vw] flex-col border border-border bg-panel-solid px-5 pb-4 pt-4"
      >
        <div className="flex flex-none items-center gap-3 border-b border-border pb-2.5">
          <span className="h-3.5 w-3.5 flex-none rounded-full border-[1.5px] border-faint" />
          <input
            ref={inputRef} value={q} aria-label="Search places and indicators"
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && items[active]) { items[active].run(); onClose(); }
            }}
            placeholder="Type a state, district or indicator…"
            className="flex-1 bg-transparent text-[15px] text-bright placeholder:text-dim"
          />
          <button onClick={onClose} className="text-[10.5px] font-semibold text-dim hover:text-foreground">ESC</button>
        </div>
        <div className="atl-scroll min-h-0 overflow-y-auto">
          {metricItems.length > 0 && (
            <>
              <div className="mt-3 text-[9.5px] font-bold tracking-[.14em] text-faint">INDICATORS</div>
              {metricItems.map(row)}
            </>
          )}
          {placeItems.length > 0 && (
            <>
              <div className="mt-3 text-[9.5px] font-bold tracking-[.14em] text-faint">PLACES</div>
              {placeItems.map(row)}
            </>
          )}
        </div>
        <div className="mt-3 flex-none text-[11.5px] text-dim">
          {q.trim() ? (items.length ? "" : "Nothing matches — try a state, district or 'literacy'.") : "Try 'Pune', 'crime' or 'Kerala'."}
        </div>
      </div>
    </div>
  );
}
