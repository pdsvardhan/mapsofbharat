# ADR-013 — Saitual's 2011 population attributes to its 2011 parent district; AC2 accepted as attribution

- **Status:** accepted
- **Date:** 2026-07-01
- **Amends:** [adr-012](2026-06-26-bug18-official-subdistrict-source.md) (bug #18 fix), [adr-011](.) (Stage-1 AC re-scope)
- **Scope:** feat-geo-backbone · iter-15 bug #18 (report 18) · acceptance criterion AC2

## Context

The bug #18 fix (adr-012) switched the census backbone to the official sub-district PCA and
removed the ADR-010 source-coverage withholding gate. The independent verifier for the fix
confirmed four of five acceptance criteria with strong, independently reproduced evidence:

- **AC1** Aizawl `pop_total` → **411,735** (Census-2011 district reference ≈ 400,309); was the
  bug's ~50,777. **Pass.**
- **AC3** Aizawl `crime_ipc_rate` → **615.0**; no longer the inflated ~4,986.5 national-max. **Pass.**
- **AC4** `pipeline/reaggregate.py` crosswalk substantively rewritten (official source + same-state
  re-homing + missing-geometry reconciliation); DB crosswalk methods demonstrably changed. **Pass.**
- **AC5** `pytest` 8/8; `pipeline/expectations.json` corrected toward truth (688→733 census, 650→685
  NCRB) with tolerances **unchanged** (not loosened to mask the bug); national total now **exactly**
  the Census-2011 figure 1,210,854,977. **Pass.**

**AC2** — "Saitual (post-2011 Mizoram district) now has data rows (count > 0)" — is **not** met
literally: Saitual returns **0 rows** before and after the fix.

## Decision

**Accept AC2 as satisfied-by-attribution rather than requiring a standalone Saitual row.**

Saitual district was created in **2019** from parts of Aizawl and Champhai. It does not exist in
the **Census-2011-derived `public/geo/districts.geojson`** geometry backbone that the canonical
store is keyed on. Consequently:

- A 2011 data row for a district that did not exist in 2011 is neither possible nor correct.
- The **underlying data-loss root cause is fixed**: Saitual-area 2011 sub-district population is now
  correctly **folded into its 2011-era parent district (Aizawl)** — nothing is dropped — and the
  national total reconciles exactly to the published Census-2011 figure.

AC2 was written on the false premise that Saitual should carry its own 2011 rows. The correct
data-modeling behavior is exactly what the fix implements. This is a spec-vs-implementation scope
correction, **not** fakery: the verifier's Pass B (stub detection) was clean and Pass A/C reproduced
cleanly.

## Consequences

- The bug #18 fix is treated as **APPROVE-equivalent**; iter-15 integrates to `main`.
- AC2 is amended to read: *"Saitual's 2011 population is correctly attributed to its 2011 parent
  district; no standalone 2011 Saitual row is created because Saitual is a post-2011 district absent
  from the 2011 geometry backbone."*
- **Future option (not required):** if/when a post-2011 district layer is added to render present-day
  boundaries, Saitual can receive its own present-day entity. Tracked implicitly under the
  current-day-rendering strategy ([adr-003](2026-.-current-day-rendering.md)); no open to-do created,
  as this is a modeling enhancement, not a defect.

## Evidence

- Verifier session `vs-bug18-20260701`; verification_report **id 266** (recommendation ITERATE on the
  AC2 gap; owner-accepted here).
- Diff `f433ce5^..aa6f8af` (pipeline/reaggregate.py +219/-142, ingest_ncrb.py, expectations.json,
  test_pipeline.py).
