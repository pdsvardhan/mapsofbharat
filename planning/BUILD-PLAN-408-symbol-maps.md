# Build plan — proportional symbol maps (#408, phase 1)

_Written 2026-08-20. Source of the decision: `research/758-choropleth-classification-findings.md`,
the project's own sourced brief. This plan implements only what that brief says to build._

## Why this, and why first

A choropleth colours a whole region by value. That works for **rates** (literacy %, sex
ratio) and lies for **counts**, because the eye reads *area*, not value. Mumbai City is
157 km²; Kutch is 45,674 km² — a **291× area ratio**. On a true-geography choropleth
Kutch outweighs Mumbai by that ratio no matter what colour either one is. The brief
calls this *area-size bias*, a named phenomenon distinct from classification, and notes
measured detection rates of ~60–80% for maximum-value small regions versus ~90% for
large ones.

No classification method, palette or class count touches it. Only a geometry- or
symbol-level remedy does.

The brief evaluated eight remedies and its verdict is unambiguous: proportional symbols
is **"the only remedy simultaneously small-cost, unconditionally compliant, and
mobile-neutral — a circle's radius is a free variable tied only to the data value,
structurally decoupled from the polygon."**

**29 district metrics — a third of the district library — are HOTSPOT-type and cannot
be shown honestly today.** That is the payoff.

## What the brief says NOT to build (correcting to-do #408's own title)

#408's title reads *"Then categorical, VSUP, hex-state, cartogram, bivariate."* That is
a roadmap for things the brief explicitly warns against:

- **Cartograms (contiguous, Dorling, hex-grid): do not build as default or share-card.**
  Largest cost, no mature JS tooling at India's scale, and they shrink exactly the huge,
  low-density, border-sensitive districts — Ladakh, Kargil, Arunachal — toward slivers.
  A merely *cropped* map (Karnataka, Nov 2024) already triggered real backlash. Legal
  status is silence, not permission: zero India-specific precedent either direction.
- **Hex/gridded: viable at STATE level only**, illegible at 735 districts.
- **Dot density: fits only literal raw counts**, and coalesces uselessly inside a small
  dense polygon.

Worth folding into this work because they are cheap and the brief endorses them:

- **Value-by-alpha** — *"trivial, one `fill-opacity` expression alongside `fill-color`"*,
  fixes rural-false-dominance, unconditionally compliant.
- **Metro inset panels** — *"cheap polish, ship alongside the primary fix"*, camera
  reframe only.

**Recommendation: rewrite #408's title to match its own research** before building, so
the backlog stops advertising work we've decided against.

## The build

**Scope:** one new render mode on the existing map. No new page, no pipeline change.

### 1. Centroids — one-time, offline
Compute a representative point per district and per state, store alongside the existing
geometry. Must be a *point-in-polygon* representative point, not a bounding-box centre:
crescent-shaped and multi-part districts put a naive centroid outside their own polygon,
in the sea for coastal ones. The crosswalk work already solved this exact problem for
sub-district reaggregation — reuse that routine rather than writing a second one.

### 2. The layer
A MapLibre `circle` layer keyed on district code, `circle-radius` driven by a
data-driven `interpolate` expression. `circle-radius` supports this natively.

**Scale by AREA, not radius.** Perceived quantity tracks the disc's area, so radius must
be proportional to √value. Radius-proportional sizing overstates large values by the
square — the classic error and the one thing that would make this *less* honest than the
choropleth it replaces.

Minimum radius floor so a nonzero value is never invisible; maximum so Mumbai does not
swallow Maharashtra. Both tunable per metric via the existing `metrics.default_scale`
column pattern.

### 3. When it turns on
Per-metric, not global, and driven by the same decision-rule machinery `default_scale`
already uses. Counts and concentrations → symbols. Rates and shares → choropleth, as
now. A metric may declare either; nothing changes for the ~120 metrics already served
well by a choropleth.

### 4. Legend
A nested-circle legend (three reference sizes with values), not a colour ramp. The
existing legend component is colour-ramp-shaped, so this is a sibling component, not a
modification — check `master_components` first, but expect bespoke.

### 5. Interaction parity — non-negotiable
Symbols must support everything polygons support today: hover tooltip, click-to-select
(now that row/feature selection is wired), the region panel, compare pinning, drill to
district, the URL state. A mode that drops half the interactions is a demo, not a
feature.

### 6. Basemap underneath
Keep the polygons, drawn neutral (`--map-neutral`) so the country still reads as India
and boundary compliance is untouched — the brief's compliance verdict depends on the
basemap being unmodified. Symbols sit on top.

## Testing

- **Unit:** area-proportional sizing — assert radius ∝ √value across the domain, and
  that a 4× value gives a 2× radius. This is the assertion that catches the classic bug.
- **Centroids:** every representative point falls inside its own polygon. All 735.
- **Rendering:** the layer appears for a symbol metric and not for a rate metric.
- **Parity:** hover, select, compare, drill and URL round-trip all work in symbol mode —
  the same specs that cover them in choropleth mode, parameterised over both modes.
- **Visual:** screenshot a known skewed metric and *look at it*. The whole point is
  perceptual; a passing suite proves nothing about whether it reads correctly.

## Sequencing

1. Centroids + the parity test harness (nothing user-visible)
2. The circle layer + area-correct sizing + legend
3. Per-metric routing for the 29 HOTSPOT metrics
4. Value-by-alpha and metro insets, if they still look worth it once symbols land

## Open, and needs data work, not code

Which of the 29 metrics genuinely want symbols versus which want a rate denominator
instead is a data question. Filed as its own research task — several may be better fixed
by normalising to per-capita than by changing the chart type, and the brief's own
cross-cutting finding is that Eurostat normalises to rate/share *specifically* to avoid
area bias.
