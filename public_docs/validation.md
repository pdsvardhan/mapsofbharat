---
public: true
type: validation
title: Sources, citations & quality gates
order: 3
summary: Every metric's provenance — and the checks that stop bad data from reaching the map.
read_minutes: 3
---

# Validation — how MapsOfBharat keeps its data trustworthy

## Sources (official or top-tier only)

| Source | What it provides |
|---|---|
| Census of India 2011 district tables | PCA, C-01 religion, C-16 language, household amenities |
| MoSPI eSankhyiki API (data.gov.in) | PLFS, CPI, WPI, IIP, NAS, HCES series |
| Survey of India outline + DataMeet/SHRUG polygons | State and district boundaries |
| NCRB / ADSI, CEA, EC-13 and other official tables | Crime, energy, economic-census verticals |

## The quality gates

- **Crosswalk or nothing** — every row must resolve to the canonical `rid` (LGD/Census-2011 district key). Unmappable rows are rejected, not guessed.
- **`expectations.json`** — each ingested dataset is validated against declared expectations before it can enter the canonical DB.
- **Citations are data** — source, year, and methodology ride with every metric; the UI renders them, and the /methodology page documents the approach.
- **As-reported-year toggle** — values are always tied to the year they were reported for; the map never silently blends eras.
- **Normalization first** — per-capita and rate views prevent the classic misleading-choropleth trap.

## Boundary compliance

Boundaries follow Survey of India — J&K, Ladakh, Arunachal Pradesh, and Aksai Chin rendered as India requires. GADM and other global boundary files are deliberately avoided (accuracy + legal risk).

## What this buys

A visitor can click any district value and know where it came from, which year it describes, and how it was normalized — the anti-paywall, anti-PDF, anti-mystery version of Indian statistics.
