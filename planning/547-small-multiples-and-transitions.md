# #547 — Small multiples and metric-to-metric transitions: build plan

> Written 2026-08-21. Builds on `research/2026-08-20-455-animation-recheck.md` (R1),
> and **corrects three of its claims** — see "What re-derivation changed" below.
> R1's two headline verdicts stand: build small multiples and the metric-to-metric
> transition; the slope chart is dead because 0 of 124 metrics hold two comparable
> time points.

## What re-derivation changed

R1's family table was measured on 2026-08-20. Re-running it against today's
catalogue (125 metrics) confirms the 8 families and their shared-district counts,
but **its part-to-whole claims do not survive the test**. A part-to-whole set is
the strongest small-multiples case, so R1 recommended seeding with three of them.
Only one is real:

| Candidate | Districts summing to 97-103 | Verdict |
|---|---|---|
| Religion (C-01, 6 metrics) | **663 / 733** | **PART-TO-WHOLE** — R1 correct |
| Household assets (HH-14, 5) | 63 / 733 | NOT — a household can own a car *and* a TV |
| Worker category (PCA, 4) | **0 / 733** | NOT — sums to 73.6% avg, see below |
| MGNREGA shares (3) | 34 / 683 | NOT — the avg of 100.0 is coincidence |

So **seed with religion alone**, not three families. The others are still good
small-multiples subjects; they are just grids of related indicators, not
decompositions, and must not be captioned as though they add up.

The worker-category result turned out to be a data finding rather than a design
one: those four metrics take `MAIN_*_P` numerators over `TOT_WORK_P`
(`pipeline/ingest_pca.py:65-66`), so they are *main* workers as a share of *all*
workers and the missing ~26% is marginal workers, undisclosed in descriptions that
say only "% of total workers". Filed as its own to-do; it is not this feature's
job to fix, but this feature must not render them as a decomposition until it is.

## The families, as measured today

| Family | Unit | Metrics | Shared districts | Axis |
|---|---|---|---|---|
| NFHS-5 health/lifestyle | % | 28 (22 excl. `nfhs5_srb`, minus `csection_private`) | 699 | free, in sub-blocks |
| Census PCA | % | 9 | 733 | free (5.6x spread) |
| Religion C-01 | % | 6 | 733 | **free** (24.2x: `jain_pct` maxes 4.1 vs `hindu_pct` 99.4) |
| ASER 2024 | % | 5 | 622 | shared |
| Household assets HH-14 | % | 5 | 733 | shared |
| NCRB crime | per 100k | 4 | 706 | **free** (153.7x: cyber vs IPC) |
| Livestock | head | 3 | 695 | shared, sqrt or log |
| MGNREGA | % | 3 | 683 | shared |

Axis choice is per-family and explicit, never defaulted — a shared linear axis
would flatten 5 of 6 religion panels and 3 of 4 crime panels into empty maps.

## Phase A — data layer (no new dependencies)

1. `lib/metric-families.ts` — the eight families as typed data: id, label, source
   cohort, unit, member ids, `axis: "shared" | "free"`, `partToWhole: boolean`,
   and the measured shared-district count.
2. **A guard, in the `check-*` family.** A family whose members drift (a metric
   retired, a unit changed, the shared-district count collapsing) must fail the
   build, not silently render a broken grid. Same shape as `check-raw-assets`:
   walk the declared families against the live store, assert each member exists,
   shares the declared unit, and still meets its floor of shared districts.
   Mutation-prove it before wiring.
3. `GET /api/families` and `GET /api/families/[id]` — members plus values on the
   shared district set, so the grid makes one request rather than N.

Phase A is fully testable without any UI and is the right first commit.

## Phase B — the small-multiple grid

- Route `/family/[id]`, server-rendered (more indexable pages, consistent with
  `/metric/[slug]`).
- N mini-choropleths from `public/geo/districts.geojson`. **Not** N MapLibre
  instances — that is the reason R1 says D3: `d3-geo` projects once to SVG paths,
  reused per panel with only the fill changing.
- New dependency: `d3-geo` (+ `d3-scale` if the existing `lib/breaks.ts` scales do
  not cover it). `d3-scale-chromatic` is already present. Adding D3 core is a
  stack decision and wants an ADR, per the precedent of adr-032.
- Reuse `lib/breaks.ts` for classification so a panel classifies exactly the way
  the main map does — one definition per visual fact (adr-033).
- Part-to-whole families get a "these sum to ~100%" caption. Only religion
  qualifies, and even it averages 97.6 rather than 100, so the caption states the
  real figure rather than implying exactness.
- Accessibility: each panel a `<figure>` with a real caption; the grid is static,
  so there is no motion to gate.

## Phase C — metric-to-metric transition

- Animates a re-sort between two different metrics on one geography. Needs zero
  time points, which is why R1 keeps it while striking the slope chart.
- Pool: 72 district metrics at >=690 coverage sharing 576 districts; 82 state
  metrics.
- `prefers-reduced-motion` gets an instant swap plus an `aria-live` announcement
  (766 Q5). Per R1, the static two-axis rendering is that fallback, **not** a
  third product.
- Staged ~1s transitions per Heer & Robertson (2007).

## Explicitly not built

- **Slope chart.** 0 of 124 metrics have two comparable time points. Revisit only
  when a `load_log` row shows an adapter loading a second year for an existing
  metric.
- **Animated map fills across time.** Same zero: one frame. Note the rule R1
  records — never animate a fill across *time*; animating across *metrics* is
  fine, and is Phase C.

## Open decisions

1. Adding D3 core to a deliberately small stack (adr-032 says no chart library).
   `d3-geo` is a projection utility, not a chart library, but the boundary should
   be drawn explicitly rather than assumed.
2. Whether the grid is its own route or a mode inside the atlas. Plan assumes its
   own route.
