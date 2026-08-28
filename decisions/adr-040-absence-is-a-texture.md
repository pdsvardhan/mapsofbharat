# Absence gets a texture, because a faded colour and no colour at all had stopped being different

**Status:** accepted · **Date:** 2026-08-28 · **Curated:** yes · **Category:** cat:product
**Related:** [adr-019](2026-07-16-estimate-disclosure.md) (ambient hatch dropped — upheld here, not reversed) · [adr-039](adr-039-uncertainty-stays-at-point-of-use.md) (we do not shade by confidence) · `lib/value-by-alpha.ts` · iteration 160 item 1077

## Context

Item 1077 added value-by-alpha: district fill opacity is weighted by population, so a
large empty district stops shouting louder than a small crowded one. The fade is real
and it works. It also, unavoidably, spends the thing it fades.

Measured on the shipped palettes: at the 0.28 alpha floor, adjacent-class contrast on
navyYellow falls from 1.62/1.73/1.75/1.78 to 1.12/1.15/1.19/1.28, and class 1 against
class 5 falls from 8.74 to 1.95. That is the fade doing its job — a faint district is
*supposed* to recede — and it is not a defect on its own.

The defect is what it collides with. No-data regions were painted as a flat tone,
`rgb(39,37,28)`. A class-5 district at the floor composites to `rgb(77,71,37)`: same
warm-olive family, contrast **1.64:1**, where unfaded the same pair sits at 8.60:1. So
the brightest possible reading and no reading at all had converged to nearly the same
mark. On the default map that is not hypothetical — it carries both floored class-5
districts and two genuine absentees.

Sweeping every ramp settles it. Across 6 palettes x 101 ramp positions x 68 alpha
values, the worst separation between a faded fill and the no-data tone is **1.000** —
literally identical colour, on spectral at t=0.98, alpha 0.38. **Tone cannot carry this
distinction.** No choice of grey fixes it, because the fade sweeps a fill through every
luminance the tone could occupy.

## Decision

**No-data is drawn as a hatch, not a tone** — in every mode, on both vintages, whether
or not the map is faded. Absence is marked by texture, which a fade cannot imitate.

## This does not reverse adr-019

It looks like it does, so the distinction is worth stating plainly.

adr-019 dropped an ambient hatch, and it was right to. But that hatch marked
**estimated** values — a caveat about a number that exists — and adr-019's three
reasons all turn on that. Proportionality: a 2.7% caveat was painting 12% of India.
Consistency: we were singling out inheritance while NFHS sampling error went undrawn.
And the estimate is usually reasonable, so the alarm overstated the doubt.

This hatch marks **absence**. There is no number, no caveat, and nothing to be
proportionate about — the region either has a figure or it does not.

That inverts every one of adr-019's three reasons:

1. **Proportionality.** The mark is exactly as large as the thing it reports. Two
   districts on the default map; 173 on the sparsest series we carry. Where the hatch
   is loud, the absence really is that widespread, and that is worth knowing before
   reading the map.
2. **Consistency.** We do not draw sampling error and still do not. But we have always
   distinguished "no figure" from "a figure" — that is not new signal, it is the same
   signal made legible now that the fade can wash out its old encoding.
3. **Point of use.** adr-019's principle — say it where the number is read — still
   holds for estimates, and still governs them. It cannot govern absence, because
   there is no number to attach a disclosure to. The map cell is the only place the
   absence can be stated at all.

## The measured failure that killed the old hatch is fixed here

adr-019 did not object to hatching in principle; it measured one and found it mute.
That hatch was `rgb(20,22,28)` at an effective alpha of 0.425 — **1.09:1** on the
darkest stop, 2.57:1 at best, against a WCAG floor of 3:1 — and its 8px tile at
`pixelRatio: 2` aliased to a flat tone. It was wired correctly and communicated
nothing.

This one was built to clear that bar and was measured against it:

- stripe against its own ground: **12.00:1** (the old one: 1.09:1)
- worst case over the full sweep, taking the better of stripe-or-ground against any
  fill at any alpha: **3.46:1** — above the 3:1 non-text floor
- tile is 8x8 with 16 stripe pixels, exactly 25%, zero partial-alpha pixels, and the
  tile is a whole multiple of the stripe period, so it does not seam
- at `deviceScaleFactor: 2` the texture survives (sampled luminance p50 73.7, p90
  155.9, max 224.3). This is the specific way the old hatch died, so it is the
  specific thing that was re-measured.

## Consequences

- Every choropleth in the atlas now carries a possible second mark. Accepted: it fires
  only where a figure is missing, and where nothing is missing nothing is drawn.
- The legend gains a hatch key, rendered when the current map actually has an absentee
  — a key for a mark the map is not painting is the defect this iteration fixed
  elsewhere, and it would be no better here.
- The hatch sits on its own full-opacity layer, so it is never itself faded. A region
  with no data is not "faintly absent"; it is absent.
- Regions with no data remain distinguishable at every alpha from 0.28 to 0.95, which
  is now asserted by test rather than assumed.
