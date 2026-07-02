"use client";

// Editorial indicator chooser (iter-51 item 385): left topic index with a
// sliding accent bar, right metric list with unit + source per row.
// Fed entirely by the live /api/metrics taxonomy.

import { useMemo, useState } from "react";
import { Metric, CAT_DESC, CAT_ICON, catAccent, hexA, orderedCategories } from "./cats";

export function ChooserModal({
  metrics, selected, onPick, onClose,
}: {
  metrics: Metric[]; selected: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const cats = useMemo(() => orderedCategories(metrics), [metrics]);
  const selCat = metrics.find((m) => m.id === selected)?.category;
  const [cat, setCat] = useState<string>(selCat && cats.includes(selCat) ? selCat : cats[0] ?? "demographics");
  const accent = catAccent(cat);
  const inCat = metrics.filter((m) => m.category === cat);
  const catIdx = Math.max(0, cats.indexOf(cat));

  return (
    <div className="atl-fade fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(7,8,11,.74)" }} onClick={onClose}>
      <div
        role="dialog" aria-label="Choose an indicator" onClick={(e) => e.stopPropagation()}
        className="atl-pop flex h-[540px] w-[760px] max-w-[94vw] flex-col overflow-hidden border border-border bg-panel-solid"
        style={{ boxShadow: "0 30px 70px rgba(0,0,0,.55)" }}
      >
        <div className="flex flex-none items-baseline justify-between border-b border-border-soft px-6 pb-4 pt-5">
          <div>
            <div className="text-[21px] font-extrabold tracking-tight text-bright">Choose an indicator</div>
            <div className="mt-0.5 text-[13px] text-muted">Hover a topic, then pick a statistic to map.</div>
          </div>
          <button onClick={onClose} className="text-[11px] font-semibold text-dim hover:text-foreground">✕ ESC</button>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* left topic index */}
          <div className="relative w-[262px] flex-none border-r border-border-faint py-4">
            <div className="px-6 pb-3 font-mono text-[10px] tracking-[.14em] text-faint">TOPICS</div>
            <div
              className="absolute left-0 w-[3px] transition-transform duration-300"
              style={{ height: 58, background: accent, transform: `translateY(${catIdx * 58}px)`, transitionTimingFunction: "cubic-bezier(.4,0,.2,1)" }}
            />
            {cats.map((c) => {
              const on = c === cat;
              const count = metrics.filter((m) => m.category === c).length;
              return (
                <button
                  key={c} onMouseEnter={() => setCat(c)} onClick={() => setCat(c)}
                  className="block h-[58px] w-full px-6 text-left transition-colors"
                  style={{ background: on ? "#17130e" : "transparent" }}
                >
                  <div className="text-[18px] font-bold capitalize tracking-tight" style={{ color: on ? "#eae4d6" : "#8a8477" }}>{c}</div>
                  <div className="text-[11px] text-faint">{count} indicator{count === 1 ? "" : "s"}</div>
                </button>
              );
            })}
          </div>
          {/* right metric list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-none items-center gap-3 border-b border-border-faint px-6 pb-3 pt-5">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ background: hexA(accent, 0.16) }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={CAT_ICON[cat] ?? CAT_ICON.demographics} />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-[21px] font-extrabold capitalize tracking-tight text-bright">{cat}</div>
                <div className="text-[11.5px] text-faint">{CAT_DESC[cat] ?? "Official statistics"}</div>
              </div>
            </div>
            <div className="atl-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
              {inCat.map((m, i) => {
                const active = m.id === selected;
                return (
                  <button
                    key={m.id} onClick={() => onPick(m.id)}
                    className="flex w-full items-baseline gap-3 border-b border-border-faint px-3 py-3 text-left transition-colors hover:bg-elevated"
                    style={{ background: active ? "#241a12" : undefined }}
                  >
                    <span className="w-5 flex-none font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[15px] font-bold text-bright">
                        {m.name} {active && <span className="text-[11px]" style={{ color: accent }}>●</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">
                        {m.levels?.includes("district") ? (m.levels.includes("state") ? "Districts & states" : "Districts only") : "States only"} · {m.year}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block font-mono text-[9.5px] uppercase text-faint">{m.unit}</span>
                      <span className="text-[9px] font-semibold text-dim">{m.source.split(",")[0]}</span>
                    </span>
                  </button>
                );
              })}
              {!inCat.length && (
                <div className="mx-3 mt-2 rounded-md border border-dashed border-border-soft px-4 py-3 text-[12px] leading-relaxed text-dim">
                  No indicators in this topic yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
