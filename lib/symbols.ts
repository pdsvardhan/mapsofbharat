// Proportional-symbol sizing and routing (#408 / #532, research 758 + 531).
//
// WHY SYMBOLS EXIST AT ALL. A choropleth colours a whole region by value, and the eye
// reads AREA, not colour. Mumbai City is 157 km²; Kutch is 45,674 km² — a 291× ratio.
// On a true-geography choropleth Kutch outweighs Mumbai by that ratio whatever colour
// either one is. research/758 names this area-size bias, distinct from classification,
// and no palette, class count or break method touches it. For a COUNT ("how many people
// live here", "how much rice is grown here") the choropleth is simply the wrong
// instrument. A circle's radius is tied only to the value, structurally decoupled from
// the polygon, which is why 758 calls it the one unconditionally compliant remedy.

/** Units that denote a COUNT — an extensive quantity that adds up across regions, and
 *  therefore inherits area bias on a choropleth.
 *
 *  This is deliberately a unit test, not a "was it flagged HOTSPOT" test. research/531
 *  reconstructed the HOTSPOT list and found the threshold splits families down the
 *  middle: goats and poultry in, cattle out; rice and wheat in, cropped area out.
 *  Shipping goats as circles and cattle as colour would be incoherent to a reader who
 *  cannot see the threshold. Unit semantics is the property that actually matters, and
 *  only 9 of 87 district metrics carry one of these units — so area bias can only ever
 *  bite those 9.
 *
 *  Anything containing "/" or "per" or "%" is an INTENSIVE quantity — a rate, share or
 *  density. Those are exactly what normalisation is for, they do not inherit area bias,
 *  and drawing them as circles would be a new lie in place of the old one. */
const COUNT_UNITS = new Set(["people", "head", "birds", "tonnes", "hectares", "km²", "km2"]);

export function isCountUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const u = unit.trim();
  // Reject composites explicitly: "people/km²" CONTAINS "people" and is a density.
  //
  // Honest note on this line, established by mutation testing: deleting it changes
  // nothing today, because the lookup below is an EXACT Set match and "people/km²"
  // is not in the Set. It is not dead code either — it is what stops the pair from
  // failing together. Loosening the exact match to a substring or prefix test is the
  // natural "helpful" refactor here, and with this guard gone that single change
  // starts drawing circles on every rate in the catalogue. The two lines are only
  // safe as a pair, and tests/symbol-maps.spec.ts mutates them as a pair.
  if (/[/%]|\bper\b/i.test(u)) return false;
  return COUNT_UNITS.has(u);
}

/** Whether this metric, with these values, may be drawn as proportional symbols.
 *
 *  Signed data is excluded in phase 1 and that is a deliberate drop, not an oversight.
 *  `forest_change_km2` is a count unit but a SIGNED one (cover gained or lost since
 *  2021), and a sqrt-area circle cannot express direction — every circle would say
 *  "large change" with no way to read gain from loss. Doing it honestly needs a
 *  diverging two-colour symbol spec, which BUILD-PLAN-408 does not cover. Detected from
 *  the data rather than by naming the metric, so a future signed count is excluded
 *  automatically instead of silently shipping wrong. */
export function symbolEligible(
  unit: string | null | undefined,
  values: readonly (number | null | undefined)[]
): boolean {
  if (!isCountUnit(unit)) return false;
  let sawValue = false;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    sawValue = true;
    if (v < 0) return false;
  }
  return sawValue;
}

/** Radius bounds, per level. Districts are 735 marks on one screen and states are 36,
 *  so one pair of numbers cannot serve both: a max that keeps Uttar Pradesh legible at
 *  state level turns district India into overlapping soup. */
export const SYMBOL_BOUNDS = {
  // Tuned by LOOKING at the rendered map, which is the only way to tune it. The
  // first pass used max 21 at district level and the Gangetic plain — Uttar Pradesh
  // through Bihar into West Bengal, the densest run of large-population districts in
  // the country — merged into one solid mass. That is the coalescing failure
  // research/758 warns about for dot density, arriving by another route: individually
  // correct circles that stop being separable marks. 12 keeps Delhi and Mumbai
  // emphatic while leaving the plain readable as districts.
  //
  // States need a much larger max and get one: 36 marks on the same canvas can
  // afford it, and at 12 the state map read as a scatter of dots.
  district: { min: 1.2, max: 12 },
  state: { min: 3, max: 40 },
} as const;

export type SymbolLevel = keyof typeof SYMBOL_BOUNDS;

/**
 * Radius for one value, scaled so that AREA is proportional to the value.
 *
 * r = maxR * sqrt(v / vmax)
 *
 * THE SQUARE ROOT IS THE WHOLE POINT. Perceived quantity tracks the disc's area, and
 * area grows with r². Sizing the RADIUS proportionally to the value therefore overstates
 * large values by the square: a district with 4× the population would be drawn 16× the
 * area. That is the classic proportional-symbol bug, and it would make this layer LESS
 * honest than the choropleth it replaces — which is why the unit test asserts a 4× value
 * gives exactly a 2× radius, and why that assertion is worth more than any of the
 * rendering tests.
 *
 * The floor applies only to values that are actually nonzero: a genuine zero is a fact
 * ("no poultry here") and deserves no mark, while a small nonzero must never round away
 * to invisible. Above the floor the proportionality is exact.
 */
export function symbolRadius(
  value: number | null | undefined,
  vmax: number,
  level: SymbolLevel = "district"
): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(vmax) || vmax <= 0) return 0;
  const { min, max } = SYMBOL_BOUNDS[level];
  const r = max * Math.sqrt(Math.min(value, vmax) / vmax);
  return Math.max(min, r);
}

/** Three reference values for the nested-circle legend: the maximum, and the values
 *  whose CIRCLES are about a half and a quarter of the largest circle's radius. Chosen
 *  on radius rather than on value because the legend is read by matching circle sizes by
 *  eye — quartiles of value would produce three nearly identical discs on the heavy
 *  tails these metrics all have. */
export function legendStops(vmax: number): number[] {
  if (!Number.isFinite(vmax) || vmax <= 0) return [];
  // r/rmax = sqrt(v/vmax), so a radius fraction f corresponds to v = vmax * f².
  const stops = [vmax, vmax * 0.25, vmax * 0.0625];
  return stops.filter((v) => v > 0);
}
