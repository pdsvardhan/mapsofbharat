# The measurement changed the plan: brotli before the CDN

**Status:** accepted · **Date:** 2026-08-27 · **Curated:** yes · **Category:** cat:system
**Related:** [adr-037](adr-037-two-kinds-of-404.md) (measure first, then decide what is fixable) · `scripts/perf-baseline.mjs` · `scripts/build-geo-compressed.mjs` · `app/geodata/[file]/route.ts` · to-do #405-F, TEC-20

## Context

Wave 2 locked two items in order: **TEC-20**, a performance baseline, and **#405-F**,
"serve geometry from R2, pre-compressed". The order was deliberate — the plan says the
baseline must exist first, so the CDN work has something to prove itself against.

It proved something else.

## What the baseline said

Recorded against the origin, three cold runs per route
(`planning/perf-baseline-2026-08-27.json`):

| route | total | geometry |
|---|---|---|
| `/` | 1088.4 KB | 288.1 KB |
| `/metric/[slug]` | 1327.8 KB | 288.1 KB |
| `/metric`, `/family`, `/family/religion`, `/coverage` | 213–474 KB | 0 |

Two facts fell out of it that the locked item had assumed away:

1. **The origin already gzips.** `districts.geojson` is 825,354 B on disk and arrives
   as 179,820 B. There was no uncompressed-payload problem to fix.
2. **The available win is brotli, not distribution.** Across `public/geo`:
   623.5 KB gzip → 398.9 KB brotli, **−36.0%**. On `states.geojson` alone, −42%.

A third fact settled the timing: the site is not launched (`SITE_URL` unset,
`mapsofbharat.in` not serving), so the half R2 adds that brotli cannot — edge
distribution — **cannot be measured at all today**. Shipping it now would mean adding a
cross-origin dependency on the heaviest asset of the page and taking the benefit on
faith, which is the thing this project keeps refusing to do.

## Decision

**Take the 36% at the origin now. File R2 for launch, when it can be measured.**

Owner ruling, 2026-08-27, on the numbers above. This is a **scope change** to a locked
item and is recorded as one rather than absorbed silently.

Shipped:

- `scripts/build-geo-compressed.mjs` writes `.br` **and** `.gz` beside every geometry
  file, at build time, in prebuild.
- `app/geodata/[file]/route.ts` negotiates brotli → gzip → original.
- `components/india-map.tsx` fetches `/geodata/*`. `/geo/*` is unchanged and still
  serves the raw files.

Measured after — **one server, one build, one variable**, the two arms differing only
in the `Accept-Encoding` the browser sends (`planning/perf-405F-arm-gzip.json`,
`planning/perf-405F-arm-br.json`):

| route | gzip arm | brotli arm | Δ |
|---|---|---|---|
| `/` | 1084.0 KB | 982.0 KB | **−102.1 KB** |
| `/metric/[slug]` | 1319.9 KB | 1217.8 KB | **−102.1 KB** |
| geometry on both | 286.6 KB | 184.5 KB | **−35.6%** |
| `/metric`, `/family`, `/family/religion`, `/coverage` | — | — | **0, byte-identical** |

The last row is the control, and it is the reason to trust the rest: routes that fetch
no geometry come out identical to the byte across both arms.

Both deltas are the same 104,519 bytes — it is one payload, fetched by two routes. An
earlier draft rendered them as −102.0 and −102.1 by subtracting the already-rounded KB
figures, which made one number out of two look like two findings.

> **Correction, 2026-08-27, before this ADR was acted on.** The first version of this
> table read −106.4 KB and −109.9 KB, from a comparison that was not like-for-like: the
> "before" was the production container on a different commit (1a35430) and the "after"
> a scratch standalone of this branch. The two differ in more than the encoding — the
> production container proxies `/stats/script.js` successfully while a scratch instance
> cannot resolve `umami` at all, so ~2.2 KB of "win" on every route was an analytics
> file the after simply failed to fetch. It showed plainly in the artefacts and was not
> read: routes with **zero geometry** all "improved" by 1.7–3.5 KB, which brotli on the
> geometry cannot do. An independent verifier caught it. Every discrepancy ran in the
> flattering direction, which is the direction that does not get questioned.
>
> The harness now takes `--accept-encoding`, so a before and an after can be one
> instance and one variable. The −36.0% file-level figure was always exact and is
> unchanged; the page-level deltas are 4–8 KB smaller than first published.

## Three things this cost, all found by measuring rather than reasoning

**The files could not move.** An app route and a `public/` file that claim the same URL
are not a race — public wins outright. A probe handler at `/geo/districts.geojson` never
ran; the static 825,354 B answered. Relocating 2.8 MB of geometry would have dragged the
boundary fingerprint, the centroid guard, the family-paths artefact and the build trace
with it, so the `.br`/`.gz` siblings live beside their originals and a second URL serves
them.

**`force-static` compiled the negotiation away.** The route's first version was
`force-static`, so it rendered once at build against a request with no `Accept-Encoding`
and every reader got the identity file. A route whose response depends on a request
header cannot be static.

**Next does not compress a route handler's response.** Serving brotli only — on the
assumption that `compress: true` would cover everyone else — gave a client that accepts
gzip but not brotli the raw **825,354 B**, where the static path had given it 179,820 B.
A 4.6× regression hiding inside an optimisation, for the part of the audience least
likely to be on a fast connection. Both variants are pre-built now, and
`tests/geodata-encoding.spec.ts` asserts each rung with the bytes that crossed the wire —
raw `node:http`, because Playwright's request context and Node's `fetch` both decode
transparently and would have watched that regression go past and called it green.

## Consequences

- **R2 is not abandoned, it is sequenced.** To-do #405-F stays open for launch, when a
  public bucket and a real edge can be measured against `planning/perf-baseline-2026-08-27.json`.
  Enabling public access on an R2 bucket is a Cloudflare dashboard action and needs the owner.
- **The baseline harness is reusable and versioned.** `--label`, `--out`, N cold runs per
  route with median and spread, CDP `encodedDataLength` rather than Resource Timing —
  chosen because Resource Timing reports 0 for a cross-origin response without
  `Timing-Allow-Origin`, which is exactly what R2 will be. An instrument that reads 0
  for the "after" would have manufactured a spectacular improvement.
- **A scar in the harness.** Its geometry column matched `/geo/` only, so the first
  "after" run reported 0 KB of geometry — a 288 KB column reading zero, which reads as
  success. It matches both URL shapes now.
- **Cost:** two extra artefacts per geometry file (~1 MB on disk, gitignored, rebuilt in
  prebuild) and a Node route in front of eight files that were previously static.
