# Every estimated number cites the district it actually came from

- **id:** adr-020-estimate-citation-per-metric
- **status:** accepted
- **date:** 2026-07-16
- **amends:** adr-018 (sibling inheritance), adr-019 (point-of-use disclosure)

## Context

adr-018 fills post-2011 districts by sibling inheritance and records which parent
each estimate came from, so the app can cite it. adr-019 then made that citation
load-bearing: having dropped the ambient hatch, the citation *is* how a reader
learns a number was inherited.

It was wrong. `fill_new_districts.py` derived the citation with one rule and
performed the fill with another:

- **citation (old line 73):** `max(rs, key=pop)` — the largest-population sibling
  of the whole group, computed once per group, blind to which metric.
- **fill (line 85):** `max(holders, key=pop)` — the largest-population sibling that
  actually holds a real value for that `(metric, year)`.

Those agree only when the largest sibling happens to hold the metric. Measured
across 79 sibling groups and 102 inheriting districts:

- **79 of 102** citations were correct.
- **16** districts inherited but had no citation row at all — they *were* the
  largest sibling, so the citation loop skipped them, yet they still lacked data
  for some metric. The region panel rendered "estimated from ____" with a blank.
  Amethi, Chengalpattu (27 inherited values), Namsai, NTR, Warangal Urban and 11
  others.
- **4** named the wrong donor: Konaseema cited Kakinada but inherited from East
  Godavari; Nirmal cited Mancherial but inherited from Adilabad; Siddipet cited
  Sangareddy but inherited from Medak; Mahabubabad cited Warangal Urban but
  inherited from Warangal Rural.
- **17** entirely-real districts carried a citation for values they never
  inherited — Krishna cited NTR, Kancheepuram cited Chengalpattu, Ferozepur cited
  Fazilka.

Those first three counts sum to 99, not 102. The remaining 3 — Jangaon, Komaram
Bheem and Mulugu — are multi-donor districts whose single stored citation named one
of their two real donors: right for some of their values, wrong for the rest. They
belong to no clean category, which is itself the point of reason 2 below.

iter-13's verifier had approved "parent-cited" because it checked the field
*existed*, not that it was *right*.

## Decision

**Record the donor inside the fill loop, from the same `src` the fill used, and key
it `(region_code, metric_id, year)` — the same key as the value it explains.**

Two independent reasons the old shape could not work:

1. **A separate derivation can always drift.** Any rule computed apart from the
   fill is a second opinion about where a number came from. Recording `src` at the
   moment of the `INSERT` makes divergence impossible by construction rather than
   by discipline.

2. **One row per district cannot state the truth for 4 districts.** Surveys cover
   different district sets, so which siblings hold a real value differs per metric.
   Mancherial takes crime from Nirmal and ASER from Adilabad; the same is true of
   Komaram Bheem, Jangaon and Mulugu. `region_code` as PRIMARY KEY holds exactly
   one donor per district — no choice of rule fixes those four.

Reciprocal pairs exist too — Warangal Urban takes ASER from Warangal Rural while
Warangal Rural takes crime from Warangal Urban, 6 such pairs — but they are a cycle
in the donor graph, not a representational problem: each member has a single donor
and fits the old key fine. Recorded here only because two drafts of this change
mistakenly cited reciprocity as a second reason for the key. It isn't one.

The API follows the data: `/api/region/[code]` returns `estimated_from` per metric
row plus `estimated_parents` for the panel footnote, replacing a single
per-district `estimated_from` that could only ever name one parent.

## Consequences

- Citations now exist exactly where a fill happened: **1494 for 1494**. The 16
  blanks, 4 wrong names and 17 bogus rows are gone as a class, not case by case —
  they were symptoms of the derivation being separate.
- Values are untouched. 1494 fills before and after, 0 value changes against
  `bak-iter15`. This was a citation-only fix and stayed one.
- The region panel can now name a different parent per metric on the same district,
  and its footnote lists the distinct parents.
- `district_estimate_source` is rebuilt every run (`DROP TABLE IF EXISTS`), so the
  schema change needs no migration — the table is wholly derived. Note the previous
  `CREATE TABLE IF NOT EXISTS` would have silently kept the old 3-column table on
  an existing DB; the DROP is what makes the re-key actually land.
- Four invariants now assert every estimate is cited, every citation explains an
  estimate, no district cites itself, and no estimate collides with a real value —
  plus `assert fills > 0`, without which all four pass vacuously on an empty
  crosswalk. **These are regression tripwires, not proofs**: with the citation
  written from the fill's own `src`, they cannot catch a wrong donor. They exist to
  fail loudly if a separate derivation is ever reintroduced. Correctness was
  established by re-deriving all 1494 donors independently in verification.
- Still no automated test covers this table (to-do 216 tracks estimate coverage
  generally). The invariants are not a substitute.

## Alternatives considered

- **Keep one row per district, fix only the rule** (store the dominant donor).
  Less work, and correct for 98 of 102 districts — but it still misstates
  Mancherial, Komaram Bheem, Jangaon and Mulugu, and "mostly cited correctly" is
  the failure this project exists to prevent. Rejected.
- **Add an `estimated_from` column to `metric_values`.** Arguably cleaner — the
  citation would live on the value itself and could never be orphaned. Rejected for
  now: `metric_values` is written by every adapter, so widening it touches the
  whole pipeline for a property only this pass produces. Worth revisiting if other
  passes start estimating.
