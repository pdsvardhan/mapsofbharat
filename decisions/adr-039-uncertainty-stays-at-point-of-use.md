# We will not shade the map by how sure we are, because we are not sure in the way that would require

**Status:** accepted · **Date:** 2026-08-27 · **Curated:** yes · **Category:** cat:product
**Related:** [adr-019](2026-07-16-estimate-disclosure.md) (disclosure at point of use, upheld here) · [adr-021](2026-07-16-estimate-kind.md) (estimate_kind) · [adr-026](2026-08-03-iter-27-inheritance-grading.md) (shaky inheritance) · `lib/estimate-kind.ts` · to-do #408, iteration 160 item 1079

## Context

`feat-vsup-uncertainty` has been specced since Stage 1 and to-do #408 lists VSUP among
the remaining map forms. A value-suppressing uncertainty palette collapses colour
distinctions where a value is less certain: two districts far apart in value but both
poorly known are drawn closer together, so the reader cannot over-read a number the
data cannot support. It is a good idea, and it is the honest answer to a real problem.

It was picked up in iteration 160 and stopped before any code was written.

## Why it stopped

**It reverses adr-019, and adr-019 is right.** On 2026-07-16 this project decided that
estimated districts are disclosed *where the number is read* — the rail badge, the map
hover, the region panel, the export footnote — and are **not painted across the map**.
That decision came out of a measured failure (the adr-018 hatch scored 1.09:1 against a
WCAG floor of 3:1 and communicated nothing) but it did not stop at "make the hatch
visible". It asked whether the mark should exist, and gave three reasons it should not.

VSUP is the same idea in a better-behaved encoding, so it inherits all three. The one
that decides it is the second.

**We do not have the uncertainty this would claim to draw.** Checked directly against
the value payload: the store carries `estimated`, `estimate_kind` and `shaky`, and
nothing else. No standard errors. No confidence intervals. No sample sizes.

So a VSUP built on today's data would suppress colour on inherited and projected
districts — 1,494 cells across 102 districts, 2.7% of district data — while every NFHS
district rate stayed fully saturated. Those rates carry real sampling error. An ASER
rate carries real sampling error. A satellite PM2.5 estimate carries real model error.
None of it is in the store, so none of it would be drawn.

That is not a partial implementation of a good idea. It is a map that says *"here is
where we are unsure"* while being silent about most of where we are unsure, in the
reader's primary channel, with the authority that channel carries. adr-019 named
exactly this: *"Singling out inheritance while ignoring sampling error was not a
principled line."* It is no more principled in alpha than it was in hatching.

**And the third reason still bites.** adr-019: *"the estimate is usually reasonable —
but not always, and the map cannot tell you which."* NTR carries Krishna's numbers
while differing from it by 31 points of urbanisation. A uniform suppression over every
inherited value says "be careful" everywhere and "how careful" nowhere — and adr-026's
shaky flag, which does distinguish the bad inheritances, already earns its disclosure
at the point the number is read.

## Decision

**Do not build VSUP. Uphold adr-019.** Uncertainty is disclosed where the number is
read, not encoded in the fill.

`feat-vsup-uncertainty` stays specced and unbuilt rather than being retired, and the
reason is written here so the next session does not rediscover the idea and rebuild it
without rediscovering the objection.

## What would change this

A real, cross-metric uncertainty series. NFHS publishes sampling errors; ASER publishes
its design. Ingesting them would give every survey-derived value an interval instead of
giving one class of value a flag, and VSUP over *that* would be a principled encoding
of something we actually know — and would supersede adr-019 on its own terms rather
than in spite of them.

That is an ingest project with its own pipeline work, adapters and citation surface. It
is not a render mode, and it should not be smuggled in as one.

## Consequences

- The map's fill continues to encode value, and value only.
- to-do #408's remaining-forms list loses VSUP and keeps bivariate.
- The estimate disclosures adr-019 put at the point of use remain the whole mechanism,
  and remain the thing to improve if disclosure is judged too quiet.
