# adr-024 — Dropped the Economic-Census metrics rather than ship non-commercially-licensed data

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes / relates to:** [adr-014 economic-data-expansion](2026-07-01-economic-data-expansion.md) (which introduced these two metrics)

## Context

Two district-level economy metrics shipped via the 6th Economic Census (2013):

- `estab_per_1000` — non-agricultural establishments per 1,000 people
- `nonfarm_emp_per_1000` — non-farm establishment employment per 1,000 people

Both were sourced from **SHRUG** (Socioeconomic High-resolution Rural-Urban Geographic
dataset), which is licensed **CC-BY-NC-SA (NonCommercial)**. A firm project rule
(to-do 204) is that NonCommercial data is incompatible with running ads on the site,
so these two metrics were a standing licence exposure.

A clean re-source was investigated and found infeasible:

- **MoSPI EC MCP** (the statistical API) exposes Economic Census data but its
  `activity` filter is broken — `activity=17` ("All Non-Agricultural") returns a
  real-estate-only slice (213 records for Goa vs 96,587 unfiltered), so the
  non-agricultural establishment definition cannot be reproduced; and its ranking
  mode only returns top/bottom-N districts per state, so all ~640 districts cannot be
  enumerated. (Established in iter-23.)
- **data.gov.in (OGD)** has no clean district-level EC6 establishment/employment
  table — the district totals are exactly what SHRUG had to compile from microdata.

## Decision

**Drop both metrics.** Remove `estab_per_1000` and `nonfarm_emp_per_1000` (metric
definitions + all `metric_values`) from the canonical store, retire
`pipeline/ingest_ec13.py`, and delete the SHRUG source file
`pipeline/raw-new/economy/shrug_ec13_pc11dist.tab`. The economy vertical goes from 12
to 10 metrics.

We keep the population-weighted reaggregation machinery (`pipeline/reaggregate.py` and
the `crosswalk` table) — it is used by many adapters, not just EC13.

## Consequences

- The licence exposure for these two metrics is eliminated; the site carries no
  NonCommercial data via this path.
- The atlas loses its only district-level "local enterprise density" measure. If a
  clean GoI district source for EC6 (or a later EC) surfaces, the metric can be
  rebuilt on that source.
- **Follow-up flagged (separate to-do):** `reaggregate.py` reads
  `pipeline/shrug/shrid2_spatial_stats.dta`, a SHRUG file, when building the crosswalk.
  Whether the crosswalk itself is SHRUG-derived (and therefore a broader NC-licence
  question) needs its own review — it underpins the current-day rendering system and
  is out of scope for this metric drop.
