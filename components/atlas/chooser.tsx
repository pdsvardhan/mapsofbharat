"use client";

// Editorial indicator chooser (iter-51 item 385): left topic index with a
// sliding accent bar, right metric list with unit + source per row.
// Fed entirely by the live /api/metrics taxonomy.

import { useMemo, useState } from "react";
import { coverageOf, sourceLegend, sourceSigil } from "@/lib/source-sigil";
import { Metric, CAT_DESC, CAT_ICON, catAccent, hexA, orderedCategories } from "./cats";

// Single-line metric row (design round `metric-row-cluster`, Option A
// "single-line", locked 2026-08-10 — ledger rows 80-83):
//   category-list.row-layout  = single-line
//   category-list.row-density = 32   (row height, px)
//   category-row.row-layout   = baseline-columns-with-leader
//   panel.padding-density     = 12   (region panel inset, px — see right-rail)
//
// One metric is ONE ruled line, the way a printed Census tabulation sheet sets an
// entry: index, name, a dotted leader carrying the eye across, then a right-hand
// block of mono figures.
//
// Every fixed track below is MEASURED against the whole live catalogue rather than
// taken from the panel's sample rows, because the panel's rows were short ones:
//   index   14px — "01".."20" measures 10.0px at 11px mono, plus air (panel 22)
//   cov     14px — two 6px cells + a 2px gap, exactly (panel budgeted 24)
//   vintage 24px — every year is four digits, 24.0px at 10px mono (panel 34)
//   sigil   40px — "MGNREGA" is the widest key, 38.8px (panel 42)
//   unit    86px — "pupils/teacher" is a real unit and measures 84.0px (panel 54,
//                  which would have spilled it left across the sigil)
// All five are IBM Plex Mono, which reaches these elements through the font-mono
// UTILITY — so unlike the sans name track, they were never affected by the
// var(--font-sans) defect fixed in globals.css on 2026-08-11, and these figures are
// unchanged by it. That returns 26px to the name, the only elastic track, so every
// pixel the metadata does not need goes to the identifier (doctrine 200).
const ROW_COLS = "14px minmax(0,auto) minmax(12px,1fr) 14px 24px 40px 86px";

/** Two-cell coverage mark: districts, then states. Filled = carried.
 *  `silent` drops the screen-reader text for the legend's own samples, where the
 *  meaning is already written out in visible text beside the mark. */
function CoverageMark({ levels, silent }: { levels?: string[]; silent?: boolean }) {
  const c = coverageOf(levels);
  const cell = "block h-[9px] w-[6px] border border-faint";
  return (
    <span className="inline-flex items-center gap-[2px] align-middle">
      <i aria-hidden className={cell} style={{ background: c.district ? "var(--faint)" : "transparent" }} />
      <i aria-hidden className={cell} style={{ background: c.state ? "var(--faint)" : "transparent" }} />
      {!silent && <span className="sr-only">{c.label}</span>}
    </span>
  );
}

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
  const inCat = useMemo(() => metrics.filter((m) => m.category === cat), [metrics, cat]);
  const catIdx = Math.max(0, cats.indexOf(cat));
  // Topics switch on hover, so a modal that opens UNDER the pointer fires
  // mouseenter without the user moving a muscle and silently retunes the browser
  // to whatever topic happened to render beneath the cursor. Whether it bites is
  // pure arithmetic between the dialog's width and where the trigger sits: at one
  // point in this round the dialog was 80px wider and the topic column landed
  // exactly on the pointer, so a flows.spec case that opens the chooser on
  // `literacy_rate` (demographics) started arriving in `society`. The width went
  // back, but the trap did not — it just moved out of range again. Hover only
  // counts once the pointer has actually MOVED inside the dialog; the first real
  // movement arms it, and a topic must then be entered afresh, so nothing
  // switches until the user aims at something.
  const [hoverArmed, setHoverArmed] = useState(false);
  // One entry per distinct sigil ON SCREEN, so the key can never explain a source
  // this topic does not show, nor omit one it does.
  const legend = useMemo(() => sourceLegend(inCat.map((m) => m.source)), [inCat]);

  return (
    <div className="atl-fade fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(7,8,11,.74)" }} onClick={onClose}>
      <div
        role="dialog" aria-label="Choose an indicator" onClick={(e) => e.stopPropagation()}
        onMouseMove={() => { if (!hoverArmed) setHoverArmed(true); }}
        // Stays 920. This was briefly widened to 1000 to fit the longest name in the
        // catalogue, back when body text was rendering in the system fallback because
        // globals.css asked for the un-emitted var(--font-sans); Hanken Grotesk is
        // ~17% narrower, so "Teen mothers (15-19 already mothers/pregnant)" measures
        // 340px here rather than 409, against a 379px name track. 39px of margin, and
        // no reason to grow the dialog.
        className="atl-pop flex h-[640px] max-h-[86vh] w-[920px] max-w-[96vw] flex-col overflow-hidden border border-border bg-panel-solid"
        style={{ boxShadow: "0 30px 70px rgba(0,0,0,.55)" }}
      >
        <div className="flex flex-none items-baseline justify-between border-b border-border-soft px-6 pb-4 pt-5">
          <div>
            <div className="text-[21px] font-extrabold tracking-tight text-bright">Choose an indicator</div>
            <div className="mt-0.5 text-[13px] text-muted">Hover a topic, then pick a statistic to map.</div>
          </div>
          <button onClick={onClose} className="text-[11px] font-semibold text-muted hover:text-foreground">✕ ESC</button>
        </div>
        {/* Below lg the topic index becomes a horizontal strip ABOVE the list (to-do 424).
            Side by side, its fixed 262px left the indicator list about 112px on a 390px
            phone, so metric names and years rendered as ellipses — a reader could browse
            topics but could not read what they were choosing, which defeats the point of
            the chooser. As a strip the list gets the full modal width. */}
        <div className="flex min-h-0 flex-1 max-lg:flex-col">
          {/* left topic index — scrolls: the live taxonomy is 20 categories and
              only ~9 fit the modal, so without this everything from labour down
              (crime, transport, elections, environment…) was unreachable (item 750) */}
          <div className="flex w-[262px] flex-none flex-col border-r border-border-faint py-4 max-lg:w-full max-lg:border-b max-lg:border-r-0 max-lg:py-2">
            <div className="flex-none px-6 pb-3 font-mono text-[10px] tracking-[.14em] text-faint max-lg:hidden">TOPICS</div>
            <div className="atl-scroll relative min-h-0 flex-1 overflow-y-auto max-lg:flex max-lg:flex-none max-lg:overflow-x-auto max-lg:overflow-y-hidden">
              {/* inside the scroller so it tracks the rows instead of drifting off them */}
              {/* The sliding rule tracks rows VERTICALLY, so it is meaningless once the
                  index is a horizontal strip; the selected row's own background carries
                  the state below lg. */}
              <div
                className="absolute left-0 w-[3px] transition-transform duration-300 max-lg:hidden"
                style={{ height: 58, background: accent, transform: `translateY(${catIdx * 58}px)`, transitionTimingFunction: "cubic-bezier(.4,0,.2,1)" }}
              />
              {cats.map((c) => {
                const on = c === cat;
                const count = metrics.filter((m) => m.category === c).length;
                return (
                  <button
                    key={c} onMouseEnter={() => { if (hoverArmed) setCat(c); }} onClick={() => setCat(c)}
                    className="block h-[58px] w-full px-6 text-left transition-colors max-lg:h-auto max-lg:w-auto max-lg:flex-none max-lg:whitespace-nowrap max-lg:px-4 max-lg:py-2"
                    style={{ background: on ? "var(--selected-section)" : "transparent" }}
                  >
                    <div className="text-[18px] font-bold capitalize tracking-tight max-lg:text-[15px]" style={{ color: on ? "#eae4d6" : "#8a8477" }}>{c}</div>
                    {/* the per-topic count would double the strip's height on a phone for
                        information the list itself immediately shows */}
                    <div className="text-[11px] text-faint max-lg:hidden">{count} indicator{count === 1 ? "" : "s"}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* right metric list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-none items-center gap-3 border-b border-border-faint px-6 pb-3 pt-5">
              {/* swatch.swatch-shape = square-tile (R2, ledger row 94). Square, not
                  rounded-lg: the ruled-sheet direction takes its cue from a printed
                  tabulation sheet, where a legend key is a tile, and it keeps the
                  swatch square with the 0-radius panel it sits inside. */}
              <span data-role="swatch" className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-none" style={{ background: hexA(accent, 0.16) }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={CAT_ICON[cat] ?? CAT_ICON.demographics} />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-[21px] font-extrabold capitalize tracking-tight text-bright">{cat}</div>
                <div className="text-[11.5px] text-faint">{CAT_DESC[cat] ?? "Official statistics"}</div>
              </div>
            </div>
            {/* Design-round stamps (2026-08-10): data-oid/data-role are read by the
                Ottomate design pipeline's decompose() to work out what a round may
                vary, and by the computed pass's cross-component coherence check,
                which asserts that the same data-role resolves to the same styling
                across the chooser, the region rail and the /metric index. Presentational
                no-ops — they add no styling and no behaviour. */}
            <div data-oid="chooser-metric-list" data-role="category-list" className="atl-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
              {inCat.map((m, i) => {
                const active = m.id === selected;
                return (
                  <button
                    key={m.id} onClick={() => onPick(m.id)} data-role="category-row"
                    aria-current={active ? "true" : undefined}
                    // Pointer affordance for the responsive tail only: below ~1042px
                    // the modal is capped by max-w-[96vw] and the name track shrinks
                    // again. It also spells the sigil out on hover. It is a SECOND
                    // cue, never the only one — the legend below carries the sigil
                    // for touch, and the name is unclipped at full width.
                    title={`${m.name} — ${m.source}`}
                    className="grid h-8 w-full items-center gap-x-2 border-b border-border-faint px-2 text-left transition-colors duration-[160ms] hover:bg-elevated"
                    style={{ gridTemplateColumns: ROW_COLS, background: active ? "var(--selected-row)" : undefined }}
                  >
                    <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate text-[15px] font-bold text-bright">
                      {m.name}
                      {/* Selection marker. aria-current above already says "this one" to a
                          screen reader, so the dot is decorative and hidden from it. Kept in
                          the topic's own accent rather than flattened to --accent: colour
                          values are held by owner ruling in this round, and it is a 6px
                          non-text marker (the 3:1 UI floor), never something read. */}
                      {active && (
                        <span
                          aria-hidden
                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{ background: accent }}
                        />
                      )}
                    </span>
                    <span aria-hidden className="h-0 border-b border-dotted border-border" />
                    <CoverageMark levels={m.levels} />
                    <span className="text-right font-mono text-[10px] text-muted">{m.year}</span>
                    {/* Attribution, not decoration — a reader picks an indicator partly on who
                        published it. Sigil + the standing legend below, because the full
                        source runs to 170 characters and a one-line row has 46px here.
                        text-dim measured 3.17:1 on the modal ground and 2.90:1 on the
                        selected row, both under the 4.5:1 AA floor (items 431/473); this
                        column is --foreground, 10.6:1 / 9.7:1. */}
                    <span className="truncate text-right font-mono text-[9px] font-bold tracking-[.06em] text-foreground">
                      {sourceSigil(m.source)}
                    </span>
                    <span className="truncate text-right font-mono text-[9.5px] text-muted">{m.unit}</span>
                  </button>
                );
              })}
              {!inCat.length && (
                <div className="mx-3 mt-2 rounded-md border border-dashed border-border-soft px-4 py-3 text-[12px] leading-relaxed text-muted">
                  No indicators in this topic yet.
                </div>
              )}
              {/* Standing key for the two encoded columns. The sigil and the coverage mark
                  are both lossy, and a `title` is not an acceptable way to pay for that on
                  a P3 public surface: it never fires on touch, and target_devices=both. */}
              {inCat.length > 0 && (
                <div className="mt-2 border border-border-faint px-2 py-1.5 text-[9px] leading-[1.9] text-muted">
                  {legend.map((e) => (
                    <span key={e.sigil} className="mr-3 inline-block">
                      <b className="font-mono font-bold tracking-[.06em] text-foreground">{e.sigil}</b> {e.label}
                    </span>
                  ))}
                  <span className="mr-3 inline-block">
                    <CoverageMark levels={["district", "state"]} silent /> districts &amp; states
                  </span>
                  <span className="mr-3 inline-block">
                    <CoverageMark levels={["district"]} silent /> districts only
                  </span>
                  <span className="inline-block">
                    <CoverageMark levels={["state"]} silent /> states only
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
