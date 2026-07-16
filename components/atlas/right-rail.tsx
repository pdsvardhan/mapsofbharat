"use client";

// Atlas right rail (iter-51 items 387/388/389/390):
//  · docked region profile — count-up value, 9-bin histogram, rank sentence
//  · cohort filter (states level) — real top-10 lists from our own metrics
//  · ranking list — High/Low sort; Top 25 / Bottom 25 at all-India districts
//    with the selected district pinned at its true rank
//  · compare takeover — A/B slots + THE GAP + plain-language read

import { useEffect, useMemo, useRef, useState } from "react";

import { ESTIMATE_BADGE, estimateNote, estimateShort, notRankedNote } from "@/lib/estimate-kind";

export type Entry = {
  code: string; name: string; sub: string; kind: "state" | "district"; value: number;
  estimated?: number;
  /** Which kind of estimate — 'inherited' | 'projected' | 'aggregated' (adr-021). */
  estimate_kind?: string | null;
  /** District that supplied this number; 'inherited' only — a projected figure has
   *  no donor (item 640). */
  estimated_from?: string | null;
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
};

const BINS = 9;

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
    // Bin REAL values only (item 641). Counting inherited copies made bin 1 read
    // 83% where the surveyed districts are 40% — three copies of West Siang's 55.4
    // stood in as three districts. Same denominator as the rank sentence below.
    let selBin: number | null = null;
    for (const e of entries) {
      if (e.estimated) continue;
      const bi = Math.min(BINS - 1, Math.floor(((e.value - min) / span) * BINS));
      counts[bi]++;
      if (e.code === sel.code) selBin = bi;
    }
    const mc = Math.max(...counts) || 1;
    // No highlighted bar when the selection is itself an estimate: it holds no
    // place in this distribution, and the sentence below says exactly that.
    const bins = counts.map((c, i) => ({ h: Math.max(8, Math.round((c / mc) * 100)), on: i === selBin }));
    // A null rank means the value is not this region's own measurement, so it has
    // no standing of its own to report. Never fall back to a number here:
    // `rank ?? 1` would announce a copied value as the top of the table.
    const selEntry = entries.find((e) => e.code === sel.code);
    if (rank == null) return { bins, sentence: notRankedNote(selEntry?.estimate_kind, selEntry?.estimated_from) };
    const N = entries.reduce((n, e) => n + (e.estimated ? 0 : 1), 0);
    const pct = N > 1 ? Math.round(((N - rank) / (N - 1)) * 100) : 100;
    return { bins, sentence: `Rank ${rank} of ${N} — ahead of ${pct}% of ${scopeNoun}.` };
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
    <div
      className="flex-none border-b border-border-soft px-[18px] py-[15px]"
      style={{ borderLeft: "2px solid #d1502f", background: "linear-gradient(90deg,rgba(209,80,47,.07),transparent)" }}
    >
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-faint">
          <span className="atl-liveDot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          SELECTED · {sel.kind.toUpperCase()}
        </span>
        <button onClick={onClear} aria-label="Clear selection" className="text-[12px] text-dim hover:text-foreground">✕</button>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2.5">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold leading-tight tracking-tight text-bright">{sel.name}</div>
          <div className="text-[10.5px] text-faint">{sel.sub}</div>
        </div>
        {hasMetric && sel.value != null && (
          <span className="whitespace-nowrap font-mono text-[24px] font-semibold leading-none text-bright">
            <CountUp value={sel.value} format={fmtFull} />
          </span>
        )}
      </div>
      {hasMetric && sel.value != null && (
        <>
          <div className="mt-3 flex h-6 items-end gap-0.5" aria-hidden>
            {bins.map((b, i) => (
              <span key={i} className="rankbar flex-1" style={{ height: `${b.h}%`, background: b.on ? "#d1502f" : "#3b3626" }} />
            ))}
          </div>
          <div className="mt-2 text-[12px] text-muted">{sentence}</div>
        </>
      )}
      {hasMetric && sel.value == null && <div className="mt-2 text-[12px] text-dim">No data for this region on the current indicator.</div>}
      {drillLabel && (
        <button
          onClick={onDrill}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-border px-2 py-2 text-[11.5px] font-semibold text-foreground hover:border-accent-border hover:bg-elevated"
        >
          ▸ {drillLabel}
        </button>
      )}
      <button
        onClick={loadAll}
        className="mt-2.5 block w-full text-left text-[10.5px] font-semibold tracking-wide text-faint hover:text-foreground"
      >
        {allOpen ? "▾ ALL INDICATORS" : "▸ ALL INDICATORS"}
      </button>
      {allOpen && (
        <div className="atl-scroll mt-1.5 max-h-56 overflow-y-auto pr-1">
          {allRows === null && <div className="py-2 text-[11px] text-dim">Loading…</div>}
          {allRows?.length === 0 && <div className="py-2 text-[11px] text-dim">No indicators for this region.</div>}
          {allRows && allRows.length > 0 &&
            Array.from(new Set(allRows.map((m) => m.category))).map((cat) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[.14em] text-dim">{cat}</div>
                {allRows.filter((m) => m.category === cat).map((m) => (
                  <div key={m.id} className="flex items-baseline justify-between gap-2 border-b border-border-faint py-1">
                    <span className="min-w-0 flex-1">
                      <a
                        href={m.source_url} target="_blank" rel="noopener noreferrer" title={`${m.source} · ${m.year}`}
                        className="block truncate text-[11px] text-muted hover:text-foreground"
                      >
                        {m.name}
                      </a>
                      {/* Why this number is an estimate, inline rather than hover-only
                          (item 642). A title attr never fires on touch, and
                          target_devices=both — so on a phone the footnote named every
                          parent but never which metric came from which. Reads "estimated
                          from Nirmal" for inherited, "Budget/Revised Estimate" for
                          projected, which has no donor to name. */}
                      {m.estimated ? (
                        <span className="block truncate text-[9px] text-dim">
                          {estimateShort(m.estimate_kind, m.estimated_from)}
                        </span>
                      ) : null}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-bright">
                      {m.value.toLocaleString("en-IN", { maximumFractionDigits: m.decimals ?? 0 })}
                      {m.estimated
                        ? <span
                            className="ml-1 text-[9px] text-accent"
                            title={estimateNote(m.estimate_kind, m.estimated_from)}
                          >{ESTIMATE_BADGE}</span>
                        : <span className="ml-1 text-[9px] text-dim">#{m.rank}/{m.count}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          {estParents.length > 0 && (
            <div className="mt-1 border-t border-border-faint pt-2 text-[10px] leading-snug text-dim">
              <span className="text-accent">{ESTIMATE_BADGE}</span> = inherited from{" "}
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
          <div className="mb-3.5 flex items-center justify-between">
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
                    <span className="font-mono text-[9px] font-bold text-dim">{c.codes ? c.codes.size : entries.length}</span>
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
            className="mt-2.5 w-full border border-border-soft bg-transparent px-2.5 py-1.5 text-[12px] text-bright placeholder:text-dim focus:border-faint"
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
                <span data-testid="rail-rank" className="w-[22px] flex-none font-mono text-[10px] text-dim">
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
                  {r.entry.sub && <span className="block truncate text-[9.5px] text-dim">{r.entry.sub}</span>}
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
                      className="ml-1 text-[9px] text-accent"
                      // Names the actual donor now that /api/metrics carries it
                      // (item 640). This said "the parent district" while the region
                      // panel said "Nirmal" for the same cell, both on screen at once.
                      title={estimateNote(r.entry.estimate_kind, r.entry.estimated_from)}
                    >
                      {ESTIMATE_BADGE}
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null
          )}
        </div>
      ) : (
        <div className="flex-1 px-[18px] py-4 text-[12.5px] leading-relaxed text-dim">
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
              {s.entry && <button onClick={s.onClear} aria-label={`Clear ${s.label}`} className="text-[11px] text-dim hover:text-foreground">✕</button>}
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
              <div className="mt-2 text-[12.5px] leading-snug text-dim">{s.hint}</div>
            )}
          </div>
        ))}
        {gap && (
          <div className="mt-1.5 border-t border-border-soft pt-3.5">
            <div className="text-[10px] font-bold tracking-[.14em] text-faint">THE GAP</div>
            <div className="mt-1.5 font-mono text-[30px] font-semibold leading-none tracking-tight text-accent">{gap}</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#c4b9a9" }}>{sentence}</div>
          </div>
        )}
      </div>
    </div>
  );
}
