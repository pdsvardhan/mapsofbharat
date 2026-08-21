# Population density divides by administered area, and says so

**Status:** accepted · **Date:** 2026-08-21 · **Curated:** yes · **Category:** cat:reliability
**Related:** [adr-010](2026-06-09-reaggregate-subdistrict-crosswalk.md) (the sub-district crosswalk) · [adr-019](2026-07-16-estimate-disclosure.md) (disclosure where you read the number) · [adr-031](adr-031-saitual-no-derivable-boundary.md) (a district we cannot draw honestly) · `tests/density-denominator.spec.ts` · to-dos #548, #549

## Context

`ingest_census_a01.py` computed district population density as reaggregated
population divided by **the sum of the A-01 sub-district area column**. That column
is enumerated village and town area. It does not count unsurveyed or uninhabited
land.

Across most of India the difference is invisible. Measured against the 495 current
districts that map cleanly onto exactly one 2011 district, the summed area was
within 2% of the official district area for **483 of them**.

For twelve it was not, and the failure scaled with how much empty land a district
has:

| District | summed area | official area | density shipped | density correct |
|---|---|---|---|---|
| Leh | 394 km² | 45,110 km² | 339 | 3 |
| Kargil | 188 km² | 14,036 km² | 750 | 10 |
| Doda | 1,364 km² | 8,912 km² | 300 | 46 |
| Anantnag | 772 km² | 3,574 km² | 1,397 | 302 |
| Baramulla | 1,038 km² | 4,243 km² | 971 | 238 |
| Kupwara | 663 km² | 2,379 km² | 1,312 | 366 |
| Kutch | 22,197 km² | 45,674 km² | 94 | 46 |

Eleven of the twelve are in Jammu & Kashmir and Ladakh. The twelfth is Kutch, whose
Rann is real land that no village area counts.

The same column fed the four states whose areas are derived from the crosswalk, so
**Ladakh published a geographic area of 582 km²** against a real administered 59,146,
and that figure was feeding the Atlas "Top 10 · Area" cohort. J&K published 23,361.

None of this was hidden in the sense of being unknown — the adapter's own docstring
said "administered area only". It was hidden in the sense that mattered: the number
on the map was wrong by two orders of magnitude, in a geography where a wrong number
is not merely a wrong number, and no reader was told anything.

## Decision

**1. Where a current district is exactly one 2011 district, use the official A-01
district area.** "Exactly one" is strict: the district receives every sub-district of
that 2011 district, no other current district takes a piece, and nothing was dropped
in the crosswalk. That covers 511 districts and all twelve broken ones.

**2. Where the district was carved after 2011, keep the crosswalk sum**, because no
official area exists for a district that did not exist. 222 districts. The sum
carries the same enumerated-land undercount for whatever unsurveyed terrain they
contain, and the methodology says so.

**3. Publish `area_km2` at district level and add `households`** (to-do #549). The
adapter already computed district area to derive density and then discarded it.
Publishing the denominator is what makes a density argue for itself.

**4. Areas are administered area, disclosed rather than reconciled.** A-01 carries no
rows for territory across the LoC or LAC. The boundaries this site draws do — that is
what the boundary gate exists to protect. So Leh is 45,110 km² in the data and
roughly 155,000 km² as drawn, and the methodology states the discrepancy in those
terms.

The alternative was to derive area from the geometry, which would make the two agree.
It was tested and rejected: geodesic area from the shipped polygons reproduces the
official district area within 5% for only 416 of the 495 checkable districts, against
the census sum's 485 — it would have broken 69 districts to fix 12. And it fails
worst exactly where the census fails, because Leh's polygon includes Aksai Chin: it
moves Leh from 339 to 0.9, wrong in the other direction. Dividing an administered
population by a claimed area is not a denominator, it is a category error.

**5. The 222 crosswalk-derived areas are NOT flagged `estimated`.** Two reasons.
`fill_new_districts.py` deletes every district `estimated=1` row and refills only the
inherited ones, so the flag does not survive the next pipeline pass — measured: 222 of
733 rows vanished between the adapter and the fill. And the only kind that would fit,
`aggregated`, promises "an exact sum of the underlying rows" (adr-021) — true of
households, false of an area column that omits unsurveyed land. A label that
overstates trust is worse than no label in the one place a reader goes to calibrate
it. Per-district provenance for adapter-written aggregates is left open as a to-do.

## Consequences

- 12 district densities change, 9 of them by more than 2x. Ladakh's state area moves
  from 582 km² to 59,146 and its density from 472 to 5; J&K's area from 23,361 to
  39,932.
- Two new metrics, 733 districts + 36 states each. National households reconciles
  exactly to A-01's INDIA row (249,501,663).
- The national area total is 3,164,309 km² against the 3,287,263 the boundaries
  enclose. The gap is the J&K/Ladakh territory the census does not enumerate, and it
  is expected rather than a coverage bug.
- `tests/density-denominator.spec.ts` pins the twelve districts, the Ladakh state
  area, the disclosure text, and — the guard that outlives the hardcoded numbers —
  that `density × area` reconciles to population for every district. Mutation-proven
  6/6 against a scratch copy of the store.
