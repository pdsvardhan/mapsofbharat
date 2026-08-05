# No user-generated content on the public site — sidestepping intermediary liability

**Status:** accepted · **Date:** 2026-08-05 · **Curated:** yes · **Category:** cat:security
**Related:** adr-028 (positioning & non-goals), iteration #32 items #846–#848, to-do #404 (Phase-1 trust/legal/brand)

## Context

Maps of Bharat is a public statistics site preparing for launch. Under India's Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, a platform that hosts third-party ("user-generated") content becomes an *intermediary* and inherits duties: a published grievance officer, fixed takedown timelines, content-moderation obligations, and traceability requirements. Those duties are disproportionate for a one-person, faceless project whose value is the data, not a community.

The product also has no need for UGC: there are no accounts (deferred until a paid tier genuinely needs them), no comments, no reviews, no uploads, no public profiles. The only inbound channel the product needs is a way for a reader to report a data error.

## Decision

**The public site carries no user-generated content, ever.** No comments, reviews, ratings, uploads, user profiles, or any third-party content published on the site.

The single inbound channel is the **Corrections** route (iteration #32, item #848): a reader can *report an error*, but that submission is **private** — it is stored for the owner (hashed IP, no raw IP) and is **never published**. The public **corrections log** is **editorially curated** by the owner: it is first-party editorial content, not UGC. This keeps the site outside the intermediary definition while still letting readers flag mistakes.

Discussion happens on the social platforms (comments left on posts there), not on the site.

## Consequences

- The site does not need a grievance officer, takedown workflow, or moderation pipeline to launch.
- The Corrections page is safe by construction: the report form writes to a private store, the log shows only owner-curated entries, and there is no path for a submission to appear publicly.
- Any future feature that would publish third-party content (comments, community datasets, user annotations) is **out of scope** until a dedicated ADR reconsiders the intermediary tradeoff — it is not an incremental change.
- Complements adr-028 ("free to read, forever, without an account"): no accounts also means no UGC surface.
