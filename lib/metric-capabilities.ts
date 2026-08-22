import { isCountUnit, symbolEligible, EXTENSIVE_NOT_SYMBOLISED } from "@/lib/symbols";

// Which visualisation forms a metric may honestly be drawn in, and why (#575).
//
// THE RULE THIS ENCODES. The form is a property of the DATA, not a reader
// preference: a count drawn as a choropleth inherits area-size bias no palette
// can remove, and a rate drawn as circles invents a distortion that
// normalisation had already solved. So the reader is never offered a form that
// lies about the quantity in front of them. That is not "no choice" — it is
// choice among honest options, which is a different thing and the reason this
// file returns a ranked list rather than a boolean.
//
// WHY IT LIVES IN ONE PLACE. Before this, the same judgement was spread across
// isCountUnit's unit Set, symbolEligible's sign check, the negative-value
// exclusion for forest_change_km2, and the EXTENSIVE_NOT_SYMBOLISED list. Four
// sites, no single answer to "what may this metric be drawn as", and #567 was
// exactly the cost: a claim in one of them ("area bias can only bite those 9")
// that the other three contradicted. A browse-by-form page makes every one of
// these calls public, so they need one resolver and one test.
//
// THREE STATES, NOT TWO. A binary would force choropleth-of-a-count to be either
// "valid" (hiding that it distorts) or "invalid" (when it is what every other
// atlas prints, and a reader may legitimately want to compare). So:
//
//   preferred   — the honest instrument for this quantity; opens by default
//   available   — defensible, with a stated caveat; offered in the toggle
//   unsuitable  — misrepresents the quantity; never offered, at all
//
// `reason` is product copy, not a debug string: it is what a browse page prints
// under the metric and what a tooltip explains on the toggle. Write it for a
// reader, not for us.

export type VizId = "choropleth" | "symbol";

export type Standing = "preferred" | "available" | "unsuitable";

export type Capability = {
  viz: VizId;
  standing: Standing;
  /** Reader-facing. Shown in browse listings and on the form toggle. */
  reason: string;
};

export const VISUALIZATIONS: Record<VizId, { name: string; suits: string }> = {
  choropleth: {
    name: "Shaded map",
    suits: "Rates, shares and densities — anything already measured per person, per household or per square kilometre.",
  },
  symbol: {
    name: "Proportional circles",
    suits: "Totals that add up across districts — people, tonnes, head of livestock — where shading would let a large district shout.",
  },
};

/** Ranking, best first. Any list this module returns is sorted by it. */
const ORDER: Record<Standing, number> = { preferred: 0, available: 1, unsuitable: 2 };

/** Metric ids that are EXTENSIVE but not currently drawn as circles.
 *
 *  Derived from lib/symbols.ts rather than restated, so the two cannot drift.
 *  These are the honest edge of phase 1: the quantity genuinely adds up, so a
 *  shaded map does distort it, but its unit string is not in COUNT_UNITS and the
 *  renderer therefore never offers circles. Recorded as a KNOWN DIVERGENCE, not
 *  quietly resolved either way — the fix is a product decision (turn them on) and
 *  is not this file's to take. tests/metric-capabilities.spec.ts asserts the
 *  divergence explicitly so it stays visible until someone decides. */
const EXTENSIVE_UNRENDERED = new Set(EXTENSIVE_NOT_SYMBOLISED.map((m) => m.id));

export function isExtensivePending(metricId: string): boolean {
  return EXTENSIVE_UNRENDERED.has(metricId);
}

/**
 * Every form this metric may be drawn in, best first.
 *
 * `values` are needed, not just the unit: forest_change_km2 carries a count unit
 * (km²) but is SIGNED, and a circle sized by area cannot say which direction the
 * change went. That is decided from the data so a future signed count is caught
 * without anyone remembering to name it.
 */
export function capabilitiesFor(
  metricId: string,
  unit: string | null | undefined,
  values: readonly (number | null | undefined)[]
): Capability[] {
  const counts = isCountUnit(unit);
  const symbolOk = symbolEligible(unit, values);
  const out: Capability[] = [];

  if (symbolOk) {
    out.push({
      viz: "symbol",
      standing: "preferred",
      reason: "This is a total, so circle size shows it without letting a large district look more important than a crowded one.",
    });
    out.push({
      viz: "choropleth",
      standing: "available",
      reason: "Shading a total makes big districts dominate — Kutch covers 291 times the area of Mumbai City. Useful for comparing with other published maps, but read it with that in mind.",
    });
    return out.sort((a, b) => ORDER[a.standing] - ORDER[b.standing]);
  }

  // A count unit that failed eligibility can only be the signed case, since
  // symbolEligible's other exit is "not a count unit" and we are past that.
  if (counts) {
    out.push({
      viz: "choropleth",
      standing: "preferred",
      reason: "This can go up or down, and a circle can show how much changed but not which way. A diverging colour scale can.",
    });
    out.push({
      viz: "symbol",
      standing: "unsuitable",
      reason: "A gain and a loss of the same size would draw the identical circle.",
    });
    return out.sort((a, b) => ORDER[a.standing] - ORDER[b.standing]);
  }

  // Intensive: rates, shares, densities.
  out.push({
    viz: "choropleth",
    standing: "preferred",
    reason: "This is already measured per person or per unit of area, so shading compares like with like.",
  });
  out.push({
    viz: "symbol",
    standing: "unsuitable",
    reason: isExtensivePending(metricId)
      ? "This is a total and circles would suit it, but its unit is not yet one the map draws circles for."
      : "Sizing circles by a rate would invent a distortion that working per-person had already removed.",
  });
  return out.sort((a, b) => ORDER[a.standing] - ORDER[b.standing]);
}

/** The form a metric opens in. */
export function preferredViz(
  metricId: string,
  unit: string | null | undefined,
  values: readonly (number | null | undefined)[]
): VizId {
  return capabilitiesFor(metricId, unit, values)[0].viz;
}

/** The forms a reader may switch between — preferred and available, never
 *  unsuitable. This is what the toggle offers, and the reason the toggle can
 *  never present a dishonest option. */
export function offerableViz(
  metricId: string,
  unit: string | null | undefined,
  values: readonly (number | null | undefined)[]
): VizId[] {
  return capabilitiesFor(metricId, unit, values)
    .filter((c) => c.standing !== "unsuitable")
    .map((c) => c.viz);
}

/** Whether a specific form may be shown at all. The guard a route or a shared
 *  link is checked against, so ?viz=symbol on a rate cannot be forced. */
export function canRender(
  metricId: string,
  unit: string | null | undefined,
  values: readonly (number | null | undefined)[],
  viz: VizId
): boolean {
  return offerableViz(metricId, unit, values).includes(viz);
}
