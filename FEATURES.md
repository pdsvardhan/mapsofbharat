<!-- generated from registry @ f5ce467 on 2026-08-28 — DO NOT EDIT; edit the registry via the Ottomate API. R-DOC-1. -->
# mapsofbharat — Features & Flows (generated reference)

> Generated from the Ottomate registry (the single source of truth). To change anything here, edit the feature/flow/acceptance-criteria in the tracker, then re-run `scripts/generation/gen-reference-docs.mjs --project mapsofbharat`.

## Features

### done (17)

- **Bivariate choropleth** `feat-bivariate-map` — _ui_, test: `partial`
  - Two curated metrics on one map via a 2D colour matrix, with pairings chosen at build time. Parked to post-launch per the launch plan.
  - AC: A reader can pair two district metrics and read them on one map through a 3x3 colour matrix, with the pairing carried in the URL so the view is shareable.
  - AC: A pair with too little shared geography is refused in plain language rather than drawn. The floor is 690 shared districts, or 30 shared states.
  - AC: Class breaks are computed per axis independently through the shared data-driven method selection, so a tie-heavy distribution ladders to zeroFloor instead of leaving an empty band and painting zero-reporting regions into the middle class.
  - AC: When the focused scope holds fewer regions than the matrix has classes, the matrix key stands down and the refusal is shown. The key never describes colours the map is not painting.
  - AC: The matrix key states its numeric class boundaries in each axis own unit, and the univariate ramp stands down while a pair is drawn.
- **Browse the catalogue by visual form** `feat-browse-by-form` — _ui_, test: `partial`
  - A second entrance to the metric catalogue that groups metrics by the visual form their data supports, derived from the data rather than chosen by the reader.
  - AC: The catalogue at /metric offers a second entrance grouping metrics by the visual form their data supports, addressable as a URL rather than a client-side control.
  - AC: A metric form is derived from its own data, its unit and value range, never from a hand-maintained metric-to-form list. All 125 metrics are reachable through at least one form and none is left formless.
  - AC: Each group states why its members sit under that form, and every distinct reason a group carries is shown. A metric is never displayed under a sentence computed for a different metric.
  - AC: Both entrances render without JavaScript, share one canonical URL, and the original subject entrance is unchanged.
- **Canonical metric store and schema** `feat-canonical-store` — _backend_, test: `passing`
  - All data lives in one canonical store — region × metric × year × value — with full metadata on every metric.
  - AC: Schema region x metric x year x value plus metric metadata is migrated
  - AC: Saitual (Mizoram, created 2019) intentionally has no region_keys row and renders no polygon. districts.geojson and region_keys stay one-for-one at 735, and no in-repo official source can produce its boundary, so none is invented (adr-031). Sources printing a Saitual row are dropped at district level; NCRB and JJM record a skip_reason, while ISFR folds it into Aizawl by an explicit documented alias. A keyless region_keys row is never inserted to make a count read 11.
  - AC: A metric can be loaded and queried by region and year
- **Interactive choropleth with India to state to district drill** `feat-choropleth-map` — _ui_, test: `partial`
  - The core experience: a colour-graded map of India you can drill from country to state to district, in colour-blind-safe palettes.
  - AC: User views a metric as a district-level choropleth and clicks a state to drill into its districts
  - AC: The colour scale can be reversed from the legend itself in value mode, without opening the scale popover; the choice persists to the URL as rev=1 and is the same setting the popover DIRECTION row drives, not a second one (test: `tests/iter35-controls.spec.ts`)
  - AC: In value mode, where the metric warrants it, district fill opacity is weighted by population on a logarithmic scale between the p5 and p95 bounds, so a large sparsely-populated district cannot dominate the reading by area alone.
  - AC: Choropleth colouring uses a continuous scale with a min/max legend
  - AC: A colour-blind-safe palette (Viridis) is the default; a diverging palette (RdBu) is used for vs-average mode
- **Compare mode (region, year, or metric)** `feat-compare-mode` — _ui_, test: `passing`
  - Put two regions, two years, or two metrics side by side with a difference view.
  - AC: Two regions render side by side in A/B slots with THE GAP and a plain-language read. Compare-by-year is struck: 0 of 124 metrics hold two comparable time points (research/2026-08-20-455). Compare-by-metric is to-do #547, not this feature. (test: `tests/flows.spec.ts`)
  - AC: A difference or percent-change view is available (test: `tests/flows.spec.ts`)
- **Demographics vertical (Census 2011)** `feat-demographics-pilot` — _hybrid_, test: `partial`
  - Census 2011 demographics was the proving ground — ingested end to end and rendered at district level on today's boundaries.
  - AC: Census 2011 district data (population, literacy, SC/ST, sex ratios, work participation, livelihood) loads on current-day boundaries (test: `pipeline/test_pipeline.py`)
  - AC: All demographic metrics render in choropleth, compare, and export
- **Export and shareable/embeddable views** `feat-export-share` — _ui_, test: `partial`
  - Any view exports to CSV, PNG or SVG — or share it as a permalink, or embed it as an iframe.
  - AC: The CARD social export downloads a PNG with headline, values, legend, source attribution and brand block (4:5/1:1, ink/paper) — sole image export since iter-72 (test: `tests/social-card.spec.ts`)
  - AC: A permalink encodes metric, mode, drilled state, and compare pins, and restores that view on load (test: `tests/flows.spec.ts`)
- **Geography backbone and region crosswalk** `feat-geo-backbone` — _backend_, test: `partial`
  - The hard part: a crosswalk reconciling Census-2011 districts with today's boundaries, so old data renders correctly on the current, Survey-of-India-compliant map.
  - AC: A Census-2011 sub-district to current-district crosswalk (rid-keyed) reaggregates 2011 data onto current boundaries, validated against official PCA (median diff < 2%) (test: `pipeline/test_pipeline.py`)
  - AC: Geometry is served pre-compressed with encoding negotiation: a client offering brotli gets the .br variant, one offering only gzip gets the .gz (never the raw file), and one offering neither gets the original intact. A stated qvalue preference is honoured and q=0 is treated as a refusal. The atlas payload drops 104,519 bytes against the recorded TEC-20 baseline, geometry 286.6 -> 184.5 KB (adr-038). (test: `tests/geodata-encoding.spec.ts`)
  - AC: Every state and district polygon resolves to one canonical region_id (test: `pipeline/test_pipeline.py`)
  - AC: Boundary set passes a Survey-of-India compliance check (J&K, Ladakh, Arunachal, Aksai Chin) (test: `scripts/check-boundaries.mjs`)
- **Ingestion pipeline and dataset adapters** `feat-ingest-pipeline` — _automated_, test: `partial`
  - Each dataset gets an adapter that fetches, cleans, maps and loads it — adding a new statistic is a pipeline run, not a rebuild.
  - AC: An adapter runs fetch then clean then map-to-canonical-region-key (rid) then normalize then load (test: `pipeline/test_pipeline.py`)
  - AC: Re-running an adapter is idempotent (upsert, no duplicates) (test: `pipeline/test_pipeline.py`)
  - AC: Each load records source, year, and license (test: `pipeline/test_pipeline.py`)
- **Metric families as small multiples** `feat-metric-families` — _ui_, test: `partial`
  - A set of related official indicators drawn as one grid of district choropleths, so a whole subject reads at a glance. Nine families declared in lib/metric-families.ts, each with an explicit shared or free axis, and a part-to-whole caption only where the members were measured to decompose.
  - AC: A family page renders one panel per resolved member; every panel draws every district in the artefact, with districts outside the family's shared set present in the no-data tone rather than omitted.
  - AC: The axis in force is the one the family declares: a shared axis classifies over one pooled domain and renders exactly one legend; a free axis classifies each member on its own values and renders no legend, stating each panel's range in its caption instead.
  - AC: Panels classify through lib/breaks.ts with the same stats membership the atlas uses (countsInStats, adr-022), so a panel classes a metric the way the main map does.
  - AC: A part-to-whole caption appears only for families measured to decompose, and prints the measured figure and district count rather than a rounded one; every other family carries the opposite statement.
  - AC: Every panel is a figure with a figcaption, and its accessible name carries both the value range and whether the scale is shared or not comparable across panels.
- **Metric selector** `feat-metric-selector` — _ui_, test: `partial`
  - Switch the statistic on the map in one click.
  - AC: User can switch the metric and the map recolours
  - AC: The ALL INDICATORS disclosure on the selected-region panel reads as a control and exposes its open/closed state via aria-expanded (test: `tests/iter35-controls.spec.ts`)
  - AC: Metrics are grouped by topic category in the selector (demographics, poverty, agriculture, health, …); picking a category filters the list to that topic
  - AC: Selecting a metric applies its per-metric default break method and topic-suggested palette, and the legend reflects the metric's unit and value formatting
- **Metric-to-metric transition** `feat-metric-shift` — _ui_, test: `partial`
  - Pick a second metric on any well-covered metric page and watch every district keep its identity while the ranking re-sorts - a Gapminder-style re-rank needing zero time points. Reduced motion gets the static two-axis scatter instead.
  - AC: A metric page whose metric meets its level's coverage floor offers a picker of eligible partners derived from the store (never a hand-written list); a metric under the floor gets no section at all.
  - AC: Picking a partner draws exactly one dot per region in the two metrics' SHARED set - never the base metric's whole set - and the comparison is shareable via ?vs= in the URL, restored on load.
  - AC: Re-sorting preserves each region's identity (stable keys, stable value-then-code tie-break) and stages the change: ~1s on position, colour following after the move settles.
  - AC: Dot colours class the sorting metric through lib/breaks' own selector, edges and palettes (adr-033) - one definition per visual fact, never a second scheme.
  - AC: Under prefers-reduced-motion the animation is replaced by the static two-axis scatter (both metrics at once, no motion controls); re-sorts announce via a scoped aria-live region and the picker is keyboard-operable.
- **Rankings, percentile, and vs-average** `feat-rankings-stats` — _ui_, test: `passing`
  - Auto rank/percentile + vs-average diverging view.
  - AC: Selecting a region shows its rank and percentile for the metric, computed over the districts the source actually surveyed. A district whose value was inherited from its parent (estimated=1) has no rank of its own and reports the inheritance instead (adr-019). (test: `tests/estimates.spec.ts`)
  - AC: The ranked table can be scrolled by keyboard alone. Its scroll container is a named focus target (role + accessible name), because 23,339px of rankings sat behind three header buttons in the first 44px - axe passed it, and a keyboard reader could reach 0.2% of it (#631). (test: `tests/a11y.spec.ts`)
  - AC: A vs national/state average diverging view can be toggled (test: `tests/rankings.spec.ts`)
- **Region detail panel** `feat-region-detail` — _ui_, test: `passing`
  - Click any state or district to open its full profile panel.
  - AC: Clicking a region opens a panel with its value and rank per metric, with citations (test: `tests/rankings.spec.ts`)
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
  - AC: Every metric shows source, year, and license, with a working citation link (test: `tests/methodology.spec.ts`)
  - AC: Each metric exposes methodology text (how the figure was measured/derived), served by the metrics API and shown in the trust surface (test: `tests/methodology.spec.ts`)
  - AC: Source metadata (source, year, license, methodology, coverage) is stored per-metric in the canonical DB rather than hardcoded in the UI, so it stays correct across re-ingests (test: `tests/methodology.spec.ts`)
- **Value-by-alpha population weighting** `feat-value-by-alpha` — _ui_, test: `partial`
  - Fill opacity weighted by population alongside fill colour by value, so the map stops weighting India by acreage. Carries its own legend key, and forces no-data to a hatch so absence can never be mistaken for faintness.
  - AC: The legend carries a colour-by-alpha key, its rows labelled with real population figures, so a faded fill can be read off the key rather than guessed at.
  - AC: Regions with no data are drawn as a hatch rather than a tone, in every mode and on both vintages, so absence of data is never mistaken for faintness. Measured worst fill-versus-hatch contrast 3.47:1, above the 3:1 floor; tone alone measures as little as 1.01:1 and cannot carry the distinction.
  - AC: The fade applies only where it is warranted, measured as a class-share total variation distance at or above 0.15, and the disclosure names the measured share.
  - AC: A warrant that cannot be computed refuses and says so. A non-finite population or area can never fall through to a warranted verdict, and the reader is never shown a non-finite share.

### building (1)

- **Symbol / proportional-symbol maps** `feat-symbol-choropleth` — _ui_, test: `partial`
  - Proportional-symbol maps for HOTSPOT metrics where a choropleth misleads (single-district spikes, raw counts). Unblocks roughly 29 district metrics — about a third of the library.
  - AC: Symbol AREA is proportional to value, not radius: a district with 4x the count draws a circle of 2x the radius, so twice the ink means twice the quantity. Holds across the domain, the maximum value takes the maximum radius, and a small nonzero value is floored so it cannot vanish while a real zero draws nothing. Each circle sits on a representative point computed offline to lie INSIDE its own polygon, so none is drawn in the sea or over a neighbour. (test: `tests/symbol-maps.spec.ts`)
  - AC: Only COUNT metrics are offered symbols. Rates stay choropleths — including count-shaped rates such as pop_density, and rates that merely look skewed, which is the case a HOTSPOT-flag check gets wrong (research/531). (test: `tests/symbol-maps.spec.ts`)
  - AC: Signed metrics are refused automatically, because a sqrt-area circle cannot say which direction a change went. forest_change_km2 is excluded by detecting negative values, so the layer fails safe rather than drawing a loss as a gain. (test: `tests/symbol-maps.spec.ts`)
  - AC: Symbol mode keeps full interaction parity with the choropleth: every feature-state write reaches the symbol source, selection from the rail works and opens the region panel, and hover behaves the same. A mode that drops half the interactions is a demo, not a view. (test: `tests/symbol-maps.spec.ts`)
  - AC: SHADE / SIZE is a real, shareable choice: flipping the mode changes the map, only a deliberate flip travels in the URL, and a shared sym=0 link opens as a choropleth for the recipient. (test: `tests/symbol-maps.spec.ts`)

### planned (2)

- **Categorical / qualitative maps** `feat-categorical-maps` — _ui_, test: `not-tested`
  - Categorical map rendering for non-continuous indicators (e.g. the dominant category per region), with a legend of discrete classes.
- **Hex-state and cartogram views** `feat-hex-cartogram` — _ui_, test: `not-tested`
  - Hex-state and population-cartogram layouts that give small or dense regions fair visual weight versus a geographic choropleth.

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
