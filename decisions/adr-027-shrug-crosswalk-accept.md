# Accept the CC-BY-NC-SA census crosswalk while non-commercial; swap to LGD before monetising

**Status:** accepted · **Date:** 2026-08-04 · **Related:** adr-024 (dropped SHRUG EC13), to-do #275, to-do #384

## Context

Every Census-2011 value rendered onto current-day districts rides a sub-district crosswalk. `pipeline/reaggregate.py:11` reads `raw/subdistrict.gpkg`, which is SHRUG-derived (see `decisions/2026-06-09-reaggregate-subdistrict-crosswalk.md`). SHRUG ships under **CC-BY-NC-SA** — the NonCommercial clause is incompatible with running ads or a paid tier (owner rule, to-do #204). To-do #275 raised the open question: **accept / re-source / drop ads**.

## Decision

**Accept** the SHRUG-derived crosswalk for now, while the site is strictly **non-commercial** (no ads, no paid tier). Every metric stays fully cited. **Before enabling any commercial use** (ads or a paid tier), **swap the crosswalk to the LGD Sub-District table** — GODL, commercial-OK — via a code-join on `(state_code, census_2011_sub_district_code) → district_code` with no geometry change. That swap is tracked as to-do #384.

## Consequences

- No data or code change now; the current crosswalk keeps shipping, fully attributed.
- Monetisation is **gated** on completing to-do #384 (the LGD swap); the DDL/plan is drafted.
- This is a scoped licence-risk **acceptance**, to be revisited at the monetisation decision point — not a permanent stance. Superseded once #384 lands.
