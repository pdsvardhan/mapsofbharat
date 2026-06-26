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
