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

## Addendum, 2026-08-23: the budget above measured two different things

The addendum above set the grid's budget at **837 KiB raw / 36 KiB gzipped** for
eight district panels. Once the panels actually rendered (iter-40 item 970), the
measured pages came out at 1,208–3,090 KiB raw and 249–456 KiB gzipped. The
budget was not missed by the grid. It was comparing two different quantities, and
it was missing a third.

**The grid's own markup is the size predicted.** Measured on a production build:
409 KiB of `<defs>`, and 45.2 bytes per `<use>` — so religion's six panels are
~604 KiB of SVG against ~837 KiB projected for eight. The `<defs>` + `<use>`
decision holds exactly as recorded.

**"36 KiB gzipped" was the artefact's own gzip, not a page's.** The artefact
compresses to 36 KiB on disk; a rendered page containing it, plus its `<use>`
references, plus the page around them, does not. Those numbers were never
comparable, and quoting one as a budget for the other made a passing grade
impossible to fail honestly.

**And a server-rendered React tree ships twice.** This is the part nothing could
have predicted before there was a page: Next serialises the rendered tree into
the HTML a second time as RSC flight data inside `<script>`, so every path string
and every `<use>` is paid for twice. On religion that was 886 KiB of the 1,537.
It is not avoidable by rearranging the component — a single opaque HTML string
prop is serialised just the same.

### What changed (iter-41 item 976)

The projection now snaps to a **0.5px grid** and drops vertices that are exactly
collinear, in `scripts/build-family-paths.mjs`. Both reductions are pure
functions of the coordinates, so two districts sharing a border make identical
decisions from either side and no cracks open between them — the reason this is a
snap rather than Douglas-Peucker, which walks each ring separately and can drop
different vertices on each side of a shared border.

The tolerance was measured, not chosen:

| step | artefact | gzip | districts flattened |
|---|---|---|---|
| 0.1 | 327 KiB | 92 KiB | 0 |
| 0.25 | 283 KiB | 68 KiB | 0 |
| **0.5** | **182 KiB** | **47 KiB** | **0** |
| 1.0 | 98 KiB | 28 KiB | **2 districts + 1 state** |

1px is the tempting number and it is wrong: it flattens districts `04_55` and
`26_494`, and state `04`, to zero extent.

> **Correction, same day.** This paragraph first said *21 districts*. That number
> was never measured — it came from misreading the guard's own output, where a
> shell pipeline split `2 district(s)` across two lines and `2` was read together
> with the `1` of the following line. The real figure is two districts and one
> state, and the build refuses all three. Recorded rather than quietly edited,
> because a fabricated number in a decision record is worse than the decision
> being wrong: the next reader has no way to tell which figures were measured. A district that spans nothing still counts
as a path — it is present, it is a string, it renders nothing — so the build now
**refuses** any tolerance that produces one, by measuring each path's extent
rather than counting paths.

District layer: 394 → 182 KiB (−54%), 37,126 → 19,732 points (−47%).

Resulting pages, production build:

| family | panels | raw before → after | gzip before → after |
|---|---|---|---|
| mgnrega | 3 | 1,208 → 776 KiB | 249 → 148 KiB |
| religion | 6 | 1,537 → 1,104 KiB | 283 → 181 KiB |
| census-pca | 9 | 1,869 → 1,438 KiB | 315 → 216 KiB |
| nfhs5-health | 22 | 3,090 → 2,666 KiB | 456 → 359 KiB |

The `<use>` elements are untouched by any of this and dominate the large grids —
nfhs5-health's 22 panels carry 16,170 of them — which is why its gzip falls 21%
where a three-panel family falls 41%.

`/family/[id]` still adds **0 B** of route JavaScript — the grid is a server
component with no state and no hydration. The page is not JavaScript-free: it
still loads the app's shared ~121 kB first-load bundle, as every route does.
Earlier wording here said the page "ships 0 B of client JavaScript", which
overstated it.

### A correction recorded on purpose

The first implementation of this item shipped a duplicate-point pass whose
comment claimed it was one of two independent reductions. Mutation testing showed
it could not change the output: an exact duplicate is a degenerate collinear case
wherever it sits. Deleting it, however, made things *worse* in a way the unit
tests did not see — two state paths gained `M115.5,105L115.5,105Z`, a subpath of
zero extent that draws nothing and counts as geometry. The real rule turned out
to be neither: **a subpath is emitted only if it spans something**, checked at
the point of emission, which covers the collapsed case AND the case the collinear
pass creates by removing a middle vertex from three points. With that guard in
place the dedupe pass is provably redundant — regenerating without it produces
byte-identical layers — and it is gone.

Recorded because the sequence is the lesson: two green unit tests, a claim in a
comment that was false, and only measuring the artefact found it.
