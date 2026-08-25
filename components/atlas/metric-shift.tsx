"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_PALETTE,
  METRIC_REFERENCE,
  PALETTES,
  SUGGESTED_PALETTE,
  colorFor,
  computeBreaks,
  selectMethod,
} from "@/lib/breaks";
import {
  cellCentre,
  gridDims,
  linear,
  rankOrder,
  sharedCodes,
  statsValues,
} from "@/lib/metric-shift-layout";
import type { TransitionPartner } from "@/lib/metric-pairs";

// The metric-to-metric transition (#547 phase C, iter-42 items 978 + 980).
//
// One dot per region on the shared set of two metrics, laid out as a RANK GRID
// under whichever metric is in view. Re-sorting swaps the ranking metric and
// the dots swim to their new cells — ~1s on position, colour following AFTER
// the move settles, which is Heer & Robertson (2007)'s staging: change one
// thing at a time so the eye can track objects through the change. Object
// constancy comes from stable React keys (the region code).
//
// The standing rule from R1 is honoured by construction: this never animates a
// fill across TIME — both metrics are one instant, and what animates is the
// comparison between them.
//
// prefers-reduced-motion does not get a slower version of the animation; it
// gets a DIFFERENT RENDERING — the static two-axis scatter, which carries both
// metrics at once so nothing needs to move at all. R1 rules that rendering IS
// the fallback rather than a third product. Loading a comparison announces via
// aria-live in BOTH modes; a re-sort additionally announces in grid mode - in
// scatter mode there is no re-sort to announce, because nothing moves. The
// picker is a native <select>, keyboard operable for free.
//
// No new dependency (owner call at the iter-42 gate): positions are plain
// math, the staging is CSS transitions on SVG transforms. adr-032 stays intact
// as written. If staging quality ever proves insufficient in practice, D3 is
// the recorded escape hatch — with evidence and its own ADR.

type Meta = {
  id: string;
  name: string;
  category: string;
  unit: string;
  year: number;
  decimals: number;
};

type Props = {
  base: Meta;
  level: "district" | "state";
  values: Record<string, number>;
  /** adr-022 metadata for the base metric: which codes are estimates, and of
   *  what kind. Edges are computed over the copy-free subset; every dot is
   *  still painted. */
  estimated: Record<string, 1>;
  estimateKind: Record<string, string>;
  names: Record<string, string>;
  partners: TransitionPartner[];
};

const WIDTH = 700;
const MOVE_MS = 1000;
const FILL_MS = 400;

function paletteFor(category: string) {
  const id = SUGGESTED_PALETTE[category] ?? DEFAULT_PALETTE;
  return PALETTES[id].fn;
}

/** Class edges + colour for one metric — the atlas's own selector and breaks
 *  (adr-033), computed over the copy-free stats subset (adr-022) while every
 *  dot still gets painted. `vals` must already be the stats subset. */
function colourer(meta: Meta, vals: number[]) {
  const ref = METRIC_REFERENCE[meta.id] ?? null;
  const method = selectMethod(vals, { isPct: meta.unit === "%", reference: ref }).method;
  const edges = computeBreaks(vals, method, 5, ref);
  let min = Infinity;
  let max = -Infinity;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const pal = paletteFor(meta.category);
  return (v: number) => colorFor(v, min, max, edges, pal);
}

function fmt(v: number, meta: Meta): string {
  return (
    v.toLocaleString("en-IN", { maximumFractionDigits: meta.decimals }) +
    (meta.unit === "%" ? "%" : "")
  );
}

export function MetricShift({
  base,
  level,
  values,
  estimated,
  estimateKind,
  names,
  partners,
}: Props) {
  const [partnerId, setPartnerId] = useState<string>("");
  const [partnerValues, setPartnerValues] = useState<Record<string, number> | null>(null);
  const [partnerEst, setPartnerEst] = useState<{
    estimated: Record<string, 1>;
    estimateKind: Record<string, string>;
  }>({ estimated: {}, estimateKind: {} });
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [view, setView] = useState<"base" | "partner">("base");
  const [reduced, setReduced] = useState(false);
  const [announce, setAnnounce] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const partner = useMemo(
    () => partners.find((p) => p.id === partnerId) ?? null,
    [partners, partnerId]
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Shareable state: ?vs=<partner> read once, written on every pick. Extends
  // the URL-state scheme the atlas already uses rather than a parallel store.
  useEffect(() => {
    const vs = new URLSearchParams(window.location.search).get("vs");
    if (vs && partners.some((p) => p.id === vs)) setPartnerId(vs);
    // Mount only: later URL edits come from this component itself, and partners
    // are SSR props that never change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useCallback(
    (id: string) => {
      setPartnerId(id);
      setView("base");
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("vs", id);
      else url.searchParams.delete("vs");
      history.replaceState(null, "", url.toString());
    },
    []
  );

  useEffect(() => {
    if (!partnerId) {
      setPartnerValues(null);
      setLoadState("idle");
      return;
    }
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoadState("loading");
    fetch(`/api/metrics/${encodeURIComponent(partnerId)}?level=${level}`, {
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (d: {
          values?: Record<string, number>;
          estimated?: Record<string, 1>;
          estimate_kind?: Record<string, string>;
        }) => {
          if (ctl.signal.aborted) return;
          if (!d.values || !Object.keys(d.values).length) throw new Error("empty");
          setPartnerValues(d.values);
          setPartnerEst({
            estimated: d.estimated ?? {},
            estimateKind: d.estimate_kind ?? {},
          });
          setLoadState("idle");
          // Announce the number the view will DRAW - the shared set - not the
          // fetch size, which is a transport detail no reader placed.
          const common = Object.keys(d.values).filter((c) => values[c] != null).length;
          setAnnounce(`Comparison loaded: ${common} ${level}s in common shown.`);
        }
      )
      .catch((e) => {
        if (ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setPartnerValues(null);
        setLoadState("error");
      });
    return () => ctl.abort();
  }, [partnerId, level]);

  const shared = useMemo(
    () => (partnerValues ? sharedCodes(values, partnerValues) : []),
    [values, partnerValues]
  );

  const scene = useMemo(() => {
    if (!partner || !partnerValues || !shared.length) return null;
    const dims = gridDims(shared.length, WIDTH);
    const current = view === "base" ? base : partner;
    const currentValues = view === "base" ? values : partnerValues;
    const posIndex = new Map(
      rankOrder(currentValues, shared).map((code, i) => [code, i])
    );
    // Edges over the copy-free subset (adr-022); paint over everything. If a
    // metric were somehow all copies on this set, fall back to all values
    // rather than classing on nothing - impossible today (no metric is wholly
    // estimated), but coded rather than assumed.
    const est = view === "base" ? estimated : partnerEst.estimated;
    const kind = view === "base" ? estimateKind : partnerEst.estimateKind;
    const stats = statsValues(shared, currentValues, est, kind);
    const fill = colourer(
      current,
      stats.length ? stats : shared.map((c) => currentValues[c])
    );

    // The reduced-motion rendering: both metrics at once, nothing moving.
    const baseVals = shared.map((c) => values[c]);
    const partnerVals = shared.map((c) => partnerValues[c]);
    const ext = (vs: number[]) => [Math.min(...vs), Math.max(...vs)] as const;
    const [bMin, bMax] = ext(baseVals);
    const [pMin, pMax] = ext(partnerVals);
    const scatterHeight = 420;
    const pad = 28;

    return {
      dims,
      current,
      fill,
      posIndex,
      currentValues,
      scatter: {
        height: scatterHeight,
        x: (c: string) => pad + linear(values[c], bMin, bMax, WIDTH - 2 * pad),
        y: (c: string) =>
          scatterHeight - pad - linear(partnerValues[c], pMin, pMax, scatterHeight - 2 * pad),
      },
    };
  }, [partner, partnerValues, partnerEst, shared, view, base, values, estimated, estimateKind]);

  const resort = useCallback(
    (next: "base" | "partner") => {
      if (next === view || !partner) return;
      setView(next);
      const name = next === "base" ? base.name : partner.name;
      setAnnounce(`Re-sorted by ${name}. ${shared.length} ${level}s re-ranked.`);
    },
    [view, partner, base.name, shared.length, level]
  );

  const regionNoun = level === "district" ? "districts" : "states";

  return (
    <div data-shift data-shift-mode={reduced ? "scatter" : "grid"}>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      <label className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-muted">Re-rank against</span>
        <select
          data-shift-picker
          value={partnerId}
          onChange={(e) => pick(e.target.value)}
          className="max-w-full border border-border bg-transparent px-2 py-1 text-[13px] text-foreground"
          style={{ background: "var(--panel-solid)" }}
        >
          <option value="">Choose a metric…</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.category ? `${p.category} · ` : ""}
              {p.name} ({p.year})
            </option>
          ))}
        </select>
      </label>

      {loadState === "error" ? (
        <p className="mt-4 text-[13px] text-muted" data-shift-error>
          That metric could not be loaded just now — pick another, or try again.
        </p>
      ) : null}

      {scene && partner ? (
        <>
          {!reduced ? (
            <div
              className="mt-4 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Which metric ranks the dots"
            >
              {(
                [
                  ["base", base] as const,
                  ["partner", partner] as const,
                ]
              ).map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  data-shift-sort={key}
                  aria-pressed={view === key}
                  onClick={() => resort(key)}
                  className={
                    "border px-3 py-1 text-[12px] font-semibold " +
                    (view === key
                      ? "border-accent-border bg-accent text-accent-ink"
                      : "border-border text-muted hover:text-foreground")
                  }
                >
                  Sorted by {m.name}
                </button>
              ))}
            </div>
          ) : null}

          {!reduced ? (
            <>
              <svg
                viewBox={`0 0 ${WIDTH} ${scene.dims.height}`}
                className="mt-4 block h-auto w-full"
                role="img"
                aria-label={`${shared.length} ${regionNoun}, one dot each, ranked by ${scene.current.name}. Highest first, reading left to right.`}
              >
                {shared.map((code) => {
                  const i = scene.posIndex.get(code) ?? 0;
                  const { x, y } = cellCentre(i, scene.dims);
                  const v = scene.currentValues[code];
                  return (
                    <circle
                      key={code}
                      data-shift-dot={code}
                      r={Math.max(2, scene.dims.cell * 0.36)}
                      fill={scene.fill(v)}
                      style={{
                        transform: `translate(${x}px, ${y}px)`,
                        transition: `transform ${MOVE_MS}ms ease-in-out, fill ${FILL_MS}ms ease ${MOVE_MS}ms`,
                      }}
                    >
                      <title>
                        {`${names[code] ?? code} — ${base.name}: ${fmt(values[code], base)} · ${partner.name}: ${fmt(scene && partnerValues ? partnerValues[code] : 0, partner)}`}
                      </title>
                    </circle>
                  );
                })}
              </svg>
              <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
                Each dot is one of the {shared.length} {regionNoun} both metrics cover,
                placed by rank under the sorting metric — highest first, reading left to
                right. Colours class the sorting metric the way the map does. Re-sort and
                a dot keeps its identity while it moves, so you can follow any {level}{" "}
                through the change.
              </p>
            </>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${WIDTH} ${scene.scatter.height}`}
                className="mt-4 block h-auto w-full"
                role="img"
                aria-label={`${shared.length} ${regionNoun} plotted on two axes: ${base.name} across, ${partner.name} up. Both metrics shown at once, nothing animated.`}
              >
                {shared.map((code) => (
                  <circle
                    key={code}
                    data-shift-dot={code}
                    cx={scene.scatter.x(code)}
                    cy={scene.scatter.y(code)}
                    r={3}
                    fill={scene.fill(scene.currentValues[code])}
                  >
                    <title>
                      {`${names[code] ?? code} — ${base.name}: ${fmt(values[code], base)} · ${partner.name}: ${fmt(partnerValues ? partnerValues[code] : 0, partner)}`}
                    </title>
                  </circle>
                ))}
              </svg>
              <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
                Motion is off, so both metrics are shown at once: {base.name} runs across,{" "}
                {partner.name} runs up, one dot per {level}. This is the same comparison
                the animated view makes, with nothing moving.
              </p>
            </>
          )}
        </>
      ) : partnerId && loadState === "loading" ? (
        <p className="mt-4 text-[13px] text-faint" data-shift-loading>
          Loading…
        </p>
      ) : null}
    </div>
  );
}
