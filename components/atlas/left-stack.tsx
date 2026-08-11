"use client";

// Atlas left stack (iter-51 items 384/392/393): breadcrumb chip, indicator
// card (with START HERE empty state), level + map-colour card, and the
// editorial legend with real break values + the 4-method Scale popover.
// The value-range slider is retired (item 397, adr-015).

import { useRef } from "react";
import Link from "next/link";

import { BreakMethod, METHOD_LABEL, PALETTES, PaletteId, classCounts, fmtBin, methodAnchor } from "@/lib/breaks";
import {
  ProvenanceClass, PROVENANCE_CLASSES, PROVENANCE_COLOR, PROVENANCE_LABEL, PROVENANCE_MUTED,
  type CoverageCounts,
} from "@/lib/coverage";
import { useDismiss } from "@/lib/use-dismiss";
import { SEGMENTED_WIDTH, ViewToggle } from "@/components/atlas/data-table";

/** Legend view mode — shared with india-map's Mode. */
type LegendMode = "value" | "vs_avg" | "coverage";

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
      {/* The drill trail is how a reader climbs back OUT of a district, so its
          buttons are real targets on a phone: bare text runs ~15px tall, under
          WCAG 2.2's 24px floor. inline-flex because min-height does not size a
          plain inline box. Desktop, with a pointer, keeps the tight trail. */}
      {hasBack && (
        <button onClick={onBack} aria-label="Back" className="text-muted hover:text-foreground max-lg:inline-flex max-lg:min-h-[26px] max-lg:min-w-[26px] max-lg:items-center max-lg:justify-center">‹</button>
      )}
      {items.map((c, i) => (
        <span key={c.label + i} className="flex items-center gap-2">
          <button onClick={c.onClick} style={{ color: c.on ? "#eae4d6" : "#a49d8c" }} className="hover:text-foreground max-lg:inline-flex max-lg:min-h-[26px] max-lg:items-center">
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
          <div className="text-[10px] font-bold tracking-[.12em] text-accent-text">START HERE</div>
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
      {/* Link to the crawlable catalogue of canonical per-metric pages (item 829),
          right where a reader browses indicators. Each metric there has its own
          permanent, cited, embeddable page. */}
      {/* Sized and coloured as a real secondary button beside the primary above
          it: at 11px faint text on one line it read as a caption and was missed
          (report 154 #3). text-muted is 6.91:1 on the panel where text-faint was
          5.02:1, and the hover moves to accent-hover (5.25:1) rather than accent
          (4.35:1), which fell under the 4.5:1 AA floor for text. */}
      <Link
        href="/metric"
        className="mt-2 block w-full rounded-sm border border-border px-3 py-2 text-center text-[11.5px] font-semibold text-muted transition-colors hover:border-accent-border hover:bg-elevated hover:text-accent-hover"
      >
        Browse all metrics →
      </Link>
    </div>
  );
}

export function LevelColourCard({
  level, onLevel, levelLock, palette, onPalette, vintage, onVintage, vintageAvailable,
  view, onView,
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
  /** map ⇄ table view toggle (iter-131 item 826), rendered as a VIEW row so the
   *  swap sits with LEVEL / BOUNDARIES / MAP COLOUR in the same controls card. */
  view?: "map" | "table";
  onView?: (v: "map" | "table") => void;
}) {
  const lockMsg = (l: "state" | "district") =>
    levelLock && levelLock !== l ? "This indicator is only available at the " + levelLock + " level" : undefined;
  return (
    <div className="border border-border px-[15px] py-[13px]" style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
      {view && onView && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[.12em] text-faint">VIEW</span>
          <ViewToggle view={view} onView={onView} fill />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">LEVEL</span>
        <div className={`flex border border-border ${SEGMENTED_WIDTH}`}>
          {(["state", "district"] as const).map((l) => {
            const on = level === l;
            const disabled = !!levelLock && levelLock !== l;
            return (
              <button
                key={l} onClick={() => !disabled && onLevel(l)} aria-pressed={on}
                disabled={disabled} title={lockMsg(l)}
                // min-h below lg only: py-1 gives these a 24px box, which clears
                // WCAG 2.2 2.5.8 by exactly nothing. On the touch surface they
                // take the 26px this codebase already settled on for a finger
                // (right-rail.tsx:150). Desktop keeps its measured 24px alignment.
                className="flex-1 px-2.5 py-1 text-[10.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40 max-lg:min-h-[26px]"
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
            {/* Deliberately NOT on the shared minimum. This pair's labels need
                ~194px, and the card's content column cannot give it that beside
                the BOUNDARIES label — forcing the minimum here made the group
                overflow its own border by 8px and pushed its right edge 6px past
                the two rows above, which is the opposite of the alignment item
                #916 asked for. Left to size itself, it lands flush on the same
                right edge as VIEW and LEVEL, which is what reads as lined up. */}
            <div className="flex border border-border">
              {([["current", "TODAY"], ["2011", "2011 AS REPORTED"]] as const).map(([v, label]) => {
                const on = (vintage ?? "current") === v;
                // px-2 below, not the px-2.5 the other rows use — this is the
                // widest pair in the card and it sits hard against the column.
                //
                // What actually keeps it safe is that it WRAPS: dropping the
                // whitespace-nowrap this row briefly carried is what lets the
                // label reflow instead of bursting its border. Measured by
                // forcing the styled 6px .atl-scroll bar to take layout width
                // (scrollbar-gutter: stable): the group narrows 181.89 -> 175.89,
                // overflow stays 0 and no button is cut. The padding is a small
                // saving on top, not the mechanism — an earlier version of this
                // comment claimed it bought 8px of headroom, and the intra-group
                // slack measures sub-pixel either way (0.11px on one verifier's
                // probe, 0.000px on the other's; the point is that it is not the
                // 8px claimed, and neither reading makes the padding load-bearing).
                //
                // Note this Chromium renders OVERLAY scrollbars, so the 6px
                // never takes layout width here at all; the reserve had to be
                // forced to test it.
                return (
                  <button
                    key={v} onClick={() => onVintage(v)} aria-pressed={on}
                    title={v === "2011"
                      ? "Render this census metric on the districts the 2011 census actually reported"
                      : "Render on current-day districts (2011 counts reaggregated via the crosswalk)"}
                    className="px-2 py-1 text-[10.5px] font-bold max-lg:min-h-[26px]"
                    style={{ background: on ? "#d1502f" : "transparent", color: on ? "#16110b" : "#a49d8c" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {vintage === "2011" && (
            <div className="mt-1.5 text-[9.5px] leading-snug text-muted">
              As the 2011 census reported it — no crosswalk, no estimates. Delhi is
              drawn whole (nine 2011 districts) and Mumbai City sits with Suburban,
              matching this map&apos;s current-day polygons. View-only: drill,
              selection and compare use today&apos;s boundaries.
            </div>
          )}
        </>
      )}
      {/* Map-only. In table view there is no choropleth, so these swatches change
          nothing a user can see — the same reason the legend is not rendered there
          (item 908's line, and items 909/910's plate rework). A control that is
          visible, enabled and inert is worse than an absent one: it invites a click
          and answers with silence. Gated on `view` rather than removed, because the
          row is correct and useful the moment the map is back. */}
      {view !== "table" && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[.12em] text-faint">MAP COLOUR</span>
            <span className="text-[10.5px] font-semibold text-muted">{PALETTES[palette].name}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {(Object.keys(PALETTES) as PaletteId[]).map((p) => (
              <button
                key={p} onClick={() => onPalette(p)} title={`${PALETTES[p].name} — ${PALETTES[p].note}`}
                aria-label={`Palette ${PALETTES[p].name}`} aria-pressed={palette === p}
                className="h-[18px] flex-1 rounded-sm border transition-transform hover:-translate-y-0.5 max-lg:h-[26px]"
                style={{
                  background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(PALETTES[p].fn).join(",")})`,
                  borderColor: palette === p ? "#d1502f" : "#3b3626",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function LegendCard({
  metricName, unit, decimals, min, max, values, method, mapEdges, paletteFn, reverse,
  mode, onMode, coverageCounts, coverageHidden, onToggleCoverageClass, coverageStat,
  avgNote, scope, countLabel, source, license, cohortNote,
  scaleOpen, onToggleScale, onReverse,
}: {
  metricName: string; unit: string; decimals: number; min: number; max: number; values: number[];
  method: BreakMethod;
  /** The edges the MAP is actually painting with. Passed in rather than recomputed
   *  here: the legend was cutting its own breaks from `entries` while the paint used
   *  `statsEntries`, so the two could disagree about where a class started. Same
   *  single-source rule item 759 applied to the social card. */
  mapEdges: number[];
  paletteFn: (t: number) => string; reverse: boolean;
  mode: LegendMode; onMode: (m: LegendMode) => void;
  /** Coverage view (item 830): per-class region counts, which classes are hidden,
   *  a toggle handler, and the always-on trust-surface coverage stat. */
  coverageCounts: CoverageCounts;
  coverageHidden: ProvenanceClass[];
  onToggleCoverageClass: (cls: ProvenanceClass) => void;
  coverageStat: string | null;
  avgNote: string | null; scope: string; countLabel: string; source: string; license: string;
  cohortNote: string | null;
  scaleOpen: boolean; onToggleScale: () => void;
  /** Flip the ramp. Same state the ⚙ SCALE popover's DIRECTION row drives — this
   *  is a second trigger for one setting, not a second setting. */
  onReverse: () => void;
}) {
  const fn = (t: number) => paletteFn(reverse ? 1 - t : t);
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  const binned = mode === "value" && method !== "continuous";
  const edges = binned ? mapEdges : [];
  // Occupancy per class, disclosed beside each row. The research brief's remedy for
  // a lopsided scale is to make the lopsidedness VISIBLE rather than to hide it
  // behind a plausible-looking legend (item 757).
  const counts = binned && edges.length ? classCounts(values, edges) : [];

  // Which classification produced these colours — surfaced at rest, not only inside
  // the ⚙ SCALE popover. A classed choropleth cannot be read honestly without its
  // break rule and class count, and the label deep-links to the method's explanation
  // on the methodology page (item 827). vs-avg and a smooth ramp have no discrete
  // classes, so they carry a mode label rather than a fabricated count. edges is
  // empty when a real method has too few regions to cut — that paints continuously,
  // so it reads as smooth too.
  const methodSmooth = mode === "value" && (method === "continuous" || edges.length === 0);
  const methodMeta =
    mode === "vs_avg"
      ? { label: "DIVERGING", anchor: "breaks-vs-avg", detail: "vs average" }
      : methodSmooth
        ? { label: METHOD_LABEL.continuous, anchor: methodAnchor("continuous"), detail: "smooth scale" }
        : { label: METHOD_LABEL[method], anchor: methodAnchor(method), detail: `${edges.length + 1} classes` };

  return (
    <div className="border border-border px-[15px] py-3" style={{ background: "var(--panel)", boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold tracking-[.1em] text-faint">{metricName.toUpperCase()}</span>
        <div className="flex flex-none items-center gap-1.5">
          <div className="flex border border-border">
            {([["value", "VALUE"], ["vs_avg", "VS AVG"], ["coverage", "COVERAGE"]] as [LegendMode, string][]).map(([m, label]) => (
              <button
                key={m} onClick={() => onMode(m)} aria-pressed={mode === m} data-legend-mode={m}
                className="px-1.5 py-0.5 text-[9px] font-bold max-lg:min-h-[26px] max-lg:px-2"
                style={{ background: mode === m ? "#d1502f" : "transparent", color: mode === m ? "#16110b" : "#a49d8c" }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* The ⚙ SCALE popover only governs value-mode class breaks — irrelevant
              to the categorical coverage view, so it is hidden there. */}
          {mode !== "coverage" && (
            <button
              onClick={onToggleScale} aria-expanded={scaleOpen} data-scale-toggle
              className="rounded-sm border border-accent-border px-1.5 py-0.5 text-[10px] font-bold text-accent-text hover:bg-elevated max-lg:min-h-[26px] max-lg:px-2"
            >
              ⚙ SCALE
            </button>
          )}
        </div>
      </div>
      {mode === "coverage" ? (
        // COVERAGE view (item 830): the categorical provenance key REPLACES the
        // value legend. Each class present in the data lists its colour + count and
        // is a show/hide toggle, so a reader can isolate e.g. inherited districts.
        <div className="mt-2 space-y-1" data-coverage-legend>
          {PROVENANCE_CLASSES.filter((cls) => coverageCounts[cls] > 0).map((cls) => {
            const hidden = coverageHidden.includes(cls);
            return (
              <button
                key={cls} onClick={() => onToggleCoverageClass(cls)}
                aria-pressed={!hidden} data-coverage-class={cls}
                className="flex w-full items-center gap-2 text-left max-lg:min-h-[26px]"
                style={{ opacity: hidden ? 0.42 : 1 }}
              >
                <span
                  className="h-2.5 w-4 flex-none rounded-[1px]"
                  style={{ background: hidden ? PROVENANCE_MUTED : PROVENANCE_COLOR[cls] }}
                />
                <span className="flex-1 text-[10px] font-semibold text-faint">{PROVENANCE_LABEL[cls]}</span>
                <span data-coverage-count className="flex-none font-mono text-[9.5px] text-faint">
                  {coverageCounts[cls].toLocaleString("en-IN")}
                </span>
              </button>
            );
          })}
          <div className="pt-0.5 text-[9px] leading-snug text-muted">
            Coloured by data provenance. Tap a class to show or hide it.
          </div>
        </div>
      ) : mode === "vs_avg" ? (
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
            {fmtBin(edges, min, max, decimals, method).map((label, i, arr) => (
              <div key={i} data-legend-row className="flex items-center gap-2 font-mono text-[9px] text-faint">
                <span className="h-2 w-4 flex-none" style={{ background: fn(arr.length <= 1 ? 0 : i / (arr.length - 1)) }} />
                <span data-legend-label className="flex-1">{label}</span>
                {counts[i] != null && (
                  <span data-legend-count className="flex-none text-faint">{counts[i]}</span>
                )}
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
      {mode !== "coverage" && (
        <div
          data-legend-method-line
          className="mt-2 flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[.05em] text-faint"
        >
          <a
            href={`/methodology#${methodMeta.anchor}`} target="_blank" rel="noopener noreferrer"
            data-legend-method
            className="text-faint underline decoration-dotted underline-offset-2 hover:text-accent-text"
          >
            {methodMeta.label}
          </a>
          <span aria-hidden>·</span>
          <span data-legend-method-detail>{methodMeta.detail}</span>
          {/* Direction sits ON the legend, beside the rule that built it — the
              ⚙ SCALE popover's DIRECTION row is the same setting, but two clicks
              deep, and a reader looking at the ramp did not find it (report 154
              #1). Value mode only: vs-avg paints a fixed diverging ramp that
              ignores `reverse`, so offering the control there would lie. */}
          {mode === "value" && (
            <button
              type="button" onClick={onReverse} aria-pressed={reverse} data-legend-reverse
              title={reverse ? "Colour scale reversed — click to restore" : "Reverse the colour scale"}
              className="ml-auto inline-flex min-h-[24px] items-center rounded-sm border px-2 text-[9.5px] font-bold tracking-[.05em] hover:bg-elevated"
              style={{
                borderColor: reverse ? "#6b3020" : "#3b3626",
                color: reverse ? "#e0603d" : "#a49d8c",
              }}
            >
              ↔ REVERSE{reverse ? " ON" : ""}
            </button>
          )}
        </div>
      )}
      {/* Per-metric coverage stat — the trust surface, shown in every mode (item
          830). One click from the /coverage league table. */}
      {coverageStat && (
        <div className="mt-2 text-[9.5px] leading-snug text-muted">
          <a href="/coverage" target="_blank" rel="noopener noreferrer" data-coverage-stat className="hover:text-accent-text">
            {coverageStat}
          </a>
        </div>
      )}
      {cohortNote && (
        <div className="mt-2 border-t border-border-soft pt-2 text-[10.5px] font-semibold text-accent-text">{cohortNote}</div>
      )}
      <div className="mt-2 text-[10.5px] text-faint">{countLabel} · {unit}</div>
      <div className="text-[10px] leading-tight text-faint">
        Source: {source}{license ? ` · ${license}` : ""} ·{" "}
        <a href="/methodology" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">methodology</a>
      </div>
    </div>
  );
}

export function ScalePopover({
  method, onMethod, reverse, onReverse, onClose, applicable, autoReason, collapseWarn,
}: {
  method: BreakMethod; onMethod: (m: BreakMethod) => void;
  reverse: boolean; onReverse: () => void; onClose: () => void;
  /** Methods worth offering for THIS series. FLOOR needs a tie mass to split off and
   *  PIVOT needs an external reference value, so neither is offered where it would be
   *  meaningless (item 757). */
  applicable: BreakMethod[];
  /** Why the automatic selector chose the current method. Null once the user has
   *  picked by hand — at that point the choice is theirs, not the selector's. */
  autoReason: string | null;
  /** Set when the CURRENT method (a manual pick) collapses the map into one class;
   *  names a better method to nudge toward. Null when the pick reads fine. */
  collapseWarn: { share: number; better: BreakMethod } | null;
}) {
  const METHODS: [BreakMethod, string][] =
    applicable.map((m) => [m, METHOD_LABEL[m]] as [BreakMethod, string]);
  // The ⚙ SCALE trigger lives in the legend card, outside this popover — it is
  // exempted so the outside-press does not fight the trigger's own toggle.
  const boxRef = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, boxRef, "[data-scale-toggle]");
  return (
    <div
      ref={boxRef}
      // left-[318px] clears the 300px controls column — which only exists at lg
      // and up. Below it the column is collapsed behind its bar and the plate is
      // ~374px wide, so a 280px box offset 318px from the left starts past the
      // right edge; it spans the plate instead (to-do 424).
      className="atl-pop absolute bottom-[10px] left-[318px] z-30 w-[280px] border border-border bg-panel-solid p-4 max-lg:bottom-2 max-lg:left-2 max-lg:right-2 max-lg:w-auto"
      style={{ boxShadow: "0 8px 26px rgba(0,0,0,.45)" }}
      role="dialog" aria-label="Scale options"
    >
      <div className="flex items-baseline justify-between border-b border-border-soft pb-2">
        <span className="text-[15px] font-extrabold text-bright">Scale</span>
        <button onClick={onClose} aria-label="Close scale options" className="text-[12px] text-muted hover:text-foreground">✕</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-y-2">
        <span className="text-[10px] font-bold tracking-[.12em] text-faint">METHOD</span>
        <div className="flex flex-wrap border border-border">
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
          // The legend's own REVERSE control already used #e0603d for its ON label
          // (iter-35); this popover row is the same setting and still carried the raw
          // accent at 4.35:1. Same role, same token now (items 431/473).
          style={{ color: reverse ? "var(--accent-text)" : "#a49d8c" }}
        >
          ↔ REVERSE {reverse ? "ON" : "OFF"}
        </button>
      </div>
      {collapseWarn && (
        <div className="mt-3 border-t border-border-soft pt-2 text-[10px] leading-snug" style={{ color: "#e0913f" }} data-collapse-warn>
          <span className="font-bold tracking-[.1em]">HEADS UP — </span>
          {METHOD_LABEL[method]} puts {Math.round(collapseWarn.share * 100)}% of regions in one class here.{" "}
          <button
            onClick={() => onMethod(collapseWarn.better)}
            className="font-bold underline underline-offset-2 hover:text-bright"
          >
            Use {METHOD_LABEL[collapseWarn.better]}
          </button>{" "}
          for a clearer spread.
        </div>
      )}
      {autoReason && (
        <div className="mt-3 border-t border-border-soft pt-2 text-[10px] leading-snug text-muted" data-auto-reason>
          <span className="font-bold tracking-[.1em] text-faint">CHOSEN FOR THIS METRIC — </span>
          {autoReason}
        </div>
      )}
    </div>
  );
}
