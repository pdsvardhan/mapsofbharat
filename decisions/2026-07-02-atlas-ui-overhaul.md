# adr-015-atlas-ui-overhaul — Atlas UI overhaul: dark editorial almanac redesign of the explorer

- **Status:** accepted
- **Date:** 2026-07-02
- **Iteration:** iter-51 (14 locked items, report #60)

## Context

The owner supplied a working design prototype (`MapsOfBharat.dc.html`, "Atlas" /
living-almanac theme) plus a folder of reference choropleths and asked for a UI
overhaul: *"use this design and revamp"*. The prototype's SVG map was explicitly a
placeholder — the owner rated our existing MapLibre map above it — but everything
around the map (masthead, floating panels, chooser, right rail, compare, motion)
was the target design.

## Decision

Adopt the Atlas presentation shell wholesale; keep the MapLibre engine and real
geometry (adr-007 stands) and re-skin it to dark editorial cartography.

- **Design system:** ink `#0d0f14`, cream `#e9e3d5`, hairline `#3b3626` panels,
  madder `#d1502f` primary accent, per-topic accents, Hanken Grotesk +
  IBM Plex Mono. Dark-only — the light theme is retired with the Observatory design.
- **Layout:** 64px masthead (brand · centered Ctrl-K search · methodology link),
  framed map plate with floating left stack (breadcrumb / indicator card /
  level + colour / legend + scale), 322px right rail (docked region profile,
  cohort filter, ranking list, compare takeover).
- **Homepage = explorer** with a neutral map until an indicator is picked; the
  marketing landing page is removed and `/explore` 307-redirects to `/` with
  query params preserved (old permalinks keep working).
- **Map re-skin:** fine district hairlines + stronger state outlines, no-data
  grey, curated ramp set (Navy–Yellow default, Blues, Plasma, YlGnBu, Spectral,
  Viridis), editorial legend with real break values, local colour scale when
  drilled into a state.
- **All four classing methods kept** (Smooth/Quantile/Equal/Jenks + Reverse) —
  the prototype shipped only two; owner: "lets make it four then".
- **Interaction model change (flow-drill-state):** at states level a click now
  *selects* the state (docked profile); drilling happens via the profile's
  "View N districts" button. Previously a district-level click drilled directly.
  Flow steps updated accordingly.
- **Share unified:** one Share menu (Copy link · Copy embed code) + a primary
  PNG button; PNG now bakes title, source *and* legend ramp. `/embed` unchanged.

## Dropped with reason (owner-confirmed at the iter-51 lock-in gate)

| Feature | Reason |
|---|---|
| CSV export | "not needed" — PNG remains the export; permalinks carry the data view. Core-idea wording "downloadable" now maps to PNG + cited sources. |
| Find-my-district geolocation | "not required" for the target audience; feature marked `dropped`. |
| Value-range slider | Overlapping with classing methods + vs-avg (three ways to reshape the scale); owner accepted recommendation to drop. |
| Marketing landing page | "dont need the marketing landing page" — the explorer is the homepage. |
| Light theme | The Atlas design is dark-only by design (prototype has no light mode). |
| "Top 10 · Area" cohort | No official area metric in the canonical store; cohorts must be real data, not hardcoded lists. Population + per-capita NSDP cohorts ship; Area can follow when an official source lands. |

## Deferred

- **As-reported-year toggle** (adr-003 must-have, never built) → project todo #149.

## Consequences

- `next-themes` and `lucide-react` become unused and are removed.
- E2E specs rewritten for the new selectors/interactions; `window.__mob_map`
  test hook retained.
- Old `?pal=` values from shared links are normalized (cividis→viridis,
  rdbu→spectral); default palette is now Navy–Yellow.
