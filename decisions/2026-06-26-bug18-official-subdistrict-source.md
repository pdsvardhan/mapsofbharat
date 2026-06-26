---
id: adr-012-official-subdistrict-source
title: Switch the census backbone to the official sub-district PCA — fixing a silent data-undercoverage bug
date: 2026-06-26
status: accepted
tags: [data, reliability, curated, cat:reliability]
linked_features: [feat-geo-backbone, feat-canonical-store, feat-demographics-pilot]
---

# ADR-012: Official sub-district PCA as the reaggregation source (bug #18 fix)

## Context

Intake report #18 (found by an iter-15 verifier) flagged that Aizawl's population was
50,777 vs the real Census-2011 ~400,309, Saitual had no rows, and Aizawl's crime rate
was inflated ~8× (4,986.5 per 100k — the national maximum) because the rate denominator
was wrong. Two conflicting theories existed: a point-in-polygon mis-assignment, or a
source data gap.

A diagnostic settled it with evidence. The reaggregation source — SHRUG's
`pc11_subdist_pca.tab` — **silently undercovers** several states:

| State | SHRUG total | Official total | Coverage |
|---|---|---|---|
| Mizoram | 721,351 (Aizawl district 39,351) | 1,097,206 (Aizawl 400,309) | 66% |
| Lakshadweep | — | 64,473 | 52% |
| Puducherry | — | 1,247,953 | 70% |
| Tripura | — | 3,673,917 | 82% |
| West Bengal | — | 91,276,115 | 82% |

The earlier mitigation (ADR-010 era) was a **source-coverage gate** that *withheld* all
districts in states under 90% coverage (45 districts, including West Bengal's 91M) — i.e.
it hid the symptom rather than fixing the data. The official ORGI sub-district Primary
Census Abstract (`raw/2011-IndiaStateDistSbDist.xlsx`, already in the repo, previously
unused) sums to the **exact** census total and carries the missing sub-districts.

## Decision

Replace SHRUG's sub-district PCA with the **official ORGI sub-district PCA** as the
reaggregation source, joined to the existing sub-district geometries by census code. Add
two corrections so coverage is complete and correct:

1. **Same-state constraint** — a census sub-district must map to a current district in
   its own state; offshore/enclave sub-districts (Lakshadweep islands, Puducherry-Mahe)
   that land in a neighbour's polygon are re-homed to the nearest current district within
   their own state. Genuine split states (AP→AP/Telangana, J&K→J&K/Ladakh) are exempt so
   geometry decides them.
2. **Missing-geometry reconciliation** — official sub-districts whose polygon the gpkg
   lacks (22, in Tripura/WB) are assigned to the dominant current district among their
   2011 district's mapped peers, so no population is dropped.

The **source-coverage withholding gate is removed** — with complete data there is nothing
to withhold. This amends ADR-010 (which described the SHRUG-based crosswalk); the
current-day boundary methodology (point-in-polygon, rates recomputed from raw counts) is
unchanged.

## Consequences

- National total is now **exactly** 1,210,854,977 (the census figure); median district
  diff vs official PCA is 0.00%; the previously-withheld outliers (Mumbai 303%, TN/CG/PB
  splits) are confirmed as expected boundary re-cuts.
- Census district coverage 688 → **733**; all 5 previously-gated states fully covered.
- `ingest_ncrb.py` re-run so crime rates use the corrected denominators (Aizawl
  crime_ipc_rate 4,986.5 → 615.0; no longer the national max). The stale "districts
  withheld" line in its methodology was removed.
- Drift baseline regenerated (`expectations.json`: census 688→733, NCRB 650→685);
  pytest 8/8.
- The methodology surfaced on `/methodology` is updated to state the official-source
  reaggregation and that no district is withheld.
- Implemented on branch `iter-15-2026-06-11` (commit f433ce5); lands on main when
  iteration 15 integrates.
