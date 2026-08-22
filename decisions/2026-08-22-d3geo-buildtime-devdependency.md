# d3-geo enters as a build-time devDependency, via precomputed paths

**Status:** accepted · **Date:** 2026-08-22 · **Curated:** yes
**Related:** to-do #547 phase B, adr-032 (no chart library), `planning/547-small-multiples-and-transitions.md` open decision 1

## Context

`#547` phase B draws a family of metrics as a grid of small choropleths — eight
or nine panels of the same India, differing only in fill. Doing that with eight
MapLibre instances is not viable, so the geometry has to be projected once to SVG
paths and reused per panel. `d3-geo` is the projection utility for that.

**adr-032 says no chart library.** The plan argued `d3-geo` is a projection
utility rather than a chart library and should therefore be allowed, and proposed
admitting it as a **build-time devDependency** so it never reaches the browser
bundle. That reasoning is right about what `d3-geo` is. It was wrong about how a
devDependency would actually behave here, and the difference matters.

A devDependency is only genuinely build-time if nothing at runtime imports it.
The plan assumed `/family/[id]` would be server-rendered and statically
generated, so the projection would run during `next build` and the image would
ship HTML.

**It cannot be.** `.dockerignore` line 7 excludes `data`, so the canonical store
is not in the build context — the same constraint `tests/metric-families.spec.ts`
records for its own existence, and the reason
`app/metric/[slug]/page.tsx:49` already says the metric pages render per-request:

> The store is a runtime-mounted volume (absent at build), so this returns `[]` in
> the image and the page renders per-request (force-dynamic).

A family grid needs values, values live in the DB, and the DB is not there at
build. So the route renders per request, so anything it imports is a **runtime**
dependency, so `d3-geo` in `devDependencies` would either fail at runtime or have
to be promoted to `dependencies` — landing exactly where adr-032 says not to go.

## Decision

**`d3-geo` is admitted to `devDependencies`, and the projection is precomputed
into a static asset so nothing at runtime imports it.**

The work splits along what each half actually needs:

- **Geometry** needs `d3-geo` and reads only `public/geo/*.geojson`, which *is*
  in the build context. `scripts/build-family-paths.mjs` projects it once and
  writes SVG path strings to `public/geo/district-paths.json`, in prebuild,
  alongside the existing `check-*.mjs` guards.
- **Values** need the DB and no projection at all. The route reads them per
  request and applies fills to paths it did not compute.

So `d3-geo` runs on a developer's machine and in the builder stage, never in the
runner image and never in the browser. The runner copies `.next/standalone`,
which traces production dependencies only, and a package nothing at runtime
imports is not traced.

**The boundary adr-032 draws is preserved as stated, not reinterpreted.** No
charting code, no rendering library, and nothing new in the client bundle. What
enters is a coordinate transform whose entire output is a string of path data
committed as a build artifact.

## Consequences

- Panels can only draw geometry the precompute step has emitted. A new boundary
  layer means regenerating `district-paths.json`; the prebuild step and its test
  fail loudly if the file is missing or stale, rather than the grid rendering
  blank.
- `district-paths.json` is a generated artifact in `public/`, in the same
  category as `centroids-*.geojson` — regenerated, never hand-edited.
- If a future feature genuinely needs projection *per request* — a user-chosen
  projection, say — this decision does not cover it, and admitting `d3-geo` to
  runtime dependencies would need its own ADR against adr-032.
- The alternative considered and rejected was hand-rolling an equirectangular
  transform to avoid the dependency entirely. India spans 8°N to 37°N, where that
  visibly distorts shape, and the point of a small multiple is that every panel is
  recognisably the same country.

## Addendum, same day: the grid must render `<defs>` + `<use>`

Measured once the artefact existed, because the payload only becomes visible when
there is something to measure:

| approach | districts (735) | states (36) |
|---|---|---|
| repeat full paths in each of 8 panels | **4,587 KiB** | 1,995 KiB |
| paths once in `<defs>`, 8×`<use>` for fills | **837 KiB** | 262 KiB |

Path data gzips to 36 KiB (districts) and 11 KiB (states), and the `<use>`
elements are near-identical so they compress almost to nothing.

So the naive rendering — one `<path>` per district per panel — puts four and a
half megabytes of HTML on the page and is not shippable. **The grid defines each
region's geometry once in `<defs>` and references it per panel with `<use>`,
overriding `fill` on the reference.** That turns an 8× multiplication of geometry
into 8× a short reference, which is the only reason a district-level small
multiple is viable at all.

Coordinates are also rounded to one decimal in the artefact: the panel is 220×240
CSS px, so 0.1px is well below anything a screen resolves, and it removed 24% of
the file for no visible change.
