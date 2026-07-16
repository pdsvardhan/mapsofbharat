# Every estimate records what kind of estimate it is

- **id:** adr-021-estimate-kind-discriminator
- **status:** accepted
- **date:** 2026-07-16
- **amends:** adr-018 (sibling inheritance), adr-019 (point-of-use disclosure), adr-020 (per-metric citation)

## Context

`metric_values.estimated` is one boolean. It answers two unrelated questions, and
the app could only ever tell one of the two stories.

- **District rows** — `pipeline/fill_new_districts.py` writes `estimated=1` when a
  value was **inherited** from a donor district that existed when the survey ran.
  The donor is recorded in `district_estimate_source` (adr-020).
- **State rows** — `pipeline/ingest_rbi_fiscal.py:467-470` writes `estimated=1`
  when the RBI fiscal year is a **Budget Estimate or Revised Estimate** rather than
  an Actual (`ESTIMATE_TAG = {2024-25: BE, 2023-24: RE, 2022-23: A}`). Nothing is
  inherited. There is no donor, and `estimated_from` is NULL for every one.

Because the flag cannot distinguish them, `right-rail.tsx:169` told all 60
state rows:

> "Inherited from the parent district — this district formed after the source's
> survey"

Every clause of that is false for them. They have no parent, nothing was inherited,
and a state is not a district that formed after a survey. Measured on the live API:

| metric | count | estimated |
|---|---|---|
| `fiscal_deficit_pct_gsdp` | 31 | 30 |
| `own_tax_pct_gsdp` | 31 | 30 |
| `econ_percapita_nsdp_rbi` | 34 | 0 |
| `outstanding_debt_pct_gsdp` | 31 | 0 |

30 + 30 = the 60 rows. The two clean metrics are exactly the two `ingest_rbi_fiscal`
writes with `use_est=False`.

This was filed as a copy bug ("needs state-appropriate wording"). It is not.
Rewording alone would make a false sentence read more nicely while leaving the next
surface free to guess wrong again — which is what adr-019 and adr-020 each had to
fix in turn, on the same flag.

A third writer exists. `ingest_pca.py` reaches `estimated=1` twice more: line 93
copies the nearest district's values (an inheritance chosen by distance rather than
lineage), and line 81 **aggregates** a whole state's real census rows into the one
geojson district feature that state has. That aggregate is exact, copied from
nobody, and not a projection. Neither of the two kinds above is true of it.

Those `ingest_pca` rows do not survive the pipeline today — `reaggregate.py`
overwrites them with real values and `fill_new_districts.py:74` deletes the rest,
which is why all 1,494 surviving district estimates carry a citation. But they are
live writers, and a flag that cannot say what it means is precisely the defect.

## Decision

**Add `metric_values.estimate_kind`. Every writer of an estimate states what it
actually did.**

- `'inherited'` — copied from a donor region that has a real value. Cites a donor.
- `'projected'` — a Budget/Revised Estimate for a fiscal year that has not closed.
  Copied from nobody; no donor exists to cite.
- `'aggregated'` — an exact sum of real rows for this area.
- `NULL` whenever `estimated=0`.

The enum is three values, not the two originally scoped: forcing `ingest_pca.py`'s
aggregate into `'inherited'` or `'projected'` would write a knowingly false label,
which is the bug class this decision removes. The widening is deliberate and
recorded here.

The API returns `estimate_kind` from `/api/metrics/[id]` and `/api/region/[code]`.
All wording branches on it through one module, `lib/estimate-kind.ts`, so the rail,
the map hover and the export footnote cannot drift apart again — three copies of a
sentence drifting is how this defect arrived.

**The backfill is derived from evidence, never guessed.**
`pipeline/migrate_estimate_kind.py` establishes each row's kind by proof:

- a citation in `district_estimate_source` proves `fill_new_districts` wrote it →
  `'inherited'` (1,494 rows)
- the two metrics `ingest_rbi_fiscal` writes with `use_est=True` prove it wrote it →
  `'projected'` (60 rows)

Any `estimated=1` row matching neither is left NULL and **fails the migration's
assert** rather than being bucketed on a hunch. Guessing is what this file exists to
delete.

## Consequences

**Positive**

- The 60 state rows now say what they are: a Budget or Revised Estimate, not an
  inheritance from a parent that does not exist.
- Wording lives in one module. A new surface gets the right sentence by default and
  an unknown kind falls back to a sentence true of every estimate.
- Every `estimated=1` row must state its kind, enforced by the migration's assert
  and by the pipeline writers, so a future writer cannot quietly re-fuse the
  meanings.
- Makes adr-022 expressible at all: "exclude copies from statistics, but not
  projections" is not a rule you can write against a boolean.

**Negative**

- One more column, and every `metric_values` writer had to name its columns
  explicitly — eight positional `VALUES(?,?,?,?,?,?)` inserts would have broken on
  the new arity. That is a one-time cost with a lasting benefit: an insert that
  names its columns cannot silently shift meaning when the schema grows again.
- `'aggregated'` is currently unreachable in the shipped data. It is carried
  because the writer is live, not because a row exists today.
- The migration must run against the live DB before the app reads the column; a
  fresh `ingest_pca.py` rebuild creates it in the `CREATE TABLE`.
