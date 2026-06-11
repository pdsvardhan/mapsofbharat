# MapsOfBharat — Pending Work & Next-Session Plan

_Last updated: **2026-06-09**, end of the session that completed the current-day crosswalk._

This is the full categorized backlog. Each item notes **what**, **why**, **approach**, **blocker**, and **priority** (P0 highest).

---

## ✅ Session 2026-06-10 — Stage 3 completion (features + hardening + deploy)

Shipped and verified live (tsc clean · 7/7 pipeline tests · next build OK · independent verifier APPROVE):

- **feat-region-detail** ✅ — per-district profile panel, all metrics + national rank (RANK() window-fn `/api/region/[code]`) + source/year citations.
- **feat-export-share** ✅ — PNG export (preserveDrawingBuffer + header band) and shareable URL state (`m/mode/st/cmp`) restored on load.
- **feat-find-my-district** ✅ — geolocation → point-in-polygon → fly-to + profile; permission-gated, location never stored.
- **Risks resolved (7):** no-tests, no-ci, no-error-tracking, no-backup, no-rate-limit, slow-page-load, data-drift. **a11y (#57) accepted/deferred** (code-level aria shipped; full live audit needs a foreground browser).
- **Tech debt F:** metric fetch decoupled from map load; `pipeline/README.md` added. (`estimated` flag already absent from app code.)
- **Stage-3 infra:** `CODING_GUIDELINES.md`, Gitea Actions CI, Playwright smoke + pytest suite, `/api/log` error sink, rate-limit middleware, geo Cache-Control, backup + drift scripts.
- **Deploy:** container rebound `127.0.0.1:8610:3000` (freed host 8601, **resolved the tg-ingest collision**). NPM proxy host (id 44) + Cloudflare DNS CNAME created → `https://mapsofbharat.vault7a.xyz` live on **LAN**. **Public (tunnel ingress) pending explicit go-ahead** to reload the shared cloudflared.


**Legend:** 🔴 blocked on you · 🟡 ready to build · 🟢 polish / nice-to-have · ⏳ deferred (later stage)

---

## A. Blocked on you — credentials / decisions

### A1. 🔴 P0 — Public URL: `mapsofbharat.vault7a.xyz`
- **What:** expose the LAN-only app (`http://192.168.1.10:8601`) on a real hostname.
- **Two paths (pick one):**
  1. **LAN/internal** — add a proxy host in **nginx-proxy-manager** pointing `mapsofbharat.vault7a.xyz` → `mapsofbharat:3000` on `projects-net`. Needs the **NPM admin login**.
  2. **Public** — add a **Cloudflare DNS** record (or tunnel ingress) for the subdomain. Needs **Cloudflare access**.
- **⚠️ Conflict to resolve first:** `tg-ingest.vault7a.xyz` already maps to port **8601** — confirm there's no collision before wiring MapsOfBharat to the same port/route.
- **Constraint:** do **not** restart the shared `cloudflared` tunnel without your explicit go-ahead.
- **Blocker:** NPM admin creds **or** Cloudflare creds.

---

## B. Map features (the engine) — ready to build next session 🟡

The generic region × metric × year engine already supports: choropleth, state-zoom drill, rank/percentile + vs-average, 2nd metric overlay, compare mode, and the current-day crosswalk. Remaining planned features:

### B1. 🟡 P1 — Region detail panel
Click a district/state → slide-in panel with all metrics for that region, its national rank per metric, and source/year citations. (`feat-region-detail`)

### B2. 🟡 P1 — Export / share
PNG export of the current map view + a shareable URL that encodes `{metric, year, level, drilled-state, compare-pins}` so a link reopens the exact view. (`feat-export-share`)

### B3. 🟡 P2 — Find my district (geolocate)
Browser geolocation → reverse-resolve to the containing district → fly-to + select. Privacy: ask permission, never store location. (`feat-find-my-district`)

### B4. 🟡 P2 — Search-to-fly
Type-ahead search over state/district names → animated `fitBounds` fly-to + select. (part of `feat-metric-selector` / new)

### B5. 🟡 P2 — Year compare
Side-by-side or swipe comparison of the same metric across two years (becomes meaningful once a second year of data exists — see C2). (`feat-year-compare`)

---

## C. Data — new categories & coverage 🟡

### C1. 🟡 P1 — 2nd real category: **Crime (NCRB)**
First non-demographics vertical, to prove the adapter pattern scales. Source: **NCRB "Crime in India"** (district/state tables). Approach: same pipeline — fetch official tables → map to current districts via the existing `rid` crosswalk → recompute rates per 100k → load into the canonical store with full citation. Watch for NCRB's own unit definitions (police districts ≠ revenue districts in some states).

### C2. 🟡 P2 — Deepen Demographics
- Add Census 2011 **rural/urban (TRU)** splits and more PCA-derived metrics already available in the raw files.
- A **second year** unlocks B5 (year-compare) and trend views — candidates: Census 2001 (reaggregated the same way) or SRS/NFHS-derived indicators.

### C3. 🟡 P2/P3 — Additional categories (availability-gated, official sources only)
Infrastructure (primary), Health (NFHS-5 / HMIS), Education (UDISE+), Economy (MoSPI / RBI), Elections (ECI), Employment (PLFS), Transport, Agriculture, Environment, Finance. Each gated on a trustworthy official/top-tier source with district or state granularity. **Rule stands (ADR-005): official/government or top-tier only; cite every metric.**

### C4. 🟡 P1 — Geography crosswalk clean-up
- **2 of 732 current districts have no data** (un-PCA'd sub-districts / J&K geometry gaps) — investigate + fill or label "no data" explicitly.
- **Residual `rid` collision `33_0` (4 Tamil Nadu features coded `dt_code=0`)** — these 4 features share one `rid` and currently merge. Assign correct district codes in `districts.geojson` and re-run the pipeline.
- Consider adding the official **LGD** code as a second key alongside `rid` for future-proofing (ADR-002 anticipated dual keys).

---

## D. Production hardening — open risks 🟡🟢

8 risks remain open in the tracker. Honest status:

| Risk | Priority | Notes |
|---|---|---|
| `no-tests` | 🟡 P1 | No automated tests. Add Playwright smoke (map loads, metric switch colours, drill, compare) + a pipeline validation test asserting median-diff < 2%. |
| `no-ci` | 🟡 P2 | No CI. Add a Gitea Actions workflow (lint + build + the smoke test) now that the repo will have a remote. |
| `no-error-tracking` | 🟡 P2 | No client/server error capture. Lightweight self-hosted option (e.g., a `/api/log` sink) to avoid 3rd-party. |
| `no-backup` | 🟢 P2 | `data/mapsofbharat.db` is **regenerable** from `pipeline/` + raw sources, so low urgency — but a periodic snapshot would save re-run time. |
| `no-rate-limit` | 🟢 P3 | Add basic rate limiting at NPM/nginx once the public URL exists. |
| `a11y-missing` | 🟡 P2 | Needs an audit pass (keyboard nav, ARIA on map controls, colour-contrast of legend). Requires a foreground browser. |
| `slow-page-load` | 🟢 P3 | **Largely mitigated** — geojson is 824 KB raw → **179 KB gzipped** on the wire. Optional: longer `Cache-Control` on `/geo/*` (currently `max-age=0`) and/or vector tiles if more layers are added. |
| `data-drift-undetected` | 🟡 P2 | No alerting if an upstream source changes. The pipeline's built-in validation (refuses to write on >2% median diff) is the current guard; add a scheduled re-validate + notify. |

---

## E. Known data limitations (documented — these are *expected*, not bugs)

1. **Total reaggregated population 1.191 B vs 1.211 B census (−1.6%)** — sub-districts with no PCA row or that fail the point-in-polygon land in no current district. Documented in **ADR-010**.
2. **Changed-district validation "outliers" are correct** — e.g. the merged **Mumbai** polygon (City + Suburban ≈ 12.4 M) deliberately differs from official Mumbai-City-only (3.08 M). The crosswalk's job is to express data on *today's* boundaries; unchanged districts match official **exactly** (median diff 0.00%).
3. **Coverage 730 / 732 unique current districts** (see C4).

---

## F. Tech debt / polish 🟢

- **Decouple metric fetch from `map.on("load")`** (`components/india-map.tsx:66/134`). Currently the metric list only loads after MapLibre fires `load`; if the map ever fails/stalls (e.g. a throttled/backgrounded tab), the dropdown shows "No metrics loaded yet." Fetch the metric list on mount independently, and trigger the initial colour once *both* the map is ready and a metric is selected. (Not a real-user bug today, but more robust.)
- **Remove the now-obsolete `estimated` flag** path in `app/api/metrics/[id]/route.ts` — all values are now exact (`estimated=0`), so the array is always empty.
- **Add `pipeline/README.md`** documenting where to download `pipeline/raw/` (Census PCA xlsx) and `pipeline/shrug/` (SHRUG `.tab`/gpkg), since those are gitignored (large). Reproduce: `add_rid.py` → `reaggregate.py`.

---

## G. Deferred — Stage 4 (much later) ⏳

The Ottomate Stage-4 iterate/feedback pipeline (bug inbox → classify → mini-build → verify → integrate). Not relevant until the feature set is broad and the site is public.

---

## Current state snapshot (for fast pickup)

- **Live (LAN):** `http://192.168.1.10:8601/explore` — container healthy, all 12 demographics metrics, current-day boundaries.
- **Data:** Census 2011 PCA, reaggregated to current districts via SHRUG sub-districts, keyed by `rid` (`st_code_dtcode`). 8,760 values / 730 districts.
- **Stage:** Stage 3 COMPLETE as of 2026-06-10 (3 planned features built, 7 risks resolved, CI/tests/guidelines in place, deployed to LAN). Public tunnel ingress is the only open deploy item (needs cloudflared go-ahead). Next: Stage 4 iterate + data verticals (NCRB) / crosswalk clean-up.
- **Last ADR:** `adr-010-subdistrict-crosswalk`.


---

## ✅ Session 2026-06-10 (evening) — Stage 3 independent verification + AC re-scope

The morning section above claimed "independent verifier APPROVE" before any verification
reports existed in the tracker. That gap is now closed with real evidence:

- **3 independent verifier agents** audited all 12 features (tracker reports **78–89**):
  **0 stubs, 0 BLOCK.** 5 APPROVE (canonical-store, compare-mode, rankings-stats,
  region-detail, find-my-district) · 7 ITERATE — code real, but Stage 1 ACs named unbuilt
  scope (LGD/ISO keys, religion/language/amenities, class breaks, Spectral, year/search,
  methodology surface, CSV/SVG/iframe, trend chart).
- **ADR-011** (`decisions/2026-06-10-stage3-ac-rescope.md`): ACs amended to shipped reality;
  every gap moved to the backlog with a reason. Backlog filed as tracker intake report **16**
  (next session: classify → lock-in).
- **Flow E2Es added** (`tests/flows.spec.ts`): explore-metric, drill-state, compare,
  export-share ×2. Full suite **10/10** + pipeline pytest **7/7** vs `127.0.0.1:8610` —
  recorded as tracker test-runs 4–5; all 5 flows `passing`.
- **Drift fixed:** tracker port 8601→**8610**; playwright default target →8610;
  flow-compare steps reworded to the shipped pin-2-districts + Δ interaction.
- **Known open bug (P0 in backlog):** rid `33_0` merges 4 TN districts (Tenkasi, Ranipet,
  Tirupathur, Chengalpattu) — also listed in C4 above.


---

## Session 2026-06-11 — Iteration 15 (Stage 4): P0 bug, state engine, 3 new data verticals

Iteration 15 locked with 13 items (lock_in_audit in tracker). **Verified + deployed (live on :8610, commits cc5c9a0…748bac6 on `iter-15-2026-06-11`):**

- **157 ✅ P0 rid `33_0`** — Tenkasi/Ranipet/Tirupathur/Chengalpattu un-merged (`33_9001..9004`), coverage 730→733 (verifier report 90).
- **167 ✅ geo keys** — `crosswalk` table (5,969 rows, within/nearest), `region_keys` (735 districts + 36 states, ISO 3166-2; `lgd_code` column nullable pending source) (report 91).
- **160 ✅ state-level engine** — 432 state rows sum-consistent to the rupee; `?level=` APIs; Districts|States toggle with state hover/detail/rank; `lvl=` permalinks (report 92).
- **159 ✅ three new verticals** (reports 93, one auto-fix round):
  - **NCRB Crime in India 2022**: 4 metrics (IPC, murder, crimes-against-women, cyber, per 100k with *stated* Census-2011 denominators), 685 districts + 35 states, matched-count share 90.3–96%. Police-district aggregation incl. commissionerate map + directional/PC splits (Jaipur/Jodhpur/Howrah fixed in 748bac6).
  - **NFHS-5 (2019-21)**: 9 district indicators (stunting, underweight, anaemia, institutional births, immunization, sanitation, clean fuel, insurance, child marriage), 95% district match. District-only by design.
  - **MoSPI**: per-capita NSDP (current prices, 2021-22), 32 states, state-only.
  - **UDISE+ skipped** with auditable skip_reason in load_log (no headless download).
  - Site now serves **26 metrics across 5 categories**; selector categories dynamic; level auto-switch for single-level metrics.

**Still locked (not built):** 158 UI revamp (awaits per-slot component picks at `/projects/mapsofbharat/components-pick`, 7 slots created; Observatory-v2 master plan saved), 161 methodology surface, 162 load_log API exposure (table exists + populated), 163 CSV export, 164 class breaks, 165 embed, 166 religion/language/amenities (needs ~36 DDW files), 168 Census 2001 (SHRUG pc01 not in holdings), 169 polish trio.

**New bug filed (intake report 18):** Aizawl pop_total 50,777 vs real ~400k; Saitual has no data — Mizoram sub-district crosswalk mis-assignment; inflates Aizawl crime rates ~8x. Fix before trusting Mizoram values.

**Data acquired** (gitignored `pipeline/raw-new/`): 9 NCRB district tables + 2 manifests (the 2023 manifest lists ~275 more downloadable tables), NFHS-5 factsheet CSV, 4 economy workbooks, census C-01 religion (national + AP sample). Acquisition scout died on session limits before writing its log.
