<!-- generated from registry @ 1ecda37 on 2026-08-11 — DO NOT EDIT; edit the registry via the Ottomate API. R-DOC-1. -->
# mapsofbharat — Features & Flows (generated reference)

> Generated from the Ottomate registry (the single source of truth). To change anything here, edit the feature/flow/acceptance-criteria in the tracker, then re-run `scripts/generation/gen-reference-docs.mjs --project mapsofbharat`.

## Features

### done (12)

- **Canonical metric store and schema** `feat-canonical-store` — _backend_, test: `passing`
  - All data lives in one canonical store — region × metric × year × value — with full metadata on every metric.
  - AC: Schema region x metric x year x value plus metric metadata is migrated
  - AC: Saitual (Mizoram, created 2019) intentionally has no region_keys row and renders no polygon. districts.geojson and region_keys stay one-for-one at 735, and no in-repo official source can produce its boundary, so none is invented (adr-031). Sources printing a Saitual row are dropped at district level; NCRB and JJM record a skip_reason, while ISFR folds it into Aizawl by an explicit documented alias. A keyless region_keys row is never inserted to make a count read 11.
  - AC: A metric can be loaded and queried by region and year
- **Interactive choropleth with India to state to district drill** `feat-choropleth-map` — _ui_, test: `partial`
  - The core experience: a colour-graded map of India you can drill from country to state to district, in colour-blind-safe palettes.
  - AC: User views a metric as a district-level choropleth and clicks a state to drill into its districts
  - AC: The colour scale can be reversed from the legend itself in value mode, without opening the scale popover; the choice persists to the URL as rev=1 and is the same setting the popover DIRECTION row drives, not a second one (test: `tests/iter35-controls.spec.ts`)
  - AC: Choropleth colouring uses a continuous scale with a min/max legend
  - AC: A colour-blind-safe palette (Viridis) is the default; a diverging palette (RdBu) is used for vs-average mode
- **Compare mode (region, year, or metric)** `feat-compare-mode` — _ui_, test: `passing`
  - Put two regions, two years, or two metrics side by side with a difference view.
  - AC: Two regions, two years, or two metrics render side by side
  - AC: A difference or percent-change view is available
- **Demographics vertical (Census 2011)** `feat-demographics-pilot` — _hybrid_, test: `partial`
  - Census 2011 demographics was the proving ground — ingested end to end and rendered at district level on today's boundaries.
  - AC: Census 2011 district data (population, literacy, SC/ST, sex ratios, work participation, livelihood) loads on current-day boundaries
  - AC: All demographic metrics render in choropleth, compare, and export
- **Export and shareable/embeddable views** `feat-export-share` — _ui_, test: `partial`
  - Any view exports to CSV, PNG or SVG — or share it as a permalink, or embed it as an iframe.
  - AC: The CARD social export downloads a PNG with headline, values, legend, source attribution and brand block (4:5/1:1, ink/paper) — sole image export since iter-72 (test: `tests/flows.spec.ts`)
  - AC: A permalink encodes metric, mode, drilled state, and compare pins, and restores that view on load
- **Geography backbone and region crosswalk** `feat-geo-backbone` — _backend_, test: `partial`
  - The hard part: a crosswalk reconciling Census-2011 districts with today's boundaries, so old data renders correctly on the current, Survey-of-India-compliant map.
  - AC: A Census-2011 sub-district to current-district crosswalk (rid-keyed) reaggregates 2011 data onto current boundaries, validated against official PCA (median diff < 2%)
  - AC: Every state and district polygon resolves to one canonical region_id
  - AC: Boundary set passes a Survey-of-India compliance check (J&K, Ladakh, Arunachal, Aksai Chin)
- **Ingestion pipeline and dataset adapters** `feat-ingest-pipeline` — _automated_, test: `partial`
  - Each dataset gets an adapter that fetches, cleans, maps and loads it — adding a new statistic is a pipeline run, not a rebuild.
  - AC: An adapter runs fetch then clean then map-to-canonical-region-key (rid) then normalize then load
  - AC: Re-running an adapter is idempotent (upsert, no duplicates)
  - AC: Each load records source, year, and license
- **Metric selector** `feat-metric-selector` — _ui_, test: `partial`
  - Switch the statistic on the map in one click.
  - AC: User can switch the metric and the map recolours
  - AC: The ALL INDICATORS disclosure on the selected-region panel reads as a control and exposes its open/closed state via aria-expanded (test: `tests/iter35-controls.spec.ts`)
  - AC: Metrics are grouped by topic category in the selector (demographics, poverty, agriculture, health, …); picking a category filters the list to that topic
  - AC: Selecting a metric applies its per-metric default break method and topic-suggested palette, and the legend reflects the metric's unit and value formatting
- **Rankings, percentile, and vs-average** `feat-rankings-stats` — _ui_, test: `passing`
  - Auto rank/percentile + vs-average diverging view.
  - AC: Selecting a region shows its rank and percentile for the metric, computed over the districts the source actually surveyed. A district whose value was inherited from its parent (estimated=1) has no rank of its own and reports the inheritance instead (adr-019). (test: `tests/estimates.spec.ts`)
  - AC: A vs national/state average diverging view can be toggled (test: `tests/rankings.spec.ts`)
- **Region detail panel** `feat-region-detail` — _ui_, test: `passing`
  - Click any state or district to open its full profile panel.
  - AC: Clicking a region opens a panel with its value and rank per metric, with citations
  - AC: The region panel shows the value against the national/state average (vs-average) and the region's rank or percentile position (test: `tests/rankings.spec.ts`)
  - AC: The detail panel works at both state and district drill levels, always reflecting the currently selected region (test: `tests/rankings.spec.ts`)
- **Social export mode (Instagram-ready map cards)** `feat-social-export` — _ui_, test: `passing`
  - One-click social-media export: 4:5/1:1 presets, mainland+insets layout, value labels, editorial headline, anchor stat, classed legend, brand block, dark ink + paper almanac themes.
  - AC: Social export offers 4:5 (1080x1350) and 1:1 (1080x1080) presets, rendered at 2x for print quality (test: `tests/social-card.spec.ts`)
  - AC: Export crops to mainland India with Andaman-Nicobar and Lakshadweep as inset boxes, no dead-space margins (test: `tests/social-card.spec.ts`)
  - AC: State cards label regions with name + formatted value and leader lines; district-level or dense views instead mark the top-8/bottom-3 with numbered rank markers plus HIGHEST/LOWEST list panels (test: `tests/social-card.spec.ts`)
  - AC: Header carries an editorial headline, plain-language scope subtitle, and a national anchor-stat callout (average for rates, total for counts); the data year is carried in the footer source citation (test: `tests/social-card.spec.ts`)
  - AC: Discrete 5-class legend with Indian-format break labels K/L/Cr, brand block with wordmark + @mapsofbharat + site URL plus source citation, all legible in both dark ink and paper almanac themes (test: `tests/social-card.spec.ts`)
- **Source citation and methodology surface** `feat-source-trust` — _ui_, test: `partial`
  - Every number carries its official source, year and methodology — nothing uncited, ever.
  - AC: Every metric shows source, year, and license, with a working citation link
  - AC: Each metric exposes methodology text (how the figure was measured/derived), served by the metrics API and shown in the trust surface (test: `tests/methodology.spec.ts`)
  - AC: Source metadata (source, year, license, methodology, coverage) is stored per-metric in the canonical DB rather than hardcoded in the UI, so it stays correct across re-ingests

### planned (5)

- **Bivariate choropleth** `feat-bivariate-map` — _ui_, test: `not-tested`
  - Two curated metrics on one map via a 2D colour matrix, with pairings chosen at build time. Parked to post-launch per the launch plan.
- **Categorical / qualitative maps** `feat-categorical-maps` — _ui_, test: `not-tested`
  - Categorical map rendering for non-continuous indicators (e.g. the dominant category per region), with a legend of discrete classes.
- **Hex-state and cartogram views** `feat-hex-cartogram` — _ui_, test: `not-tested`
  - Hex-state and population-cartogram layouts that give small or dense regions fair visual weight versus a geographic choropleth.
- **Symbol / proportional-symbol maps** `feat-symbol-choropleth` — _ui_, test: `not-tested`
  - Proportional-symbol maps for HOTSPOT metrics where a choropleth misleads (single-district spikes, raw counts). Unblocks roughly 29 district metrics — about a third of the library.
- **VSUP uncertainty encoding toggle** `feat-vsup-uncertainty` — _ui_, test: `not-tested`
  - A value-suppressing-uncertainty toggle that folds confidence / coverage into the colour, so estimated or thin-coverage values read as less certain.

## Flows

- **Compare two regions, years, or metrics** `flow-compare` — test: `passing` (`tests/flows.spec.ts`)
  - User opens compare mode → Side-by-side comparison with optional difference
- **Drill into a state to district level** `flow-drill-state` — test: `passing` (`tests/flows.spec.ts`)
  - User selects a state, then clicks View N districts in its profile → District-level detail for the chosen state
- **Explore a metric on the map** `flow-explore-metric` — test: `passing` (`tests/flows.spec.ts`)
  - User opens a metric view → User sees the spatial distribution and a chosen region standing
- **Export or share the current view** `flow-export-share` — test: `passing` (`tests/flows.spec.ts`)
  - User clicks export or share → A downloadable file or shareable link
- **Ingest or refresh a dataset** `flow-ingest-dataset` — test: `not-tested`
  - Scheduled job or manual run → Fresh, cited data available to the UI
