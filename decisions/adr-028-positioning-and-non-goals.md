# Positioning as the provenance-honest atlas; and non-goals that match shipped behaviour

**Status:** accepted · **Date:** 2026-08-04 · **Curated:** yes · **Category:** cat:product
**Related:** adr-011 (scope changes get written down), adr-027 (crosswalk licence), feat-social-export, iteration #131 item #824

## Context

`overview.yaml` carried no positioning statement, so competitor comparisons went stale and the product's defensible claim was never stated. Two non-goals also contradicted shipped behaviour:

1. *"No editorialized rankings or political commentary; data is presented neutrally with sources and methodology."* — but `feat-social-export` **requires** an editorial headline (a neutrally-titled map does not travel). The shipped product already violated the stated non-goal.
2. *"No login or paywall to view data; the site is public-first."* — a good commitment stated too broadly. It would be eroded accidentally the first time any gated export/edit feature is considered. The part worth holding forever is about *viewing*, not export formats or bulk access.

## Decision

**Positioning statement** (canonical home = this ADR; mirrored in `overview.yaml`; no dedicated tracker column exists):

> MapsOfBharat is the pre-loaded, provenance-honest atlas of India's official statistics — already cleaned, mapped to current-day boundaries, honest about what is measured versus inherited, and free to read. Not a map tool (BharatViz is free and wider); not a data library (Dataful is deeper) — the pre-loaded, provenance-honest atlas.

The three defensible claims underneath it, strongest first: (1) provenance honesty — no competitor discriminates measured / inherited / projected values, cites the source district an inherited value came from, or excludes copies from rankings; (2) pre-loaded and cited — every other tool starts empty; (3) free to read, forever.

**Non-goal rewrites** (non-goal rows 70 and 67 in the tracker, canonical):

- *(row 70, editorial)* → "No political commentary or advocacy. Editorial framing of headlines and story selection is allowed; the numbers, their classification, and their presentation stay neutral, sourced, and methodologically disclosed."
- *(row 67, viewing)* → "Every number on the map is free to read, forever, without an account. Paid tiers may gate export formats, bulk and API access, and private workspaces — never viewing."

## Consequences

- `feat-social-export`'s required editorial headline is now consistent with the non-goals; the numbers/classification/presentation remain neutral rails.
- The monetisation path (paid export/edit/bulk/API tiers) is left explicitly open without breaching the free-to-view commitment. This is the seam the deferred accounts work will use.
- Positioning has no dedicated tracker column; if `mirror:write` ever regenerates `overview.yaml` from the DB, re-apply the `positioning:` field from this ADR.

## Future guardrail (noted, NOT adopted here)

When composite indices / derived rankings are eventually built, a dedicated ADR must require each to publish its formula, weights, inputs, peer-group definition and version alongside — and never be framed as a verdict. Recorded here so the guardrail is not forgotten; it is not in force until that ADR is written (indices are v2 / monetisation-era).

## Amendment (2026-08-05, iteration #32) — the free/paid line, sharpened

The Phase-1 launch decision pass (`decisions/2026-08-05-launch-decisions-and-plan.md`) refined row 67's free/paid seam into a concrete, data-access framing. Superseding the general wording above **for the purpose of the paywall line**:

- **Free, forever, without an account:** viewing every number on the map, downloading the **social card PNG**, and the **iframe embed**.
- **Paid (v2, when monetising):** the **table / data view** and **downloading that data** (per-dataset, bulk, and API).

The commitment is framed as **data-access**, not viewing: reading the numbers on the map is always free; paying buys the *tabular data and its export*, not the map. This is the seam the deferred accounts + LGD-crosswalk-swap (adr-027, to-do #384) work will use. No feature changes now — monetisation stays v2.
