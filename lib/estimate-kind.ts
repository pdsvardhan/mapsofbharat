// Why a value is an estimate — one sentence per kind, in one place (adr-021).
//
// `estimated` is a boolean answering two unrelated questions, so every surface
// that worded it from the flag alone could only tell one story. The rail told all
// 60 RBI Budget/Revised-Estimate state rows "Inherited from the parent district —
// this district formed after the source's survey": no parent, no inheritance, and
// states are not post-survey districts. Wording lives here so the rail, the map
// hover and the export footnote cannot drift apart again.

export type EstimateKind = "inherited" | "projected" | "aggregated";

/** Short badge, identical across kinds — all three are "not this region's own measurement". */
export const ESTIMATE_BADGE = "est.";

/**
 * The full explanation for one estimated value.
 *
 * `donor` is only ever meaningful for 'inherited'; the other kinds have nothing to
 * cite. An unknown kind falls back to a sentence that is true of every estimate
 * rather than guessing one of the three — guessing is the defect adr-021 removes.
 */
export function estimateNote(
  kind: EstimateKind | string | null | undefined,
  donor?: string | null
): string {
  switch (kind) {
    case "inherited":
      return donor
        ? `Inherited from ${donor} — this district formed after the survey, so this number is ${donor}'s, not its own measurement`
        : "Inherited from the district this one was carved out of — it formed after the source's survey, so this number is not its own measurement";
    case "projected":
      return "Budget or Revised Estimate — the state's own projection for a fiscal year that has not closed, not an audited actual";
    case "aggregated":
      return "Aggregated from the underlying rows — an exact sum for this area, not a separately measured figure";
    default:
      return "Estimated — see the methodology for how this number was derived";
  }
}

/**
 * Terse form for tight spots — the map tooltip is a single nowrap line, where the
 * full sentence cannot fit. Still names the donor: "estimated from parent" while
 * the region panel said "Nirmal" for the same cell is the confusion item 640 fixes.
 */
export function estimateShort(
  kind: EstimateKind | string | null | undefined,
  donor?: string | null
): string {
  switch (kind) {
    case "inherited":
      return donor ? `estimated from ${donor}` : "estimated from parent district";
    case "projected":
      return "Budget/Revised Estimate";
    case "aggregated":
      return "aggregated figure";
    default:
      return "estimated";
  }
}

/**
 * Does this value count toward distribution stats — min, max, mean, class breaks?
 *
 * The rule is "exclude copies, not projections" (adr-022):
 *
 *  - 'inherited' is a DUPLICATE. fill_new_districts only ever fills from a sibling
 *    that holds a real value for the same metric+year, so every inherited number
 *    equals a real number already in this set. Counting it double-counts one
 *    district — the defect behind items 611 and 639.
 *  - 'projected' is NOT a duplicate. It is that state's only figure, copied from
 *    nobody. Excluding it is what collapsed fiscal_deficit_pct_gsdp to a
 *    zero-width scale: min == max == 0.7645, one real row (Gujarat 2022) standing
 *    in for 31 states whose values actually run 0.54–6.92.
 *  - 'aggregated' is an exact sum of real rows — real information, counts.
 *
 * Allow-list, not deny-list: an estimate of unknown kind is excluded, because if
 * we cannot say whether it is a copy we must not risk double-counting it. That
 * also preserves the pre-adr-022 behaviour for anything unclassified.
 */
export function countsInStats(
  estimated: number | boolean | null | undefined,
  kind: EstimateKind | string | null | undefined
): boolean {
  if (!estimated) return true;
  return kind === "projected" || kind === "aggregated";
}

/**
 * "N of M districts estimated from a parent region" — the disclosure for surfaces
 * that TRAVEL: social cards and iframe embeds carry no tooltip, no rail and no
 * methodology link, so adr-019's point-of-use disclosure cannot reach them and the
 * footnote is the only place the caveat can live (item 643).
 *
 * Worded per kind, because "estimated from a parent" is false of an RBI
 * Budget/Revised Estimate. A scope mixing kinds falls back to a sentence true of
 * all of them rather than picking one. Empty when nothing is estimated, so a
 * fully-measured map gains no noise.
 */
export function estimateFootnote(
  entries: { estimated?: number | null; estimate_kind?: string | null }[],
  noun: string
): string {
  const est = entries.filter((e) => e.estimated);
  if (!est.length) return "";
  const M = entries.length;
  const kinds = new Set(est.map((e) => e.estimate_kind ?? "unknown"));
  if (kinds.size === 1) {
    const [k] = [...kinds];
    if (k === "inherited") return `${est.length} of ${M} ${noun} estimated from a parent region`;
    if (k === "projected") return `${est.length} of ${M} ${noun} are Budget/Revised Estimates, not actuals`;
    if (k === "aggregated") return `${est.length} of ${M} ${noun} aggregated from underlying rows`;
  }
  return `${est.length} of ${M} ${noun} estimated — see methodology`;
}

/** Rank-sentence clause for a value that carries no rank of its own. */
export function notRankedNote(kind: EstimateKind | string | null | undefined): string {
  switch (kind) {
    case "inherited":
      return "Value inherited from the parent district — not ranked.";
    case "projected":
      return "Budget or Revised Estimate, not an actual — not ranked.";
    case "aggregated":
      return "Aggregated figure — not ranked.";
    default:
      return "Estimated value — not ranked.";
  }
}
