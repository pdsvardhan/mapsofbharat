# The four worker categories now count everyone who works

**Status:** accepted · **Date:** 2026-08-21 · **Curated:** yes · **Category:** cat:reliability
**Related:** [adr-035](adr-035-administered-area-denominator.md) (administered-area denominator) · [adr-010](2026-06-09-reaggregate-subdistrict-crosswalk.md) (the sub-district crosswalk) · `tests/metric-families.spec.ts` · to-do #562

## Context

`cultivators_pct`, `agri_labourers_pct`, `household_industry_pct` and
`other_workers_pct` were published as *"X as % of total workers"*. They were
computed as `MAIN_<cat>_P / TOT_WORK_P` — **main** workers over **all** workers.

Census splits workers into *main* (six months or more of work in the year) and
*marginal* (less than six months). Taking main-only numerators over an all-workers
denominator meant the four shares summed to **73.6%** on average and to 100 in
**zero of 733 districts**.

The excluded quarter is not distributed evenly. Marginal work is disproportionately
rural, agricultural and female, so the understatement fell hardest on exactly the
districts a reader would open the map to look at. Jhabua's agricultural labourers
read 10.0% when the real figure is 57.5%.

This was found while testing whether the four metrics formed a part-to-whole set
for the small-multiples work (#547). They did not, and the reason turned out to be
a defect rather than a property of the data.

**Why it survived.** Every individual number was internally consistent and
plausible. Nothing was null, nothing was out of range, no test failed. The only
symptom was an absence — a sum that never reached 100 — and nothing was checking
sums.

## Decision

**Count marginal workers.** The numerators become `MAIN_<cat>_P + MARG_<cat>_P`
over the same `TOT_WORK_P` denominator. Census's own identity makes this exact,
verified against the source workbook before any code changed:

```
MAINWORK_P + MARGWORK_P             == TOT_WORK_P     exact
MAIN_ CL+AL+HH+OT                   == MAINWORK_P     exact
(MAIN+MARG) CL+AL+HH+OT             == TOT_WORK_P     exact
national marginal share of workers   = 24.8%
```

Two alternatives were rejected.

**Disclosure only** — fix the wording, leave the numbers — would have left a known
understatement on a live public map because correcting it was inconvenient.

**Re-basing onto `MAINWORK_P`** also sums to 100, and was the tempting option
because it is a one-word change. It gets there by shrinking the population until
the remainder disappears: the question silently becomes "of main workers" and a
quarter of India's workforce leaves the denominator. That is the same move as
[adr-035](adr-035-administered-area-denominator.md)'s enumerated-area denominator,
and it is rejected for the same reason.

## Consequences

- Four metrics × 733 districts change. The four now sum to **100.0 in all 733**.
- **Both** producers had to be fixed. `ingest_pca.py` computes these metrics, but
  `reaggregate.py` runs after it and overwrites every district from the
  sub-district PCA via the crosswalk (adr-010/012). Patching `ingest_pca.py` alone
  passed review and changed nothing on the map — the rebuild proved it, still
  reading 73.61% afterwards. A metric with two producers needs both fixed, and the
  live one was not the obvious one.
- `ingest_pca.py` DROPs `metric_values`, so this could not be a one-adapter re-run.
  The whole store was rebuilt in an isolated tree with the canonical DB set
  read-only, then swapped in only after a comparison proved that **exactly** the
  four metrics moved: 73,077 values in and 73,077 out, 121 of 125 metrics
  reproduced value-for-value. That the pipeline reproduces itself this exactly is
  worth recording on its own.
- A new guard asserts the four sum to 100 ± 0.5 for every district at ingest time,
  in both producers. This is the check that would have caught the original defect,
  and it is cheap because the identity is exact in the source.
- `livelihood` joins `religion` as the catalogue's second genuine part-to-whole
  family, which unblocks it for the #547 small-multiples grid. `census-pca` keeps
  `partToWhole: false` — it mixes literacy, caste and livelihood, and only the
  four-member subset decomposes anything.
- Descriptions now say "as % of all workers, main and marginal" rather than the
  bare "% of total workers" that the old numerators did not deliver.
