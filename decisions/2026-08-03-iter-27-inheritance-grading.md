# Inherited estimates are graded, and the shaky ones are flagged

- **id:** adr-026-inheritance-grading
- **status:** accepted
- **date:** 2026-08-03
- **item:** iter-27 item 812 (to-do 218, Slice 2)
- **input:** `research/218-inheritance-audit.md`, `decisions/218-inheritance-grading-scope.md`
- **builds on:** adr-018 (sibling inheritance), adr-019 (point-of-use disclosure), adr-020 (per-metric citation), adr-021 (estimate_kind), adr-022 (stats exclude copies), adr-023 (ranks follow stats)

## Context

adr-018 fills a post-2011 district that a survey never covered with its
largest-population 2011 sibling's value, and adr-019/020/021 disclose every such
inheritance identically — one `"est."` badge, the donor named. But an inheritance
is only as trustworthy as the child's resemblance to its donor, and the app could
not say which were weak. adr-019 named the exact failure it was leaving open:

> NTR is 58.7% urban, Krishna 27.8% (both real, from re-aggregation), yet NTR
> carries Krishna's immunization and poverty numbers because NFHS only ever
> surveyed the 2011 "Krishna". An ambient mark says "be careful" everywhere and
> "how careful" nowhere.

and parked "grade inheritances and flag only the shaky ones" as its most
attractive un-taken alternative. This decision takes it.

Item 218's calibration audit (`research/218-inheritance-audit.md`) measured all
115 child/donor pairs on the live store and found the intuition is **not**
reproducible by similarity alone: on `urban_pct` — the very axis the complaint
cites — Shi Yomi diverges from West Siang *more* (Δ44.5) than NTR from Krishna
(Δ30.9), and it diverges more on literacy and assets too. By pure divergence Shi
Yomi ranks 20th shakiest and NTR only 24th. The signal that separates them in the
intended direction is **reach**: NTR is 2.22M people carrying a big-city profile;
Shi Yomi is 13.3k in a Himalayan corner where one census town swings its
percentages and a wrong estimate misleads almost nobody.

## Decision

**Grade every inherited estimate, and flag the shaky ones with a two-floor gate:**

> **SHAKY** iff **divergence ≥ 1.0** AND **reach ≥ 1,000,000 people**

- **divergence** = robust-z MAX distance over three structural axes,
  `urban_pct`, `female_literacy_rate`, and `log(pop_density)`: each axis's
  child-vs-donor `|Δ|` divided by that axis's **national IQR** (so a delta reads as
  IQR-multiples of the national spread), then the MAX across the three. MAX, not a
  sum — "differs from its donor by more than one national spread on at least one
  structural axis" is the interpretable claim.
- **reach** = the child's `pop_total` (a real count, never inherited).

The gate, not the raw `divergence × reach` product, is the rule. The product lets
reach dominate — Purba Bardhaman (6.56M) ranks 2nd on population despite a *similar*
donor (divergence 0.79) — which reads a fine estimate as shaky. Requiring both
floors keeps "big **and** unlike its donor".

**This is disclosure-only.** It changes no value, no rank and no statistic:
inherited estimates are already rank-less and stats-excluded (adr-022/023). All the
grade does is choose how loudly to disclose.

### Why a gate and not a natural cutoff — the honest caveat

The risk distribution is a **smooth, roughly log-spaced continuum, not bimodal**
(deciles `[0.042, 0.116, 0.213, 0.32, 0.486, 0.698, 1.001, 1.493, 2.755]`, no
cliff). There is therefore no data-given boundary; the thresholds are a **policy
choice**, recorded here so they are owned, not slipped in (the same discipline
adr-022 applied to its stats-membership change). `divergence ≥ 1.0` is one national
IQR; `reach ≥ 1M` is the round population floor that spares tiny remote districts.
`divergence ≥ 1.5` would drop NTR itself (its divergence is 1.43), which is why 1.0
is the floor.

### What the gate flags

**12 pairs** on the shipped data, each a populous district with a large structural
gap from its donor: Anakapalli, Alluri Sitharama Raju (both ← Visakhapatnam),
Palghar ← Thane, Hapur ← Ghaziabad, **NTR ← Krishna**, Medchal Malkajgiri ←
Ranga Reddy, Warangal Urban ← Warangal Rural, Chhota Udaipur ← Vadodara, Baloda
Bazar ← Raipur, Palnadu ← Guntur, Sangareddy ← Medak, Konaseema ← East Godavari.
**Shi Yomi ← West Siang** (13.3k people) and **Purba Bardhaman ← Paschim Bardhaman**
(similar donor) are correctly **not** flagged.

## Implementation

- **Persist.** `pipeline/fill_new_districts.py` computes `divergence` and `shaky`
  in its fill loop (it already holds the real axis values and `pop`) and writes them
  as two new columns on `district_estimate_source` — the grade is a property of the
  `(child, donor)` pair, so a multi-donor district can be shaky via one donor and
  fine via another. `pipeline/migrate_inheritance_grading.py` adds the columns and
  backfills an already-built store from the same evidence, with **no re-ingest**;
  its assert fails loudly unless the gate reproduces the audit's 12 pairs.
- **Surface, once.** `lib/estimate-kind.ts` owns the wording (adr-021), so a single
  new branch — `ESTIMATE_BADGE_SHAKY` + a `shaky` argument on `estimateNote` /
  `estimateShort` / `notRankedNote` / `estimateFootnote` — propagates to the rail,
  the region panel, the map hover and the travelling export footnote at once. The
  base sentence for a non-shaky inheritance is unchanged byte-for-byte; the caution
  is appended. `/api/metrics/[id]` and `/api/region/[code]` return `shaky` per row,
  tolerating the column's absence on an ungraded store.

## Consequences

- A reader of a shaky value sees an amber `"est. ⚠"` badge and a caution that names
  the donor and why it is a weak match, instead of the same flat `"est."` a
  well-matched inheritance gets. adr-019's "how careful, nowhere" gap is closed for
  the cases that most need it.
- No number moves. This is verifiable against the pre-change store: values, ranks
  and stats are identical; only two new columns and new disclosure strings exist.
- A second disclosure tier now exists (`est.` vs `est. ⚠`). Readers must not read
  a plain `est.` as "verified" — it means "inherited, and not measured as a weak
  match", which is still a copy.
- The thresholds are a calibrated choice on a continuum, not a natural law. If the
  underlying data shifts materially, `migrate_inheritance_grading.py`'s assert will
  flag that the shaky set has moved rather than silently re-grading.

## Alternatives considered

- **Raw `divergence × reach` score with a rank cutoff.** Rejected: the product lets
  population dominate (Purba Bardhaman), and with no natural gap the cutoff is
  arbitrary anyway. The gate states the intent — big AND unlike — directly.
- **Divergence only (pure similarity).** Rejected by the audit: it flags Shi Yomi
  as shakier than NTR, the opposite of the intuition, because it ignores who is
  actually misled.
- **Revive the ambient hatch for shaky districts only** (adr-019 left the layer
  wired). Deferred to its own decision — this ADR is point-of-use disclosure only;
  a map-wide mark is a separate visual question.
