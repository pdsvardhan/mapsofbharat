# Build plans — #547 phase B, #562, feat-symbol-choropleth, #410

Written 2026-08-21. Each plan states what is decided, what is measured, and what
still needs an owner call.

---

## #562 — the worker-category metrics understate by a quarter

### What is wrong

`cultivators_pct`, `agri_labourers_pct`, `household_industry_pct` and
`other_workers_pct` are described as "X as % of total workers". They are computed
(`pipeline/ingest_pca.py:65-66`) as `MAIN_<cat>_P / TOT_WORK_P` — **main** workers
over **all** workers. The missing people are marginal workers: those who worked
under six months of the year.

Measured on the source workbook (676 district rows):

```
MAINWORK_P + MARGWORK_P            == TOT_WORK_P     exact
MAIN_CL+AL+HH+OT                   == MAINWORK_P     exact
(MAIN+MARG) CL+AL+HH+OT            == TOT_WORK_P     exact
national marginal share of workers  = 24.8%
```

So the four shares sum to **73.5%** and never to 100 — 0 of 733 districts. The
excluded quarter is not random: marginal work is disproportionately rural,
agricultural and female, so the current figures understate exactly the districts a
reader would go looking for.

### The three candidate fixes, all buildable from data already on disk

| | Numerator | Denominator | Sums to | What it means |
|---|---|---|---|---|
| **A** disclose only | MAIN | TOT_WORK | 73.5% | numbers unchanged, wording fixed |
| **B** re-base | MAIN | MAINWORK | 100.0% | "of main workers" — drops 24.8% of workers from the question |
| **C** include marginal | MAIN+MARG | TOT_WORK | 100.0% | "of all workers" — what the description already claims |

### Decision: C

C is the only option where the number matches the sentence already published.
B makes the arithmetic tidy by shrinking the population until the remainder
disappears, which is the same species of error as #548's denominator. A leaves a
known understatement on a live map because fixing it is work.

C also makes the four a genuine decomposition, which unblocks the `census-pca`
family for #547 (currently carrying a `blockedBy`).

### Steps

1. Add `MARG_CL_P`, `MARG_AL_P`, `MARG_HH_P`, `MARG_OT_P` to `RAW` in
   `pipeline/ingest_pca.py`; numerator becomes `MAIN_x + MARG_x`.
2. Add an in-adapter assert: the four categories must sum to 100 ± 0.5 for every
   district. This is the guard that would have caught the original defect, and it
   is cheap because the identity is exact in the source.
3. Update the four `description` strings and add a methodology line naming
   marginal workers explicitly.
4. `fill_new_districts.py` after, then `validate_drift.py`. Expect real drift on
   four metrics — review it rather than re-baselining blind.
5. Test: extend `tests/metric-families.spec.ts` — `census-pca` gains
   `partToWhole` and loses `blockedBy`, which the existing spec already asserts in
   both directions and is mutation-proven for.
6. ADR: this changes published numbers on a live site, same class as adr-035.

**Blast radius:** 4 metrics × 733 districts. `work_participation` is unaffected
(already `TOT_WORK_P / TOT_P`).

---

## #547 phase B — the small-multiples grid

### The dependency question, resolved

The open question was `d3-geo` versus adr-032 ("no ORM, no chart library"). It
dissolves on inspection: the grid needs a **projection**, once, to turn
`districts.geojson` into SVG path strings. Nothing about that is a chart library,
and nothing about it needs to happen in the browser.

**Plan: `d3-geo` as a devDependency, used by a build-time script. Zero runtime
bundle cost.** `scripts/build-district-paths.mjs` projects the geometry once and
writes `public/geo/districts-paths.json` (a `rid -> "M…Z"` map for a fixed
viewBox). The grid then renders plain `<path d=…>` with only `fill` varying per
panel — no projection library ships, and panels are cheap enough to render N of.

This keeps adr-032 intact rather than arguing around it, and is faster at runtime
than projecting in the client. If the owner would rather not add even a
devDependency, the fallback is to write the ~40 lines of Albers projection by
hand; that is a worse trade (correctness risk for no shipped-bytes saving) but it
is available.

### Steps

1. `scripts/build-district-paths.mjs` + a checked-in generated artifact, with a
   guard that the artifact's feature ids match `districts.geojson` (same shape as
   `check-boundaries`, so a regenerated geometry cannot silently desync the paths).
2. `GET /api/families/[id]` — members plus values on the shared district set, one
   request per grid.
3. `/family/[id]`, server-rendered, listed from `SHIPPABLE_FAMILIES`.
4. Panels reuse `lib/breaks.ts` for classification so a mini-map classifies exactly
   as the main map does (adr-033, one definition per visual fact).
5. `axis: "free"` renders per-panel scales; `"shared"` renders one. The family data
   already carries the choice and the reason.
6. `partToWhole` families get a caption stating the **measured** sum (religion:
   97.6%, not 100), because C-01's "other"/"not stated" are not in the catalogue.
7. Tests: every shippable family renders N panels; a free-axis family shows N
   legends and a shared-axis family shows one; the religion caption states 97.6%;
   a blocked family is not linked. Mutation-prove before wiring.

Seed with **religion** only — it is the one verified decomposition.

---

## feat-symbol-choropleth — acceptance criteria for shipped code

Symbol maps went live 2026-08-20 for 9 count metrics, but the feature has **zero**
acceptance criteria, which is why the registry still calls it `planned`. It does
not trip the `missing-acceptance` HARD rule only because that rule fires *past*
planning — so the gap is real and invisible at once.

Criteria to write, each already covered by `tests/symbol-maps.spec.ts`:

1. A COUNT metric offers a symbol layer; a rate metric never does.
2. Symbol area is proportional to value (sqrt radius), so a district with twice
   the count draws twice the ink, not twice the radius.
3. The legend states the scale with real values, not relative sizes.
4. Metrics with signed values are excluded automatically (`forest_change_km2`,
   #546) — it fails safe rather than drawing a gain as a loss.
5. Symbols respect the same estimate disclosure as the choropleth (adr-019).

Then move the feature to `done` with the tests linked, exactly as #561 did for the
other nine. This is bookkeeping with teeth: it is what makes "12 done" mean
something.

---

## #410 — the paid tier

### The one hard prerequisite

**#384 must land first.** The sub-district crosswalk is SHRUG, licensed
CC-BY-NC-SA — **non-commercial**. Every district value on current boundaries is
derived from it. Charging for access to that derivative breaches the licence.
adr-027 already records this: accept SHRUG while non-commercial, swap to the LGD
sub-district table (GODL, commercial-OK) before monetising.

So the order is: LGD swap → then anything in this section. No exceptions, and no
"soft launch" that takes money first.

### What stays free, forever

Locked by adr-028 and the to-do: **the map view, the card PNG export, and the
embed**. The paywall never touches the core map. Single-metric **raw** downloads
also stay free — they are the government's files with a citation header, and
charging for redistribution of public data would be indefensible for a project
whose entire pitch is provenance honesty.

### What is actually sellable

The product is not the data — it is the *harmonisation*. 125 metrics × 733
districts on **current** boundaries, with per-value provenance. That is the
crosswalk work, and it exists nowhere else.

| Tier | Contains | Price shape |
|---|---|---|
| Free | map, card, embed, per-metric raw file | — |
| **Pro** | processed dataset downloads (CSV/Parquet), table-view export, API key with quota | small monthly or one-off |
| **Commercial** | bulk snapshot, redistribution rights, support | annual, invoiced |

The UI hook already exists: `components/atlas/metric-lineage.tsx` renders a
disabled `Pro (coming soon)` control for the processed dataset, pinned by
`tests/metric-lineage.spec.ts`. That is the seam to open.

### Accounts: don't build them

There is no auth anywhere in the codebase today, and that is an asset. A licence
**key** model needs no accounts, no passwords, no sessions, no reset flow, and
almost no personal data — which keeps adr-029's no-UGC posture and minimises the
DPDP-Act surface for a solo operator.

Payment → key generated and emailed → key gates the download route and the API via
a header. Revocable, rate-limitable, and the whole state is one table.

Payment rail: **Razorpay** for INR/UPI (the audience is Indian), with Stripe only
if international demand appears. Both support one-off and subscription.

### Phasing

- **P0** — #384 LGD swap. Licence unblock. Nothing else starts.
- **P1** — key issuance + gating, keys minted by hand. Proves the gate holds
  before money is involved. Route gate + `tests/` for: no key → 402, bad key →
  401, revoked key → 401, good key → the file.
- **P2** — Razorpay checkout → automatic key. Webhook, idempotent.
- **P3** — the API (`/api/v1/...`) with per-key quota, reusing the middleware
  limiter already in `middleware.ts`.
- **P4** — commercial licence page + the CC-BY line the roadmap's Phase-1
  before-launch confirm still owes.

### Two things to decide before P1

1. **Price.** Not a technical question, and it wants a number before the gate is
   built, because "what does Pro cost" changes the copy on the control that
   already ships.
2. **Whether Pro downloads are per-metric or whole-catalogue.** Whole-catalogue is
   the stronger product and the easier build; per-metric earns less and costs
   more.
