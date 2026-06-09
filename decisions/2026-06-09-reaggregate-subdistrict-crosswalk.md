---
id: adr-010-subdistrict-crosswalk
title: Reaggregate 2011 sub-district counts into current-day districts
date: 2026-06-09
status: accepted
tags: [data, architecture]
linked_features: [feat-geo-backbone, feat-demographics-pilot]
---

# ADR-010: Current-day crosswalk via sub-district reaggregation

## Context

Census 2011 is the richest official small-area dataset for India, but it is published on **2011 administrative boundaries**. Since 2011 the district map has changed substantially — Telangana was carved out of Andhra Pradesh (33 current districts that did not exist as such in 2011), Andhra Pradesh re-cut its districts (2022), and many states split or merged districts. Users expect statistics on **today's** boundaries (the map they recognise), so 2011 counts must be re-expressed on current districts.

Two methods were considered:

1. **Nearest-parent inheritance** — assign each current district the value of the 2011 district it most overlaps (or whose centroid it contains). Simple, but **wrong for counts**: a current district formed by merging parts of several 2011 districts inherits only one parent's total, badly over/under-counting.
2. **Unit reaggregation** — treat a current district as the *bag of 2011 sub-units now inside it*, sum their raw counts, and recompute rates. This is what official re-tabulations do.

The user explicitly directed method 2 as not merely better but **correct**: "We are giving current district boundary statistic based on 2011 census, which is exactly what they are seeing there."

## Decision

Implement the crosswalk by **sub-district (tehsil) reaggregation** using SHRUG (Development Data Lab) data, which carries **official Census 2011 PCA values** joined to **WGS84 sub-district geometry** (peer-reviewed; pc11 codes):

1. Load SHRUG `subdistrict.gpkg` (5,969 sub-districts, EPSG:4326); take each sub-district's `representative_point()`.
2. Point-in-polygon join each sub-district point **within** the current-day district polygons (`public/geo/districts.geojson`), with a `sjoin_nearest` fallback for the handful that miss.
3. Group by current district and **sum raw PCA counts** (`pc11_pca_tot_p/m/f`, `p_06`, `m_06`, `f_06`, `p_sc`, `p_st`, `p_lit`, `f_lit`, `tot_work_p`, `main_cl_p`, `main_al_p`, `main_hh_p`, `main_ot_p`).
4. **Recompute every rate from the summed counts** (literacy, female literacy, sex ratio, child sex ratio, SC/ST %, work participation, worker composition) — never average or inherit a rate.

**Join key — unique `rid`:** districts are keyed by `rid = st_code.zfill(2) + "_" + int(dt_code)` **everywhere** (geojson property, DB `region_code`, MapLibre `promoteId`). This was forced by discovering **36 duplicate `dt_code` collisions** between the re-cut Andhra Pradesh districts and Maharashtra (e.g. code 519 = Srikakulam *and* Mumbai), which previously merged unrelated districts and corrupted both the stored data and the map colouring.

Pipeline: `pipeline/add_rid.py` (stamps `rid` onto every geojson feature) then `pipeline/reaggregate.py` (does the join, validates, and **refuses to write on validation FAIL**).

## Consequences

**Positive**

- Counts are correct for merged/split districts; rates are internally consistent (recomputed from summed counts, not inherited).
- Unchanged districts match the official 2011 district PCA **exactly** — validation median diff **0.00%**, 489/594 districts within 2%.
- Telangana's 33 current districts are now fully populated (impossible under 2011-only district data).
- The AP ↔ Maharashtra `dt_code` collision is eliminated: Mumbai (`27_519`) = 12.44M and Srikakulam (`37_519`) = 2.19M are now independent.
- 8,760 metric values written across 730 current-day districts.

**Negative / limits**

- Total reaggregated population is 1.191B vs 1.211B census (**1.6% under**): sub-districts with no PCA row, or that fail the point-in-polygon, land in no current district. Acceptable and documented.
- Reaggregated totals for *changed* districts deliberately differ from the old official 2011 district totals (that is the point), so naive validation against 2011 district files flags them as "outliers" — e.g. the merged Mumbai polygon (City + Suburban ≈ 12.4M) vs official Mumbai City-only (3.08M). These are expected, not errors.
- 2 of 732 current districts lack data (un-PCA'd sub-districts / J&K geometry gaps).
- Depends on SHRUG geometry + the DataMeet current-district polygons. If either is replaced, re-run the pipeline and re-validate before deploy.

**Reproduce:** `python pipeline/add_rid.py && python pipeline/reaggregate.py` — the second script validates against `pipeline/raw/2011-IndiaStateDist.xlsx` and only writes to `data/mapsofbharat.db` if median diff < 2% and total population within 3% of census.
