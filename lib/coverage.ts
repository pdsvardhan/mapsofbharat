// Data-provenance / coverage classes (iter-131 item 830).
//
// MoB already tracks, per region per metric, whether a value is the region's own
// measurement or an estimate — and of WHICH kind (lib/estimate-kind: 'inherited'
// | 'projected' | 'aggregated', adr-021). That flag has only ever surfaced as a
// small badge. This module turns it into a first-class VIEW: one categorical
// class per region, so the map can shade by DATA PROVENANCE instead of by value.
//
// The four provenance classes named in the item-830 spec map onto the three real
// estimate kinds like this:
//   measured      → the value is not estimated (the region's own measurement)
//   re-aggregated → estimate_kind 'aggregated'  (an exact sum of underlying rows)
//   inherited     → estimate_kind 'inherited'   (copied from a donor/parent region)
//   projected     → estimate_kind 'projected'   (an RBI Budget/Revised Estimate)
// "re-aggregated" is NOT a distinct fourth kind in the data — it is the existing
// 'aggregated' kind, relabelled for the coverage surface. There is no separate
// re-aggregation kind to collapse, so all three estimate kinds are represented.
//
// The palette is a FUNCTIONAL choice, deliberately kept apart from every value
// ramp in lib/breaks (viridis family + RdBu diverging): those are ordered
// gradients, this is a categorical key, and the two must never be confused. The
// hues are the Okabe–Ito colour-blind-safe set (bluish-green / sky-blue /
// orange / reddish-purple), which reads as the spec's suggested teal-green /
// blue / amber / violet and stays legible over the dark #0d0f14 panel/background.

export type ProvenanceClass = "measured" | "aggregated" | "inherited" | "projected";

/** Canonical order: measured first (the good case), then the estimate kinds. */
export const PROVENANCE_CLASSES: ProvenanceClass[] = [
  "measured",
  "aggregated",
  "inherited",
  "projected",
];

/** Human label. 'aggregated' shows as "Re-aggregated" to match the spec's naming
 *  and the BOUNDARIES card's "reaggregated via the crosswalk" wording. */
export const PROVENANCE_LABEL: Record<ProvenanceClass, string> = {
  measured: "Measured",
  aggregated: "Re-aggregated",
  inherited: "Inherited",
  projected: "Projected",
};

/** One-line meaning for each class — legend footnotes, tooltips. */
export const PROVENANCE_NOTE: Record<ProvenanceClass, string> = {
  measured: "the region's own reported measurement",
  aggregated: "an exact sum of the underlying rows",
  inherited: "copied from the parent region it was carved out of",
  projected: "a Budget/Revised Estimate, not an audited actual",
};

/** Categorical fills — Okabe–Ito, colour-blind-safe and distinct from the value
 *  ramps. Luminances span 0.47–0.64, all well clear of the dark backdrop.
 *
 *  no-token: a data palette, not a set of UI roles. Okabe–Ito is chosen as a whole
 *  for its colour-blind separation, so the four values are only correct together —
 *  pulling them into the theme would invite someone to retune one to match the
 *  interface and quietly break the property the set exists for. Sibling to PALETTES
 *  in lib/breaks.ts and CAT_ACCENT in components/atlas/cats.ts. */
export const PROVENANCE_COLOR: Record<ProvenanceClass, string> = {
  measured: "#009e73", // bluish green (teal)
  aggregated: "#56b4e9", // sky blue
  inherited: "#e69f00", // amber / orange
  projected: "#cc79a7", // reddish purple (violet)
};

/** Fill for a region whose class is toggled OFF, or which has no value — it
 *  recedes to the map's neutral no-data tone so the visible classes stand out. */
export const PROVENANCE_MUTED = "#2a271d"; // token: --map-nodata

/** Which provenance class one value belongs to. An estimate of unknown kind is
 *  treated as 'inherited' (the modal, and the most conservative disclosure) so a
 *  value is never silently promoted to "measured". */
export function provenanceOf(
  estimated: number | boolean | null | undefined,
  kind: string | null | undefined,
): ProvenanceClass {
  if (!estimated) return "measured";
  if (kind === "aggregated") return "aggregated";
  if (kind === "projected") return "projected";
  return "inherited";
}

export type CoverageCounts = Record<ProvenanceClass, number>;

/** Tally a set of rows into the four provenance classes. Reused by the map trust
 *  surface, the coverage legend and the /coverage page so every count agrees. */
export function coverageCounts(
  rows: { estimated?: number | null; estimate_kind?: string | null }[],
): CoverageCounts {
  const c: CoverageCounts = { measured: 0, aggregated: 0, inherited: 0, projected: 0 };
  for (const r of rows) c[provenanceOf(r.estimated, r.estimate_kind)] += 1;
  return c;
}

/** "612 of 730 districts measured · 118 inherited" — the per-metric coverage stat
 *  for the trust surface. Lists each non-empty estimate class after the measured
 *  share, so a projected/aggregated metric reads accurately too. */
export function coverageStat(counts: CoverageCounts, total: number, noun: string): string {
  const n = (x: number) => x.toLocaleString("en-IN");
  const est = (["inherited", "aggregated", "projected"] as ProvenanceClass[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${n(counts[k])} ${PROVENANCE_LABEL[k].toLowerCase()}`);
  return `${n(counts.measured)} of ${n(total)} ${noun} measured${est.length ? ` · ${est.join(" · ")}` : ""}`;
}
