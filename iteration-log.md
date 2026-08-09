# MapsOfBharat — Iteration Log

## 2026-08-04 — iter-28: 762 card ship, C8 anchor, C7 classification polish (branch iter-28-2026-08-04)

**Ask:** resumed the open visual-QA queue (report 127). Owner directed the build list item-by-item, corrected two of my misreads, approved each deploy. Three iterations shipped to the live preview (121, 123, 127); one comment folded then parked; one licence decision recorded.

**Shipped — each through the anti-gaslight pipeline (independent code verifier + 4/4 social-card E2E on a temp prod container before every deploy):**

- **762 (ec4db7e, iter 121):** wired the layout-preset engine into production `lib/social-export.ts`, default **v7 "Hero Ledger"** — national hero number in the Bay above the Andaman inset, both rank tables abreast in the Tibet band; legend in the Arabian. The independent code verifier caught a dropped `spec.tableN` (the dialog's TABLE ROWS control had silently gone inert in the port); restored it. Nudged the Dadra & Nagar Haveli flung label off the Arabian legend.
- **C8 (22b40fc, iter 123):** the card anchor summed intensive metrics — UPI ₹/person/mo read "All-India total 89.5 L" while the map frames it per person. Now any compound-unit (contains "/") or explicit per-/rate metric is averaged; bare counts still total. upi → "National average 12.2K", visits → total, literacy → average.
- **C7 (e522c86, iter 127):** *not a default fix.* Verified the auto-selector (`selectMethod`, item 757) already spreads **86/87** district metrics, so the per-metric `default_scale`-by-skew scheme I first proposed was redundant — and is the skew-threshold approach item-757 already measured and rejected. Built the two genuine additions instead: a **`log` break method** (equal-interval in log space; 8 metrics now default to log, magnitude-preserving; offered only for strictly-positive series; occupancy-checked in the ladder so `pop_density` stays quantile) and a **collapse warning** — a manual pick burying >60% of regions in one class shows an amber hint naming a better method with a one-click switch. Default auto-selector deliberately unchanged.

**Corrections owned to the owner mid-session:** (1) my C7 before/after render implied the default map was monochrome — it isn't; the commenter hit `?brk=equal`, a manual override; corrected the research doc. (2) I first scoped comment C1 as a whole-site mobile-responsive rebuild; the owner clarified the "mobile" comments (C9/C11) were about the downloaded CARD in mobile feeds (satisfied by 762 v7), not the site — parked the site-mobile work.

**Decisions:** **adr-027** — accept the CC-BY-NC-SA census crosswalk while non-commercial; swap to LGD Sub-District (GODL) before enabling ads/paid (resolves the #275 question; #384 is the deferred swap). Curated `cat:product`.

**Friction:**
- *env* — next-dev E2E is render-timing flaky (the social-card footnote draws last; false-red on dev, 4/4 green on a prod build). Established the **temp-prod-container E2E gate** as the standard pre-deploy path; captured in project memory.
- *tooling* — Ottomate `/lock` needs a `{}` body (empty → "Invalid JSON"), and posting `verifier-result` before `/lock` resets the verified item back to `locked` and blocks integrate. Correct order captured in memory.
- *tooling* — the to-do `title` 422 over ~300 chars bit again (the C7 to-do); shortened. Recurring (also 2026-07-16, 2026-07-27) — worth an owner fix on the tracker.

**Next session context:**
- **PARKED (task #6):** site-presentation comments **C2 (animations), C3 (category icon), C6 (category rows → cards)** — a design session; owner will pick from options.
- `iter-28-2026-08-04` is a live preview, not merged. `main` still stalled at iter-25; iters 26/27/28 run as previews. Merge to main when the owner wants.
- Open to-dos: **#384** (SHRUG→LGD when monetising), **#386** (Elections district-level needs a PC→district crosswalk or PC-boundary geometry; PC-wise .xls in raw-new/elections), **#157** (RBI, owner-parked), **#380** (flaky chooser test).

## 2026-07-27 — iter-26 continued: card fixes, skew-aware classification, attribution sweep, three research briefs

**Ask:** resumed iter-26 (visual-QA batch, report 127). Owner directed work item-by-item across the locked list and the open to-do queue, asking for questions only where a decision was genuinely theirs. Closed 8 iteration items and 11 to-dos; scoped one; opened one design round.

**The data contradicted three things this session — the item, the brief, and my own first fix.**

- **Item 757 was filed to "add log / percentile-rank methods." Both were the wrong answer, and the research the item was blocked on said so.** Measuring the real catalogue first: `buddhist_pct/district` is not merely "one colour dominates" — 60.7% of districts report exactly 0, all four quantile breakpoints collapse onto 0, and because binning is `v >= edge` the collapsed edges clear at once and the 445 zero districts painted **class 4 of 5**. Districts with none of the thing rendered as if they had a lot; the three lowest colours rendered for nobody. Shipped a `zeroFloor` method (Evans 1977 — the tie mass becomes class 0 at the *bottom*) and a `reference` method (external pivot as an edge; sex_ratio/child_sex_ratio at 1000, not the median). → **adr-025**.
- **The research brief's own decision table would have regressed 21 series.** It routes high skew to jenks; on our data jenks degenerates exactly where quantile is fine (`christian_pct/district` 0.866 vs 0.353), because minimising within-class variance on a heavy tail means one vast low class — a step *toward* the complaint. So the shipped selector is **occupancy-checked against realised class counts**, not threshold-driven: it cannot regress a metric relative to a lower rung. Quantile sits above jenks, measured. The brief's 0.80 near-zero threshold also missed `jain_pct` (51.0% exactly zero); re-derived as share-at-minimum ≥ 1/k, which is where tie-collapse actually starts. Validated across 193 series: **13 improvements, 0 unintended regressions.**
- **To-dos 336/337/338 were filed as attribution typos; they were three real miscredits on a site whose whole promise is exact attribution.** education CAT_DESC named UDISE+ while 5 of 8 metrics are ASER; labour named PLFS while 6 of 9 are MGNREGA; agriculture named APY while 5 of 8 are the Livestock Census — both halves wrong for the majority. Fixed, and pinned by a **data-driven test (340)**: any source family ≥40% of a category must be named in its description — one assertion that would have caught all three at once.

**A real bug found in passing.** To-do 346: the as-reported-2011 view (an adr-003 must-have) painted every state no-data at state level. Three things must agree on the 2011 state key and all three are zero-padded — the source promoteId, the API value keys, the name index — but the index was built with `String(Number(st_code))` giving "1".."35". One line; two symptoms (blank map + rail showing bare codes instead of names). Pre-existing since the vintage toggle shipped; district-2011 unaffected.

**762 (social card revamp) ran the design method for the first time on a live project — and hit a real archetype gap.** The card is a static Canvas-rendered PNG, not a DOM component, so an HTML preview panel would be a fake of it (the method's own retrospective warns against exactly that). Rendered **6 real compositions through the actual renderer**, filtered to 3 by rubric, published the pick page to the previews volume. But `publish-round.mjs` correctly refused to write the ledger: composition axes ("dead-space-usage") don't trace to `media-card`'s anatomy (doctrine rule 40). The pick is live for the owner but **unrecorded** until a `poster-export` archetype exists — flagged to the owner, not worked around.

**Process honesty.** Earlier in the session I referenced "the A→B→C loop" from a one-line router summary without having read `stage-2-design-method.md` — and told the owner two wrong things (Claude Artifacts as the host, "2–4 variants"). The real method uses the in-app design route and over-generates 6→3 in a fresh sub-agent. Corrected once I actually read the references. Also: a sub-agent I dispatched earlier for research fanned out to ~20 grandchildren because I gave it `general-purpose` (which carries the Agent tool); the owner caught the sprawl. Switched research to paste-ready briefs the owner runs externally, and the one design sub-agent this session carried an explicit no-fan-out instruction.

**Decisions:** adr-025 (classification follows the distribution; two methods added, two dropped-with-reason, curated `cat:product`). Scope doc committed for to-do 275 (no decision taken).

**Friction:**
- *skill* — the Ottomate to-do `title` still 422s over 300 chars (cost three round-trips on to-do 275); same limit flagged 2026-07-16, still biting.
- *skill* — the design harness has no archetype for a static exported poster; `media-card` is the only near-fit and its interactive axes are meaningless for a PNG. → the poster-export archetype is the durable fix (owner decision pending; edits the shared plugin while a sibling session is active in it).
- *tooling* — `git status` showed clean but a Bash heredoc for commit messages needs the `'"'"'` escaping dance; worked, but verbose. No data lost.
- *env* — `/tmp/u5` on the server is a sibling session's plugin extract (screenroom design work); left untouched. All published design rounds on the box are screenroom's, not this project's.

**Next session pickup:** iteration 112 at **13 verified / 6 locked**. Two owner decisions are staged and waiting: the **762 card pick (A Hero-Number / B Four-Quarters / C Ocean-Ledger, mixing allowed)** at the previews URL, and the **348 district-border comparison** (`?outline=adaptive`). Both are deployed and non-destructive. If the owner adds the `poster-export` archetype, the 762 pick can be recorded and round 2 built — the renderer is already refactored to a `LAYOUT` preset (`design/762-social-card-round1/social-export.variants.ts`), so shipping the winner is now cheap. Remaining locked: 752/753/754/755 (chooser components — hard component-pick gate, need owner picks; do 753 layout before 752 motion), 765 (animated-viz surface — its research 766 just landed; verdict is 3 forms, none animated map fills, and the blocker is *data depth* not engineering). 5 to-dos open: 275 (SHRUG licence — scoped, one cheap check outstanding: does any open-licence sub-district set carry 2011 census codes), 157 (RBI QSDCB — dbie TLS defect, needs a human browser), 218 (grade inheritances — parked), 348/349 (border variant + its test).

## 2026-07-16 — iter-91 + iter-93: say which kind of estimate a number is

**Ask:** "complete all pending tasks" → scoped by owner to the 9 buildable to-dos. Of 18 open, 6 were blocked on a browser session (network/auth walls already confirmed from the server) and 3 were open decisions. Untouched, still open — trying harder would only have produced a false claim.

**Three to-dos rested on false premises. The data said so each time.**

- **223 was filed as copy ("needs state-appropriate wording"). It was the data model.** `metric_values.estimated` is one boolean answering two unrelated questions: district = inherited from a donor (`fill_new_districts.py`, has `estimated_from`); state = the RBI fiscal year is a Budget/Revised Estimate (`ingest_rbi_fiscal.py:467-470`, `ESTIMATE_TAG`, no donor). So `right-rail.tsx:169` told all 60 state rows *"Inherited from the parent district — this district formed after the source's survey"*: no parent, nothing inherited, and a state is not a post-survey district. Rewording would only have made a false sentence read better. → **adr-021**, `estimate_kind` discriminator. Widened to three values because `ingest_pca.py:81` flags exact whole-state *aggregates* estimated=1 — forcing that into 'inherited' or 'projected' would write a knowingly false label, which is the bug being removed.
- **639's prescribed fix would have been wrong.** "Real-only stats" was written for copies and silently generalised to projections, collapsing `fiscal_deficit_pct_gsdp` and `own_tax_pct_gsdp` to **min == max == 0.7645** — one real row (Gujarat 2022) scaling 31 states whose values actually run 0.54–6.92, under a legend reading "avg 0.76" over data averaging 3.71. → **adr-022**: exclude copies, not projections. An inherited value duplicates a real row already counted; a projected one is that state's only figure. Ranks deliberately held unchanged.
- **adr-019 was accepted 2026-07-16 and never implemented.** The hatch it measured at 1.09:1 and formally dropped was still rendering — layer, image, visibility toggle and feature-state all live, no removal commit. The ADR, the to-do list and the session notes all described a state the code was never in. → iter-93 item 650.

**Anti-gaslight, working as designed — twice:**

1. `POST /api/iterations/91/items` correctly refused a post-lock addition ("status 'building' is not editable"), so item 650 went through its own intake → classify → lock as iter-93 rather than being forced past the gate.
2. **The verifier caught a real defect in item 640.** `notRankedNote()` took no donor, so the region panel headline read "inherited from the parent district" while the *same panel* read "estimated from Adilabad" — the exact two-surfaces-disagree bug 640 exists to close, recurring inside the module written to prevent it. The test passed while the bug was live because it asserted only `/not ranked/i`. Fixed at 59bd98d; the test now pins the wording and asserts the generic sentence is absent.

**Item 644 mutation-tested 3/3.** The verifier broke the code on purpose: gutting `countsInStats` failed the adr-022 test; restoring the dead `String(r.rank ?? 0)` failed the "never a rank of 00" test; removing `estimated_from` failed two tests. The specs provably fail when the code they cover breaks — which is the entire point of an item filed because 14/14 stayed green through item 611.

**Evidence:** migration `inherited=1494 projected=60`, 0 unclassified, **0 value diffs and 0 row delta vs backup**, idempotent. Playwright **24/24** (test_run 101). Lint 25 errors vs main's 26 baseline (net −1; removing the hatch's `as any` dropped one). Reports 523–532. Deploy artifact 44. Merge 5528ef3.

**Decisions:** adr-021 (every estimate records what kind it is), adr-022 (statistics exclude copies, not projections). Both curated, `cat:reliability`.

**Friction:**
- *env-limitation* — `/mnt/storage` went read-only mid-session and 19 containers stopped. Not a fault: a sibling Claude session had `rm -rf`'d `/mnt/storage/media/music/telugu` via `find … -maxdepth 1 -type d -exec rm -rf {} +` (find returns the start dir) and was correctly running `extundelete`. Two other sessions read the read-only mount as a hardware fault; one restarted the writers onto it and reported "sanity clean" while `ingest`/`immich` crash-looped. **Several sessions share this box as the same user and cannot see each other — an incident report from a sibling is a hypothesis, not evidence.** Deploy resumed only after the recovery finished (photorec, 26G carved) and the mount returned rw at 01:36:36.
- *tooling* — Playwright is flaky on this host under full parallelism; verifiers reproduced failures on specs this branch never touched, and every one passed at `--workers=1/2`. Filed; green must mean green.
- *skill* — the Ottomate to-do `title` caps at 300 chars and 422s over it. Cost two round-trips.

**Next session pickup:** 16 open to-dos. 6 still blocked on a browser session (201 CPCB, 202 Vahan, 203 NPCI, 206 RBI Handbook, 157 RBI QSDCB, 113 Census 2001) — unchanged, still not doable from the server. 3 open decisions (204 SHRUG licence, 218 grade inheritances, 149 as-reported-year toggle, an adr-003 must_have still unbuilt). New from the verifiers: 254 (item 644's AC mapping is wrong — classifier error at intake), 255 (`scopeMin`/`scopeMax` bypass `countsInStats`, same class as 639), 256 (AC 271/525/526 + social-card footnote untested), 252 (commit bundling), 253 (Playwright flakiness).


## 2026-06-10 — Stage 3 completion

Built feat-region-detail, feat-export-share, feat-find-my-district. Resolved 7
open risks (tests, CI, error-tracking, backup, rate-limit, page-load, data-drift);
accepted/deferred a11y (#57). Added CODING_GUIDELINES, Gitea CI, Playwright + pytest
suites, /api/log sink, rate-limit middleware, geo cache headers, backup + drift scripts.
Decoupled metric fetch from map load; added pipeline/README.

Deploy: rebound container to 127.0.0.1:8610 (freed host 8601, resolved tg-ingest
collision); NPM proxy host #44 + CF DNS CNAME → https://mapsofbharat.vault7a.xyz live
on LAN. Public tunnel ingress pending cloudflared go-ahead.

Verification: tsc clean, 7/7 pipeline tests pass, next build OK, independent
verifier APPROVE. Commit fc507ba + docker-compose port rebind.



## Session 2026-06-11 — Stage 4 iteration 15 (build marathon)

**Stage:** Stage 4 — iteration 15 (13 items locked), preceded by Stage 3 verification close-out
**Duration:** ~2 long sessions (overnight + day)
**What changed:**
- P0 rid `33_0` un-merged → 4 TN districts with own values (157)
- crosswalk + region_keys tables, ISO 3166-2 keys, state-level engine end-to-end (167, 160)
- 3 new data verticals: NCRB crime 2022 (4 metrics), NFHS-5 health (9), MoSPI NSDP (1) — 26 metrics across 5 categories (159)
- source-coverage gate: 45 districts withheld in 5 SHRUG-undercovered states, 8 state rows official-direct (report-18 bug fix)
- Observatory v2 explore UI: Ctrl+K palette w/ search-to-fly, filter rail (chips/levels/breaks/palettes/range), dock, sheet, breadcrumbs (158)
- trust layer: methodology + last_updated DB→API→UI, /methodology page (161); load_log provenance (162)
- cited CSV export (163) · Fisher-Jenks class breaks + 4 palettes (164) · /embed + CSP split (165)
- polish: locate highlight, state-cohort vs-avg, SoI compliance pytest (169)

**Verification:** 11/13 items APPROVE by independent verifiers (reports 90–104); 2 auto-fix rounds (159 police splits, 161 reproducibility). Suite 10/10 e2e + 8/8 pytest, all run by verifiers against the live container.

**Decisions:** no new ADRs this session (ADR-011 was previous session); coverage-gate methodology documented in commit 72b8137 + /methodology.

**Next session context:**
- User testing round → collect dislikes → classify → lock-in (reworks expected)
- Items 166 (census religion/language/amenities — needs ~36 DDW state files) + 168 (Census 2001 — SHRUG pc01 not in holdings) remain locked; acquisition first, then build, then integrate + trace report for iteration 15
- Component picks were delegated (7 slots registered with provenance note) — user may swap any
- Public tunnel exposure still awaits explicit cloudflared go-ahead


## Session 2026-06-26 — bug #18 fix (Stage 4, iter-15 continued)

**Stage:** Stage 4 — iteration 15 (still building; integration deferred by user)
**What changed:**
- Root-caused intake report #18 (Aizawl pop 50,777 vs real ~400k; crime rate ~8x inflated):
  the SHRUG sub-district PCA undercovers 5 states (MZ 66%, LD 52%, PY 70%, TR 82%, WB 82%)
  — a source data gap, NOT the point-in-polygon mis-assignment the bug report assumed.
- Rewrote `pipeline/reaggregate.py` to use the official ORGI sub-district PCA
  (`raw/2011-IndiaStateDistSbDist.xlsx`, complete) + same-state correction (offshore/
  enclave sub-districts) + missing-geometry reconciliation; removed the source-coverage
  withholding gate (no longer needed).
- National total now EXACT (1,210,854,977); census coverage 688 -> 733 districts; all 5
  previously-withheld states covered (West Bengal's 91M un-withheld).
- Re-ran `ingest_ncrb.py`: crime denominators corrected (Aizawl crime_ipc_rate
  4986.5 -> 615.0, no longer national max). Regenerated drift baseline
  (`expectations.json`: census 688->733, NCRB 650->685). pytest 8/8. Live-verified.

**Decisions:** ADR-012-official-subdistrict-source (amends ADR-010).
**Commits (branch iter-15-2026-06-11, pushed):** f433ce5 (#18 fix), 21eef75 (adr-012).
**Deferred (user calls):** items 166 (religion/language/amenities) + 168 (Census 2001)
  PARKED — data not acquirable from the server (todos 112/113). Integrate iter-15 DEFERRED
  — tracker gate gap: a locked item can't be dropped-with-reason (todos 114 mapsofbharat,
  115 ottomate). Independent #18 verifier still required pre-integrate.
**Next session pick-up:** acquire 166/168 data OR fix the tracker gate (todo 115), then run
  the #18 verifier + integrate iter-15 (todo 114).

## Session 2026-07-01 — iter-15 integrate + Stage 4 economy/labour expansion

**Stage:** Stage 4 (iterate) — closed out iter-15, shipped iter-50 (3 new data verticals).
**What changed:**
- **Integrated iter-15 → main** (was blocked). Independent verifier on the #18 fix: AC1/3/4/5 PASS
  (Aizawl pop 411,735, crime 615.0, national total exact, pytest 8/8); AC2 (Saitual standalone rows)
  accepted-as-attribution — Saitual is a 2019 district absent from 2011 geometry, its population folds
  into the 2011 parent (adr-013). Items 166 & 168 deferred-with-reason (todos 112/113). Canonical
  standard-CI-template ci.yml landed on main (todo 4). Re-picked 6 component slots; 1 (rankings-table) honest-skip (todo 105).
- **iter-50 — economy + labour expansion (26 → 36 metrics):**
  - `ingest_plfs.py` — 3 state labour metrics (unemployment 2023-24, WPR 2022-23, LFPR 2020-21) via data.gov.in OGD.
  - `ingest_rbi_fiscal.py` — 5 state fiscal metrics (per-capita NSDP FY24-25 + gsdp_growth + deficit/own-tax/debt %GSDP), ratios computed with ₹Lakh↔₹Crore alignment.
  - `ingest_ec13.py` — 2 district metrics (establishments + non-farm employment per 1,000) via the geometric crosswalk (mass-conserving, 100% assigned).
  - All 3 independently verified (reports 267/268/269). New `labour` category renders automatically; live at /api/metrics.

**Decisions:** adr-013 (Saitual attribution), adr-014 (economic data expansion + caveats).
**Commits (main, pushed):** 289ee82 (iter-15 integrate), dcb6994 (iter-50), + mirror commits (71dd162, c87ba53).
**Scouted for roadmap:** Agriculture (data.gov.in APY, on disk, ready), NITI MPI 2023 (PDF on disk, needs bar-chart parser); NDAP rejected (login-wall). Elections/forest/air need user-assisted download (servers unreachable).
**Next session pick-up:** build Agriculture (APY files staged) or write the NITI MPI PDF parser; ECI elections awaiting user download (todo 140). Optional refinements from verifiers: RBI debt cross-year GSDP for 6 states; PLFS LFPR refresh when a newer persons series lands.

## Session 2026-07-03 — iter-58 ingestion wave (11 verticals, 23 new metrics)

**Stage:** Stage 4 (iterate) — items 419-431: metrics table 36 → 59, five new Atlas categories.
**What changed (branch iter-58-2026-07-03):**
- `ingest_census_a01.py` — pop_density + urban_pct (733 districts + 36 states, crosswalk replay,
  median diff vs pop_total 0.000%) + official state `area_km2` (Top-10-Area cohort feed).
  Spot: Delhi 11,320/km², India urban 31.14%, Rajasthan 342,239 km² (largest).
- `ingest_religion_c01.py` — 6 religion shares (733d+36s) from the 35 C-01 workbooks; post-2011
  splits by population-weighted parent attribution via the crosswalk (documented). Spot: Punjab
  Sikh 57.7, Kerala Muslim 26.6, Mizoram Christian 87.2. Tripura workbook prints districts
  without the "District -" prefix → rows selected by MDDS code, all 640 of 640.
- `ingest_ls2024.py` — voter_turnout_ls2024 (36s; ECI Report 12 read with xlrd
  ignore_workbook_corruption — OLE quirk, stream intact). National 66.10%, Lakshadweep 84.98.
- `ingest_hces.py` — mpce_rural/mpce_urban (36s each) from HCES 2023-24 Statement 7 (WITHOUT
  imputation; All-India 4,122/6,996 asserted).
- `ingest_adsi.py` — suicide_rate (36s). DEVIATION: raw file named ADSI-2022 is the 2023
  edition; 2023 table ingested (national 12.3, Sikkim 40.2, A&N highest 49.6); the brief's 2022
  spot values (12.4/43.1) asserted present in LIST-2.3.
- `ingest_morth.py` — road_accident_death_rate (36s), 2023 deaths / Census-2011 pop (documented
  like crime); state sum == 172,890 gate; Daman & Diu NA → merged-UT row (disclosed).
- `ingest_udise.py` — udise_ger_secondary / udise_dropout_secondary / udise_ptr_secondary
  (36s each; India 78.7 / 11.5 / 15 asserted). District level auth-walled (noted).
- `ingest_trai.py` — teledensity + internet_subs_per_100 (36s each, QE Dec-25). TRAI's own
  State/UT tables used — circle→state attribution is TRAI's (metro circles folded, UPE+UPW
  combined, NE broken out); no state skipped, no local apportionment invented.
- `ingest_cea.py` — percapita_power_kwh FY24 (36s). DEVIATION: Table 9.9 (utilities+non-utilities,
  All-India 1,400) instead of the brief's 9.7 (utilities-only 967 — contradicts its own
  spot-truth). J&K+Ladakh combined row applied to both (disclosed).
- `ingest_jjm.py` — tap_water_pct (726 districts + 34 states, snapshot 2026-07-03). JJM-name
  match 729/754 = 96.7%; 25 unmatched are post-geometry new districts (logged, not guessed,
  still in state sums); state = household-sum ratio, never an average of percentages; Delhi &
  Chandigarh absent from the JJM CSV (no rural reporting). National 82.1%.
- `ingest_tourism.py` — tourist_visits_domestic/foreign 2024 (36s each) from the 2025
  compendium Table 4.1.2 (newer year than the 2024 edition); serial-keyed parse, Overall-row
  sums asserted; UP leads domestic (646.8M). Delhi/Maharashtra 2024 are MoT estimates (noted).
- UI (items 420+431): `components/india-map.tsx` third cohort "Top 10 · Area" (mirrors
  pop/nsdp); `components/atlas/cats.ts` +elections/society/safety/infrastructure/education
  (accents/icons/desc); `lib/breaks.ts` SUGGESTED_PALETTE safety→rdbuDiv, infrastructure→viridis.
**Checks:** pytest 8/8 after every vertical; expectations.json regenerated (59 metrics, 733
districts, 36 per-metric entries); typecheck + next build clean; Playwright 11/11 vs :3100.
**Next session pick-up:** consider a 2011→current alias pack for the ~25 post-geometry new
districts (JJM logged list is the seed); NCRB city-series and UDISE district cards still parked.

## Session 2026-07-03 — Atlas overhaul + data-quality + ingestion wave

**Iterations this session:** 51 (Atlas UI overhaul), 52 (data-quality fixes), 53 (13 UI comments), 58 (ingestion wave).
**Outcome:** site 36 to 59 metrics, 6 to 11 topics; Atlas editorial UI live; all four iterations verified (7/7, 4/4, 7/7, 13/13) and deployed to https://mapsofbharat.vault7a.xyz.

**What changed:**
- iter-51: full UI revamp to Atlas dark-editorial (masthead, chooser modal, floating panels, ranking rail, compare THE GAP, palette set, jenks scale); retired CSV/geolocation/value-range/light-theme (adr-015).
- iter-52: Sikkim restored to crime via 2021 rename crosswalk; PLFS aligned to one round (2023-24); NFHS immunization 443 to 660 via negative-encoding recovery; crime_women_rate switched to per-lakh-women; Telangana cyber 27.8 to 43.8 after recovering Cyberabad's 5,424 dropped rows.
- iter-53: PNG blank fixed (MapLibre v5 canvasContextAttributes), jenks default, palette overhaul (added Sunset/Red-Blue/Earth, removed Blues/YlGnBu/Plasma), Escape-to-India, rail search, floating profile, bigger panels.
- iter-58: 11 new adapters, 23 metrics — density+urban+area (Top-10-Area cohort live), religion x6 district, LS-2024 turnout, MPCE x2, suicide rate, road deaths, UDISE x3, teledensity+internet, per-capita power, tap water 726 districts, tourism x2; 5 new chooser categories.

**Decisions:** adr-015 (Atlas UI overhaul). Two data deviations upheld by verifier: ADSI file is the 2023 edition (ingested as 2023); CEA Table 9.9 used over 9.7 (9.7 was utilities-only and contradicted the known national per-capita figure).

**Friction (systemic):**
- tooling: sub-agent session-capacity caps interrupted 3 agents mid-run (acquisition x2, iter-58 coder). Mitigation adopted: per-vertical commits so caps never lose finished work; resume-from-transcript worked each time.
- api-change: MapLibre v5 moved preserveDrawingBuffer under canvasContextAttributes; silent blank PNG for a full iteration until user reported it.
- tooling: an integrate script used the wrong todo route (PATCH /api/projects/slug/todos vs PATCH /api/todos/id) and left 150-153 open despite delivery; caught and fixed. Correct close route is PATCH /api/todos/id.
- env-limitation: server is network-blocked from tourism.gov.in, trai.gov.in, ECI, censusindia, fsi, cpcb; working pattern is local-download then scp. The data.gov.in S3 bucket ogd20 returns 403 to all automation.
- data-mismatch: RBI QSDCB district banking unobtainable (SAP login wall plus broken legacy TLS); UDISE district auth-walled; both shipped or parked at state level with disclosure.

**Anti-gaslight surface at packup (pre-existing, not this session):** 12 original features lack feature_claims/acceptance-criteria rows and carry stale feature-level verification (June). Work IS independently verified, but this session's verifier reports were logged against iteration-item ids, not feature ids. Tracked as a ledger-hygiene todo.

**Next session pickup:** build agriculture (todo 141, file on disk) / poverty (142, NITI MPI PDF) / environment (143, needs user downloads) verticals; PC-level election turnout; default_scale cleanup (154); or ledger-hygiene backfill.
- 2026-07-15 iter-74 item 577 (observation): "Maps of Bharat" wordmark/title is a placeholder — final product name to be decided in a future branding pass. No code change.

## Session 2026-07-15 — social export mode (4 iterations)

**Stage:** Stage 4 — iterations 71, 72, 74, 76 (19 items, all verified + integrated)
**Duration:** ~2h15m
**What changed:**
- iter-71 (8 items): social export mode shipped — feat-social-export (child of feat-export-share), lib/social-export.ts canvas compositor (4:5/1:1 @2x, mainland+insets, value labels+leaders, editorial headline, anchor stat, jenks-5 legend with K/L/Cr, brand block, ink+paper themes), CARD dialog in toolbar, e2e spec
- iter-72 (4 items): label x-clamp (DNH&DD), inset values, legacy PNG button + composePng removed (CARD sole export, AC 273 reworded), viewport-responsive preview
- iter-74 (5 items): Lakshadweep dot archipelago (source geojson is a degenerate 4-pt polygon — todo 196), 19/13px labels + 12.5px legend for mobile, brand top-right with anchor below (site URL dropped), year out of subtitle (AC 513 reworded), title-placeholder observation logged
- iter-76 (2 items): dense/district cards use numbered rank markers + HIGHEST/LOWEST panels (no on-map text labels), no-data hatched map+legend (AC 512 reworded); new district-card e2e

**Decisions:** none (feature additions/fixes; taste picks recorded in trace reports: paper almanac theme, @mapsofbharat brand, rank markers + panels)
**Friction:**
- API-change: `/api/reports/<id>/classify` wants `item_type` + flat `target_kind`/`target_id` — prompts/classify-text.md documents `type` + nested `target` (drift; todo filed on ottomate)
- API-change: item `build-status` silently ignores `verifier-pending` (stays `building`; only verifier-result advances) — stage-4 ref table overstates the enum (same todo)
- API-change: `verification_reports.target_kind` enum is `stage-3-feature|stage-4-iteration-item`; test-runs/deploy-artifacts POSTs return flat `{"id":N}` not nested
- env-limitation: dev server needs explicit DB_PATH (default /data is container-only); orphaned next-server processes held :3111 across kills — kill via ss port-holder lookup
- tooling: server-side AC cap is 5 per feature (forced feat-social-export child split — good outcome)
**Next session context:** social cards shipped + iterated 4x, live at mapsofbharat.vault7a.xyz. Open threads: create the actual @mapsofbharat IG account; inset islands show no rank markers (panels list them); adjacent-district markers can touch; todo 196 proper Lakshadweep geometry; roadmap verticals 141/142/143; default_scale cleanup 154; rails 149; ledger backfill 159.

## Session 2026-07-15/16 — pending-task sweep, dataset expansion, new-district fill (3 iterations)

**Stage:** Stage 4 — iterations 11, 12, 13 (18 items: 17 verified + integrated, 1 deferred)
**Duration:** ~9h
**What changed:**
- iter-11 (5 items): the 5 buildable open to-dos. #154 default_scale — all 59 metrics held palette names ("sequential"/"viridis") the choropleth silently ignores; now data-driven break methods (Fisher-Pearson skew: |g1|>=0.5 -> quantile, else equal) + root cause fixed (region_match.upsert_metric hardcoded "sequential"; ingest_pca "viridis"). #196 Lakshadweep — degenerate 4-pt triangle replaced with curated 10-island MultiPolygon (patch_lakshadweep_geo.py); card inset keeps point symbols. #141 agriculture vertical (APY 2014: rice/wheat/gross-cropped-area; Assam "Paddy" is an exact duplicate of "Rice" — excluded, else double-count). #142 poverty vertical (NITI MPI 2023: HCR/intensity/MPI; the PDF carries an INVISIBLE phantom text layer duplicating the previous state's table — beaten by word-coordinate parsing + a relational checksum MPI=HCR x Intensity, 667/667 pass). #159 ledger hygiene — premise was STALE (all 12 features already had ACs+claims); enriched the 3 thin ones to 3 ACs each.
- iter-12 (10 items, 9 verified + 1 deferred): dataset expansion wave 1, 65 -> 111 metrics, +8 categories. NFHS-5 lifestyle pack (14 district metrics from 100 unused columns already on disk: alcohol/tobacco/obesity/C-section/SRB/teen-mothers/BP/sugar); IMD 2024 climate (rain annual+JJAS, tmax, heatwave-days via point-in-polygon on open NetCDF); Census C-16 language; Census HH-14 assets; GST FY2025-26; ISFR 2023 forest (double checksum per row, 0 rejects); ASER 2024 education; Livestock Census 2019 (35 data.gov.in resources); FR375 veg/non-veg diet. RBI banking DEFERRED (bot-wall).
- iter-13 (3 items): fill post-2011 districts that rendered grey (user report: AP/Telangana). Part A — language + assets re-aggregated from 2011 SUB-DISTRICT data onto current boundaries via the `crosswalk` table (accurate, estimated=0; 628 -> 733 districts each; new districts get their OWN composition: Alluri Sitharama Raju top-lang 71% vs Vizag 93%). Part B — fill_new_districts.py: 2011-parent lineage from the crosswalk, intensive/rate survey metrics inherited from the largest-pop sibling with estimated=1 (1494 fills / ~103 districts; Anakapalli 33 -> 73 metrics); absolute COUNTS never inherited. Part C — estimated surfaced end-to-end: /api/metrics estimated map + real-only stats, /api/region rankless + estimated_from parent, map diagonal-hatch overlay + tooltip, right-rail "est." badge + footnote.

**Decisions:** adr-017 (agriculture + poverty vertical expansion), adr-018 (fill post-2011 districts: exact crosswalk re-aggregation + flagged sibling inheritance)
**Friction:**
- data-mismatch: NITI MPI 2023 PDF has an invisible phantom text layer (previous state's table) at the same coords; extract_text interleaves them character-wise ("BaAkrsaaria" = Baksa+Araria). Only word-matrix filtering (phantom m0~=7.74 non-square) + a relational checksum made it trustworthy. Expect the same in other NITI/NFHS PDFs.
- data-mismatch: ASER's Uttar Pradesh PDF is the only 2-page file — the adapter read page 1 only and silently dropped 35 districts (Lucknow/Varanasi/Prayagraj). Caught by the verifier, not by any gate. Never assume one-page-per-state.
- data-mismatch: livestock counts — filtering `v > 0` dropped genuine-zero-buffalo districts (Ladakh + 16 cold-desert/NE). True zeros are data; only None is missing.
- env-limitation: Radware bot-wall (rbidocs.rbi.org.in) and 403s (npci.org.in, incometaxindia, www.data.gov.in pages) defeat BOTH the server and headless local curl — genuinely browser-only. But censusindia NADA + data.gov.in API resources ARE reachable from the LOCAL machine even when the server gets 000, so local-fetch + scp is a real third option worth trying before declaring blocked.
- env-limitation: cpcb.nic.in refuses connection from the server (confirmed ECONNREFUSED).
- tooling: datagov_pull.py's socket timeout is too short for api.data.gov.in (all 35 livestock pulls failed); plain curl with the key worked. `/api/todos` title cap is 300 chars.
- tooling: verification_reports get written TWICE per item (explicit POST + verifier-result endpoint both insert) — task chip filed on the ottomate app.
**Next session context:** 111 metrics / 735 districts, 18 categories, live at mapsofbharat.vault7a.xyz. New districts now filled + hatched (adr-018) — a human eyeball of the hatch on the live choropleth is still advisable (not headlessly verifiable). Everything buildable-without-the-user is done; the 8 open to-dos are user-assisted acquisitions or decisions: RBI banking 206 (bot-wall, files -> raw-new/finance/ then ~30min adapter), CPCB air 201, Vahan EV 202, NPCI UPI 203, SHRUG NonCommercial license decision 204 (unlocks night-lights + todo 113 Census-2001), plus rails 149 (as-reported-year toggle) and parked 157 (RBI QSDCB registration). Wave-1b quick wins never locked: NTCA tiger/elephant, NDDB milk, PPAC fuel, EPFO payroll, MNRE solar — all server-fetchable, ~1 iteration.

## Session 2026-07-16 (afternoon) — Stage 4 × 2: the hatch eyeball, and what it turned over

**Stage:** Stage 4 iterate — iter-14 (id 84) + iter-15 (id 87), both integrated
**Duration:** ~3 h

**What changed:**

- **iter-14 (2 items): the estimate hatch, dropped rather than fixed.** Last session's pickup was "human eyeball of the hatch" — item 600 shipped with `mandatory_user_review=true` and its verifier's note "human eyeball of hatch advisable (non-headless)". The owner looked and asked *"what is hatch"*: it was invisible. Measured against the navyYellow ramp, `rgb(20,22,28)` @ effective alpha 0.425 scores **1.09:1** on `#16263e` and **2.57:1** at best on `#f0d64f` — never reaching the 3:1 WCAG floor on any band, and all 5 Arunachal estimates sit in the dark half. Geometry compounded it: an 8px tile at `pixelRatio: 2` = ~2 CSS px line period, which aliases to flat tone. It was wired perfectly and communicated nothing.
  The owner then challenged the premise — why mark ambiently at all? — and the numbers backed them: inheritance is 1494 cells / 102 districts = **2.7% of district data**, yet an ASER map hatches **74 of 622 districts (12% of India)**; and we render NFHS sampling error flat, so singling out inheritance was never a principled line. Item 610 **deferred with reason**; adr-019. Estimates now disclose at point-of-use.
  Item 611 built the rail badge, then the verifier found **three surfaces disagreeing** about whether an inherited value has a rank: rail said `#11 … est.`, hover said "estimated from parent", `/api/region` said rankless out of 660. Owner chose one rule; the rail now de-ranks (real districts 1..N, em dash for estimates, real-only denominators). **`RegionProfile`'s `rank ?? 1` fallback was removed — left in, it would have announced every inherited value as "Rank 1 of 25 — ahead of 100%" the moment `rankOf` stopped ranking estimates.**

- **iter-15 (2 items): the citation bug, fixed at the root.** `fill_new_districts.py` derived the citation with one rule (`max(rs, key=pop)` — largest-pop sibling of the whole group, metric-blind) and filled with another (`max(holders, key=pop)` — largest-pop sibling *holding real data for that (metric, year)*). Of 102 inheriting districts: 79 correct, **16 with no citation at all** (panel rendered "estimated from ____" — Amethi, Chengalpattu w/ 27 values, NTR, Warangal Urban…), **4 naming the wrong donor** (Konaseema cited Kakinada, inherited from East Godavari), **17 bogus rows** on entirely-real districts (Krishna cited NTR), and 3 multi-donor districts fitting no category.
  The **key** was wrong, not just the rule: 4 districts (Mancherial, Komaram Bheem, Jangaon, Mulugu) inherit from **two** donors by metric — Mancherial takes crime from Nirmal and ASER from Adilabad — which `region_code PRIMARY KEY` cannot hold. Donor is now recorded **inside the fill loop from the same `src` the INSERT used** (divergence impossible by construction), table re-keyed `(region_code, metric_id, year)`. 1494 citations for 1494 fills. `/api/region` returns per-row `estimated_from` + `estimated_parents`. **Values provably unchanged** — 0 diffs vs `bak-iter15`. adr-020.

**Decisions:** adr-019 (estimate disclosure at point-of-use, supersedes adr-018 Part C in part), adr-020 (every estimated number cites the district it actually came from)

**Friction:**
- **process (the big one): item 617 needed THREE verifier passes, and the code was right on pass 1.** Both ITERATEs were **false claims I wrote in comments about correct code** — first inventing a "Nirmal inherits back from Mancherial" cycle (Nirmal cites only Adilabad, zero Mancherial), then, *in the very comment fixing that*, claiming "a region_code PRIMARY KEY cannot hold either shape" when reciprocity fits the old key fine (all 12 reciprocal-pair members are single-donor; only the 4 multi-donor districts defeat it). Same failure mode twice in one file. Prose *about* code needs the same evidence bar as the code — a comment that states a relationship is a claim, and nothing was checking claims in comments.
- **process: adr-020 was cited 6× in shipped code before it existed** (docstring, an assert message, a print users see every run, route.ts, right-rail.tsx). Project convention is ADR-first (adr-018, adr-019 each landed before their code); this one didn't and nothing caught it but the verifier. Consider a grep gate: every `adr-NNN` in code resolves to a decision body.
- **tooling: the quick-resume path skips `task-tracking.md`, whose line 14 documents the 300-char `title` cap — so I hit it twice.** 6 of 7 to-dos were rejected and the POST response carried **no id and no error my script surfaced**; I nearly reported them as logged. Fix on the skill side: pre-flight length before POSTing, and re-read from the server rather than trusting POST responses. Recurring: this exact cap is already in last session's friction list.
- **tooling: POST responses don't echo what you wrote.** `feature-claims` PATCH returned `reconciler_id: None`, `skill-events` returned `id: None` — both had actually persisted correctly. Always re-read via GET before reporting; a "failed" write here is usually a response-shape mismatch, not a failure.
- **tooling: `GET /api/reports/[id]` does not exist** — only `GET /api/projects/[slug]/reports` (the list). The inventory has this right; I guessed and got a 404.
- **tooling: `scp` to paths containing `[brackets]`** (`app/api/region/[code]/route.ts`) fails no matter the escaping — stage to `/tmp` then `cp` on the server.
- **tooling: `%` in a Python `%`-format string** — the trace report's "ahead of 100%" blew up `finish.py`. Use `.replace()` for token substitution in long prose.
- **verification (good news): the verifiers earned their keep three times.** One proved my invariants were theatre by **mutating `max(holders)` → `min(holders)`** — producing systematically wrong donors — and watching all four asserts still print OK. Another caught a latent bug in fresh code: the route keyed donors on `metrics.year` while the pipeline writes `metric_values.year`; they agree today but 36 rows already disagree elsewhere, so the first drift would have silently nulled every citation. Both verifiers drove real headless Chromium and read the rendered DOM — unlike item 600's, which approved on wiring alone and shipped something invisible.

**Next session context:** 111 metrics / 735 districts live at mapsofbharat.vault7a.xyz. The map now reads clean — no ambient hatch; estimates disclose in the rail (badged + de-ranked), the hover, and the region panel (naming the right parent per metric). **Nothing tests any of it** — the 14/14 suite is blind to both iterations, which is why both claims reconciled as `partial` and not `verified` (to-do 216). 12 features carry `stale-verification` (SOFT, pre-existing).
Natural next: **to-do 214** — the vs-avg legend still contradicts the scale it labels (`recolor()` means over real values only, `scopeMean` averages all entries; Arunachal coloured ~66.485 while the legend reads "avg 64.9"; nationwide 77.42 vs API 77.68). Same root cause as 611 — a mean over copies. Then **216** (test coverage, so the next regression doesn't need a human), **221** (per-row donor is hover-only; touch users never get the metric→parent map, on `target_devices=both`), **222** (rail + map hover still say the generic "the parent district" — they read `/api/metrics`, not `/api/region`). Also still open: the user-assisted acquisitions (206 RBI, 201 CPCB, 202 Vahan, 203 NPCI, 204 SHRUG licence) and wave-1b server-fetchable quick wins (NTCA tiger, NDDB milk, PPAC fuel, EPFO, MNRE solar). **218** is the interesting one: grade inheritances by child-vs-donor similarity (we have real `urban_pct` per district — NTR is 58.7% urban vs Krishna's 27.8%, so that estimate is weak; Shi Yomi from West Siang is fine) and surface only the shaky ones.


---

## 2026-07-18 — iter-98 "complete all": 9 items, 9/9 verified, merged at cba7f30

**Session directive:** "of all the open todos how many you need my help, get that help now and once that is done complete all." Decisions collected up front: 244 = rank projections with badge (→ adr-023); 218 = keep parked; 201 = UrbanEmissions over CPCB browser work; 204 = **SHRUG declined** (CC BY-NC-SA NonCommercial is incompatible with running ads; zero current metrics predate 2011, so nothing was lost — 113 closed as won't-do).

**Shipped (one commit per item, per the new convention itself):**
- **669** Playwright workers capped at 2 (`PW_WORKERS` overrides) — the flakiness to-do 253 closed.
- **668** `scripts/check-adr-refs.sh` CI gate — **first run immediately caught adr-021/adr-022 cited 37× with a stale mirror index**; entries restored from the tracker's own rows. The gate to-do 245's proposal, built and mutation-tested (adr-999 injection fails CI).
- **670** one-commit-per-item documented in CODING_GUIDELINES (to-do 252).
- **665** item 644's AC mapping reconciled (target → feat-rankings-stats, audit transition row) + AC 523 finally covered (`tests/methodology.spec.ts`, strict every-metric form). To-do 254.
- **666** `scopeMin/scopeMax` join `scopeMean` on `countsInStats` — one membership rule for the whole legend (to-do 255).
- **672 / adr-023** ranks follow stats membership: projected (BE/RE) states rank **with badge and disclosure clause**; copies never rank. Fiscal metrics went from em dash on 30/31 states to full 31-state rankings. Answers question 244 that adr-022 deliberately parked.
- **671** the **as-reported-2011 toggle** — adr-003's last unbuilt must-have (to-do 149, deferred since iter-51). Data read straight off the ORGI PCA district/state rows (no crosswalk, census-exact to the person: 1,210,854,977 at both levels); vintage polygons dissolved from our own committed geometry (**no SHRUG**, honouring the 204 decision); Delhi whole as "Delhi (NCT)", Mumbai City+Suburban merged at raw counts, Mahe folded to host; PoK passthrough keeps the SoI outline. View-only by design: drill/select/compare stay current-day and say why. URL `vin=2011`.
- **673** environment vertical completed: `pm25_satellite` from UrbanEmissions (609 direct via `censuscode` — NOT `DT_CEN_CD`, which is within-state and collapses 641→72 keys; the adapter's ≥580 assert caught exactly that on first run), 102 inherited with donors cited, Delhi = UE's own NCT row. 112 metrics, expectations rebaselined.
- **667** committed interaction tests: AC 271 (VS AVG toggle), 525/526 (region panel, both levels, moving selection), adr-023 pins, and the social-card footnote via a **committed** fillText interception. Suite now 33 specs, 33/33 at 2 workers in 21s.

**Verification:** 9 independent verifier sub-agents (locked-manifest+diff inputs), 9/9 APPROVE, reports 566–574; claims 193–198 reconciled `verified`; test_run 104. Verifier hygiene that paid off: 667's verifier proved the specs fail against a dead port; 668's ran the live mutation; 671's wrote, ran and removed its own probe spec; 673's re-derived every number from the raw xlsx.

**Acquisitions this session (browser via claude-in-chrome, no user hands needed):** RBI Handbook T152/155/156 via rbi.org.in (rbidocs bot-wall bypassed in-browser) → `raw-new/finance/`; NPCI UPI **district-level** statewise sheet (the tab exists on the ecosystem-statistics page, easy to miss) → `raw-new/payments/`; Vahan state×fuel CY2025 + CY2026-partial via dashboard export (Y-Axis=State exists) → `raw-new/transport/` + MoRTH Table 20.4 vehicle stock 2001+. **Sibling-session junk quarantined:** the 07-15 `rbi_hbs2025_T15*.xlsx` were Radware TSPD challenge HTML saved as .xlsx — always `file(1)` acquisitions.

**Friction:**
- The tracker to-do title 300-char cap bit twice more (same as last session's note) — pre-flight the length.
- `git push` to the server repo is refused while a worktree holds the branch — detach the worktree HEAD first.
- MoSPI MCP connector added mid-session doesn't join a running session; once it appeared it proved rich (25 datasets, 500+ indicators, headless PLFS/CPI/UDISE/MNRE/EC/HCES) — to-do filed for an API-ingest iteration.

**Next session context:** 112 metrics / 735 districts / 33-spec suite. Open: to-do 260 (ingestion adapters for the browser haul + GST files), MoSPI API-ingest iteration, 218 (grade inheritances, parked), 157 (RBI QSDCB, needs user registration), 156-related wave-1b quick wins.

## Session 2026-07-18 (pm) — brand identity + card redesign + capacity hardening

**Stage:** Stage 4 — three iterations (100, 101, 102), all integrated + deployed.
**Duration:** ~multi-part (user reviewing between tasks).

**What changed:**
- **iter-100 (items 676–681) — brand identity.** The site was on 100% create-next-app scaffold branding. Wired the user's 3 Canva brand assets (MB circular badge, wordmark lockup, mark) into: real favicon.ico (25931B default → 6235B) + `app/icon.png`; apple-icon 180 + `app/manifest.ts` (192/512 any+maskable); 1200×630 `opengraph-image`/`twitter-image` + full openGraph/twitter/metadataBase in `layout.tsx`; masthead `<span>MB</span>` → real mark; social-card typographic MB box → dark disc via drawImage (theme-safe, both ink+paper); removed 5 scaffold SVGs. Assets derived with Pillow (circular-mask disc, black→transparent mark, seamless OG). Correction logged: header + cards were NOT "unbranded" — they used a typographic MB placeholder (reported to user, framing fixed). Deferred (documented, not silent): true-vector `icon.svg` → to-do 268.
- **iter-101 (items 682–686) — social card redesign** from user voice feedback + annotated screenshot. LOWEST panel overlap fixed: national-average moved under the headline; HIGHEST/LOWEST became twin top-right tables (accent vs plain frame); map frame now starts below the header band (overlap impossible). Always-on top-8/bottom-3 rank bubbles removed → opt-in markers (none/extremes/top3/match, **default none**) with pairwise dodge + leader lines. Dialog gained TABLE ROWS 3/5/7/10 (**default 7**, picked by user from live 5/7/10 comparison renders), MAP MARKERS control, tap-to-toggle accent-word chips (any word, not just last). Brand block sized up (mark 36→46, wordmark 16→19). Handle changed **@mapsofbharat → @maps_of_bharat** in card + twitter metadata.
- **iter-102 (items 687–689) — capacity trio** (from the morning's capacity review). Container caps `cpus:4 mem_limit:2g` in compose (uncapped on shared 47-container box); `Cache-Control public max-age=300 s-maxage=86400 swr=604800` on GET /api/(metrics|region|regions) in middleware (health/log uncached); regex guard `^\d{1,2}(_\d{1,5})?$` on the region-code param before the DB. Closed to-dos 269/270/271.

**Also delivered (not a code iteration):** full data-audit page — `data-audit-2026-07-18.html` in the project desktop folder (118 live metrics across 18 categories + 9 pending raw-new sources + 6 blocked, with fidelity grades A/A-/B+/B and public-interest ratings 1/2/3). And a capacity/security review (i5-14600K/62GB origin behind Cloudflare → hardware is not the constraint).

**Decisions:** no ADRs (all three iterations were asset/feature/infra modifications, not re-wires/revamps).

**Verification:** 3 independent verifier sub-agents (locked-manifest+diff inputs), **14/14 items APPROVE** across the three iterations — reports 576–589; claims 199 (iter-100) + 200 (iter-101) reconciled `verified`; deploy artifacts 47/48. e2e 33/33 held green across all rebuilds. Verifier hygiene that paid off: iter-101's verifier drove the live dialog headless (confirmed default 7 / None / accent chips); iter-102's hammered the rate limiter live (96×429, confirmed 429s stay uncacheable).

**Friction:**
- `scp` to a bracketed path `app/api/region/[code]/route.ts` fails from Git-Bash (glob/escape) — first iter-102 rebuild silently shipped without item 689. Fix: stage to `/tmp` then `mv` on the server. **Recurring-risk: pre-check bracketed paths land before rebuilding.**
- Chrome extension refuses `file://` (rewrites to `https://file://…` → falls back to a live tab). Serve local HTML over `python -m http.server` instead.
- A zombie `next start` held port 3999 across headless-render runs (identical chunk hashes gave it away; MIME errors + disabled buttons downstream). `fuser -k 3999/tcp` before re-launching; prefer `next dev` for one-off renders.
- MoSPI + design MCP servers connect/disconnect mid-session — ambient, ignorable.

**Next session context:** 112 metrics / 735 districts / 33-spec suite, all green. Live at mapsofbharat.vault7a.xyz with full brand chrome + redesigned social cards. Open to-dos: **260** (ingestion adapters for the UPI/Vahan/RBI/GST browser haul — most concrete), **261** (MoSPI API-ingest wave — biggest unlock, district UDISE/PLFS/CPI/NFHS), 268 (vector icon.svg), 218 (grade inheritances — parked), 157 (RBI QSDCB — needs user registration). User-side follow-up from iter-102: add a Cloudflare dashboard Cache Rule so the edge actually caches /api JSON (origin is ready).

---

## Session 2026-07-26/27 — Stage 4 iteration 26 (visual-QA batch → bug wave + first design round)

**Stage:** Stage 4 — iteration 112 (#26). 19 items locked from a DOM-commenter batch; 6 built + verified, 13 not started.
**Duration:** ~11h (overnight, user reviewing between waves).

**Intake:** first **visual-QA batch** through the Task-1 path — 15 DOM comments imported as report 127 (`source='visual-qa'`, per-comment screenshots on the asset volume) and classified into 19 items. The extension's "Send to Ottomate" push had failed silently, so the owner fell back to the zip export; logged against the ottomate project as to-do 333.

**What changed (6 items, 13 commits on `iter-26-2026-07-26`):**
- **750 — chooser topic column had no scroll.** 20 live categories × 58px in a 640px modal meant only ~9 were reachable; everything from labour down (crime, transport, elections, environment, assets, language — ~55 metrics) could not be reached by browsing at all, only via Ctrl-K. Accent bar moved inside the scroller so it tracks the rows.
- **751 — three live categories missing from the taxonomy.** environment/assets/language existed in the metrics table but not in `CAT_ORDER`/`ICON`/`ACCENT`/`DESC`, so each fell back to the demographics person icon with no description. Verifier caught a source misattribution in my own new copy (`air` credited to IMD/FSI when it is UrbanEmissions/APnA) and, extending the same test to the 17 untouched descriptions, found three pre-existing ones → to-dos 336–338.
- **756 — sticky break-method preference.** One click pinned a method globally forever and wrote it into every share link; stuck on equal-interval, `upi_value_per_capita` (skew 4.37) put 682 of 731 districts in class 1. Now scoped per metric, with a degeneracy guard on the automatic path. **Took five fixes and six verifier passes** — see Friction.
- **759 — card and map disagreed.** `social-export.ts` always cut its own jenks-5 while the explorer classed by the live method, so the same metric came out differently coloured on screen and in the exported PNG. The card now inherits the map's actual edges (same adr-022 stats rows).
- **760 — boundary treatment**, via the **first real design round through the variant harness** (see below).
- **764 — popovers had no dismissal.** Cohort dropdown had neither outside-click nor Escape; the scale popover had the same gap. Shared `lib/use-dismiss.ts`; the trigger-outside-the-panel case needed an `ignoreSelector` to avoid a dead toggle.

**Design round (Task 2, first real use):** three boundary treatments — knockout seam / adaptive contrast / ground gap — built on real India geometry and real UPI values, published to a stable Artifact URL. Isolation gate passed first time; the **constraint checker blocked** a genuine defect (all three panels declared the same CSS class names in one document, so the last panel's styles would have silently restyled the others — the set would have differed by more than its declared axis). Owner picked adaptive contrast. Tooling findings → ottomate to-dos 342/343.

**Decisions:** no ADRs (all six were bug fixes or a locked component modification; no re-wire or revamp).

**Verification:** 11 independent verifier passes. 750/759 APPROVE first pass; 751 took 2; 764 took 3; **756 took 6**. Every code fix was ultimately correct; **what kept failing was my own regression tests** — three of them were provably inert (asserting on a locator that is always visible; on a URL param that is null on both code paths). Adopted mid-session and now the rule for this project: **build the broken version, run the test against it, require red.** That control found two more tests that could not fail, and one that still cannot, which is labelled in the spec as a forward guard rather than counted as coverage.

**Friction:**
- **Item 756 produced three successive variants of its own defect, each introduced by the fix for the last.** Root cause of the pattern: four inputs (session pick / URL pin / stored memory / metric default) compete to set one value, and I kept resolving them two at a time. Explicit ranking is what finally held. **Recurring-risk: when a fix relocates a defect twice, stop fixing the instance and enumerate the inputs.**
- **A test that cannot fail is worse than none** — it reads as coverage to the next reader. Negative controls are now mandatory here for any regression guard.
- Research sub-agents that spawn their own children exhausted the 20-agent concurrency budget and then the session limit, killing two of three briefs (animated dataviz, data landscape). Only the choropleth brief survived. **Fix applied: verifier and research prompts now say "do NOT spawn sub-agents".**
- Control trees need `DB_PATH` set explicitly — `data/` is gitignored and `lib/db.ts` defaults to the container path, so a control server returns `[]` from `/api/metrics` and every test dies in `waitForMapReady` at 20s, which looks like a failing test and proves nothing. Cost one invalid control run. → ottomate to-do 343.
- `next dev --turbopack` refuses an out-of-root `node_modules` symlink; plain webpack `next dev` accepts it.
- Python's default text mode on Windows wrote CRLF into a staged file, turning a 71-line diff into a 1379-line whole-file rewrite. Caught before it reached a verifier; commits rebuilt with LF.
- Full-suite runs structurally exceed the 120-req/60s middleware limiter, producing ~1 false failure per run in a different spec each time. Two verifiers independently had to re-classify it. → to-do 341.
- The container is built from the working tree and committed afterwards, so the image can predate its own commit object; a verifier had to bind its conclusions to a `git archive` tree to be sure what it was testing. → to-do 344.

**Next session context:** 13 locked items remain in iteration 112 — 9 UI/card, 3 research, 1 approach question. The natural next cluster is the card work (**762** poster redesign is a `revamp` and wants its own design round; **763** labels-beside-states instead of leader lines; **761** default rows 7→5), and the variant harness is warm now so a second round is much cheaper than the first. Highest-value loose bug found in passing: **to-do 346** — the as-reported-2011 toggle (an adr-003 must-have) paints every state as no-data at state level because the API returns zero-padded st_codes and the app normalises them; district-2011 is fine. The two dead research briefs are worth re-running with the no-grandchildren rule.

## Session 2026-08-03 — OPEN-5 dive + iteration 27 (811 + 812) shipped

**Stage:** Stage 4 (shipped/building). Ottomate iteration 120 = iter #27.
**What changed / SHIPPED (live at d7a01f5):**
- **811 (to-do 348)** — adaptive state-outline is now the DEFAULT (`?outline=fixed` escape hatch, preserved in the shareable URL; also fixed the URL-writer silently stripping `?outline`). Commit `398a818`. Independent verifier APPROVE (#698).
- **812 (to-do 218 Slice 2)** — grade inherited Census-2011 estimates; flag the 12 SHAKY inheritances via a two-floor gate `div>=1.0 AND reach>=1M` (amber "weak match" badge across rail/panel/hover/footnote). Disclosure-only: no value/rank/stat moved. Commit `d7a01f5` (adr-026, idempotent migration `pipeline/migrate_inheritance_grading.py`). DB migrated with backup `data/mapsofbharat.db.bak-iter27-pre-20260803T064214`. Independent verifier APPROVE (#699) — it recomputed the 12 pairs itself.
- **349** — item-760 stroke-invariant Playwright test (`tests/iter26-regressions.spec.ts`), mutation-verified. Commit `2b3cdad`.
- Iteration 120 INTEGRATED; YAML mirror `0dea391`; branch `iter-27-2026-08-03` pushed to Gitea; **container rebuilt from d7a01f5** (public health confirms).

**Decisions:** adr-026-inheritance-grading (curated, cat:reliability). 275 verified CC-BY-NC-SA (SHRUG NonCommercial) — decision stands; site is compliant until ads run.

**Friction (tooling/env):** (1) first 811 coder sub-agent returned empty (0 tool calls) — built by hand instead. (2) `next dev` tests return EMPTY unless `export DB_PATH=/mnt/storage/websites/mapsofbharat/data/mapsofbharat.db` (lib/db.ts defaults to container path `/data/...`, absent on host; .env sets same). (3) `next dev` orphans children on kill — `fuser -k <port>/tcp` before+after, use fresh port. All captured in memory `mapsofbharat-build-test-deploy-ops`.

**Deploy model learned:** Dockerfile `COPY . .` builds the checked-out ref (not `main`); `main` is the integration branch but stalled at iter-25 (07-19); iter-26 + iter-27 run as LIVE branch-previews. main-merge DEFERRED (iter-26 mid-flight — 762 still open).

**Next session context (start here):**
- **762 round-2 (owner picked, spec captured):** owner chose composition **A (Hero Number = preset v3)** MODIFIED — national hero number moved into the **Bay (above the Andamans)**, two rank tables **side-by-side in the Tibet band**. Full build spec: `design/762-social-card-round1/ROUND2-SPEC.md`. Build the preset, render via `design/762-social-card-round1/render.mjs`, show for approval, then wire into `lib/social-export.ts` (+ add poster-export archetype to component-anatomy.json — doctrine rule 40 blocked the iter-26 ledger write).
- **275 RESOLUTION FOUND:** open ads-safe drop-in for the SHRUG crosswalk = **LGD Sub-District table (GODL-India, commercial-OK)** — code-join on `(state_code, census_2011_sub_district_code) -> present-day district_code`, no geometry. Render on geoBoundaries ADM2 / DataMeet districts (CC-BY). Adopt when monetising; email DDL only if that path fails. (Avoid AIKosh subdist polygons = SHRUG re-host, still NC.) DDL email draft delivered to owner.
- **5 open UI comments (08-03 batch)** not yet built: C2 metric-row animations (needs 752-755 picks), C3 category icon, C4/C5 header-label presentation, C6 metric-list-as-cards.
- Open to-dos: 157 (RBI QSDCB export — owner), 275 (defer email), 380 (flaky chooser test iter26-regressions.spec.ts:32).

## Session 2026-08-04/05 — launch planning + decisions (post iter-131)

**Stage:** Stage 4 planning (no product code changed; iter-131 already shipped + integrated earlier this session).
**What happened:**
- Critiqued the external competitive/DV research (files 00–07) against live state; corrected stale claims (124 metrics not ~12; embed already unblocked; adr-027 already decided).
- Consolidated the 16 `cat-*` launch docs (via 4 parallel extraction agents → 164 items) + the viz/data tables (31 items) into one master backlog (195), then a decided, de-duplicated "whole picture" (77 remaining items).
- Ran a full owner decision pass (49-question HTML form) + follow-ups + web research (scheduler, IG aspect, monetisation market). All "needs-a-decision" and "needs-research" items closed.
- Produced the before-launch build plan (3 phases + verification gates) — **approved**.

**Decisions:** captured in `decisions/2026-08-05-launch-decisions-and-plan.md` (domain .in, keep tagline, logo A, CC-BY, no-UGC, paywall line, Postiz, silent-live-until-ready, #384 stays deferred, etc.).
**Artifacts:** `planning/2026-08-05/MoB-master-backlog.csv`, `MoB-the-whole-picture.html`.
**Friction:** none blocking (one API session-limit interruption mid-session; a coder interrupted at commit but the commit had landed — verified).
**Next session context:** BUILD next session. Start **Phase 1** (trust/legal/brand): citation block + boundary self-cert + no-UGC ADR + corrections page. Owner tasks in parallel: buy mapsofbharat.in, secure @maps_of_bharat handles, flip Cloudflare cache rule. Post-launch tracks (product growth / content machine / paid tier v2) recorded as PENDING to-dos.

## Session 2026-08-06 — V1 milestone + V2 hardening slice

**Stage:** Stage 4 (iterate) + a pack of direct fixes / deliverables. Long multi-part session.

**What changed (all verified + deployed unless noted):**
- **iter-32** (Phase-1 batch 1): copyable citation block, boundary self-certification (SoI/DST) + card note, public Corrections page + private token-gated report route; ADR **adr-029** (no-UGC). Two independent verifiers (code + feature); deployed.
- **iter-33** (Phase-1 batch 2): Terms + Privacy pages, cite-all-contributing-sources on export cards (23 multi-source metrics), `hashIp()` extracted + no-raw-IP verified, favicon/avatar from logo A; docs VOICE.md + does-not-claim.md; **adr-028** amended (paywall line). Deployed.
- **Parallel streams A ∥ B** (worktree-isolated): A = governance docs (AGENTS.md canonicity rule, DECISIONS.md 28-ADR register, ROADMAP.md, moderation-policy + response-playbook) — also caught + fixed **adr-028 missing from adr-index**; B = SEO floor (app/robots.ts + app/sitemap.ts, 124 metric URLs), noindex /embed, WhatsApp share. B verified by two CONCURRENT verifiers in separate worktrees. Deployed.
- **#413 (P0)**: 16 wiped 2011 metrics re-ingested (census A-01, religion, assets, language) — all 124/124 metrics serve values (validate_drift OK); `reaggregate.py` DELETE scoped to its own metric_ids + tested (re-run no longer wipes siblings). DB backed up.
- **#404**: promoted 5 planned product features (symbol-choropleth P1, categorical, VSUP, hex/cartogram, bivariate) into features.yaml.
- **#419 + #414**: responsive action toolbar so Compare/Share/WhatsApp reach at every sub-desktop width (fix-loop: max-[480px] → max-[640px] → max-[1024px], each narrower version caught by the feature verifier); legal-copy placeholders finalized. Deployed.
- **#417 / #416**: v0/V1/V2/V3 orientation board + friends-&-family test kit (planning/).
- **#415**: pre-test QA sweep — desktop clean across the 3 critical paths + trust surface; found the mobile explorer layout collapses at phone widths → logged **#424**; first test round set to desktop-only.
- **V2 hardening**: Survey-of-India boundary CI gate (`scripts/check-boundaries.mjs` + golden fingerprint; tested PASS/block-on-Arunachal-drop/restore) wired into the on-push quality job; flaky **#380** fixed (expect.poll on topic-button count).

**Decisions:** adr-029 (no-UGC); adr-028 amendment (paywall = data-access, viewing free); desktop-only first friends&family test with the mobile overhaul (#424) deferred to V2.

**Friction:** (1) `output: standalone` + `next start` serves `/_next/static/*` as 400 → a zombie `next start` on a reused port masqueraded as a code regression; root-caused + the standalone-serve recipe now lives in every verifier brief [tooling]. (2) Todo-title validation rejects `<`/`>` and long strings [API-quirk]. (3) Two off-by-one breakpoint iterations on #419, each caught by the independent feature verifier [verification working as intended].

**Next session context:** V1 done except **#416** (owner runs the desktop test). Next automatable: **#406 perf/a11y audit** or **#424 mobile overhaul**. Owner-gated: **#407** (domain/handles/Cloudflare/CORRECTIONS_ADMIN_TOKEN), **#405** infra (off-box backup target, uptime monitor, warm standby, R2 geometry CDN). Legal: real operator name before public launch.

## Session 2026-08-09 — iteration 35: the 4-Aug comment batch, and a backlog census

**Stage:** Stage 4 (iterate), branch `iter-35-2026-08-09`, served as the live preview.

**What happened.** The session opened on a request for a full inventory of everything ever planned and never built. Reconciling six registers — 13 open to-dos, `features.yaml`, iteration 112, three pending reports, the 5-Aug master backlog CSV (195 rows) and the deduplicated whole-picture (77) — against what actually shipped on 5–6 August produced **110 open items**. Three were invisible to every existing surface: report 154 (the owner's 4-Aug visual-QA batch) had sat **unclassified for five days**, iteration 112 had been stuck at `building` since 26 July, and the analytics plan was specified in full and built in no part.

**Iteration 35** then took the six smallest items from that census. 15 items were extracted from report 154's 12 comments plus one hand-added from to-do #412; **6 locked, 9 soft-rejected pre-lock with reasons**, each carried to a to-do so nothing was dropped silently, and the two comments the owner had marked "drop" were honoured.

- **908 reverse scale** — the control *already existed* in the ⚙ SCALE popover's DIRECTION row, persisted to `?rev=1`. The comment was a discoverability failure, not a missing feature. Built as a second **trigger** on the legend method line wired to the same `useState`, value-mode only (vs-avg paints a fixed diverging ramp that ignores `reverse`, so offering it there would lie).
- **911 / 915 / 917 affordances** — `--faint` 5.02:1 → `--muted` 6.91:1 and hover `--accent` 4.35:1 → `--accent-hover` 5.25:1 on the metrics link (the 4.35 is exactly what the owner's own tool measured); `aria-expanded` added to a disclosure that had none; the clear-selection cross from `--dim` 3.17:1 and a 9.9×17.7 target to 6.91:1 and a 26px square — padding alone had cleared 24px on one axis only.
- **916 widths** — VIEW and LEVEL share a 188px minimum and a right edge; BOUNDARIES is deliberately **off** that minimum.
- **923 corrections dedup** — identical resubmission from the same hashed IP inside 60s collapses onto the stored row under `BEGIN IMMEDIATE`. The key carries location and email, wider than the bug report's wording: a corrected email on a resend is a second, better report.

**Three verifier rounds, and every defect was found by them, not by the coder.** Round 1 BLOCKed on a **table-view regression** — 908 and 911 each added height to a column with ~1px of clearance, so at 1280×720 the legend covered the VIEW row and the table view became unreachable — plus a BOUNDARIES overflow. Round 2 APPROVEd all six items but found that the column fix had introduced a **300px-wide invisible dead zone** over the map that swallowed drags, 76px at 1440×900 and 616px at 1920×1440. Round 3 verified the fix with real mouse drags at all three sizes. Both verifiers hit an API session limit mid-round-3 and were resumed.

They also caught a **tautological test** (`scrollWidth <= clientWidth` on a button, where those are equal by construction — it passed while the thing it guarded was broken), a missing hover-contrast assertion, a reverse control shipped at 20.25px under the 24px floor this same iteration was enforcing, and a **code comment that was plausible and measurably wrong** about why the BOUNDARIES row is safe (the label wraps; the padding is not the mechanism).

**Decisions:** **adr-030** — the component-pick gate applies to new components, not to corrective fixes on existing ones. Recorded as an explicit override rather than relabelling three items to dodge the gate. Curated, no category tag.

**Found while here, not fixed, filed:**
- **#441 launch blocker.** `POST /api/corrections` has answered **503 in production since it shipped in iteration 32** — the container runs as uid 1001 while `/data` is uid 1000 mode 775, so `corrections.db` has never been creatable. Every reader reporting a data error gets a failure. Item 923's dedup is correct but unexercisable in production until that volume permission changes; it was verified only on an isolated server.
- **#454** Saitual district is absent from `region_keys` entirely — Mizoram carries 10 districts where it should have 11, and its two sibling 2019 splits *did* land, so the gap is specific rather than a vintage cutoff. This is the unresolved half of report 18, and the cause is not the crosswalk mis-assignment that report assumed.
- **#440** the sitemap spec is red on `main` too.

**Bookkeeping:** reports 16 and 18 classified and closed with reasons (Aizawl verified fixed at 411,735 against the 50,777 reported in June); iteration 112 unstuck — 762 superseded by iteration 121, 752–755 and 765 deferred-with-reason to to-dos #432 and #455. 14 to-dos filed.

**Friction:** (1) both verifier agents terminated on an API session limit mid-round; resuming them from transcript worked and cost nothing but wall time. (2) The to-do title cap is 300 chars and a POST over it fails with no usable error — hit once. (3) A verifier dispatch of mine named port 8620 for a throwaway server; 8620 is the live Umami dashboard. The agent caught it and routed around it. Ports for scratch servers must be checked against `docker ps` first.

**Next session context:** V1 remains done except #416 (owner runs the desktop test) and #424 (mobile at 390px). The launch-blocking item is now **#441**, which is a permissions change on the volume the canonical DB lives on. `main` is still stalled at iter-25 since 19 July with iterations 26, 27, 28, 35 all running as branch previews — merging it is a standing owner decision this session did not take.
