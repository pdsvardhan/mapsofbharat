# Completion plan — everything buildable, 2026-08-25

Written after the backlog survey (artifact "The Unbuilt Atlas") and an owner decision pass
(8 answers). Supersedes `planning/PLAN.md` for sequencing; that file's standing decisions
still hold.

## What the owner decided (2026-08-25)

| Question | Answer |
|---|---|
| Data acquisition depth | **Everything reachable — my call on scope** |
| Map forms | **All four + browse-by-form** |
| Content machine (#409) | **Skip for now** |
| #574 rclone | **Upgrade and re-verify all five backup jobs** |
| A11y fix latitude | **Fix everything, visual changes included** (within the existing palette) |
| Family coverage floor | **Lower to 675**, with measured impact reported first |
| #405-E warm standby | **Park for owner** (needs a Pages token); do #405-F now |
| Deploy cadence | **Deploy each iteration as it passes both verifiers** |

Out of scope by owner instruction: Zone A owner-only items, the paid tier (#410/#384),
SEO phase 2 (region pages, region cards, diff automation, 9:16), and the whole content
machine (#409).

## Corrected on entry

**#547 phase C was already deployed.** `/api/health` reports `0f35c07` and the served
`/metric/literacy_rate` renders `data-band="shift"` with a populated `data-shift-picker`.
The to-do's "NOT deployed" was stale. To-do corrected; no deploy was needed.

---

## Wave 1 — Hardening and recorded contradictions

Small, independent, low-risk. Clears every open defect that is not a feature.

| # | Item | Shape |
|---|---|---|
| 1.1 | **#579** — 404 bodies exist only in the RSC payload | `app/not-found.tsx` so the text is in the markup a crawler reads. Test asserts on raw HTML, not the hydrated DOM — the whole defect is that the two differ. |
| 1.2 | **#580** — robots signals contradict | `X-Robots-Tag: noindex,nofollow` vs `meta robots index,follow` at `app/layout.tsx:47`. Make one authority. Must keep the `SITE_LAUNCHED` gate working in both states. |
| 1.3 | **#581** — Ottomate page registry is a partial index | Backfill `/metric`, `/metric/[slug]`, `/coverage`, `/family`, or record explicitly that it is partial. A half-filled index that looks complete is the defect. |
| 1.4 | **#567a** — `symbolForcedRef` contradiction | `india-map.tsx:176` and `:910` disagree on per-metric vs global. Resolve, document which, test the discriminating case. |
| 1.5 | **pop_density J&K / Ladakh** | Research 531 flagged ~339 people/km² against a true ~3. adr-035 moved the denominator to administered area. Verify whether that resolved these two rows; fix if not. |
| 1.6 | **#574** — rclone upgrade | Install current rclone, re-run and verify all five backup jobs on VAULT7A. Ops only, no app code. |

**Gate:** both verifiers APPROVE on 1.1–1.5; 1.6 verified by a real sync of a new object
returning 200 on first PUT across all five jobs.

## Wave 2 — Performance and accessibility

| # | Item | Shape |
|---|---|---|
| 2.1 | **TEC-20** — performance baseline | A repeatable harness plus recorded numbers, so #405-F has something to prove itself against. Without the baseline first, the CDN work cannot be shown to have helped. |
| 2.2 | **#405-F** — geometry from R2, pre-compressed | The heaviest asset the page pulls. R2 credentials already exist on the box. Measured against 2.1. |
| 2.3 | **TEC-21** — WCAG 2.1 AA audit | Real audit with axe, keyboard traversal, and screen-reader name checks across every route. |
| 2.4 | **TEC-21 fixes** | Everything found. Token-level contrast changes stay inside the almanac palette — lightness shifts only, no new hues. `eslint-rules/no-hex-literals.mjs` already prevents the fix-one-copy-miss-seven failure that produced #523. |

**Gate:** baseline recorded before 2.2 ships; audit re-run clean after 2.4; the a11y spec
proves a failure is detectable before proving it passes.

## Wave 3 — Map forms (#408 phase 2 / #575)

The spine is `lib/metric-capabilities.ts` — one resolver, three standings
(`preferred` / `available` / `unsuitable`). Every form below extends `VizId` and adds its
rule there, never in a component.

| # | Item | Shape |
|---|---|---|
| 3.1 | **FND-01** — map shape as a real setting | State plus URL param, not a hard-coded projection. Foundation for hex and anything after it. |
| 3.2 | **Categorical maps** | Winner-takes-colour for non-continuous indicators, discrete-class legend. Needs a categorical metric kind the store does not model yet — first job is deciding how a category is stored. |
| 3.3 | **VSUP uncertainty toggle** | Value-suppressing uncertainty from the `estimated` flag, `estimate_kind` and coverage. The form that most fits this product's thesis. |
| 3.4 | **Bivariate choropleth** | 2D colour matrix, pairings curated at build time — I propose the pairings from the data and record them as a decision. |
| 3.5 | **Hex-state layout** | State level only (36 rows). Research 758 is explicit the district version does not work. |
| 3.6 | **Family coverage floor → 675** | Measure which metrics this newly admits and what the smallest shared set becomes; report both before it ships. |
| 3.7 | **Browse-by-form page** | The #575 second entrance. Metric-first stays the front door. |
| 3.8 | **ANI-06** — nicer drill zoom | Small. |
| 3.9 | **ANI-01** — shape morph | Depends on 3.1 and 3.5. |

**Gate:** each form's rule lands in the capability matrix with a test that proves an
unsuitable metric is never offered it; feature verifier drives the real map for each.

## Wave 4 — Data

Ordered by the research/767 score, filtered by what the server can actually reach.

**Reachable from VAULT7A (verified 2026-08-25):** data.gov.in API with the project key,
Kerala and Maharashtra GDDP PDFs, BMTPC vulnerability atlas, ESA WorldCover.
**Returns 000:** `censusindia.gov.in`, CGWB, NITI Champions of Change, MSME dashboard.

| # | Item | Shape |
|---|---|---|
| 4.1 | **Derived metrics** | D1–D5, D7–D12 from data already held. Zero acquisition cost, highest score. Each carries its documented trap; the pervasive one is a 2011 denominator under a 2024 numerator, and it is guarded in the pipeline, not the UI. Excludes the recorded should-not-ships. |
| 4.2 | **data.gov.in GODL pulls** | MSME/Udyam enterprises, Watershed Development KPIs, first census of water bodies, Aadhaar generation, court pendency. All GODL, difficulty 1–3. |
| 4.3 | **District GDDP** | Kerala, Maharashtra, Rajasthan, Karnataka, Uttarakhand. PDF parses, one per state. Unlocks D6, the top-ranked derived metric. Cross-state vintage column is mandatory — no ranking without it. |
| 4.4 | **BMTPC flood + earthquake risk** | Reachable. Needs a 2011→current district crosswalk, which we already own. |
| 4.5 | **ESA WorldCover built-up + cropland** | CC BY 4.0, direct S3, one file serving two asks. |
| 4.6 | **Census tables** | HLPCA amenities, D-series in-migration, C-20 disability. Server-blocked; attempt via a browser session, otherwise record as blocked with the measured reason. |
| 4.7 | **FND-04 / FND-06** | Adopt the free geography source for shapes; independently double-check the free crosswalk. |

**Gate:** every load records source, year and licence; re-running an adapter is idempotent;
no metric ships without a citation and a methodology string.

## Wave 5 — Remaining foundations

| # | Item | Shape |
|---|---|---|
| 5.1 | **FND-03** — video-making step | Client-side MediaRecorder to MP4/WebM. Server-side rendering risks OOMing the box (research 766). |
| 5.2 | **GEO-04** — H3 equal-cell grid | After FND-01. |
| 5.3 | **GEO-09** — nature cuts | River basins and agro-climatic zones. Research-first: needs a compliant boundary source, which may not exist. |
| 5.4 | **Ops docs** | RSK-06 takedown protocol, RSK-07 forged-card posture, OPS-01 continuity plan. Docs, not code. |

## Not buildable, and why

| Item | Reason |
|---|---|
| #405-G cache-hit trigger, #433 baseline, MSR-05/06/11/14/15/16 | Need real post-launch traffic. No amount of building substitutes. |
| #495 Umami funnel 4 | An Umami step must be a URL or an event; "return visit" is neither. Reopens only if Umami gains conditioned retention. |
| TEC-19 Android card export | Needs a physical device. |
| LNC-01 friends-and-family test | Owner-run by definition. |
| #405-E warm standby | Needs a Cloudflare Pages token only the owner can mint. Staged and documented. |
| GEO-06 constituencies | Held until after the 2027 delimitation. |
| ANI-02/03/04/05 | Need data the catalogue does not hold. |

## Process

Every wave is one or more Ottomate iterations through the Stage 4 mini-pipeline: intake →
classify → **lock-in gate** → build → both verifiers → integrate → deploy. No code before
the lock. Deploy on each pass, per the owner's cadence choice. YAML mirrors written and
pushed at every lock-in and integrate, not only at pack-up.
