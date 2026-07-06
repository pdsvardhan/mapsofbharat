# adr-016 — Site-sync backfill: inventories, pages, public docs, real README (#178 pass)

**Status:** accepted · **Date:** 2026-07-06

## Decision
Complete the mapsofbharat Stage-4 site-sync pass per ottomate adr-021 (owner-gated): populate the empty service/secret inventories — 4 third-party services (MoSPI eSankhyiki / data.gov.in API, Cloudflare Tunnel, NPM LAN proxy, Gitea) and 1 secret (DATA_GOV_IN_API_KEY, env-file); backfill the 3 missing page rows (/explore, /methodology, /embed) alongside the existing map root; publish 3 public_docs (thesis, technical-deep-dive, validation) mirrored to the showcase Resources tab; replace the create-next-app boilerplate README with a real one documenting the read-only canonical DB rule, the rid crosswalk, pipeline quality gates and deployment. Register wording unchanged (already accurate); current_status stays "building" by owner decision — the ingestion waves are ongoing work.

## Context
The 2026-06-29 audit flagged the empty inventories, boilerplate README and missing public docs. The register and SO1 content were already rich (12 features, 15 ADRs, 4 diagrams, UI plan), so this pass was inventory + narrative only. All content traces to CODING_GUIDELINES.md, pipeline/ scripts, .env keys and the cloudflared config; the previously-flagged stale geo-backbone feature note was already fixed in an earlier iteration.

## Consequences
- Showcase page renders the full adr-021 IA: Engineering inventories populated, Resources tab now appears.
- README finally describes the project instead of create-next-app.
- React Flow diagram conversion deferred to the global #178 rollout chunk.

## Related
ottomate adr-021 (showcase IA), adr-012 (official sub-district PCA), #178.
