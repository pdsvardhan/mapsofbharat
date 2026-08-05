# Roadmap

The ordered backlog for Maps of Bharat, consolidated from the launch plan (`decisions/2026-08-05-launch-decisions-and-plan.md`) and the Ottomate to-do list. Sequencing principle: **product/website readiness first, content/social second**; the public `mapsofbharat.in` domain goes live only at the end of Phase 3. Everything is reversible until the first public link.

To-do ids (e.g. `#405`) are the canonical trackers in Ottomate; this file is the reading order, not a second source of truth.

## Before launch

### Phase 1 — Trust, legal & brand  *(nearly done)*
- ✅ Citation block · boundary self-cert · corrections page + no-UGC ADR (iter-32)
- ✅ Terms + Privacy · cite-all-sources on cards · IP-hashing · favicon from logo A (iter-33)
- ⏳ Governance: AGENTS.md + canonicity rule · decisions register · this roadmap · moderation policy · response playbook
- ⛳ Before-launch confirm: legal copy — operator name, contact emails, CC-BY-on-#384 line

### Phase 2 — Technical hardening  *(#405)*
1. Off-box backups + a tested restore
2. Uptime monitoring + alerts
3. Warm standby (Cloudflare Pages)
4. Boundary-compliance CI gate (checksum + golden render + runtime assert)
5. CI tests on every push + fix the flaky test (#380)
6. Geometry via CDN (R2) + pre-compression
7. Migration-trigger monitor (cache-hit < 90% → consider moving off the home server)

### Phase 3 — Go-live  *(#406)*
1. SEO floor: robots.txt + sitemap + Search Console / Bing verification
2. Noindex `/embed`
3. WhatsApp share button
4. Perf baseline + a11y audit + fixes; mobile card-export test
5. Repoint `mapsofbharat.in` + scrub vault7a refs + submit sitemap → **silent-live**

*(SEO floor, noindex /embed, and WhatsApp share are in flight as stream B.)*

### Owner, in parallel  *(#407)*
Buy `mapsofbharat.in` (redirect `.com`) · secure `@maps_of_bharat` handles · flip the Cloudflare `/api` cache rule · set `CORRECTIONS_ADMIN_TOKEN` · file the trademark (Class 42) after a sustained ~1-week traffic spike.

## After launch  *(pulled in at the owner's pace)*

### Product growth  *(#408)*
VSUP uncertainty toggle · categorical maps · symbol-choropleth · hex-state · cartogram · shape-morph animation · flood-risk · seismic zones · + foundations (map-shape param, video pipeline, adopt india-geodata shapes, crosswalk double-check).

### Content machine  *(#409)*
Compositor → batch card export → 90-piece bank → Postiz (self-hosted) → calendar / pillars / QC → social launch (Instagram + X first). Cards 4:5 with a 3:4 safe zone; 9:16 ~month 2.

### Paid tier — v2  *(#410)*
Accounts + payment → gate the table/data view + data downloads → bulk + API → LGD licence swap (#384) → commercial-licence page. **Free forever:** the map view, the card PNG, and the embed.

## Parked / deferred
- **#384** LGD sub-district crosswalk swap — deferred until monetising (unblocks CC-BY reuse + commercial use; adr-027).
- **#386** Elections district-level turnout — needs a PC→district crosswalk or PC geometry; multi-year needs ECI 2019/2014. State-level LS2024 already shipped.
- **#390** Doc-freshness Phase 4 — arm `doc_gate=block` after backfilling docs to the standard.
- **#412** Corrections POST server-side dedup (low impact; found by the iter-32 feature verifier).
- **#380** Flaky `iter26-regressions` spec — fold into Phase 2 CI work.
- **#157** RBI QSDCB district deposits/credit — parked (login-walled); revisit only if the owner exports the XLSX.
