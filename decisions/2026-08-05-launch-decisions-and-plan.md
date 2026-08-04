# MapsOfBharat — Launch decisions & build plan (2026-08-05)

Consolidates the competitive/launch research (files 00–07 + the 16 `cat-*` launch docs) into a decided, phased plan. Written after a full owner decision pass (49 answers + follow-ups). Repo state at authoring: `main` = 69f699c (iter-131 shipped + live).

## End goal (north star)
The provenance-honest atlas of India's official statistics — publicly launched, discoverable (SEO), trusted (cited, corrected, methodology-open), **free to explore forever**, richer maps/data over time, with a **paid data-access tier later that never paywalls the core map**.

## Sequencing principle (owner steer)
**Product/website readiness first, content/social second.** Build everything privately; the public `.in` domain goes live only at the end of Phase 3 (everything is reversible until the first public link).

---

## Decisions (owner, 2026-08-04/05)

### Brand & identity
- **Domain:** `.in` primary (`mapsofbharat.in`); buy both, redirect `.com`.
- **Tagline:** keep current — "India's official statistics, finally on a map."
- **Logo/avatar:** **A — the disc/badge mark** (`public/brand/badge-disc.png`) for avatar + favicon; the bare MB monogram (`mark.svg`) stays for in-app/masthead.
- **Voice:** impersonal (no "we"/"I"); write a short `VOICE.md`. Sign *outreach emails* by real name while the brand stays faceless.
- **Social-card default theme:** ink / dark.
- Name "Maps of Bharat" + faceless brand: already settled.

### Legal & compliance
- **Corrections log:** public.
- **No user-generated content, ever** (write an ADR — avoids IT-Rules intermediary duties).
- **Trademark:** file (~₹4,500, Class 42) after a *sustained* traffic spike (~1 week), not before launch.
- **Legal review:** no paid advocate; owner does own AI + research at trademark time.
- **Entity:** sole proprietor for now.
- **Reuse licence:** **CC-BY** (publishes when #384 lands).
- **No accounts** until a paid tier truly needs them.
- **DPDP:** hash/truncate IPs in analytics; keep Umami cookieless + self-hosted in India.

### Trust & credibility
- Add a copyable **"To cite this"** block (corporate author "MapsOfBharat") to metric/region pages.
- **Zenodo DOI:** no.
- **Never self-cite MoB on Wikipedia.**
- Public **boundary self-certification** statement (Survey of India / DST guidelines).

### Content & social
- **'Does not claim' fence:** present official numbers as-is; no causation, no rankings-as-verdicts, estimates aren't exact — all sourced & disclosed. (Unblocks captions + moderation.)
- **Hostile threads:** engage case-by-case *(owner choice; agent recommended "never — correct once, stop")*.
- **Religion:** on the site, never posted to social.
- **Comments:** left on *(note: moderation load on society/crime posts)*.
- **HOTSPOT single-district maps:** held off social until symbol-choropleth ships.
- **Content bank:** 90 pieces before seeding.
- **Scheduler:** **Postiz**, self-hosted on VAULT7A (free, automated, feature-rich — research-picked over Meta Business Suite).
- **Instagram aspect:** export **4:5 (1080×1350)** with a centred **3:4 safe zone** (grid switched to 3:4 in Jan 2026).
- **LinkedIn:** present from launch. **9:16 (Reels/Shorts):** after launch (~month 2); plan early.
- Compositor generates posts from data (not Figma); each content series gets its own colour family.

### SEO & technical
- **Region pages:** phase 2; slug `{district}-{state}`. Region share-images: **on-demand + cached** (else text-only).
- **Noindex `/embed`.**
- **API posture:** decide at monetisation.
- **Off-home-server migration trigger:** cache-hit < 90% (or a daily origin-request threshold).
- **CI:** run the full test suite on every push; fix the one flaky test (#380).

### Measurement
- Share menu: keep **PNG primary** (embed not promoted above it).
- **Analytics retention:** 12 months, then aggregate-only.
- **Zero-result search:** offer an optional, consented "email me when added" capture.

### Launch operations
- **Silent-live:** stays quietly live (indexing) **until product readiness is done** (min ~2 weeks to index).
- **First seeding:** Instagram + X later — *product changes first*.
- **Backup/continuity contact:** set just before launch.

### Operations & governance
- Adopt the **canonicity rule + `AGENTS.md`**; a **decisions register**; convert the backlog to ordered `features.yaml`.
- Capacity: much more than 5h/week available.

### Monetisation (all v2 / when-monetising)
- **Paywall line:** **free** = view the map + download the card PNG + embed. **Paid** = the table/data view + downloading that data. Framed as *data-access* (reading numbers on the map stays free) — amend `adr-028` wording to match.
- **Levers to pursue:** licensed reuse, commissioned viz/studio, data-access (API+bulk), sponsored report, pro-export tier. (Not teaching.) Buyers of interest: media, consultants; research shows **BFSI + agri-fintech** are the willing data-access buyers.
- **No display ads, no early sponsorship.**
- **#384 (LGD licence swap):** kept **deferred** until actually monetising — nothing user-facing needs it, and it's the risky value-swap.

### Agent resolutions (owner may veto)
- **Bivariate map:** park to post-launch (curate pairings at build time).
- **Election-constituency map:** hold until after the **2027 delimitation** (current PC/AC boundaries expire).
- **Satellite number-cruncher + satellite metrics:** parked (only if we pursue land-cover/rainfall/elevation).
- **Mobile/perf/a11y check:** a test task in Phase 3, not a decision.

---

## Before-launch build plan — 3 phases, each with a verification gate

Every **code** item is built on a branch and checked by an **independent verifier sub-agent** driving the real app (ledger-reconciled). **Non-code** items are verified by a concrete checklist. Each phase integrates + deploys at its gate before the next starts.

### Phase 1 — Trust, legal & brand (private)
Code: citation block · boundary self-cert (methodology + card note) · cite all sources on combined-metric cards · Terms + Privacy + **Corrections page (public log + report route)** · hash/truncate IPs · favicon + profile assets from logo A.
Docs/ADRs: no-UGC ADR · 'does not claim' fence · moderation policy · response playbook · VOICE.md · amend adr-028 (paywall line).
Governance: canonicity rule + AGENTS.md · decisions register · backlog → features.yaml.
Owner (parallel): secure `@maps_of_bharat` handles · buy `mapsofbharat.in` · flip Cloudflare cache rule.
**Gate:** trust/legal pages live + footer-linked · ADRs committed · cards show all sources + boundary note · IP-hashing verified · verifier APPROVE on every code item · deploy.

### Phase 2 — Technical hardening (private)
Off-box backups + tested restore · uptime monitoring + alerts · warm standby (Cloudflare Pages) · boundary-compliance CI gate (checksum + golden render + runtime assert) · CI tests every push + fix flaky #380 · geometry via CDN (R2) + pre-compress · migration-trigger monitor.
**Gate:** real restore succeeds · test outage fires an alert · CI green + boundary gate blocks a bad-boundary commit · geometry from CDN, load improved · standby reachable · deploy.

### Phase 3 — Go-live gate (private → silent-live)
SEO floor: robots.txt + Search Console/Bing verify · noindex `/embed` · WhatsApp share button · perf baseline + a11y audit + fixes · mobile card-export test · **repoint `mapsofbharat.in` + scrub vault7a refs + submit sitemap**.
**Gate:** public URL resolves at `mapsofbharat.in` · Search Console verified + sitemap submitted · `/embed` noindexed · perf/a11y acceptable · monitoring green → **silent-live begins**.

---

## POST-LAUNCH TRACKS — PENDING (separate plans, pulled in at owner's pace)

1. **Product growth (PENDING):** VSUP uncertainty toggle · categorical maps · symbol-choropleth · hex-state · cartogram · shape-morph animation · flood-risk metric · seismic zones · + foundations (map-shape param, video pipeline, adopt india-geodata shapes, crosswalk double-check).
2. **Content machine (PENDING):** compositor → batch card export → 90-piece bank → Postiz → calendar/pillars/QC → social launch.
3. **Paid tier — v2 (PENDING):** accounts + payment → gate table view + data downloads → bulk download + API → LGD licence swap (#384) → commercial licence page.

---

## Next session pickup
Start **Phase 1**, first buildable batch: **citation block + boundary self-cert + no-UGC ADR + corrections page**. Owner does the three 2-minute tasks in parallel (buy `mapsofbharat.in`, secure `@maps_of_bharat` handles, flip the Cloudflare cache rule). Full item picture: `planning/2026-08-05/MoB-the-whole-picture.html` + `MoB-master-backlog.csv`.
