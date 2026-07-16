# Filling post-2011 districts: exact re-aggregation + flagged inheritance

**Status:** accepted · **Date:** 2026-07-16 · iteration 13

## Context

The canonical store is keyed to Census-2011 district codes, but the map renders
current-day boundaries (733 districts). Districts created after 2011 — Andhra
Pradesh went 13→26, Telangana 10→33, plus new districts in Arunachal, Manipur,
Mizoram, Tamil Nadu and Madhya Pradesh — rendered grey for many indicators,
because a metric whose source predates a district cannot have a row for it. The
Census PCA verticals already reached new districts (reaggregate.py), but the
newer census verticals and every survey-based metric did not.

## Decision

Fill new districts by two mechanisms, kept strictly separate and both honest:

1. **Exact re-aggregation for census verticals.** The C-16 (language) and HH-14
   (assets) adapters now read 2011 SUB-DISTRICT data and aggregate onto
   current-day districts via the `crosswalk` table (the same sub-district →
   current-district map used for the PCA, ADR-010). A new district therefore
   carries its OWN composition, computed from the sub-districts that compose it —
   e.g. tribal Alluri Sitharama Raju's top mother tongue is 71% vs urban
   Visakhapatnam's 93%. These values are real (`estimated = 0`).

2. **Flagged sibling inheritance for survey metrics.** Where a survey (NFHS, NITI
   MPI, ASER, …) never covered a post-formation district, the district inherits
   the value of its largest-population 2011-lineage sibling (the parent district
   the survey actually measured), written with `estimated = 1`. This applies
   ONLY to intensive quantities (rates, percentages, per-capita, indices).
   Absolute counts (population, livestock, crop tonnes, area, GST, tourist
   visits) are never inherited — a new district does not carry its parent's
   totals — and stay grey. `district_estimate_source` records the parent.

3. **Disclosure, so an estimate never reads as a fact.** The estimated flag is
   surfaced end-to-end: estimated districts render with a diagonal-hatch overlay,
   their tooltip says "estimated from parent" instead of a rank, the region panel
   shows an "est." badge and names the parent district, and all ranks / colour
   breaks / min-max are computed over real values only.

## Consequences

- Post-2011 districts now show data instead of grey: e.g. Anakapalli went from 33
  to 73 indicators (40 accurate census + survey estimates), the remainder being
  count metrics correctly left blank.
- A reusable `fill_new_districts.py` pass (idempotent, runs last) plus a
  lineage-from-crosswalk method that needs no hand-curated parent table.
- Estimates are visibly and textually distinguished — consistent with the
  must-have that every figure is cited and no map misleads.
