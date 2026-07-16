# Estimated districts are disclosed where you read the number, not painted across the map

- **id:** adr-019-estimate-disclosure-point-of-use
- **status:** accepted
- **date:** 2026-07-16
- **supersedes (in part):** adr-018 Part C (hatch overlay for estimated districts)

## Context

adr-018 filled post-2011 districts two ways: exact crosswalk re-aggregation where
sub-district census rows let us rebuild a district's own numbers (`estimated=0`),
and sibling inheritance for survey rate-metrics the source never measured in the
new district (`estimated=1`). Part C of that decision marked inherited values on
the choropleth with a diagonal hatch overlay.

A human eyeball check of that hatch (2026-07-16) found it invisible. Measured
against the default navyYellow ramp, the hatch — `rgb(20,22,28)` at an effective
alpha of 0.425 — scored 1.09:1 on the darkest stop and 2.57:1 at best on the
lightest. WCAG's floor for non-text UI is 3:1, so it never cleared the bar on any
band. Its geometry compounded this: an 8px tile at `pixelRatio: 2` produced a
~2 CSS px line period that aliases to flat tone. The feature was wired correctly
and communicated nothing.

The obvious fix was to make the hatch visible. Investigating that raised a better
question: should the map mark these at all?

## Decision

**Drop ambient hatching. Disclose inherited values at the point where someone
reads or acts on the number.**

Three facts drove this:

1. **Proportionality.** Inheritance is 1,494 cells across 102 districts — 2.7% of
   all district data. But an ASER map would hatch 74 of 622 districts, 12% of
   India. That is a large visual alarm for a small caveat.

2. **Consistency.** We already render uncertainty we do not draw. NFHS district
   rates carry sampling error and appear perfectly flat. Singling out inheritance
   while ignoring sampling error was not a principled line.

3. **The estimate is usually reasonable — but not always, and the map cannot tell
   you which.** Districts do not split randomly; they split along lines of
   difference. NTR is 58.7% urban, Krishna 27.8% (both real, from re-aggregation),
   yet NTR carries Krishna's immunization and poverty numbers because NFHS only
   ever surveyed the 2011 "Krishna". An ambient mark says "be careful" everywhere
   and "how careful" nowhere.

Disclosure now lives where the number is read: the ranking rail badges inherited
values and does not rank them, the map hover names the inheritance, and the region
panel cites the parent district. Exports and embeds get a footnote (follow-up),
because those images travel without a tooltip.

**Corollary — inherited values carry no rank, anywhere.** `/api/region/[code]` had
already established this ("an inherited value carries no rank, and the of-N
denominator reflects only districts the source actually surveyed"), but the rail
contradicted it, showing `#11 … est.` where the region panel showed the same
district rankless out of 660. One rule now applies across the rail, the hover and
the region panel: real districts rank 1..N consecutively over a real-only
denominator; inherited values report the inheritance instead.

## Consequences

- The choropleth reads clean. The hatch layer stays wired but is not made visible;
  reviving it needs a new decision, not a CSS tweak.
- A reader who never hovers, never opens the rail, and never reads the methodology
  will not know a value was inherited. That is the accepted cost. The alternative
  taxed every reader to inform the few.
- AC 270 was amended: rank and percentile are shown for every district the source
  surveyed; inherited districts report the inheritance instead. The prior behaviour
  did not satisfy AC 270 — it fabricated a rank over a 699 denominator that
  contradicted the API's own 660.
- Deferring the hatch surfaced a real bug: `fill_new_districts.py` uses one donor
  rule for the citation table (largest-population sibling) and another for the
  actual fill (largest-population sibling **with data for that metric**). Where
  they diverge the citation is wrong — NTR shows an inherited value with
  `estimated_from: None`, while Krishna, entirely real, carries
  `estimated_from: NTR`. Tracked for the next iteration.
- Follow-ups tracked as to-dos: parent-citation fix, export/embed footnote,
  vs-avg mean computed over real values only (the legend currently reads
  "avg 64.9" against a scale coloured around 66.485), histogram real-only bins,
  and test coverage — no test currently exercises any estimate behaviour.

## Alternatives considered

- **Make the hatch visible (two-tone light+dark paired lines).** Measured: clears
  3:1 on every stop (12.3 / 7.3 / 4.1 / 6.9 / 12.2) because a light stripe adjacent
  to a dark one contrasts against any fill; a single tone mathematically cannot,
  since the ramp's endpoints are 10.45:1 apart. Rejected on proportionality, not
  feasibility — it worked, it just told 12% of the map to look alarmed.
- **Grade inheritances and hatch only the shaky ones** (score child-vs-donor on
  real `urban_pct`/population, flag NTR-shaped cases only). Genuinely attractive
  and still open — parked as a possible follow-up rather than rejected.
- **Rank estimates everywhere for consistency.** Rejected: it asserts a standing a
  copied value never earned.
