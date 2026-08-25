# Two kinds of 404, and the one we could not fix

**Status:** accepted · **Date:** 2026-08-25 · **Curated:** yes · **Category:** cat:reliability
**Related:** [adr-031](adr-031-saitual-no-derivable-boundary.md) (a recorded no, with the numbers) · `app/not-found.tsx` · `tests/iter43-hardening.spec.ts` · to-do #579

## Context

To-do #579 recorded that 404 bodies "exist only in the RSC flight payload, not the
markup", and proposed `app/not-found.tsx` as the fix. Measuring first turned one
defect into two, and only one of them is fixable in the stable runtime.

This site produces 404s by two different mechanisms:

| | How it happens | Body in the served markup, before | after |
|---|---|---|---|
| **Route miss** | no page matches the URL at all (`/does-not-exist`) | **0 characters** | **680** |
| **`notFound()`** | `/metric/{slug}` and `/family/{id}` reject an unknown id | 41 characters | 41 |

All four cases returned, and still return, a correct **404 status**.

The 41 characters are the site title. The real copy is present in the response
either way — for `notFound()` it sits inside `<script>`, in the RSC flight
payload, and a browser hydrates it into view. Anything reading markup sees a
titled blank.

## What was measured, not assumed

The obvious hypothesis was streaming: `notFound()` called after the shell has
flushed cannot retract it. Next's own documentation supports that reading — it
says a `notFound()` after streaming begins leaves the status at 200. Two probe
routes were built to test it:

- `app/nf-probe-a` — a **synchronous, statically rendered** page whose entire body
  is `notFound()`. Result: **0 visible characters.**
- `app/nf-probe-b` — the same, `force-dynamic`. Result: **41.**

Neither streams meaningfully, both returned 404, and neither rendered the boundary
into HTML. So streaming is not the cause and `force-dynamic` is not the cause:
Next's not-found boundary is a **client** boundary, and its content is delivered
as flight data in the stable app-page runtime. Both probes were deleted after
measurement.

A second measurement, from the mutation run: replacing `app/not-found.tsx` with
`return null` turned the `notFound()` routes red as well. The boundary is
rendering *our* component. Only the delivery differs.

## Decision

**Ship the half that works, refuse the half that does not, and say which is
which.**

1. `app/not-found.tsx` is added. Route-miss 404s go from an empty body to the real
   page — the recovery links point at `/metric` and `/family`, because a stale
   share link and a retired id are what actually produce 404s here.
2. `notFound()` 404s keep a correct status and a body that needs JavaScript. This
   is **not** fixed, and is not quietly left undocumented either.

`app/global-not-found.tsx` — Next's own answer to exactly this — was built,
wired, and reverted, because **it does not fix the half that is broken.** Enabled
(`experimental.globalNotFound`) and rebuilt, it renders server-side for a route
miss and leaves the `notFound()` routes exactly where they were:

| | route miss | `notFound()` |
|---|---|---|
| with `global-not-found` | server-rendered | **41 characters** |

Since the route-miss case is already solved by `app/not-found.tsx`, the file buys
a second way to do the thing that works and nothing for the thing that does not.
It was removed rather than kept as dead configuration.

> **Correction, 2026-08-25 (same day, before this ADR was acted on).** The first
> version of this section gave a *different* and **wrong** reason: that the
> convention is compiled only into Next's experimental app-page runtime, that the
> stable runtime never consults the file, and that adopting it would mean moving a
> live site onto an experimental React runtime. An independent verifier checked
> and none of that is true — `global-not-found` appears in the stable and
> experimental runtime bundles alike (3 hits each; the logic is equivalent, with
> only minified identifiers differing), and no runtime swap was ever
> substantiated.
>
> The error came from a measurement that could not tell the two outcomes apart.
> The `global-not-found.tsx` under test rendered the *same component* as
> `not-found.tsx`, so the 680 characters observed on a route miss were consistent
> with either file having produced them, and "nothing changed" was inferred from a
> signal that could not have shown a change. The verifier used a sentinel string
> and got a different, decisive answer. The conclusion below survives; the
> mechanism given for it was invented, and a fabricated mechanism in a decision
> record is worse than a wrong decision, because the next reader cannot tell which
> parts were measured.

## Consequences

- **No SEO cost.** Indexing is governed by the status code, which is correct in
  every case. There is no soft-404 exposure — a soft 404 is a *200* that says "not
  found", and nothing here returns 200.
- **A real, small cost:** a reader with JavaScript disabled who follows a dead
  `/metric/{slug}` link sees a bare page. Two routes, an uncommon reader.
- `tests/iter43-hardening.spec.ts` carries a **characterization test** that asserts
  the limitation rather than the fix. It is written to FAIL the day a Next upgrade
  server-renders the boundary — at which point this ADR is retired and those
  routes move into the block above. The test says so in its own comment.
- Both halves are mutation-proven: hard-coding the robots block back kills **7**
  tests across the suite (2 in `iter43-hardening`, 5 in `seo-metadata`); emptying
  the 404 body kills 5. An earlier draft said 2 for the first, which was the count
  at the moment it was measured — `seo-metadata.spec.ts` had not yet been made
  launch-aware, so it still passed under the mutation. Measuring one spec file and
  reporting it as the suite figure is the same error in miniature as the one
  corrected above.
