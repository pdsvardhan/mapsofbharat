# Statistics exclude copies, not projections

- **id:** adr-022-stats-exclude-copies
- **status:** accepted
- **date:** 2026-07-16
- **depends on:** adr-021 (estimate_kind discriminator)
- **amends:** adr-018 (sibling inheritance)

## Context

Since adr-018, every distribution statistic — `min`, `max`, `mean`, and the class
breaks — has been computed over `estimated=0` rows only. The reasoning was sound
for the case it was written against: an inherited value is a **copy** of a real
district's number, so counting it counts one district twice and drags the mean.
Item 611 and item 639 are both that bug.

The rule was written for copies and then applied to every estimate. For the RBI
state series that is wrong, and visibly so. Measured on the live API:

| metric | count | estimated | min | max | mean |
|---|---|---|---|---|---|
| `fiscal_deficit_pct_gsdp` | 31 | 30 | 0.7645 | 0.7645 | 0.76 |
| `own_tax_pct_gsdp` | 31 | 30 | 5.6644 | 5.6644 | 5.66 |
| `literacy_rate` (contrast) | 733 | 0 | 33.1 | 97.9 | 71.57 |

The only Actual row for both is Gujarat, 2022. The 30 projected rows actually span
**0.54 → 6.92**, averaging 3.71. So the colour scale for those two shipped metrics
is **zero-width** — `min == max` — and 31 states are being coloured against a scale
derived from one of them, under a legend reading "avg 0.76" over data averaging
3.71.

The difference is not about confidence. It is about **duplication**:

- An `'inherited'` value is a duplicate. `fill_new_districts.py` only ever fills
  from a sibling that holds a real value for the same `(metric, year)`, so every
  inherited number *equals a real number already in the set*. Excluding it changes
  the mean and leaves `min`/`max` untouched by construction.
- A `'projected'` value is not a duplicate. It is that state's only figure, copied
  from nobody. Excluding it does not remove a double-count — it removes the state.

adr-021 is what makes this sayable: you cannot express "exclude copies but not
projections" against a boolean that calls both `estimated`.

## Decision

**Statistics exclude copies, not projections.** `countsInStats(estimated, kind)` in
`lib/estimate-kind.ts` owns the rule and both the API and the map call it:

- `estimated=0` → counts.
- `'inherited'` → excluded. It duplicates a row already counted.
- `'projected'` → counts. Distinct region, distinct figure.
- `'aggregated'` → counts. An exact sum of real rows.
- unknown kind → **excluded**. An allow-list, not a deny-list: if we cannot prove a
  value is not a copy, we must not risk double-counting it. This also preserves the
  pre-adr-022 behaviour for anything unclassified.

`/api/metrics/[id]` additionally returns `stats_count` — how many rows the stats
actually rest on. Without it a caller cannot tell a mean over 733 districts from a
mean over one, which is exactly how the collapsed scale went unnoticed.

**Scope held deliberately.** Ranks still exclude every estimate (`estimated=0`
only), unchanged. Whether a projected figure deserves a rank against actuals is a
real question, but it is a different one, and widening this decision to answer it
would have been the same over-generalisation that produced the defect. Filed as a
follow-up instead.

## Consequences

**Positive**

- `fiscal_deficit_pct_gsdp` and `own_tax_pct_gsdp` regain a real colour scale
  (0.54–6.92 rather than a single point), and their legend average describes the map
  a reader is looking at.
- Item 639 is fixed as intended for district metrics: the legend's average is now
  the average of the scale that coloured the map, so Arunachal at ~66.485 no longer
  sits under a legend reading "avg 64.9".
- The rule is stated once and reused, so the map, the API and any future surface
  agree by construction rather than by discipline.

**Negative**

- The two RBI metrics' `min`/`max`/`mean` change on this deploy. That is the point —
  the old numbers described one state — but it is a visible shift in shipped output
  and must be called out, not slipped in.
- Statistics now mix Actuals with Budget/Revised Estimates for those series. That is
  defensible (they are each state's best available figure, and BE/RE is what the
  RBI publishes for open years) and it is disclosed at point of use per adr-019, but
  it is a real modelling choice, not a neutral bug fix.
- `countsInStats` is a second concept next to `estimated`. Readers must not assume
  "estimated ⇒ excluded from stats" any more; the predicate is the only authority.
