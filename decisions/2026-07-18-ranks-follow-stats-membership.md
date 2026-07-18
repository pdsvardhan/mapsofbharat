# Ranks follow stats membership

- **id:** adr-023-ranks-follow-stats-membership
- **status:** accepted
- **date:** 2026-07-18
- **depends on:** adr-021 (estimate_kind discriminator), adr-022 (stats exclude copies)
- **amends:** adr-022 ("ranks deliberately held" — the follow-up it filed)

## Context

adr-022 fixed the distribution statistics — copies out, projections in — and
deliberately held ranks at `estimated=0` only, filing the question "does a
projected figure deserve a rank against actuals?" as a follow-up (question 244).

Holding ranks left the two RBI fiscal metrics readable but useless as rankings:
`fiscal_deficit_pct_gsdp` and `own_tax_pct_gsdp` showed an em dash for 30 of 31
states. The em dash exists to say "this number is a copy with no standing of its
own" — but a Budget/Revised Estimate is copied from nobody. It is the state's
only figure, published by the RBI precisely so open fiscal years can be compared.
Refusing to rank it protects nothing and erases the comparison the vertical
exists to serve.

The owner resolved 244 on 2026-07-18: **rank projections, keep the badge**.

## Decision

**A value ranks iff it counts in the stats.** Rank membership and stats
membership are the same predicate — `countsInStats` in `lib/estimate-kind.ts`:

- `estimated=0` → ranks.
- `'projected'` → ranks, badge and disclosure kept. Its rank sentence and its
  rail row still carry `est.` / "Budget/Revised Estimate" — a rank is standing
  in the table, not a claim the year is audited.
- `'aggregated'` → ranks (an exact sum of real rows; none shipped today).
- `'inherited'` → never ranks. The donor already occupies that slot; ranking the
  copy would place one number twice.
- unknown kind → never ranks (same allow-list stance as adr-022).

Touchpoints kept in lockstep:

- `/api/region/[code]` — SQL rank window admits `estimated = 0 OR estimate_kind
  IN ('projected','aggregated')`; the `of N` denominator counts the same set.
- `components/india-map.tsx` — `rankOf`, the rank-sentence denominator and the
  hover tooltip use `countsInStats`; a ranked estimate shows rank AND note.
- `components/atlas/right-rail.tsx` — the region-panel histogram bins, the rank
  sentence denominator, and a ranked projection's disclosure clause.

## Consequences

**Positive**

- The fiscal metrics become rankings again: 31 states, 30 of them badged BE/RE,
  em dashes only where a number is genuinely a copy.
- One membership rule — class breaks, legend min/max/mean, histogram bins and
  ranks all agree by construction (items 611/639/655 were all drift between
  these surfaces).

**Negative**

- A rank now sometimes compares an audited Actual against projections. That is
  the RBI's own comparison for open years, and every projected cell keeps its
  badge — but rank 1 no longer implies an audited figure.
- District ranks are unchanged today (no projected/aggregated district rows
  exist), so the visible change is state-level only; a future district-level
  projection will rank without further code change, which is intended but must
  be remembered.
