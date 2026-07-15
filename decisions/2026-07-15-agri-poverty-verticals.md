# Expand data coverage: agriculture (APY) and poverty (NITI MPI) verticals

**Status:** accepted · **Date:** 2026-07-15 · iteration 11

## Context

Two roadmap verticals had acquirable official data on disk but were unbuilt, and
two data-quality gaps blocked good rendering. This iteration ships them together.

## Decision

Add two new topic verticals to the atlas and fix two rendering-integrity gaps:

- **Agriculture (APY 2014, data.gov.in).** Three district metrics — rice
  production, wheat production, and gross cropped area — from the Area-Production-
  Yield dataset (22 states / 430 districts). Production units differ per crop, so
  only same-unit aggregates are exposed; pre-aggregated rows and Assam's duplicate
  "Paddy" entries are excluded to avoid double-counting.
- **Poverty (NITI Aayog National MPI 2023).** Three district metrics — the
  multidimensional-poverty headcount ratio, intensity, and the MPI index
  (NFHS-5, 2019-21), 667 districts. The report is a 410-page PDF whose district
  tables carry an **invisible phantom text layer** duplicating the previous
  state's table; naive extraction interleaves the two into garbage. Solved by
  reading word coordinates, filtering the phantom by its glyph text-matrix, and
  guarding every row with an **integrity checksum** — NITI defines
  MPI = headcount x intensity, so each triple must satisfy
  `|mpi - hcr*intensity/10000| <= 0.006`. This turns a fragile PDF parse into a
  trustworthy one (667/667 rows pass).
- **Per-metric break methods (`default_scale`).** The column held palette names
  ("sequential"/"viridis") the choropleth silently ignored, leaving the override
  inert. Every metric is now assigned a data-driven class-break method from its
  distribution (skewed → quantile, symmetric → equal); the ingest helpers no
  longer write palette names.
- **Lakshadweep geometry.** The degenerate 4-point placeholder polygon is
  replaced with a curated Survey-of-India-compliant MultiPolygon of the ten major
  islands at their true coordinates.

## Consequences

- Two new topic categories (agriculture, poverty); 65 canonical metrics total.
- Every metric now has a valid break method, so per-metric scale tuning is live.
- Reusable extraction pattern for future NITI/NFHS PDFs: coordinate parse +
  matrix-based phantom filter + relational checksum.
- Coverage remains partial where the source is partial (APY: 22 states) — disclosed
  in each metric's methodology, not hidden.
