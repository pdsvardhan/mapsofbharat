# Grading sibling inheritances by child-vs-donor similarity (to-do 218) — SCOPE

- **id:** scope-218-inheritance-grading
- **status:** proposal (go/park decision pending) — SCOPE ONLY, no code or data changed
- **date:** 2026-08-03
- **relates to:** adr-018 (sibling inheritance), adr-019 (point-of-use disclosure — parked
  this idea by name), adr-020 (per-metric citation), adr-021 (`estimate_kind`),
  adr-022 (stats exclude copies)
- **calibration source:** live app, `GET /api/health` → commit `1c4e87b`, tree clean

## The ask

`fill_new_districts.py` fills a post-2011 district that a survey never covered with
its largest-population 2011 sibling's value, flagged `estimated=1`,
`estimate_kind='inherited'`, donor recorded in `district_estimate_source`. Every
inheritance is disclosed identically today (the `"est."` badge). To-do 218 asks:
**grade** each inheritance by how similar the child is to its donor, and flag only
the shaky ones. The stated intuition: NTR←Krishna is a bad match (NTR 58.7% urban,
Krishna 27.8%); Shi Yomi←West Siang is fine.

adr-019 already logged this exact idea as its most attractive un-taken alternative
("Grade inheritances and hatch only the shaky ones ... Genuinely attractive and
still open — parked as a possible follow-up rather than rejected"). This is that
follow-up.

---

## 1. Signals available

### How inheritance is recorded (real field names)

`pipeline/fill_new_districts.py`:
- Lineage is voted from `crosswalk(sd_code, rid, method)`: each current district
  `rid` is mapped to the dominant 2011 parent (`sd_code[:5]` = state2+district3).
  Siblings = current districts sharing a 2011 parent; `groups` = parents that split
  into >1 child.
- The donor is `src = max(holders, key=lambda r: pop.get(r, 0.0))` — the
  largest-population sibling **that holds a real value for that `(metric_id, year)`**.
  `pop` comes from `metric_values` where `metric_id='pop_total'`.
- Only INTENSIVE metrics are inherited. `COUNT_UNITS =
  {"people","km²","visits","tonnes","hectares","head","birds","₹ crore"}` are never
  inherited (a new district does not carry its parent's totals).
- Each fill writes `metric_values(metric_id, region_code, region_level, year, value,
  estimated=1, estimate_kind='inherited')` and records the donor in
  `district_estimate_source(region_code, metric_id, year, source_code, source_name)`,
  keyed per `(region, metric, year)` because four districts inherit from two
  different donors depending on the metric (adr-020).

**Volume:** 1,494 inherited cells across 102 child districts (adr-019/020). Example:
`nfhs5_full_immunization` at district level = 699 rows, 39 inherited, stats rest on
660 (`GET /api/metrics/nfhs5_full_immunization?level=district`).

### What real attributes each district carries (candidate similarity axes)

All of the following are `estimated=0` (the child's OWN reaggregated value) and are
therefore comparable child-vs-donor. Two are structurally ideal because they are
present for **every** district and are themselves never inherited:

- `urban_pct` — from `pipeline/ingest_census_a01.py`. Verified `GET
  /api/metrics/urban_pct?level=district` → **count 733, estimated_count 0**. Full
  coverage, always real.
- `pop_density` — same adapter (`pop_total` / reaggregated area).

From `pipeline/reaggregate.py` `metrics()` (recomputed from PCA raw counts, real):
`literacy_rate`, `female_literacy_rate`, `sex_ratio`, `child_sex_ratio`, `sc_pct`,
`st_pct`, `work_participation`, `cultivators_pct`, `agri_labourers_pct`,
`household_industry_pct`, `other_workers_pct`, and the count `pop_total`.

Also real and reaggregated onto current boundaries (adr-018 mechanism 1):
`assets_car`/`assets_tv`/`assets_computer`/`assets_none` (HH-14),
`language_top_share`/`language_diversity`/`language_hindi_pct` (C-16), religion
shares (`hindu_pct` …).

`pop_total` is a real count for every child (NTR `pop_total`=2,218,591, `estimated=0`)
— usable as an **impact/reach weight**, not a similarity axis.

---

## 2. Similarity score proposal — calibrated against the real numbers

### The real numbers (live API, commit `1c4e87b`), child vs donor

| axis (metric_id) | NTR `37_749` | Krishna `37_510` | \|Δ\| | Shi Yomi `12_785` | West Siang `12_250` | \|Δ\| |
|---|---:|---:|---:|---:|---:|---:|
| `urban_pct` | 58.7 | 27.8 | **30.9** | 0.0 | 44.5 | **44.5** |
| `literacy_rate` | 73.9 | 75.0 | 1.1 | 46.9 | 71.3 | **24.4** |
| `female_literacy_rate` | 68.6 | 71.2 | 2.6 | 36.0 | 64.8 | **28.8** |
| `pop_density` | 676 | 455 | 221 | 5 | 33 | 28 |
| `st_pct` | 3.7 | 2.2 | 1.5 | 91.7 | 76.8 | 14.9 |
| `assets_tv` | 69.6 | 61.8 | 7.8 | 17.2 | 60.3 | **43.1** |
| `assets_none` | 13.8 | 18.1 | 4.3 | 46.7 | 20.0 | **26.7** |
| `other_workers_pct` | 47.2 | 29.9 | 17.3 | 37.4 | 40.2 | 2.8 |
| `pop_total` (reach) | **2,218,591** | 1,735,079 | — | **13,310** | 46,506 | — |

### The central finding (this drives the recommendation)

**A pure child-vs-donor similarity distance does NOT reproduce the stated labels.**
On `urban_pct` — the axis the to-do itself cites — Shi Yomi diverges *more* (44.5)
than NTR (30.9). On literacy and asset ownership Shi Yomi diverges far more (Δ24.4,
Δ28.8, Δ43.1, Δ26.7) while NTR is nearly identical to Krishna there (Δ1.1, Δ2.6).
By any single-axis or composite attribute distance, Shi Yomi←West Siang would be
flagged **shakier** than NTR←Krishna — the opposite of the intuition.

The only quantity that separates the two cases in the intended direction is
**child population / reach**: NTR carries Vijayawada, 2.22M people, prominent on the
map; Shi Yomi is 13.3k people in a Himalayan corner where (a) census percentages are
statistically noisy — one census town flips West Siang's `urban_pct` from ~0 to
44.5 on a 46k base — and (b) a wrong inherited number misleads far fewer readers.

So to-do 218 as literally worded ("how similar the child is to its donor") is
**underspecified**: similarity alone flags the wrong example. The workable
formulation is **risk = divergence × reach**, not divergence alone.

### Proposed score

For each `(child, donor)` pair (obtained from `district_estimate_source`; a child
may have >1 donor, so grade per donor):

1. **Axes** — start narrow and structural, the axes most predictive of the SURVEY
   outcomes actually being inherited (poverty, immunization, sanitation, nutrition):
   `urban_pct`, `female_literacy_rate` (or `literacy_rate`), `log(pop_density)`.
   `st_pct` optional. Assets/religion are secondary confirmatory signals, not
   primary — they add noise on tiny districts.
2. **Normalize** each axis by its national spread across all 733 real district
   values — robust z-score `(x − median)/IQR` (urban_pct and density are heavily
   right-skewed, so log density first and prefer median/IQR over mean/SD).
   A raw 30pp urban gap then becomes "N spreads of the national urban distribution",
   comparable across axes.
3. **Divergence** `D = max` of the per-axis normalized \|Δ\| (interpretable: "differs
   from its donor by more than K spreads on at least one structural axis"). A
   weighted Euclidean norm is the alternative; `max` is easier to explain in a badge.
4. **Reach** `R` = child `pop_total` (or child share of the pre-split parent's
   population). This is the term that spares Shi Yomi.
5. **Flag "shaky"** iff `D ≥ τ` **AND** `R ≥ P_floor`. With a population floor of a
   few hundred thousand, Shi Yomi (13.3k) drops out while NTR (2.22M) stays —
   reproducing the intuition. A pop-share floor (e.g. child ≥ 40% of parent AND
   diverges) is a defensible alternative that is scale-free.

**Threshold honesty:** `τ` and `P_floor` MUST be calibrated on the full
distribution of all 102 child/donor pairs, not asserted from two examples. The two
examples fix the *direction* (reach is required) but cannot set the *cutoff*. That
sweep is the recommended first slice (§4). Every inherited value is already
rank-less and stats-excluded (§3), so the threshold only tunes *disclosure
strength* — getting it slightly wrong moves no numbers.

---

## 3. Surfacing a "shaky" flag — it fits existing machinery cleanly

Two facts make this low-blast-radius:

- **Inherited values already carry no rank and are already excluded from every
  distribution statistic** (`countsInStats` returns false for `'inherited'`,
  adr-022; ranks follow stats membership, adr-023, enforced in the SQL of
  `app/api/region/[code]/route.ts` and in `components/india-map.tsx`). Grading
  therefore changes **no value and no statistic** — it is purely a
  disclosure-intensity feature. Nothing on the map recolours; no mean moves.
- **All estimate wording already funnels through one module**,
  `lib/estimate-kind.ts` (`ESTIMATE_BADGE="est."`, `estimateNote`, `estimateShort`,
  `notRankedNote`, `estimateFootnote`). The rail
  (`components/atlas/right-rail.tsx`) and the map hover / export footnote
  (`components/india-map.tsx`, `lib/social-export.ts`) all call it. A new distinction
  added there propagates everywhere at once, by construction — the property adr-021
  was built to give.

Surfacing options, cheapest first:

- **(a) Stronger badge variant (recommended).** Keep `"est."` for OK inheritances;
  render a distinct variant for shaky ones (e.g. `"est. ⚠"` / an amber badge).
  Requires one new per-value field on the API (`app/api/metrics/[id]/route.ts` and
  `app/api/region/[code]/route.ts` already emit `estimate_kind` and `estimated_from`
  per row — add e.g. `inherited_shaky` / `inherited_divergence` beside them) and one
  new wording branch in `estimateNote`/`estimateShort`/`notRankedNote`.
- **(b) Per-metric caveat text.** `estimateNote` already builds
  "Inherited from Krishna — …". Append the reason: "— Krishna is 28% urban vs this
  district's 59%, so treat with caution." Highest information, no new visual.
- **(c) Revive the hatch, shaky-only.** adr-019 dropped the ambient hatch on
  proportionality (it would mark 12% of the map) but **left the layer wired**
  (`components/india-map.tsx` ~L383-388: "The overlay that used to mark … stays
  wired") and stated reviving it "needs a new decision, not a CSS tweak." Grading
  makes revival proportionate — it would mark a handful of districts, not 12% — and
  to-do 218 is precisely the new decision adr-019 required. Use the two-tone
  light+dark hatch adr-019 measured at ≥3:1 WCAG on every ramp stop.
- **(d) Stats exclusion — no change needed.** Shaky inheritances are already out of
  min/max/mean/breaks/ranks. If anything the grade could *promote* the OK ones
  (currently excluded as copies) — but that is a separate, riskier question; leave
  stats untouched for this scope.

Recommended surfacing: **(a) + (b)** — a distinct badge whose tooltip states the
divergence in plain numbers. Defer (c) to a second decision.

---

## 4. Effort, risks, recommendation

### Effort (rough)

- **Slice 1 — read-only calibration audit (½ day).** A throwaway analysis script
  (not committed to pipeline/app): for all 102 child/donor pairs pull the real axis
  values, compute normalized divergence + reach, output a ranked table. Answers the
  only question that matters before building anything: *does divergence × reach
  cleanly separate a defensible "shaky" set, and where do NTR and Shi Yomi actually
  land?* No schema, no UI, no data mutation.
- **Slice 2 — persist the grade (~1 day).** `fill_new_districts.py` already holds
  every real value (`real` dict) and `pop` in the fill loop, so it can compute
  divergence beside each `src` at write time and store it — either a
  `divergence`/`shaky` column on `district_estimate_source`, or a derived
  `district_inheritance_grade` table (rebuilt each run, like
  `district_estimate_source`). Backfill-derivable, testable with the same
  invariant-assert pattern already in that file.
- **Slice 3 — API + UI (~1–2 days incl. tests).** Emit the flag from the two API
  routes; add the wording branch in `lib/estimate-kind.ts`; render the badge variant
  in `right-rail.tsx`. This is also the moment to add the first automated test of
  estimate behaviour (adr-019/020 both note none exists; to-do 216 tracks it).

### Risks

- **The premise is not self-consistent (highest risk).** The two hand-picked
  examples don't separate on similarity; a naive score contradicts the owner's own
  Shi Yomi call. Shipping that would be worse than shipping nothing. Mitigated
  entirely by doing Slice 1 first and confirming the reach term resolves it.
- **Small-population noise.** Census percentages for micro-districts swing on a
  single town; a similarity flag over-fires there. The `P_floor`/pop-share gate is
  the mitigation and is itself the thing to validate in Slice 1.
- **A threshold is a modelling choice, not a bug fix** (adr-022 flagged the same for
  its stats change). `τ`/`P_floor` must be disclosed and owned by an ADR, not slid
  in.
- **Another concept alongside `estimated`/`estimate_kind`/`countsInStats`.** Adds
  surface, but stays consistent with the project's one-predicate-in-one-module
  pattern, so drift risk is low.
- **adr-019's "how careful, nowhere" tension.** Grading is the direct answer to the
  gap adr-019 accepted, so it is philosophically aligned — but it asks readers to
  learn a second tier of disclosure.

### Recommendation: **conditional GO — smallest first slice only**

Do **Slice 1 (the read-only calibration audit) and nothing else yet.** It is
cheap, mutates nothing, and settles the one open question the two examples exposed:
whether *divergence × reach* actually carves out a clean, defensible "shaky" set and
where NTR / Shi Yomi fall under it. Reframe the to-do from "similarity" to
**"risk = divergence × reach"** — the calibration numbers show similarity alone
flags the wrong example.

- If Slice 1 shows a separable shaky population → proceed to Slices 2–3, surfacing
  via a stronger badge variant + numeric caveat routed through `lib/estimate-kind.ts`
  (defer the shaky-only hatch to its own decision). Blast radius is small: no value
  and no statistic changes, only disclosure strength.
- If Slice 1 shows the "shaky" set is noisy / not separable, or that it mostly
  re-flags tiny districts → **park**, and record that adr-019's parked alternative
  was measured and did not hold up. Either outcome is a decision the audit earns
  cheaply.
