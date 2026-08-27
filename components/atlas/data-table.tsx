"use client";

// Reusable data table for the atlas (iter-131 item 826): a semantic, sortable
// HTML <table> of the SAME rows the ranking rail computes, so the two surfaces
// can never disagree — the single-source rule this codebase keeps re-applying
// (legend vs paint, legend vs social card). It is fed `entries` + `rankOf`
// straight from india-map, not its own recomputation.
//
// Estimated values are marked with the shared estimate-kind labels (adr-021,
// adr-026) so the table agrees with the map hover, the rail badge and the export
// footnote instead of wording the flag a fourth way.
//
// Prop-driven and UI-library-free by design (component-pick gate: zero table
// candidates in master_components) so the canonical metric pages (#829) and the
// methodology / download page (#831) can reuse it without a map underneath.

import { useMemo, useState } from "react";

import { Entry } from "@/components/atlas/right-rail";
import { estimateBadge, estimateNote, estimateShort } from "@/lib/estimate-kind";

// Amber for a SHAKY inheritance — the same badge colour the rail uses (adr-026),
// so a weak sibling match reads as the same stronger caution here as everywhere.
// "Same colour" is now enforced rather than asserted: both read --shaky from
// globals.css instead of each carrying its own literal (to-do 502).
const SHAKY_COLOR = "var(--shaky)";

export type SortKey = "rank" | "name" | "value";

/** Shared minimum width for the left stack's segmented control groups (VIEW,
 *  LEVEL, BOUNDARIES). A minimum rather than a fixed width: the longest pair
 *  ("TODAY | 2011 AS REPORTED") is free to exceed it instead of clipping, while
 *  every shorter pair snaps to the same edge. Lives here because ViewToggle is
 *  one of the three and is defined in this file. */
export const SEGMENTED_WIDTH = "min-w-[188px]";

/** The map ⇄ table view control. Styled to match the LEVEL / VALUE segmented
 *  buttons in the left stack and legend, so the toggle reads as one of the atlas
 *  controls.
 *
 *  Rendered in exactly ONE place: the VIEW row of the left stack, which now
 *  stands in BOTH views (item 910). It used to be rendered a second time inside
 *  the table's own header, because the left stack went display:none with the map
 *  plate — so the control moved the moment it was used, measured at (127,356) in
 *  map view and (980,97) in table view. A control you have to re-find after
 *  operating it is the defect; one stable position is the fix, not two copies
 *  kept in sync.
 *
 *  Exported rather than inlined in left-stack.tsx because SEGMENTED_WIDTH and the
 *  table it toggles to both live in this file. */
export function ViewToggle({
  view, onView, fill = false,
}: {
  view: "map" | "table";
  onView: (v: "map" | "table") => void;
  /** Stretch to the shared control width the left stack's control rows use, so
   *  VIEW / LEVEL / BOUNDARIES line up instead of each group sizing to its own
   *  labels — MAP|TABLE is the shortest pair, so it was the visibly odd one out
   *  (report 154 #8). The left stack — the one place this renders — passes it;
   *  the default keeps the control content-sized for a use with no siblings to
   *  line up with. */
  fill?: boolean;
}) {
  return (
    <div
      // The space before `${` is load-bearing, not formatting. Tailwind extracts
      // candidates from the raw source text: a class glued straight onto an
      // interpolation is read as one token running into the `$` and its utility
      // is never emitted. That cost the action toolbar its counter-translate
      // earlier today (see india-map.tsx) — `border-border` survived here only
      // because other files spell it out in a plain string.
      className={`flex border border-border ${fill ? SEGMENTED_WIDTH : ""}`}
      role="group" aria-label="Choose map or table view"
    >
      {(["map", "table"] as const).map((v) => {
        const on = view === v;
        return (
          <button
            key={v} onClick={() => onView(v)} aria-pressed={on}
            // max-lg min-h: py-1 lands this pair on exactly 24px, WCAG 2.2
            // 2.5.8's floor with nothing to spare. On the touch surface it takes
            // the 26px the rest of the atlas uses for a finger. Matches the LEVEL
            // and BOUNDARIES pairs so the three rows stay a set at every width.
            className={`px-2.5 py-1 text-[10.5px] font-bold max-lg:min-h-[26px] ${fill ? "flex-1" : ""}`}
            style={{ background: on ? "var(--accent)" : "transparent", color: on ? "var(--accent-ink)" : "var(--muted)" }}
          >
            {v === "map" ? "MAP" : "TABLE"}
          </button>
        );
      })}
    </div>
  );
}

/** A keyboard-operable, aria-sort-annotated column header. The <button> is a real
 *  button, so Enter/Space toggle the sort natively; aria-sort lives on the <th>
 *  so assistive tech announces the current column and direction. */
function SortHeader({
  label, col, sortKey, dir, onSort, align = "left",
}: {
  label: string; col: SortKey; sortKey: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === col;
  const ariaSort: "none" | "ascending" | "descending" =
    active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      scope="col" aria-sort={ariaSort}
      className={`sticky top-0 z-10 bg-panel-solid px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button" onClick={() => onSort(col)}
        aria-label={`Sort by ${label.toLowerCase()}${active ? (dir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
        className={`inline-flex items-center gap-1 text-faint hover:text-foreground max-lg:min-h-[26px] ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        {/* KEPT on --accent (items 431/473). This caret is a sort-state MARKER, not
            text: it is aria-hidden and the state it shows is carried for real by
            aria-sort on the <th> and by the button's own aria-label, so nothing is
            read from its colour. As a graphical indicator it takes the 3:1 non-text
            floor, which --accent clears at 4.35:1 on --panel-solid. */}
        <span aria-hidden className="text-[8px] text-accent">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

/**
 * The table itself. `entries` is already scoped to what the map is showing (the
 * current drill state) and `rankOf` is the same rank map the rail renders, so the
 * two never disagree. Rankless copies (an inherited value carries no rank of its
 * own — adr-023) sort to the bottom under rank and show an em dash for rank.
 */
export function DataTable({
  metricLabel, unit, year, scopeNoun, boundaryNote,
  entries, rankOf, fmtVal, onRowClick, selectedCode,
}: {
  metricLabel: string; unit: string; year?: number;
  scopeNoun: string; boundaryNote?: string | null;
  entries: Entry[]; rankOf: Record<string, number>;
  fmtVal: (v: number) => string;
  onRowClick?: (e: Entry) => void;
  selectedCode?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    // A fresh column starts in its natural direction: best rank / A→Z at the top,
    // highest value at the top.
    else { setSortKey(k); setDir(k === "value" ? "desc" : "asc"); }
  };

  const isDistrict = entries.some((e) => e.kind === "district");

  const rows = useMemo(() => {
    const withRank = entries.map((e) => ({ e, rank: rankOf[e.code] ?? null }));
    const sign = dir === "asc" ? 1 : -1;
    return withRank.sort((a, b) => {
      if (sortKey === "name") return sign * a.e.name.localeCompare(b.e.name, "en");
      if (sortKey === "value") return sign * (a.e.value - b.e.value);
      // rank: a copy holds no rank of its own, so it sinks to the bottom in BOTH
      // directions rather than claiming rank 1 when sorted ascending.
      if (a.rank == null && b.rank == null) return b.e.value - a.e.value;
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return sign * (a.rank - b.rank);
    });
  }, [entries, rankOf, sortKey, dir]);

  const unitParen = unit ? (unit === "%" ? " (%)" : ` (${unit})`) : "";
  const caption =
    `${metricLabel}${unitParen} — ${entries.length} ${scopeNoun}` +
    `${year ? ` · ${year}` : ""}${boundaryNote ? ` · ${boundaryNote}` : ""}`;
  // Value formatting matches the map's fmtFull (fmtVal + "%") so a cell here reads
  // identically to the same region's tooltip and rail row.
  const fmtCell = (v: number) => fmtVal(v) + (unit === "%" ? "%" : "");

  if (!entries.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[13px] text-muted">
        Pick an indicator and every place lines up here, first to last.
      </div>
    );
  }

  return (
    // Design-round stamps (2026-08-11): data-oid/data-role are read by the
    // Ottomate design pipeline to derive this component's anatomy, and by the
    // constraint checker, which asserts that the same data-role resolves to the
    // same styling wherever it appears. Presentational no-ops. This is the
    // REGION-ROW archetype: the metric-row cluster's locked decisions do not
    // govern it, which is why it needs a round of its own (to-do 428 item 913).
    // The component mounts twice — the /metric/<id> detail page and the atlas
    // table view — so a change here lands on both.
    // FOCUSABLE, because a keyboard has no other way to scroll this (#631, iter-45).
    // Measured on /metric/[slug]: 23,339px of ranked districts inside a 638px viewport -
    // 36 screens - with exactly three focusable elements, all within the first 44px,
    // which are the sort buttons in the header. A keyboard user could reach 0.2% of it.
    //
    // axe passed it the whole time: scrollable-region-focusable is satisfied by ANY
    // focusable descendant, and three header buttons qualify. The embed snippet in
    // metric-share.tsx got tabIndex + role=region in iter-44 for exactly this reason,
    // and only because it had NO focusable children for axe to find. The to-do filed the
    // difference as "an odd asymmetry - review"; it was the same defect with a better
    // disguise, and tests/a11y.spec.ts now asks the question axe cannot - whether focus
    // alone can drive the box to its bottom.
    //
    // role=region + a name, not a bare tabIndex: focusable without a name is just an
    // unlabelled tab stop, which is the trade metric-share.tsx already documents.
    <div
      data-oid="metric-rank-table"
      tabIndex={0}
      role="region"
      aria-label={`${metricLabel} rankings, scrollable`}
      className="atl-scroll min-h-0 flex-1 overflow-auto"
    >
      {/* Five columns — rank, region, state, value, estimate — do not fit a 374px
          plate at a readable size. Below lg the table keeps a real minimum and
          SCROLLS inside this box rather than compressing; the scroll is contained
          (the parent is overflow-auto), so the page itself never gains a
          horizontal scrollbar. Dropping a column instead was not an option: the
          estimate cell is a disclosure (item 643) and the state cell is what
          disambiguates same-named districts in the all-India scope. */}
      <table className="w-full border-collapse text-left max-lg:min-w-[480px]">
        <caption className="px-3 pb-2 pt-3 text-left text-[11px] leading-snug text-faint">
          {caption}
        </caption>
        <thead>
          <tr>
            <SortHeader label="Rank" col="rank" sortKey={sortKey} dir={dir} onSort={onSort} />
            <SortHeader label="Region" col="name" sortKey={sortKey} dir={dir} onSort={onSort} />
            {isDistrict && (
              <th scope="col" className="sticky top-0 z-10 bg-panel-solid px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[.1em] text-faint">
                State
              </th>
            )}
            <SortHeader label="Value" col="value" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
            <th scope="col" className="sticky top-0 z-10 bg-panel-solid px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[.1em] text-faint">
              Estimate
            </th>
          </tr>
        </thead>
        <tbody data-role="region-list">
          {rows.map(({ e, rank }) => {
            const on = e.code === selectedCode;
            return (
              <tr
                key={e.code}
                data-role="region-row"
                data-testid="data-table-row"
                onClick={onRowClick ? () => onRowClick(e) : undefined}
                // region-row.selected-affordance (R4, ledger row 101). Three things
                // were wrong here and all three were invisible to the suite:
                //   1. #17130e was a hard-coded literal, and the WRONG one of the two
                //      values this app used for a selected row.
                //   2. Selection was signalled by COLOUR ALONE. That is a floor, not a
                //      preference, and it got worse the moment to-do 503 wired row
                //      selection on — before that the state was unreachable.
                //   3. No aria-current, so a screen reader was told nothing at all.
                // The fix INHERITS the chooser's answer (chooser.tsx region-row) rather
                // than inventing a third: surface step + a 6px accent marker + the aria
                // state. Two components, same archetype, same question, one answer.
                aria-current={on ? "true" : undefined}
                className={`border-b border-border-faint ${onRowClick ? "cursor-pointer hover:bg-elevated" : ""}`}
                style={{ background: on ? "var(--selected-row)" : undefined }}
              >
                <td className="px-3 py-1.5 font-mono text-[11px] text-faint">
                  {/* The marker is decorative — aria-current above is what carries the
                      state to a reader, so this is aria-hidden. 6px non-text, judged
                      against the 3:1 UI floor rather than 4.5:1. */}
                  {on && (
                    <span
                      aria-hidden
                      data-testid="row-selected-marker"
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                  {rank == null ? "—" : rank}
                </td>
                <th scope="row" className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-bright">
                  {e.name}
                </th>
                {isDistrict && (
                  <td className="px-3 py-1.5 text-[11px] text-faint">{e.sub || "—"}</td>
                )}
                <td className="px-3 py-1.5 text-right font-mono text-[12px] text-bright">
                  {fmtCell(e.value)}
                </td>
                <td data-role="region-estimate" className="px-3 py-1.5 text-[11px]">
                  {e.estimated ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        data-testid="est-badge" data-shaky={e.shaky ? 1 : 0}
                        className={`font-mono text-[10px] ${e.shaky ? "font-bold" : "text-accent-text"}`}
                        style={e.shaky ? { color: SHAKY_COLOR } : undefined}
                        title={estimateNote(e.estimate_kind, e.estimated_from, e.shaky)}
                      >
                        {estimateBadge(e.estimate_kind, e.shaky)}
                      </span>
                      <span
                        className={e.shaky ? "" : "text-faint"}
                        style={e.shaky ? { color: SHAKY_COLOR } : undefined}
                      >
                        {estimateShort(e.estimate_kind, e.estimated_from, e.shaky)}
                      </span>
                    </span>
                  ) : (
                    // KEPT on --dim (items 431/473). This em dash is the one use of
                    // --dim in the app that is not text a reader reads: it is
                    // aria-hidden, it stands in for an EMPTY cell, and the
                    // information is the absence, not the glyph. Raising it would
                    // print "no estimate" louder than the estimates beside it.
                    <span className="text-dim" aria-hidden>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
