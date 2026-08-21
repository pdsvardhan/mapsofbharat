# MapsOfBharat — Iteration Log

## 2026-08-10 — iter-36: first locked design round, a11y + SEO floors, mobile unblocked (branch iter-36-2026-08-10)

**Ask:** run a design round on the report-154 remainder, then — after the backlog was listed — "complete all this session" against 15 named to-dos. 13 shipped; 2 were never mine to do (#416 needs five humans, #407 needs the owner's card and identity, and there are no Cloudflare credentials on the box either).

**The design round — the project's first decisions ever recorded.** `metric-row-cluster`, cluster scope, desktop-first, profile P3 set explicitly (it was unset, so every prior round silently ran at the most permissive floor on a public site). Three prerequisites had to land first: the repo had **zero `data-oid`/`data-role` stamps**, so `decompose()` found no parts and the mechanical fallback proposed animation helper classes plus one invalid record; the stored ledger context belonged to iter-26's social card ("phone in a feed"), and `contextGate` passed it because it only checks the four keys are *present*; and `publish-round` would have refused the write exactly as it did for item 762 in July — `anatomy_inline` (R5/F-11) is the supported path for a target the registry does not know.

Round 2 of 3 (density) ran ahead of composeRounds' weight-first default, on the recorded ruling in this log at iter-112 ("do 753 layout before 752 motion") and because every backlog item lived in the density round. Weight and motion are deferred **with explicit owner assent** — the banner's `assentRequired` fired and was answered, not bypassed. Owner picked **Option A single-line**; decisions 80–83 are LOCKED with source hashes, so the regression gate is armed.

**A pipeline defect found and fixed to get there (plugin d9331dd).** `computed-runner.mjs` has documented since R3.2 that the divergence floor must not block a *controlled* round, because such a round is supposed to look near-identical off-axis. That exemption had never once fired: `build-variant-set.mjs` called `runComputedPass`/`blockingFindings`/`formatComputed` without a `roundType`, so `allFindings` always took its `whole-direction` default. It hid behind green tests — `composition-gate-r3.test.mjs` calls `blockingFindings` directly, and nothing covered the integration boundary. Mutation-proved both ways; suites 159/159, 394/394, 41/41.

**Shipped:**

- **a11y floor (470/431/473, bf4c374 + a6ab41a).** The app had **no authored focus indicator at all** — the only `outline` declaration in the stylesheet was `input { outline: none }`, which deleted it from the rail search box and the corrections fields. The new rule is qualified `:root :focus-visible` to win a real cascade race: maplibre-gl.css ships an unscoped `:focus-visible` box-shadow and `india-map` is a `ssr:false` dynamic import, so the vendor stylesheet lands after globals. `--dim` (3.17:1) came off all read text, 74 class uses → 1; accent-as-text → a new `--accent-text` role derived from `--accent-hover`; `--accent-ink` 4.38 → 4.67:1.
- **SEO floor + 440 (bf4c374).** 440 was **sitemap drift, not assertion drift** — 5798345 created sitemap and test together with `/metric` present, 544ca83 rewrote it around a flat path array and dropped it while claiming to include it. Next merges metadata shallowly per top-level key, so `/metric`, `/methodology` and `/coverage` emitted no `og:image` and shared as bare links. `/terms`, `/privacy`, `/corrections` canonicalized to a host that does not resolve — a de-index instruction.
- **Design tokens (474).** `design/mapsofbharat.tokens.json`; the pre-publish contrast gate now RUNS rather than skipping, and encodes the a11y outcome so it cannot regress silently.
- **Export card 430 (54df297).** 918's clipping renamed one region into another. 919's prescribed offset was **overturned by measurement** — 918 alone made the gap worse (13 → 1.5px) and the offset was zero-sum; the real fix was `BLOCK_PAD` in the label placer.
- **Row anatomy (1d54d65)**, **table + toggle (8c2d706)**, **mobile 424 (8c2d706 + 6bab1b5)**.
- **The brand font (54df297): the site had NEVER rendered Hanken Grotesk.** `@theme inline` does not emit custom properties, so `body { font-family: var(--font-sans) }` was dead and fell through to preflight. The `font-sans` utility always worked, which is why it survived from launch.

**Decisions:** design_decisions 80–83 locked (first for this project). No new ADRs.

**Friction:** *tooling* — three agents sharing one repo collided on `.next`, surfacing as both `ENOTEMPTY` and `ENOENT pages-manifest.json`; a full suite run in parallel against one scratch server reports failures that all pass serially (183/0 at `--workers=1`). *tooling* — `pkill -f` with a pattern matching one's own ssh command line kills the session, and a `next start -p NNNN` renames itself to `next-server` so the pattern misses it anyway; kill by PID from `ss -lntp` (to-do 482). *env-limitation* — `tests/corrections.spec.ts` POSTs real submissions and defaults to production; 7 rows landed in the live store and had to be purged through `docker exec`, since the file is uid 1001 and the host user is uid 1000 (to-do 481). *env-limitation* — a scratch server inherits `DB_PATH` from `.env`, which is the **container** path, so its APIs return empty.

**Next session context:** nothing is deployed — the branch is pushed but production still runs the pre-session image, and #424 touches every surface, so the 5-person test (#416) wants a preview first. Open design work: **428 item 913** (metric detail redesign — its rank table is a *region-row* archetype, so the locked metric-row decisions do not govern it and it needs its own round) and **432 item 752** (motion), plus the deferred weight and motion rounds (to-do 472). One SOFT anti-gaslight warning stands: `stale-verification` ×12, features edited since their last verification. All HARD rules are 0.

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
- **668** `scripts/check-adr-refs.sh` CI gate — **first run immediately caught adr-021/adr-022 cited 37× with a stale mirror index**; entries restored from the tracker's own rows. The gate to-do 245's proposal, built and mutation-tested (injecting a synthetic ADR number fails CI).
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

**Next session context:** V1 remains done except #416 (owner runs the desktop test) and #424 (mobile at 390px). The launch-blocking item is now **#441**, which is a permissions change on the volume the canonical DB lives on. `main` is current: this iteration merged into it (fast-forward to `72dfb54`) and the container now builds from `main`.


**Correction (same session, after the entry above was written).** That paragraph originally said `main` was
"still stalled at iter-25 since 19 July with iterations 26, 27, 28, 35 all running as branch previews". That
was **wrong** — it repeated a note from the 2026-08-03 entry as if it were current. `git branch --merged main`
shows `iter-26`, `iter-27`, `iter-28` and `iter-131` were **all** already ancestors of `main`; the 2026-08-06
session merged them. `main` was behind by this iteration alone. It has since been fast-forwarded to `72dfb54`,
pushed, and the container rebuilt from `main` (suite 153 pass / 7 skip / 2 fail, unchanged). The same stale
claim was repeated in iteration 144's trace report and in commit `72dfb54`'s message, neither of which can be
edited in place; this note is the correction of record. Lesson: a "standing decision" quoted from an older log
entry is a claim about the past, not a reading of current state — check `git branch --merged` before repeating
one.

### Addendum (same session, after integrate) — main merged, and #441 fixed

**`main` merged.** Fast-forwarded to `72dfb54`, pushed, container rebuilt from `main`; suite unchanged. See the correction note above for why the "main is stalled" claim was wrong.

**#441 fixed — and it was two bugs, not one.** The image runs `chown nextjs:nodejs /data`, but the bind mount replaces that directory with the host's, owned uid 1000 mode 775, while the process runs as **uid 1001**. The chown is defeated at mount time (`docker exec … touch /data/.probe` → Permission denied). Casualties:

- `POST /api/corrections` answered **503 on every submission since iteration 32**. `corrections.db` had never been created. A reader reporting a data error got a failure, on a trust surface that shipped verified-green.
- `lib/log.ts` degrades to stdout *by design* when its file sink is unwritable, so `/api/log` had never written `app.log` either. Invisible precisely because quiet degradation is what it was built to do.

Fix: a dedicated `./data-rw` bind owned `1001:pdsv` with setgid — so the owner can read and back it up without root — holding `corrections.db` and `logs/app.log`. `./data` is now mounted **`:ro`**, enforcing what `lib/db.ts` already declares (`readonly` + `query_only`); safe because the canonical DB is in `delete` journal mode and needs no `-wal`/`-shm` sidecars. A host bind rather than a named volume on purpose: reader error reports have trust value and #405's off-box backup work needs to see them.

Verified in production, not inferred: a submission stores a row with a 16-hex `ip_hash` and no raw IP · an identical resubmission returns `duplicate:true` and leaves one row, so **iteration 35's dedup is now exercisable where it never was** · the honeypot stores nothing · `app.log` is written · the canonical DB still serves 124 metrics through the read-only mount. `corrections.spec.ts:54` — one of the two standing failures — now passes. **Suite 154 pass / 7 skip / 1 fail**, the remainder being the sitemap case (#440). Probe rows cleared; the store self-creates on first submission, proven by deleting it and re-posting.

**Still open, and it matters:** `CORRECTIONS_ADMIN_TOKEN` is unset, so the owner-only GET fails closed at 503 — reports are now *stored* but cannot be *read back*, and 7 store-assertion tests skip against the live container. A skip reads as green, which is how this bug survived four days in the first place. To-do **#463**, alongside #407.

**Lesson worth keeping:** every defect this session — the two regressions, the tautological test, the wrong comment, the stale main claim, and this permission bug — was caught by something that *drove the real thing* rather than reasoned about it. The unit suite was green through all of them.

## Session 2026-08-11 — iterations 148 and 149, and the checkers that were not checking

**Stage:** Stage 4 (iterate). Branches `iter-37-2026-08-11` then `iter-38-2026-08-11`; both merged to `main`. Deployed twice — `f58ec05`, then `ffa8962`, which is live.

**The session opened on a backlog census and closed on three shipped iterations.** The first ask was a categorised inventory of everything pending; the work then followed the categories in the order the owner set. What the census could not have predicted is the theme that ran through the whole day: **three separate checkers were reporting success while checking a fraction of what they claimed** — and one of them was written in this session.

**Blocked on shipping (closed).** `iter-36` had been sitting built, tested and unmerged since the previous session, with production still on the pre-session image. Merged and deployed, gated on the full suite run against a container built from the *same* image. That gate immediately paid for itself: 7 corrections tests were **skipping**, not passing, because `CORRECTIONS_ADMIN_TOKEN` was absent from the *runner's* shell rather than the container's. A skip reads as green. Re-run with the token exported: 192/192, zero skips.

**Iteration 148 — to-dos #454, #433, #390.**

- **#454 Saitual** was described as a missing `region_keys` row. It is not. `districts.geojson` holds exactly 735 features against 735 region keys, and there is **no Saitual polygon** — so a key without one would render nowhere and break the one-for-one invariant. Measured before deciding: Mizoram minus its ten districts leaves **0.000 km²**, 2011 Aizawl and present-day Aizawl differ by **0.000 km²** (the parent it was cut from was never actually cut upstream), the official ORGI sub-district PCA returns **0 rows** matching Saitual, and SHRUG has none either — so adr-027's licence rail was not even the binding constraint. Recorded as **adr-031** with the cost published: 28 of 3,587 Mizoram IPC offences and 9,433 JJM households roll up to state rather than district. An invented boundary on a map whose whole claim is Survey-of-India compliance is worse than an absent district.
- **#433 analytics** was filed as "built in no part". It was ~60% built. Six kebab-case events covered seven of the plan's twelve. Renamed to the plan's names and typed as a union so a typo is a build error; added the five that were missing; `embed_loaded` now carries the embedding host (host only — proven by framing `/embed` behind a URL carrying a secret token and finding zero stored rows containing it). Four funnels plus a retention report created via the Umami API, with the creation script committed so a restore can rebuild them. Funnel 4 is a **named proxy**: an Umami step is a url or an event and "return visit" is neither.
- **#390 docs** produced `FEATURES.md` (generated, provenance-headed), `ARCHITECTURE.md` to the arc42 skeleton, and a working doc-lint.

**Iteration 149 — to-dos #491, #496, #498.** Four packages (`drizzle-orm`, `drizzle-kit`, `recharts`, `zustand`) were declared with **zero imports** and removed; adr-007's recorded stack named two of them, so it is **superseded by adr-032** rather than edited — it was a true statement of intent in June. `check-adr-refs.sh` now exits 0: adr-026 was real, cited three times in code, with a body on disk and no index row, while `DECISIONS.md` called it "an unused number (skipped)". And `scripts/check-raw-assets.mjs` now refuses to build without the untracked raw data.

**The three checkers that were not checking.**

1. **doc-lint** reported `CLEAN` and was wrong: it parsed lychee's `fail_map`, but lychee 0.24 emits `error_map`, so the entire link-checking leg was a silent no-op. Proven by mutation *before* the fix — a scratch repo with one deliberately broken link returned CLEAN at `--gate block`, exit 0.
2. **The analytics spec** passed 10/10 while `methodology_viewed` had **never once** reached Umami. It fires at ~86ms; the `afterInteractive` tracker installs `window.umami` at 115–171ms, so the optional-chained call no-opped and the event died in-process. The test could not see it by construction: `addInitScript` installs the spy before any page script, so something is *always* listening. A spy proves the call was MADE, not that anything was LISTENING. `embed_loaded` was not safe either, only lucky — its effect lands at ~304ms and won by bundle weight.
3. **My own raw-asset guard** covered **19 of 27** files. Two helpers build their path with a template literal and are called nine times, so eight real files were invisible to a regex over string literals. The verifier hid one the running image serves with HTTP 200 and watched the guard print `OK` and let the build start. Its own comment claimed it "reads the SAME declaration the route reads". It did not — it scraped source text, and had already drifted by eight files.

All three are fixed and mutation-proven. The guard now transpiles the declaration and imports it, walking the same object the route walks, with the floor set to the exact count rather than a slack margin.

**Verifiers.** Both returned **ITERATE first, APPROVE after** — on both iterations. The feature verifier confirmed the twelve events end-to-end against Umami's own store by probing all 124 metrics on a real build; the code verifier confirmed 27 raw files by an oracle sharing nothing with the guard, and verified inside Docker that `typescript` resolves in the builder stage rather than assuming it. It also withdrew one of its own suggestions on measurement: *"you were right and I was wrong. Do not add them."*

**doc_gate armed, and proven before trusted.** Flipped to `block`, and the first integrate was **refused** with HTTP 400 naming `#937=bug:feature:feat-canonical-store` (R-DOC-10). Arming it also activated three rules that had been *skipped* while it was off — surfacing 11 HARD `unbacked-pass` violations that had stood for months: five flows and six features claiming `test_status='passing'` with nothing linked. Backed with the real tests where they exist, and demoted where they do not — `flow-ingest-dataset` is pytest-covered, not Playwright, and `feat-find-my-district` is a *dropped* feature that was still claiming to pass. HARD violations 11 → 0.

**Sibling sessions.** Three ran concurrently on this box and finished with work uncommitted in the shared tree; verified substantively and committed under their own attribution. That also taught the deploy lesson of the day: an image built from a clean `git worktree` **started, passed its healthcheck, and served HTML 404 for every raw download**, because 825MB of source data is untracked. Production had 27 raw-new entries; that image had 0.

**Design prep.** Round **R2 (weight)** is generated and published — three variants, all gates green, at `/projects/mapsofbharat/design/metric-row-cluster`. R4's blocker turned out to be real and unrecorded: the metric-detail subtree carried **zero design stamps**, so `decompose()` returned no parts and the round had nothing to name. Stamped at `f5379a6`.

**Decisions:** adr-031 (Saitual), adr-032 (no ORM, no chart library; supersedes adr-007). adr-026 registered against its existing body; adr-001–009 repointed at the record that actually holds them.

**Friction:**
- *tooling* — the design toolchain was staged incompletely twice by me (`design-questions.json`, then `preview-build/` and `theming/`), and an agent worked around it from a **stale 2026-07-28 tree**, independently re-deriving a `roundType` fix already made in the plugin that morning. Restaged from the plugin and re-ran every gate before publishing.
- *tooling* — `publish-round.mjs --replace` replaced the HTML but **created a second set of design decisions**; the pick screen would have shown every axis twice. Deleted by hand (#506).
- *tooling* — `design-round.mjs` has no `--theme-file` passthrough, so the theme-contrast gate always SKIPs claiming no theme file exists. This project has had one since iter-36; wiring it by hand turned that SKIP into a PASS (#505).
- *api-limitation* — Ottomate to-do titles are capped at 300 characters, hit four times.

**Next session context:** pick **R2** at `/projects/mapsofbharat/design/metric-row-cluster` (decisions 89–93, proposed). Then R3 motion — which genuinely cannot be pre-generated, because it animates the forms R2 chooses and the isolation gate holds every other axis constant — then R4 on the now-stamped `metric-rank-table`. The full plan, including the three parallel build items (#481, #482, risk 57) with their hazards and required mutation proofs, is at `planning/2026-08-12-next-session-plan.md`. Two SOFT anti-gaslight advisories stand (`stale-verification` ×12, `stale-spec` ×1); all HARD rules are 0.

## Session 2026-08-20 — planning + pre-launch indexing

**Stage:** Stage 4 iterate · iter-41 shipped, then a full planning pass
**What changed:**
- **#525 shipped and live at `d9f92ae`** — the site was deployed but indexable under its
  INTERNAL name: `robots.txt` said `Allow: /`, the home canonical pointed at
  `mapsofbharat.vault7a.xyz`, and the sitemap advertised `mapsofbharat.in`, which does not
  resolve. Added `IS_LAUNCHED` (default UNLAUNCHED, fails safe). While unlaunched:
  `Disallow: /`, no sitemap or host line, and `X-Robots-Tag: noindex, nofollow` on every
  page. `robots.txt` is now `force-dynamic` — Next prerendered it, so a runtime flag flip
  would have moved the header and left robots.txt disagreeing.
- Both launch states PROVEN against two running servers: `SITE_LAUNCHED=true` returns the
  original robots verbatim and drops the header. Switchover is one env var.
- Two existing SEO specs made launch-aware, both branches asserted rather than skipped.
- **Planning pass:** `planning/EXECUTION.md` (5 parallel streams with file ownership),
  `planning/PLAN.md`, and sub-plans for #408 symbol maps, #405 hardening (split 7 ways)
  and #913 metric detail. `planning/TESTING-CHECKLIST.md` accumulates what the owner tests.

**Decisions:** no new ADRs. Owner rulings recorded: design rounds SUSPENDED (author and
show, don't offer options); Ottomate tracker is source of truth with `TASKS.md` generated;
#913 keeps DOM order and changes visual weight only; R2's colour-budget overage accepted;
#410 after launch.

**Friction:**
- *tooling* — SSH heredocs mangled a patch twice. The second time it wrote a literal
  BACKSPACE byte (0x08) where `\b` was intended, producing `/Disallow:\s*\/api\x08/i`,
  a regex that can never match. Write scripts to a file and scp them; never heredoc.
- *tooling* — my own new assertion `/Allow:\s*\//i` was unanchored and matched inside
  `Disallow: /`, so it passed on the opposite state. Anchor regexes that distinguish two
  states.
- *self* — twice counted the wrong thing and reported it: 66 "lint problems" was a grep
  line-count (real figure 64), and "5 HARD anti-gaslight violations" was the number of
  HARD *rules*, all with count 0. Read the field, not the row count.

**Next session context:** **Run Wave 1 of `planning/EXECUTION.md` autonomously.** Owner
instruction: do not check in until Wave 1 is done or context is nearly exhausted. Every
decision needed is already recorded in the banner at the top of that file — do not re-ask.
Start the three Stream R research agents (unattended), then work Stream Q. Branch order
Q → O → S → M; `app/globals.css` is owned by Q alone. Ask before any production deploy.
Ottomate tool work is a separate track (`Desktop/Projects/Ottomate/TASKS.md`); **#237, a
plaintext admin password reused across the media stack, should be done regardless.**

---

## Session 2026-08-20 — Wave 1 and Wave 2, executed autonomously

**Stage:** Stage 4 iterate — research, guards, hardening, two features
**Duration:** ~7 h
**What changed:**

**Stream R — three research agents, two of them ending in a recorded "no".**
- *R1 (#455)* — **0 of 124 metrics have two comparable time points.** Not below a
  threshold: zero. No region is observed twice for any metric; the five metrics with
  several distinct years are RBI fiscal rows where `year` is a per-state vintage stamp.
  The slope chart is **struck permanently**. Transition + small multiples survive and are
  stronger than research/766 assumed — 8 families of 3+ metrics share a unit and geometry,
  three of them part-to-whole sets on all 733 districts.
- *R2 (#386)* — **district election turnout is not honestly derivable.** Three independent
  defeaters: 542 PCs cannot cover 735 districts (≥246 districts, 33.5%, would carry a
  neighbour's value); with the same weight on numerator and denominator the apportionment
  weight **cancels algebraically**, so the output is a resampling of the PC surface, not a
  measurement; and no PC geometry exists in the repo. Unblocked only by assembly-segment
  data, which nests inside districts by the Delimitation Commission's own rule.
- *R3 (#531)* — **rescoped #408 before it was built.** Of the 29 HOTSPOT metrics only 4
  want symbols, 3 want a denominator we already hold, 22 are already rates. Route by unit
  semantics, not the HOTSPOT flag. Also found the pop_density error (see #548) and that
  district `area_km2` is not stored at all.

**Stream Q — six guards, every one mutation-proven.** Q0 generated `../Ottomate/TASKS.md`
from the tracker (kills the second hand-kept copy). Q1 retitled #408. Q2 deleted the
June-dated `PENDING-AND-NEXT-SESSION.md`. Q3 `kill-port.sh` resolves the PID from
`ss -lntp` and refuses container-owned ports without `--force` (8610 is production).
Q4 the corrections spec now proves where it writes and refuses production stores.
Q5 an ESLint rule bans unannotated hex; 111 violations retired, five recurring roles
became real tokens. Q6 refuses an unlayered bare selector in `globals.css`.

**Stream O — 405-A done, 405-B owner-blocked.** Off-box backup script with WAL-safe
snapshots, verified row counts, and a **performed** restore drill (124 metrics, catalogue
identical to production, raw tree at parity). Later reshaped so the raw tree is mirrored
incrementally rather than re-archived nightly: **~1.3 GB instead of ~10 GB**, which is what
turns "choose a storage plan" into "run rclone config".

**Stream S — proportional symbol maps (#408 phase 1)** for the 9 count metrics. Centroids
verified inside their own polygons (a naive centroid falls outside for 7 of 735). Radius
∝ √value in a pure function so the classic bug is unit-testable. Nested-circle legend.
Parity made structural by wrapping `setFeatureState`/`removeFeatureState` once.

**Stream M — #913 metric detail page.** Eight containers became ruled bands, measured
against the live atlas panel. Hierarchy in the three stats. Map fills its frame. The Pro
placeholder reads as unbuilt rather than broken.

**Wave 2 — CI, and the guards that were never wired in.**
- **CI had been failing on every push for weeks and nobody noticed** (runs 753–756 all
  red). The build needed data CI did not have.
- The full 249-test suite now runs on every push against the real database, via read-only
  host mounts on the self-hosted runner. Green in ~4.5 min.
- Lint is a **ratchet** (cannot rise; failing on a fall forces you to bank it).
- **405-C was already built** — the boundary gate has been in CI since #405. What it never
  had was proof it could fire. 6 of 7 mutations caught; the seventh was a real hole
  (a property rename passed as a "reformat", which would blank every state name while the
  gate printed PASS). Closed, now 7/7.
- `/api/health` **could not fail** — it returned a hardcoded "ok", so the container
  healthcheck and any future uptime monitor were both watching something with no failure
  mode. It now opens the store, counts the catalogue, and answers 503.

**Decisions:** no new ADRs. Owner rulings carried forward unchanged.

**Friction:**
- *self* — **my test harness was subtly wrong and produced a credible lie.** It ran
  `next start` against an `output: "standalone"` build, so pages served but the client
  bundle never loaded: 200 of 214 passed and 14 failed in a pattern that looked exactly
  like a regression in my own colour changes. It was not. Serve standalone the way the
  Dockerfile does.
- *self* — **a mutation harness reported "6 of 6 mutations survived" while the tests were
  catching every one.** Two causes, both mine: it piped the run through `tail -4`, cutting
  off Playwright's "N failed" summary before the grep that decided the verdict; and it
  never checked that a mutation had applied. Never truncate before a verdict; always
  assert the mutation landed. Same family as last session's grep-line-count error.
- *tooling* — Python text-mode writes on Windows convert files to CRLF and broke two shell
  scripts. Use `newline=""`, or run the patch on the server.
- *tooling* — `app/metric/[slug]/page.tsx` has **mixed** line endings, so an LF-anchored
  patch silently matched nothing in half the file and applied one of four edits. Recorded
  as #550.
- *self* — reported the M5 consistency sweep as done having completed only half of it. The
  owner's question found it. Re-checking against the plan is not optional.
- *env* — Chromium SIGSEGVs at cold launch with 2 workers in the CI container (2 of 3
  runs). Capped to `PW_WORKERS=1` in CI, which is the same cap to-do 253 already found for
  this box.

**Next session context:** **Start with #549 → #548, then launch.** `pop_density` reads
~100× too high across Ladakh and J&K (Leh 339/km² against a real ~3) because
`ingest_census_a01` divides by the sum of *enumerated* sub-district areas; the adapter's
own comments admit it and the reader is never told. That is a wrong number on a live public
map in a politically sensitive geography, and it should not survive first contact with
inbound traffic. #549 is the cheap sibling: the adapter already computes district area and
discards it, and persisting it makes #548 visible rather than buried.

After that: launch (#499, plus the two owner ops items), then growth — #547 (transitions +
small multiples, now proven buildable), #409, #410.

**Owner-blocked, both needing credentials only they have:** #544 (one `rclone config`; the
backup is now ~1.3 GB so a free tier covers it) and #545 (an external uptime monitor — and
note it only becomes useful *after* a production deploy, since production still runs the
old always-ok health endpoint).

## Session 2026-08-21 — Wave 1+2 deployed, and the density denominator (#548, #549)

**Ask:** deploy Wave 1 and Wave 2, then complete #549 and #548.

**Deploy.** Production moved `d9f92ae` -> `3d1b25b`, gated on a full local run of the
suite against the standalone build (249/249, exit 0) rather than on the previous
session's claim. Verified after the fact from three independent places, because an
image label alone cannot prove what is serving: the label
(`org.opencontainers.image.revision=3d1b25b`), `/api/health` reporting commit
`3d1b25b` **with the new failable `checks` block** — which only Wave 2's code emits,
so it is the new build and not a relabelled old one — and a smoke of six public
routes plus a metric page, sitemap and robots.

*Friction, worth knowing:* the first `docker compose up --build` **hung at `npm ci`
for 10 hours 23 minutes** with the process tree alive at 0% CPU. Buffered compose
output made "still working" and "hung" look identical, and I misread other containers'
CPU as progress. Killed, and relaunched through `scripts/`-style wrapper with
`--progress=plain` and `timeout 1800`, so the same stall is now loud and bounded.
Production was never touched by the hung attempt.

**#548 — a wrong number on a live map, and it was narrower and worse than recorded.**
The to-do said "~100x too high across Ladakh and J&K". Measured: the enumerated-area
denominator was within 2% of the official area for **483 of the 495 districts that have
a comparator**, and catastrophically wrong for **twelve** — Leh 339 against a true 3
(114x), Kargil 750 against 10 (75x), then Doda, Anantnag, Baramulla, Kupwara, Kutch,
Pulwama, Punch, and three within noise. Kutch is not J&K at all; the Rann is real land
no village area counts.

The same column fed the crosswalk-derived states, so **Ladakh was publishing a
geographic area of 582 km²** against a real 59,146, feeding the Atlas area cohort.
J&K published 23,361 against 39,932. That half of the bug was not in the to-do.

**Geometry was tested as the denominator and rejected on measurement.** Geodesic area
from the shipped Survey-of-India polygons matches the official district area within 5%
for only **416 of 495**, against the census sum's 485 — it would have broken 69
districts to fix 12 — and it fails worst where the census fails, because Leh's polygon
includes Aksai Chin: it moves Leh from 339 to 0.9, wrong in the other direction.
Recorded in adr-035.

**Shipped:** official A-01 district area wherever a current district is exactly one
2011 district (511 districts, all twelve broken ones); the crosswalk sum elsewhere
(222); `area_km2` at district level and a new `households` metric, 733d + 36s each.
National households reconciles **exactly** to A-01's INDIA row (249,501,663). Owner
decision: administered area, disclosed in the methodology rather than reconciled
against the drawn boundary.

**A dead end worth recording.** The 222 crosswalk-derived areas were first written as
`estimated=1, estimate_kind='aggregated'`. They vanished: `fill_new_districts.py:131`
deletes **every** district estimate and refills only the inherited ones, so 222 of 733
rows disappeared between the adapter and the fill. The label was wrong anyway —
`aggregated` promises "an exact sum of the underlying rows", true of households, false
of an area column that omits unsurveyed land. Reverted; `region_match.py` ended the
session **byte-identical to where it started**. Per-district provenance for
adapter-written aggregates is a live to-do, not a silent gap.

**Verification.** `tests/density-denominator.spec.ts`, 6 tests, **mutation-proven 6/6**
against a scratch copy of the store so production was never written to. The guard that
outlives the hardcoded numbers is the reconciliation invariant — `density × area` must
return population for every district — and it independently caught the mutation where
only density regressed and the area stayed right. Full suite 255/255, pipeline tests
9/9, `validate_drift` OK.

**Drift baseline:** `regen_expectations.py` re-baselined. The diff is one changed line
(metric_count 124 -> 125) and ten additions — the two new metrics plus **eight
mgnrega/upi metrics the baseline had never tracked**. No existing expectation value was
altered, so nothing was laundered.

**Decisions:** adr-035 (administered-area denominator, curated, cat:reliability).
