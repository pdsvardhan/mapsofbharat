"use client";

// Atlas left stack (iter-51 items 384/392/393): breadcrumb chip, indicator
// card (with START HERE empty state), level + map-colour card, and the
// editorial legend with real break values + the 4-method Scale popover.
// The value-range slider is retired (item 397, adr-015).

import { BreakMethod, PALETTES, PaletteId, computeBreaks, fmtBin } from "@/lib/breaks";

export function Crumbs({
  items, hasBack, onBack,
}: {
  items: { label: string; on: boolean; onClick: () => void }[];
  hasBack: boolean; onBack: () => void;
}) {
  return (
    <nav
      aria-label="Drill trail"
      className="flex w-fit max-w-full flex-wrap items-center gap-2 border border-border px-[11px] py-[7px] text-[11px] font-semibold tracking-[.06em]"
      style={{ background: "var(--panel)" }}
    >
      {hasBack && (
        <button onClick={onBack} aria-label="Back" className="text-dim hover:text-foreground">‹</button>
      )}
      {items.map((c, i) => (
        <span key={c.label + i} className="flex items-center gap-2">
          <button onClick={c.onClick} style={{ color: c.on ? "#eae4d6" : "#a49d8c" }} className="hover:text-foreground">
            {c.label}
          </button>
          {i < items.length - 1 && <span style={{ color: "#4a4433" }}>/</span>}
        </span>
      ))}
    </nav>
  );
}

export function IndicatorCard({
  metricName, metricDesc, srcShort, onOpenChooser,
}: {
  metricName: string | null; metricDesc: string; srcShort: string; onOpenChooser: () => void;
}) {
  return (
    <div className="border border-border px-[15px] py-[14px]" style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
      {metricName ? (
        <>
          <div className="text-[10px] font-bold tracking-[.12em] text-faint">SHOWING · {srcShort.toUpperCase()}</div>
          <div className="mt-1.5 text-[22px] font-extrabold leading-tight tracking-tight text-bright">{metricName}</div>
          <div className="mt-1 text-[12.5px] leading-normal text-muted">{metricDesc}</div>
        </>
      ) : (
        <>
          <div className="text-[10px] font-bold tracking-[.12em] text-accent">START HERE</div>
          <div className="mt-1.5 text-[21px] font-extrabold leading-tight text-bright">Choose an indicator</div>
          <div className="mt-1 text-[12.5px] leading-normal text-muted">The map stays quiet until you pick a statistic to colour it by.</div>
        </>
      )}
      <button
        onClick={onOpenChooser}
        className="mt-3 w-full rounded-sm bg-accent px-3 py-2.5 text-center text-[12px] font-bold tracking-[.05em] text-accent-ink transition-colors hover:bg-accent-hover"
      >
        {metricName ? "CHANGE INDICATOR" : "BROWSE INDICATORS"}
      </button>
    </div>
  );
}

export function LevelColourCard({
  level, onLevel, levelLock, palette, onPalette, vintage, onVintage, vintageAvailable,
}: {
  level: "state" | "district";
  onLevel: (l: "state" | "district") => void;
  levelLock: "state" | "district" | null; // metric only exists at this level
  palette: PaletteId; onPalette: (p: PaletteId) => void;
  /** as-reported-2011 boundary vintage (adr-003 toggle, item 671); row hidden
   *  when the metric has no 2011-vintage rows */
  vintage?: "current" | "2011";
  onVintage?: (v: "current" | "2011") => void;
  vintageAvailable?: boolean;
}) {
  const lockMsg = (l: "state" | "district") =>
    levelLock && levelLock !== l ? "This indicator is only available at the " + levelLock + " level" : undefined;
  return (
    <div className="border border-border px-[15px] py-[13px]" style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">LEVEL</span>
        <div className="flex border border-border">
          {(["state", "district"] as const).map((l) => {
            const on = level === l;
            const disabled = !!levelLock && levelLock !== l;
            return (
              <button
                key={l} onClick={() => !disabled && onLevel(l)} aria-pressed={on}
                disabled={disabled} title={lockMsg(l)}
                className="px-2.5 py-1 text-[10.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: on ? "#d1502f" : "transparent", color: on ? "#16110b" : "#a49d8c" }}
              >
                {l === "state" ? "STATES" : "DISTRICTS"}
              </button>
            );
          })}
        </div>
      </div>
      {vintageAvailable && onVintage && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[.12em] text-faint">BOUNDARIES</span>
            <div className="flex border border-border">
              {([["current", "TODAY"], ["2011", "2011 AS REPORTED"]] as const).map(([v, label]) => {
                const on = (vintage ?? "current") === v;
                return (
                  <button
                    key={v} onClick={() => onVintage(v)} aria-pressed={on}
                    title={v === "2011"
                      ? "Render this census metric on the districts the 2011 census actually reported"
                      : "Render on current-day districts (2011 counts reaggregated via the crosswalk)"}
                    className="px-2.5 py-1 text-[10.5px] font-bold"
                    style={{ background: on ? "#d1502f" : "transparent", color: on ? "#16110b" : "#a49d8c" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {vintage === "2011" && (
            <div className="mt-1.5 text-[9.5px] leading-snug text-dim">
              As the 2011 census reported it — no crosswalk, no estimates. Delhi is
              drawn whole (nine 2011 districts) and Mumbai City sits with Suburban,
              matching this map&apos;s current-day polygons. View-only: drill,
              selection and compare use today&apos;s boundaries.
            </div>
          )}
        </>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">MAP COLOUR</span>
        <span className="text-[10.5px] font-semibold text-muted">{PALETTES[palette].name}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {(Object.keys(PALETTES) as PaletteId[]).map((p) => (
          <button
            key={p} onClick={() => onPalette(p)} title={`${PALETTES[p].name} — ${PALETTES[p].note}`}
            aria-label={`Palette ${PALETTES[p].name}`} aria-pressed={palette === p}
            className="h-[18px] flex-1 rounded-sm border transition-transform hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(PALETTES[p].fn).join(",")})`,
              borderColor: palette === p ? "#d1502f" : "#3b3626",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function LegendCard({
  metricName, unit, decimals, min, max, values, method, paletteFn, reverse,
  mode, onMode, avgNote, scope, countLabel, source, license, cohortNote,
  scaleOpen, onToggleScale,
}: {
  metricName: string; unit: string; decimals: number; min: number; max: number; values: number[];
  method: BreakMethod; paletteFn: (t: number) => string; reverse: boolean;
  mode: "value" | "vs_avg"; onMode: (m: "value" | "vs_avg") => void;
  avgNote: string | null; scope: string; countLabel: string; source: string; license: string;
  cohortNote: string | null;
  scaleOpen: boolean; onToggleScale: () => void;
}) {
  const fn = (t: number) => paletteFn(reverse ? 1 - t : t);
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  const binned = mode === "value" && method !== "continuous";
  const edges = binned ? computeBreaks(values, method) : [];

  return (
    <div className="border border-border px-[15px] py-3" style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold tracking-[.1em] text-faint">{metricName.toUpperCase()}</span>
        <div className="flex flex-none items-center gap-1.5">
          <div className="flex border border-border">
            <button onClick={() => onMode("value")} aria-pressed={mode === "value"}
              className="px-1.5 py-0.5 text-[9px] font-bold"
              style={{ background: mode === "value" ? "#d1502f" : "transparent", color: mode === "value" ? "#16110b" : "#a49d8c" }}>VALUE</button>
            <button onClick={() => onMode("vs_avg")} aria-pressed={mode === "vs_avg"}
              className="px-1.5 py-0.5 text-[9px] font-bold"
              style={{ background: mode === "vs_avg" ? "#d1502f" : "transparent", color: mode === "vs_avg" ? "#16110b" : "#a49d8c" }}>VS AVG</button>
          </div>
          <button
            onClick={onToggleScale} aria-expanded={scaleOpen}
            className="rounded-sm border border-accent-border px-1.5 py-0.5 text-[10px] font-bold text-accent hover:bg-elevated"
          >
            ⚙ SCALE
          </button>
        </div>
      </div>
      {mode === "vs_avg" ? (
        <>
          <div className="mt-2 h-2" style={{ background: "linear-gradient(90deg,#b2182b,#f7f7f7,#2166ac)" }} />
          <div className="mt-1 flex justify-between font-mono text-[9.5px] text-faint"><span>below avg</span><span>{avgNote}</span><span>above avg</span></div>
        </>
      ) : binned && edges.length ? (
        <>
          <div className="mt-2 flex h-2">
            {Array.from({ length: edges.length + 1 }, (_, i) => (
              <span key={i} className="flex-1" style={{ background: fn(edges.length === 0 ? 0 : i / edges.length) }} />
            ))}
          </div>
          <div className="mt-1.5 space-y-px">
            {fmtBin(edges, min, max, decimals).map((label, i, arr) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[9px] text-faint">
                <span className="h-2 w-4 flex-none" style={{ background: fn(arr.length <= 1 ? 0 : i / (arr.length - 1)) }} />
                {label}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 h-2 transition-colors" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(fn).join(",")})` }} />
          <div className="mt-1 flex justify-between font-mono text-[9.5px] text-faint">
            <span>{fmt(min)}</span><span>{scope}</span><span>{fmt(max)}</span>
          </div>
        </>
      )}
      {cohortNote && (
        <div className="mt-2 border-t border-border-soft pt-2 text-[10.5px] font-semibold text-accent">{cohortNote}</div>
      )}
      <div className="mt-2 text-[10.5px] text-faint">{countLabel} · {unit}</div>
      <div className="text-[10px] leading-tight text-dim">
        Source: {source}{license ? ` · ${license}` : ""} ·{" "}
        <a href="/methodology" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">methodology</a>
      </div>
    </div>
  );
}

export function ScalePopover({
  method, onMethod, reverse, onReverse, onClose,
}: {
  method: BreakMethod; onMethod: (m: BreakMethod) => void;
  reverse: boolean; onReverse: () => void; onClose: () => void;
}) {
  const METHODS: [BreakMethod, string][] = [
    ["continuous", "SMOOTH"], ["quantile", "QUANTILE"], ["equal", "EQUAL"], ["jenks", "JENKS"],
  ];
  return (
    <div
      className="atl-pop absolute bottom-[10px] left-[318px] z-30 w-[280px] border border-border bg-panel-solid p-4"
      style={{ boxShadow: "0 8px 26px rgba(0,0,0,.45)" }}
      role="dialog" aria-label="Scale options"
    >
      <div className="flex items-baseline justify-between border-b border-border-soft pb-2">
        <span className="text-[15px] font-extrabold text-bright">Scale</span>
        <button onClick={onClose} aria-label="Close scale options" className="text-[12px] text-dim hover:text-foreground">✕</button>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">METHOD</span>
        <div className="flex border border-border">
          {METHODS.map(([k, label]) => (
            <button
              key={k} onClick={() => onMethod(k)} aria-pressed={method === k}
              className="px-1.5 py-1 text-[9px] font-bold"
              style={{ background: method === k ? "#d1502f" : "transparent", color: method === k ? "#16110b" : "#a49d8c" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">DIRECTION</span>
        <button
          onClick={onReverse}
          className="border border-border px-2.5 py-1 text-[10px] font-bold hover:text-foreground"
          style={{ color: reverse ? "#d1502f" : "#a49d8c" }}
        >
          ↔ REVERSE {reverse ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
