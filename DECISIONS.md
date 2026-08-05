# Decisions register

The canonical index of architecture decisions for Maps of Bharat. Each row links to its ADR body in `decisions/`. The register is mirrored from the Ottomate `adr-index` (the source of truth); the curated ones also render on the site's architecture page (adr-017). Regenerate rather than hand-maintain when the index changes.

**Legend:** `cat:*` = the showcase category an ADR renders under (product / system / reliability / security). ADRs marked *curated* with no `cat:` tag are internal and do not render publicly. `adr-026` is an unused number (skipped).

| ADR | Date | Category | Decision |
|---|---|---|---|
| [adr-001](decisions/adr-001-mapsofbharat-staging.md) | 2026-06-08 | — | Initial Stage 1 staging for MapsOfBharat |
| [adr-002](decisions/adr-002-geography-backbone.md) | 2026-06-08 | system | Geography backbone: 2011 census districts + Survey of India outline, dual-keyed to LGD and Census codes |
| [adr-003](decisions/adr-003-current-day-rendering.md) | 2026-06-08 | system | Store data at the finest unit; render onto current-day boundaries via a crosswalk, with an as-reported-2011 toggle |
| [adr-004](decisions/adr-004-own-canonical-store.md) | 2026-06-08 | system | Own canonical database with scheduled ingestion — zero live calls to sources at request time |
| [adr-005](decisions/adr-005-official-sources-only.md) | 2026-06-08 | product | Official or top-tier sources only — and every metric carries its citation |
| [adr-006](decisions/adr-006-vertical-slice.md) | 2026-06-08 | product | Ship one vertical (Demographics) end-to-end first, on a generic engine plus adapters |
| [adr-007](decisions/adr-007-tech-stack.md) | 2026-06-08 | internal | Tech stack: Next.js (App Router) + TS; Tailwind v4 + shadcn/ui; MapLibre GL; Recharts + d3-scale-chromatic; better-sqlite3 + drizzle; Python ingestion |
| [adr-008](decisions/adr-008-component-strategy.md) | 2026-06-08 | internal | Component strategy: core viz built custom on MapLibre/D3; primitives from shadcn/ui; master_components intentionally unused |
| [adr-009](decisions/adr-009-build-plan.md) | 2026-06-08 | internal | Build plan v1 (topological order) |
| [adr-010](decisions/adr-010-subdistrict-crosswalk.md) | 2026-06-09 | reliability | 2011 sub-district counts re-aggregated into today's districts — data integrity over convenience |
| [adr-011](decisions/adr-011-stage3-ac-rescope.md) | 2026-06-10 | product | Acceptance criteria re-scoped to shipped reality — gaps moved to an explicit backlog |
| [adr-012](decisions/adr-012-official-subdistrict-source.md) | 2026-06-26 | reliability | Switch the census backbone to the official sub-district PCA — fixing a silent under-coverage bug |
| [adr-013](decisions/adr-013-ac2-saitual-attribution.md) | 2026-07-01 | reliability | Saitual's 2011 population attributes to its 2011 parent; AC2 accepted as attribution |
| [adr-014](decisions/adr-014-economic-data-expansion.md) | 2026-07-01 | product | Expand economy + add labour vertical: RBI fiscal, PLFS, Economic Census 2013 |
| [adr-015](decisions/adr-015-atlas-ui-overhaul.md) | 2026-07-02 | product | Atlas UI overhaul: dark editorial almanac redesign of the explorer |
| [adr-016](decisions/adr-016-mob-site-sync-backfill.md) | 2026-07-06 | product | Site-sync backfill: service/secret inventories, pages, public docs, real README |
| [adr-017](decisions/adr-017-agri-poverty-verticals.md) | 2026-07-15 | product | Expand data coverage: agriculture (APY) and poverty (NITI MPI) verticals |
| [adr-018](decisions/adr-018-fill-new-districts.md) | 2026-07-16 | reliability | Fill post-2011 districts: exact crosswalk re-aggregation + flagged sibling inheritance |
| [adr-019](decisions/adr-019-estimate-disclosure-point-of-use.md) | 2026-07-16 | product | Estimated districts are disclosed where you read the number, not painted across the map |
| [adr-020](decisions/adr-020-estimate-citation-per-metric.md) | 2026-07-16 | reliability | Every estimated number cites the district it actually came from |
| [adr-021](decisions/adr-021-estimate-kind-discriminator.md) | 2026-07-16 | reliability | Every estimate records what kind of estimate it is |
| [adr-022](decisions/adr-022-stats-exclude-copies.md) | 2026-07-16 | reliability | Statistics exclude copies, not projections |
| [adr-023](decisions/adr-023-ranks-follow-stats-membership.md) | 2026-07-18 | reliability | Ranks follow stats membership — projections rank with their badge, copies never |
| [adr-024](decisions/adr-024-drop-shrug-ec13.md) | 2026-07-18 | reliability | Dropped the Economic-Census metrics rather than ship non-commercially-licensed data |
| [adr-025](decisions/adr-025-classification-method-selection.md) | 2026-07-27 | product | Choropleth classification follows each metric's distribution, not one global default |
| [adr-027](decisions/adr-027-shrug-crosswalk-accept.md) | 2026-08-04 | product | Accept the CC-BY-NC-SA census crosswalk while non-commercial; swap to LGD before monetising |
| [adr-028](decisions/adr-028-positioning-and-non-goals.md) | 2026-08-04 | product | Positioning as the provenance-honest atlas; non-goals matched to shipped behaviour (+ 2026-08-05 paywall-line amendment) |
| [adr-029](decisions/adr-029-no-user-generated-content.md) | 2026-08-05 | security | No user-generated content on the public site — sidestepping intermediary liability |
