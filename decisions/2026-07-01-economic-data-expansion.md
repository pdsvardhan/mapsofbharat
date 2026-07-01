# ADR-014 — Expand the economy vertical + add a labour vertical (iter-50)

- **Status:** accepted
- **Date:** 2026-07-01
- **Scope:** iteration 50 (items 381 PLFS, 382 RBI fiscal, 383 EC13). Extends feat-ingest-pipeline / feat-canonical-store.

## Context

The `economy` vertical held a single state metric (MoSPI per-capita NSDP, 2022). This iteration adds
**10 official economic/financial metrics** across three sources, taking the catalog from 26 → 36 metrics
and adding a new `labour` category. All three items were built with idempotent adapters and passed the
independent verifier (verification reports 267, 268, 269).

## Decision — three new verticals

**Labour (PLFS, MoSPI · state)** — `plfs_unemployment_rate`, `plfs_lfpr`, `plfs_wpr`, pulled from the
data.gov.in OGD API (usual status ps+ss).

**State fiscal (RBI Handbook of Statistics on Indian States, FY2024-25 · state)** —
`econ_percapita_nsdp_rbi`, `gsdp_growth`, `fiscal_deficit_pct_gsdp`, `own_tax_pct_gsdp`,
`outstanding_debt_pct_gsdp`. Ratios computed against GSDP (Table 21) with ₹Lakh↔₹Crore unit alignment.

**Economic activity (Economic Census 2013 via SHRUG · district)** — `estab_per_1000`,
`nonfarm_emp_per_1000`, reaggregated from 2011-Census districts onto current-day boundaries via the
geometric crosswalk (mass-conserving; 100% of establishments/employment assigned).

## Methodology decisions & disclosed caveats

1. **Per-capita NSDP kept as BOTH series** — the existing MoSPI (2022) metric is retained *and* the RBI
   Handbook (FY24-25) per-capita NSDP is added as a separate, labelled metric, so users can compare
   vintages. No overwrite.
2. **PLFS uses the latest year available per metric** (UR 2023-24, WPR 2022-23, LFPR 2020-21) — a single
   common recent year is not published state-wise for all three on OGD. Each metric cites its own year
   (the store already mixes vintages across metrics). LFPR (2020-21) is the weakest link and is labelled.
3. **RBI debt cross-year fallback** — `outstanding_debt_pct_gsdp` divides the end-March-2025 debt stock
   by an earlier-FY GSDP for 6 states lacking a recent GSDP figure (Gujarat, Goa, Sikkim, Nagaland,
   Manipur, Mizoram), a slight overstatement disclosed in the metric methodology. Future refinement:
   align the stored year or extrapolate GSDP for those states.
4. **EC13 split-district density approximation** — where a 2011 district was later split into N current
   districts, each child inherits the parent's per-1,000 rate (raw counts can't be split without
   sub-district EC detail the SHRUG district table lacks). Documented per-metric.
5. **Vintage gaps disclosed** — EC 2013 counts ÷ 2011 population (~2-yr gap); crime rates already reuse
   the 2011 denominator (pre-existing). Each metric's `methodology` states its source, year, and
   processing.

## Consequences

- economy 1 → 8 metrics; new `labour` category (3); 26 → 36 total. Live at `/api/metrics` (DB is a
  mounted volume — no redeploy needed).
- Adapters `pipeline/ingest_plfs.py`, `pipeline/ingest_rbi_fiscal.py`, `pipeline/ingest_ec13.py` are
  committed (idempotent; regenerate the gitignored DB).
- NDAP was evaluated as a district-level meta-source and **rejected** (Cognito + per-user API-key wall,
  no headless access) — source datasets directly instead.
