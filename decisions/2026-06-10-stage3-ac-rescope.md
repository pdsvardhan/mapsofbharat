---
id: adr-011-stage3-ac-rescope
title: Re-scope Stage 1 acceptance criteria to shipped Stage 3 reality; move gaps to backlog
date: 2026-06-10
status: accepted
tags: [process, scope]
linked_features: [feat-geo-backbone, feat-ingest-pipeline, feat-demographics-pilot, feat-choropleth-map, feat-metric-selector, feat-source-trust, feat-export-share, feat-region-detail]
---

# ADR-011: Stage 3 AC re-scope

## Context

On 2026-06-10 an independent 3-agent verification pass (verification reports 78–89 in the
Ottomate tracker) audited all 12 features against their locked Stage 1 acceptance criteria.
Outcome: **0 stubs, 0 BLOCK** — everything shipped is real and live-verified — but 7 features
received ITERATE because their ACs name capabilities that were never built. The ACs were
written at Stage 1 ambition level (LGD/ISO crosswalk, six census data domains, class-break
methods, CSV/SVG/iframe export, multi-year trends) while Stage 3 deliberately built a
narrower, coherent v1 (Census-2011 demographics pilot, rid-keyed crosswalk, continuous-scale
choropleth, PNG + permalink sharing).

## Decision

Amend the acceptance criteria to describe **shipped reality**, and move every removed
capability to the Stage 4 backlog with an explicit reason — nothing is silently dropped.
User approved this option over "build everything to AC" on 2026-06-10.

| Gap (verifier evidence) | Destination |
|---|---|
| TN rid `33_0` collision: Tenkasi, Ranipet, Tirupathur, Chengalpattu merge (report 81) | **Backlog P0 bug** — AC "one canonical region_id per polygon" kept as the standard; currently unmet for 4/735 polygons |
| LGD + ISO keys; persisted crosswalk table (reports 81, 83) | Backlog P2 (ADR-002 anticipated dual keys) |
| `fetched_at` / load-log provenance (report 83) | Backlog P1 |
| Religion, language, amenities data domains (report 84) | Backlog P2 (C-1, C-16, HH-series via existing adapter pattern) |
| State-aggregated choropleth view (report 78) | Backlog P2 — design decision; district-level view with state drill shipped |
| Class-break methods (quantile/equal-interval/Jenks) + Spectral palette (report 78) | Backlog P2 — continuous Viridis/RdBu shipped |
| Year selector; search-to-fly (report 79) | Search → Backlog P1. Year → Backlog P3, blocked on multi-year data |
| Methodology + last-updated surface; caveats note (report 80) | Backlog P1 |
| CSV + SVG export; iframe embed (report 88) | CSV → P1, embed → P2, SVG → P3 |
| Year + scale permalink params (report 88) | Backlog P3, moot until multi-year data |
| Multi-year trend chart (report 87 — no code; won't auto-satisfy on 2nd-year ingest) | Backlog P3, with multi-year data |
| flow-compare locked steps said "two synced maps side by side"; built UI is pin-2-districts + Δ panel on one map | Flow steps amended to shipped interaction (verifier APPROVEd the feature AC as disjunctive) |

## Consequences

- The 3→deploy gate's "verifier APPROVE on every feature" is judged against the amended ACs.
  Features whose only failures were re-scoped items are eligible for re-verification.
- The ITERATE reports (78–89) stand unmodified as the historical record of the original ACs.
- The full backlog was filed as a Stage 4 intake report in the tracker inbox; it goes through
  classify → lock-in before any of it is built (lock-before-build).
- Feature titles trimmed where they named unbuilt scope: "Metric and year selector with
  search" → "Metric selector"; "Region detail panel and trend chart" → "Region detail panel".
