"use client";

// Atlas right rail (iter-51 items 387/388/389/390):
//  · docked region profile — count-up value, 9-bin histogram, rank sentence
//  · cohort filter (states level) — real top-10 lists from our own metrics
//  · ranking list — High/Low sort; Top 25 / Bottom 25 at all-India districts
//    with the selected district pinned at its true rank
//  · compare takeover — A/B slots + THE GAP + plain-language read

import { useEffect, useMemo, useRef, useState } from "react";

import { ESTIMATE_BADGE, estimateBadge, countsInStats, estimateNote, estimateShort, notRankedNote } from "@/lib/estimate-kind";
import { useDismiss } from "@/lib/use-dismiss";

export type Entry = {
  code: string; name: string; sub: string; kind: "state" | "district"; value: number;
  estimated?: number;
  /** Which kind of estimate — 'inherited' | 'projected' | 'aggregated' (adr-021). */
  estimate_kind?: string | null;
  /** District that supplied this number; 'inherited' only — a projected figure has
   *  no donor (item 640). */
  estimated_from?: string | null;
  /** 1 when this inherited value is a SHAKY (weak sibling) match (adr-026). */
  shaky?: number;
};
export type CohortDef = { key: string; name: string; note: string; codes: Set<string> | null };
export type RegionMetricRow = {
  id: string; name: string; category: string; unit: string; year: number;
  source: string; source_url: string; decimals: number; value: number; rank: number; count: number;
  estimated?: number;
  /** Which kind of estimate this row is, since `estimated` alone cannot say (adr-021). */
  estimate_kind?: string | null;
  /** District that supplied this specific number. Per-metric: one district can
   *  inherit different metrics from different siblings (adr-020). Only ever set
   *  for estimate_kind='inherited' — a projected figure has no donor. */
  estimated_from?: string | null;
  /** 1 when this inherited value is a SHAKY (weak sibling) match (adr-026). */
  shaky?: number;
};

const BINS = 9;

// Amber for a SHAKY inheritance badge (adr-026) — distinct from the accent orange
// a normal "est." uses, so a weak sibling match reads as a stronger caution.
// The value lives in globals.css as --shaky; this was a literal duplicated here and
// in data-table.tsx, i.e. one caveat with two definitions (to-do 502).
const SHAKY_COLOR = "var(--shaky)";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Count-up number (560ms ease-out cubic), reduced-motion aware. */
function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(value);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); fromRef.current = value; return; }
    const from = fromRef.current;
    // 560ms and the cubic ease-out below are the SHARED data-motion timing:
    // --motion-data-dur / --motion-data-ease in globals.css drive the bars with the
    // same values so the figure and its distribution settle together. Changing one
    // without the other splits a single event into two (R3, 2026-08-13).
    const t0 = performance.now(), dur = 560;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = from + (value - from) * e;
      setShown(v);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); fromRef.current = value; };
  }, [value]);
  return <>{format(shown)}</>;
}

/** Docked profile for the selected region. */
export function RegionProfile({
  sel, unit, hasMetric, entries, min, max, fmtVal, fmtFull, rank, scopeNoun,
  drillLabel, onDrill, onClear,
}: {
  sel: { code: string; name: string; sub: string; kind: "state" | "district"; value: number | null };
  unit: string; hasMetric: boolean; entries: Entry[]; min: number; max: number;
  fmtVal: (v: number) => string; fmtFull: (v: number) => string;
  rank: number | null; scopeNoun: string;
  drillLabel: string | null; onDrill: () => void; onClear: () => void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const [allRows, setAllRows] = useState<RegionMetricRow[] | null>(null);
  const [estParents, setEstParents] = useState<string[]>([]);
  useEffect(() => { setAllOpen(false); setAllRows(null); setEstParents([]); }, [sel.code]);

  const { bins, sentence } = useMemo(() => {
    if (!hasMetric || sel.value == null || !entries.length) return { bins: [] as { h: number; on: boolean }[], sentence: "" };
    const span = max - min || 1;
    const counts = new Array(BINS).fill(0);
    // Bin stats members only (item 641, adr-023): an inherited copy stood in as
    // an extra district (bin 1 read 83% where the surveyed districts are 40% —
    // three copies of West Siang's 55.4), but a projection is its state's only
    // figure and holds a real place in this distribution. Same membership as the
    // class breaks, the legend and the ranks: countsInStats.
    let selBin: number | null = null;
    for (const e of entries) {
      if (!countsInStats(e.estimated, e.estimate_kind)) continue;
      const bi = Math.min(BINS - 1, Math.floor(((e.value - min) / span) * BINS));
      counts[bi]++;
      if (e.code === sel.code) selBin = bi;
    }
    const mc = Math.max(...counts) || 1;
    // No highlighted bar when the selection is an unranked copy: it holds no
    // place in this distribution, and the sentence below says exactly that.
    const bins = counts.map((c, i) => ({ h: Math.max(8, Math.round((c / mc) * 100)), on: i === selBin }));
    // A null rank means the value is a copy with no standing of its own. Never
    // fall back to a number here: `rank ?? 1` would announce a copied value as
    // the top of the table.
    const selEntry = entries.find((e) => e.code === sel.code);
    if (rank == null) return { bins, sentence: notRankedNote(selEntry?.estimate_kind, selEntry?.estimated_from, selEntry?.shaky) };
    const N = entries.reduce((n, e) => n + (countsInStats(e.estimated, e.estimate_kind) ? 1 : 0), 0);
    const pct = N > 1 ? Math.round(((N - rank) / (N - 1)) * 100) : 100;
    // A ranked projection still is not this state's own audited number — the
    // rank sentence carries the disclosure with it (adr-023 keeps the badge).
    const estClause = selEntry?.estimated
      ? ` · ${estimateShort(selEntry.estimate_kind, selEntry.estimated_from, selEntry.shaky)}`
      : "";
    return { bins, sentence: `Rank ${rank} of ${N} — ahead of ${pct}% of ${scopeNoun}.${estClause}` };
  }, [hasMetric, sel.code, sel.value, entries, min, max, rank, scopeNoun]);

  const loadAll = () => {
    setAllOpen((o) => !o);
    if (allRows === null)
      fetch(`/api/region/${encodeURIComponent(sel.code)}`)
        .then((r) => r.json())
        .then((d) => { setAllRows(d.metrics ?? []); setEstParents(d.estimated_parents ?? []); })
        .catch(() => setAllRows([]));
  };

  return (
    // Design-round stamps (2026-08-10): data-oid/data-role feed the Ottomate design
    // pipeline's decompose() and the computed pass's cross-component coherence check,
    // which asserts a given data-role resolves to the same styling here, in the chooser
    // and on the /metric index. Presentational no-ops — no styling, no behaviour.
    <div
      data-oid="region-indicator-panel" data-role="panel"
      // panel.padding-density = 12 (design round `metric-row-cluster`, Option A,
      // locked 2026-08-10 — ledger row 83). Down from 18/15, and the 12px it
      // returns is not cosmetic: this panel is a fixed 300px card on the map
      // plate, so every pixel of inset comes straight out of the width the
      // indicator names below have to identify themselves in. See the row
      // comment further down for what that width buys.
      // panel.border-treatment = rules-3px-above-and-below, and
      // panel.surface-depth = flat-no-lift (design round `metric-row-cluster` R2,
      // ledger rows 95 and 97, authored 2026-08-13). The ruled-sheet direction: the
      // panel is a band ruled off the sheet, not an object drawn on it. So the 2px
      // accent rule down the left edge and the accent wash behind it are GONE — an
      // open-sided band has no side edges, and a gradient is a drawn surface.
      //
      // Losing them costs nothing in signalling. The round's colour budget allows
      // accent on ONE element, and this panel was spending it four times (left rule,
      // wash, live dot, selected histogram bar). What says "selected" is the word
      // SELECTED, the pulsing accent dot beside it, and now the rules that bracket
      // the band — form, not a tinted background.
      className="flex-none border-y-[3px] border-border p-3"
    >
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-faint">
          <span className="atl-liveDot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          SELECTED · {sel.kind.toUpperCase()}
        </span>
        {/* An explicit 26px square rather than padding round the glyph: padding
            alone gave 24.6 × 22.5, because the ✕ is taller than it is wide, and
            a target that passes on one axis only is not a 24px target (WCAG 2.2
            target-size minimum). The negative margin holds the original visual
            position. text-dim measures 3.17:1 on the panel, under the 4.5:1 AA
            floor, so the rest colour moves to text-muted at 6.91:1 (report 154 #9). */}
        <button
          onClick={onClear} aria-label="Clear selection" title="Clear selection"
          className="-m-[5px] inline-flex h-[26px] w-[26px] items-center justify-center rounded-sm text-[13px] leading-none text-muted hover:bg-elevated hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2.5">
        <div className="min-w-0">
          {/* Wraps, never clips. This is the REGION's identifier, and clipping it is
              the failure this project has already shipped once: on the export card a
              clipped "Dadra and Nagar Haveli and Daman and Diu" became the name of a
              different real region. `truncate` here was turning Uttar Bastar Kanker
              into "Uttar Bastar Kan…" directly above a list of indicator names this
              same round is protecting from exactly that. The approved panel sets
              .pnl-nm with a 1.15 line-height and no overflow rule — it wraps by
              design. A two-line region name makes the panel ~20px taller; a wrong
              region name makes the whole panel a lie. */}
          <div className="text-[18px] font-extrabold leading-tight tracking-tight text-bright">{sel.name}</div>
          <div className="text-[10.5px] text-faint">{sel.sub}</div>
        </div>
        {hasMetric && sel.value != null && (
          <span data-role="metric" className="whitespace-nowrap font-mono text-[24px] font-semibold leading-none text-bright">
            <CountUp value={sel.value} format={fmtFull} />
          </span>
        )}
      </div>
      {hasMetric && sel.value != null && (
        <>
          {/* bar.bar-shape = abutting-columns (R2, ledger row 98). The nine bins are a
              rank DISTRIBUTION, i.e. a histogram, and histogram bars abut because the
              variable is continuous; a gap says "nine unrelated categories". The 2px
              gap-0.5 that was here said the wrong thing about the data. */}
          <div className="mt-3 flex h-6 items-end gap-0" aria-hidden>
            {bins.map((b, i) => (
              <span key={i} data-role="bar" className="rankbin flex-1" style={{ height: `${b.h}%`, background: b.on ? "var(--accent)" : "var(--border)" }} />
            ))}
          </div>
          <div className="mt-2 text-[12px] text-muted">{sentence}</div>
        </>
      )}
      {hasMetric && sel.value == null && <div className="mt-2 text-[12px] text-muted">No data for this region on the current indicator.</div>}
      {drillLabel && (
        <button
          onClick={onDrill}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-border px-2 py-2 text-[11.5px] font-semibold text-foreground hover:border-accent-border hover:bg-elevated"
        >
          ▸ {drillLabel}
        </button>
      )}
      {/* A bare line of faint text directly under a bordered button read as a
          caption rather than a control (report 154 #7). Bordered and padded like
          the drill button above but one step quieter, since this expands in place
          rather than navigating. The chevron moves to the right — the
          conventional disclosure position, and it stops the label shifting
          sideways each time it flips. aria-expanded was missing entirely. */}
      <button
        onClick={loadAll} aria-expanded={allOpen}
        className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-sm border border-border-soft px-2 py-1.5 text-[10.5px] font-bold tracking-[.08em] text-muted hover:border-border hover:bg-elevated hover:text-foreground"
      >
        <span>ALL INDICATORS</span>
        <span aria-hidden className="text-[9px] text-faint">{allOpen ? "▾" : "▸"}</span>
      </button>
      {allOpen && (
        <div
          data-role="category-list"
          // No right padding: .atl-scroll's 6px scrollbar already takes its own
          // layout width, so the old pr-1 was 4px of pure inset — and 4px is about
          // one character of metric name at 268px, which is exactly what this round
          // is short of.
          className="atl-scroll mt-1 max-h-56 overflow-y-auto"
        >
          {allRows === null && <div className="py-2 text-[11px] text-muted">Loading…</div>}
          {allRows?.length === 0 && <div className="py-2 text-[11px] text-muted">No indicators for this region.</div>}
          {allRows && allRows.length > 0 &&
            Array.from(new Set(allRows.map((m) => m.category))).map((cat) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[.14em] text-faint">{cat}</div>
                {allRows.filter((m) => m.category === cat).map((m) => {
                  const shown = m.value.toLocaleString("en-IN", { maximumFractionDigits: m.decimals ?? 0 });
                  return (
                    <div key={m.id} className="border-b border-border-faint">
                      {/* Single-line row, 32px (design round `metric-row-cluster`, Option A,
                          locked 2026-08-10 — ledger rows 80-82). Same anatomy as the chooser
                          and the /metric index: name, dotted leader, figures — but this rail
                          row deliberately carries LESS than they do.

                          The round's own report flagged that at rail width the single-line row
                          clips long names ("Institutiona…", "Total popul…"), and doctrine 200
                          forbids truncating the identifier a reader needs to tell rows apart —
                          this project has already shipped that failure once, when clipping on
                          the export card turned "Dadra and Nagar Haveli and Daman and Diu" into
                          the name of a different real region.

                          What this row carries was settled by measurement, not preference. For
                          each of the 124 metrics, taking ITS OWN largest value (so the narrowest
                          name budget that metric can ever get, in any region), how many names
                          clip, and can a clipped name be read as a different metric?

                            name + leader + figure          8/124 clip, floor 177px, 0 collisions
                            + vintage                      34/124 clip, floor 140px, 0 collisions
                            + source sigil                 56/124 clip, floor  93px, 0 collisions
                            + sigil AND vintage            94/124 clip, floor  51px, 3 COLLISIONS

                          The last line is the approved panel's full rail row, and it fails:
                          "Households owning …" resolves to four different metrics, and
                          "Per-capita NSDP…" is indistinguishable from the metric actually called
                          "Per-capita NSDP". So the vintage is here and the sigil is not.

                          The sigil is not merely the more expensive of the two — it is the one
                          that cannot pay its own way here. A sigil is a lossy code that only
                          means anything beside the standing legend that expands it, and a 272px
                          rail has no room for a 23-publisher key; a bare "ORGI" in this column
                          would be a puzzle, where "2011" explains itself. The coverage mark could
                          not have stayed regardless: /api/region does not return `levels`.

                          The value column is `auto`, not the panel's fixed 58px, so every pixel a
                          short figure does not use goes back to the name. Provenance beyond the
                          vintage is not lost: the row is still a link to the publisher, and the
                          full source sits in its accessible name — which is also where the whole
                          metric name lives when the visible one clips. */}
                      <a
                        data-role="category-row"
                        href={m.source_url} target="_blank" rel="noopener noreferrer"
                        title={`${m.name} — ${m.source} · ${m.year}`}
                        aria-label={`${m.name}: ${shown}${m.unit ? ` ${m.unit}` : ""}${
                          m.estimated ? `, ${estimateNote(m.estimate_kind, m.estimated_from, m.shaky)}` : `, rank ${m.rank} of ${m.count}`
                        }. Source: ${m.source}, ${m.year}.`}
                        // No horizontal padding: the panel's own 12px inset already
                        // holds these rows off the edge, and the 8px it saves is
                        // ~2 characters of metric name at this width.
                        className="grid h-8 items-center gap-x-2 transition-colors duration-[160ms] hover:bg-elevated"
                        // Leader floor is 4px here, not the 12px the wide surfaces
                        // use: at this width the leader is decoration and the name
                        // is the identifier, so the tie breaks toward the name.
                        style={{ gridTemplateColumns: "minmax(0,auto) minmax(4px,1fr) 24px auto" }}
                      >
                        <span className="truncate text-[11px] text-muted">{m.name}</span>
                        <span aria-hidden className="h-0 border-b border-dotted border-border" />
                        {/* 24px is exact, not rounded up: every vintage is four digits and
                            measures 24.0px at 10px IBM Plex Mono. */}
                        <span className="text-right font-mono text-[10px] text-muted">{m.year}</span>
                        <span className="whitespace-nowrap font-mono text-[11px] text-bright">
                          {shown}
                          {/* Rank only, no "/of N" — that is the approved panel's own figure
                              block, and dropping the denominator returns ~24px to the metric
                              name on EVERY row, which is the single biggest thing standing
                              between this rail and doctrine 200. The denominator is not lost:
                              it is in the row's accessible name, and the panel states it in
                              full for the mapped indicator two lines above ("Rank 182 of
                              699"). */}
                          {m.estimated
                            ? <span
                                data-testid="est-badge"
                                data-shaky={m.shaky ? 1 : 0}
                                className={`ml-1 text-[9px] ${m.shaky ? "font-bold" : "text-accent-text"}`}
                                style={m.shaky ? { color: SHAKY_COLOR } : undefined}
                              >{estimateBadge(m.estimate_kind, m.shaky)}</span>
                            : <span className="ml-1 text-[9px] text-faint">#{m.rank}</span>}
                        </span>
                      </a>
                      {/* Why this number is an estimate, inline rather than hover-only
                          (item 642). A title attr never fires on touch, and
                          target_devices=both — so on a phone the footnote named every
                          parent but never which metric came from which. Reads "estimated
                          from Nirmal" for inherited, "Budget/Revised Estimate" for
                          projected, which has no donor to name. It hangs BELOW the row
                          rather than inside it: at 32px there is no second line, and
                          competing for the one line would have cost the metric name the
                          width this layout just spent three columns buying back. */}
                      {m.estimated ? (
                        <span
                          className={`block truncate px-1 pb-1 text-[9px] ${m.shaky ? "" : "text-faint"}`}
                          style={m.shaky ? { color: SHAKY_COLOR } : undefined}
                        >
                          {estimateShort(m.estimate_kind, m.estimated_from, m.shaky)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          {estParents.length > 0 && (
            <div className="mt-1 border-t border-border-faint pt-2 text-[10px] leading-snug text-muted">
              <span className="text-accent-text">{ESTIMATE_BADGE}</span> = inherited from{" "}
              <span className="text-muted">
                {estParents.length === 1
                  ? estParents[0]
                  : `${estParents.slice(0, -1).join(", ")} and ${estParents[estParents.length - 1]}`}
              </span>
              {estParents.length === 1
                ? ", the district this one was carved out of"
                : " — different surveys covered different districts, so these values come from different siblings"}
              . Each row names its own source above; each stands in until a survey covers this district directly.
            </div>
          )}
        </div>
      )}
      <span className="sr-only">{unit}</span>
    </div>
  );
}

/** Ranking + cohort filter (normal rail body). */
export function RankingRail({
  hasMetric, metricLabel, entries, rankOf, selectedCode, hoveredCode,
  districtsAll, rankView, onToggleRankView, sortDir, onToggleSortDir,
  cohorts, cohort, onCohort, cohortEnabled, scopeSub, fmtVal,
  onRowClick, onRowEnter, onRowLeave,
}: {
  hasMetric: boolean; metricLabel: string; entries: Entry[]; rankOf: Record<string, number>;
  selectedCode: string | null; hoveredCode: string | null;
  districtsAll: boolean; rankView: "top" | "bottom"; onToggleRankView: () => void;
  sortDir: "desc" | "asc"; onToggleSortDir: () => void;
  cohorts: CohortDef[]; cohort: string; onCohort: (k: string) => void; cohortEnabled: boolean;
  scopeSub: string; fmtVal: (v: number) => string;
  onRowClick: (e: Entry) => void; onRowEnter: (e: Entry) => void; onRowLeave: () => void;
}) {
  const [cohortOpen, setCohortOpen] = useState(false);
  const cohortBoxRef = useRef<HTMLDivElement>(null);
  useDismiss(cohortOpen, () => setCohortOpen(false), cohortBoxRef);
  const [q, setQ] = useState("");
  const activeCohort = cohorts.find((c) => c.key === cohort) ?? cohorts[0];
  const min = entries.length ? entries[entries.length - 1].value : 0;
  const max = entries.length ? entries[0].value : 1;
  const span = max - min || 1;

  type Row = { divider?: boolean; entry?: Entry; rank?: number };
  const rows = useMemo<Row[]>(() => {
    if (!hasMetric || !entries.length) return [];
    // rail search (iter-53 item 406): matches shown at their TRUE ranks,
    // bypassing cohort + Top/Bottom-25 slicing while active
    const needle = q.trim().toLowerCase();
    if (needle) {
      return entries
        .filter((e) => e.name.toLowerCase().includes(needle) || e.sub.toLowerCase().includes(needle))
        .slice(0, 60)
        .map((e) => ({ entry: e, rank: rankOf[e.code] }));
    }
    if (districtsAll) {
      // Slice over RANKED entries only (item 645). Slicing all entries made
      // nationwide "Bottom 25" show 25 rows holding 23 ranked districts — 37_750
      // and 14_770 are estimated and carry no rank, so the list was coherent but
      // did not contain what its label promised.
      const ranked = entries.filter((e) => !e.estimated);
      const slice = rankView === "bottom" ? ranked.slice(-25) : ranked.slice(0, 25);
      const out: Row[] = slice.map((e) => ({ entry: e, rank: rankOf[e.code] }));
      if (selectedCode) {
        const inSlice = slice.some((e) => e.code === selectedCode);
        if (!inSlice) {
          const selEntry = entries.find((e) => e.code === selectedCode);
          if (selEntry) { out.push({ divider: true }); out.push({ entry: selEntry, rank: rankOf[selEntry.code] }); }
        }
      }
      return out;
    }
    let pool = activeCohort?.codes ? entries.filter((e) => activeCohort.codes!.has(e.code)) : [...entries];
    if (sortDir === "asc") pool = [...pool].reverse();
    return pool.map((e) => ({ entry: e, rank: rankOf[e.code] }));
  }, [hasMetric, entries, districtsAll, rankView, sortDir, selectedCode, rankOf, activeCohort, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex-none border-b border-border-faint px-[18px] pb-3 pt-[15px]">
        {cohortEnabled && (
          <div ref={cohortBoxRef} className="mb-3.5 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[.14em] text-faint">FILTER</span>
            <button
              onClick={() => setCohortOpen((o) => !o)} aria-expanded={cohortOpen}
              className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 text-[12px] font-semibold text-foreground hover:border-faint"
            >
              {activeCohort?.name ?? "All states"} <span className="text-[9px] text-faint">▾</span>
            </button>
            {cohortOpen && (
              <div className="atl-pop absolute right-[18px] top-11 z-20 w-[196px] border border-border bg-panel-solid" style={{ boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}>
                {cohorts.map((c) => (
                  <button
                    key={c.key} onClick={() => { onCohort(c.key); setCohortOpen(false); }}
                    className="flex w-full items-center justify-between border-b border-border-faint px-3 py-2 text-left hover:bg-elevated"
                    style={{ background: cohort === c.key ? "#1f1b14" : undefined }}
                  >
                    <span className="text-[12.5px] font-semibold" style={{ color: cohort === c.key ? "#eae4d6" : "#ccc4b2" }}>{c.name}</span>
                    <span className="font-mono text-[9px] font-bold text-faint">{c.codes ? c.codes.size : entries.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[15.5px] font-extrabold leading-tight tracking-tight text-bright">
              {hasMetric
                ? districtsAll
                  ? rankView === "bottom" ? "Bottom districts" : "Top districts"
                  : `Ranked by ${metricLabel.toLowerCase()}`
                : "Ranking"}
            </div>
            <div className="mt-0.5 text-[10.5px] text-faint">{scopeSub}</div>
          </div>
          {hasMetric && (
            <button
              onClick={districtsAll ? onToggleRankView : onToggleSortDir}
              className="flex-none whitespace-nowrap rounded-sm border border-border px-2 py-1 font-mono text-[10px] font-semibold tracking-wide text-muted hover:border-accent-border hover:text-foreground"
            >
              {districtsAll ? (rankView === "bottom" ? "BOTTOM 25" : "TOP 25") : sortDir === "desc" ? "HIGH ↓" : "LOW ↑"}
            </button>
          )}
        </div>
        {hasMetric && (
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search the ranking"
            placeholder={districtsAll ? "Find a district…" : "Find a place…"}
            // A placeholder is read like any other text, so it carries the same
            // 4.5:1 floor: text-dim was 3.17:1, placeholder:text-faint is 5.02:1
            // (items 431/473). The focus:border-faint below is a 1px colour change
            // and was the ONLY thing marking this field as focused while
            // `input { outline: none }` stood in globals.css — it is now a second
            // cue behind the authored :focus-visible ring, not the whole indicator
            // (item 470).
            className="mt-2.5 w-full border border-border-soft bg-transparent px-2.5 py-1.5 text-[12px] text-bright placeholder:text-faint focus:border-faint"
          />
        )}
      </div>
      {hasMetric ? (
        <div className="atl-scroll min-h-0 flex-1 overflow-y-auto py-1.5 pl-[18px] pr-3">
          {rows.map((r, i) =>
            r.divider ? (
              <div key={`div-${i}`} className="py-1 text-center text-[12px] tracking-[.3em] text-border">· · ·</div>
            ) : r.entry ? (
              <button
                key={r.entry.code}
                onClick={() => onRowClick(r.entry!)} onMouseEnter={() => onRowEnter(r.entry!)} onMouseLeave={onRowLeave}
                className="flex w-full items-center gap-2 border-b border-border-faint px-1 py-[7px] text-left transition-transform hover:translate-x-[3px] hover:bg-elevated"
                style={{ background: r.entry.code === selectedCode ? "#17130e" : undefined }}
              >
                <span
                  className="h-[26px] w-[3px] flex-none transition-colors"
                  style={{ background: r.entry.code === selectedCode ? "#d1502f" : r.entry.code === hoveredCode ? "#8a8477" : "transparent" }}
                />
                <span data-testid="rail-rank" className="w-[22px] flex-none font-mono text-[10px] text-faint">
                  {/* Branch on the rank itself, not on `estimated` (item 645). The old
                      `?? 0` could only ever fire for a rankless row, which the
                      estimated check had already caught — so it was dead, and had it
                      ever fired it would have printed "00" as a rank. */}
                  {r.rank == null ? "—" : String(r.rank).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: r.entry.code === selectedCode ? "#f0e9db" : "#ccc4b2" }}>
                    {r.entry.name}
                  </span>
                  {r.entry.sub && <span className="block truncate text-[9.5px] text-faint">{r.entry.sub}</span>}
                  <span className="mt-1 block h-[3px] bg-[#1c1a12]">
                    <span
                      className="rankbar block h-full"
                      style={{
                        width: `${Math.max(4, Math.round(((r.entry.value - min) / span) * 100))}%`,
                        background: r.entry.code === selectedCode ? "#d1502f" : "#4a4433",
                      }}
                    />
                  </span>
                </span>
                <span className="flex-none whitespace-nowrap font-mono text-[11.5px] text-bright">
                  {fmtVal(r.entry.value)}
                  {r.entry.estimated ? (
                    <span
                      data-testid="est-badge"
                      data-shaky={r.entry.shaky ? 1 : 0}
                      className={`ml-1 text-[9px] ${r.entry.shaky ? "font-bold" : "text-accent-text"}`}
                      style={r.entry.shaky ? { color: SHAKY_COLOR } : undefined}
                      // Names the actual donor now that /api/metrics carries it
                      // (item 640). This said "the parent district" while the region
                      // panel said "Nirmal" for the same cell, both on screen at once.
                      // A shaky match (adr-026) gets the amber ⚠ badge + caution note.
                      title={estimateNote(r.entry.estimate_kind, r.entry.estimated_from, r.entry.shaky)}
                    >
                      {estimateBadge(r.entry.estimate_kind, r.entry.shaky)}
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null
          )}
        </div>
      ) : (
        <div className="flex-1 px-[18px] py-4 text-[12.5px] leading-relaxed text-muted">
          Pick an indicator and every place lines up here, first to last.
        </div>
      )}
    </div>
  );
}

/** Compare takeover (items 389): slots A/B + THE GAP. */
export function ComparePanel({
  hasMetric, metricLabel, scopeSub, slots, gap, sentence, onExit,
}: {
  hasMetric: boolean; metricLabel: string; scopeSub: string;
  slots: { label: string; accent: string; entry: { name: string; sub: string; val: string; barPct: number } | null; hint: string; onClear: () => void }[];
  gap: string | null; sentence: string; onExit: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border-soft px-[18px] py-[15px]">
        <div>
          <div className="text-[16px] font-extrabold tracking-tight text-bright">Compare</div>
          <div className="mt-0.5 text-[10.5px] text-faint">{hasMetric ? `${metricLabel} · ${scopeSub}` : "pick an indicator"}</div>
        </div>
        <button onClick={onExit} className="rounded-sm border border-border px-2 py-1 text-[10px] font-bold text-muted hover:text-foreground">EXIT</button>
      </div>
      <div className="atl-scroll min-h-0 flex-1 overflow-y-auto px-[18px] py-4">
        {slots.map((s) => (
          <div
            key={s.label}
            className="mb-2.5 px-3 py-3"
            style={{
              border: `1px solid ${s.entry ? "#4a4433" : "#2a2619"}`,
              borderLeft: `3px solid ${s.accent}`,
              background: s.entry ? "rgba(30,27,18,0.5)" : "transparent",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-bold tracking-[.14em] text-faint">{s.label}</span>
              {s.entry && <button onClick={s.onClear} aria-label={`Clear ${s.label}`} className="text-[11px] text-muted hover:text-foreground">✕</button>}
            </div>
            {s.entry ? (
              <>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-bold text-bright">{s.entry.name}</div>
                    <div className="text-[10px] text-faint">{s.entry.sub}</div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-[20px] font-semibold text-bright">{s.entry.val}</span>
                </div>
                <div className="mt-2 h-[5px] rounded-sm bg-[#1c1a12]">
                  <span className="rankbar block h-full rounded-sm" style={{ width: `${s.entry.barPct}%`, background: s.accent }} />
                </div>
              </>
            ) : (
              <div className="mt-2 text-[12.5px] leading-snug text-muted">{s.hint}</div>
            )}
          </div>
        ))}
        {gap && (
          <div className="mt-1.5 border-t border-border-soft pt-3.5">
            <div className="text-[10px] font-bold tracking-[.14em] text-faint">THE GAP</div>
            <div className="mt-1.5 font-mono text-[30px] font-semibold leading-none tracking-tight text-accent-text">{gap}</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#c4b9a9" }}>{sentence}</div>
          </div>
        )}
      </div>
    </div>
  );
}
