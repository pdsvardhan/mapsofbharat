# MapsOfBharat — Iteration Log

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
  adr-020 ci.yml landed on main (todo 4). Re-picked 6 component slots; 1 (rankings-table) honest-skip (todo 105).
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
