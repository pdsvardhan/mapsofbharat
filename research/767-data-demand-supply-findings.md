# MapsOfBharat — Data Ingestion Research Brief
Prepared 2026-07-27. Scope: demand, supply, good-to-have, derived metrics for district-level Indian statistics. Dense/tabular, written for a downstream ingestion agent, not narrative reading.

**Legend**: `GODL` = Government Open Data License–India (permissive, commercial OK w/ attribution — confirmed data.gov.in sitewide default). `Unverified` = ToU page couldn't reload this session (TLS/robots/JS blocks common on gov.in) — re-check before ingest, don't treat as cleared. `CC BY-NC*` = disqualified (site runs ads). Difficulty: 1=trivial pull, 2=easy download, 3=moderate (PDF/fragmented), 4=hard (manual browser session), 5=blocked/not a dataset.

## 1. Executive Summary

- **Top acquisition target: district GDDP.** MoSPI issued a DDP compilation standard 3 Jun 2026 (methodology only, no central figures — [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2268392)). 13/20 states checked currently publish district GDDP (Kerala most current, 2024-25Q); 7 confirmed dead (Gujarat, AP, Odisha, Haryana, Assam, Chhattisgarh, current HP). Mostly not-NC, several explicit GODL.
- **Derived metrics = cheapest leverage** (already-held data) — but the Census-2011-denominator-vs-current-numerator trap is pervasive; guard it in the pipeline, not just the UI.
- **Blocked-list update**: Census 2001 has a legitimate PDF workaround (NADA district handbooks, replacing SHRUG's NC pc01). NDAP may allow bulk UI download without the Cognito API (unconfirmed — SPA blocks probing). CPCB has a partial workaround (CCR dashboard export). **RBI QSDCB remains genuinely blocked** — a `dbie.rbi.org.in`-specific TLS cert defect, distinct from the general rbi.org.in bot-wall issue (which now resolves fine via plain fetch elsewhere).
- **Two clean dead ends**: Census language tables (C-16/C-17 — state/India-only) and district-to-district migration corridors (D-series only resolves state-to-state).
- **MoSPI's API is state-level only, one exception**: verified directly — PLFS/NSS76/78/79/80/UDISE all lack a district parameter; **Economic Census (EC6/EC5/EC4) is genuinely district-level** via the same API.
- **Census 2027**: gazette notification issued — two enumeration phases, 1 Oct 2026 (Ladakh + snow-bound J&K/HP/Uttarakhand) and 1 Mar 2027 (rest of India); first digital census; caste data included. Table releases typically lag enumeration 2-5yrs — no near-term crosswalk impact, but watch for delimitation-linked boundary changes once data releases (~2028+).
- **Remote sensing beats SHRUG cleanly**: NASA Black Marble nightlights (public domain), ESA WorldCover built-up+cropland (CC BY 4.0), GHSL built-up trend (CC BY 4.0). Bhuvan/ISRO disqualified outright (ToS bars redistribution/bulk download).
- **Coverage caveat**: some research passes hit search-quota limits mid-task and fell back to direct-fetch only. Every "Unverified" tag below is a genuine to-do, not an oversight — don't treat as cleared.

## 2. Part 1 — Demand (ranked, evidence-based)

| Rank | Indicator | Evidence | Interest |
|---|---|---|---|
| 1 | District/state per-capita income & GDP (GDDP/GSDP) | MoSPI DDP standardisation ([policyedge.in](https://www.policyedge.in/p/mospi-standardises-district-domestic-product-estimation-under-new-202223-statistical-framework)); Wikipedia state "district income estimates" pages ([Bihar](https://en.wikipedia.org/wiki/Bihar_district_income_estimates), [WB](https://en.wikipedia.org/wiki/West_Bengal_district_income_estimates)); SEO listicles ([jaincollege.ac.in](https://www.jaincollege.ac.in/blogs/richest-district-in-india-2025-top-25-districts-by-gdp-and-per-capita-income)); viral X rankings | Both |
| 2 | NITI Aspirational Districts composite (Delta ranking) | Live [championsofchange.gov.in](https://championsofchange.gov.in/site/coc-home/); [PIB baseline](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1526802) | Both |
| 3 | Groundwater level/extraction stage by district | 2024-25 Bengaluru crisis coverage ([Deccan Herald](https://www.deccanherald.com/india/karnataka/86-taluks-contaminated-bengaluru-over-exploited-groundwater-report-3961002)); [CGWB](https://cgwb.gov.in/en/ground-water-level-monitoring) | Both |
| 4 | Sex ratio at birth (SRB), district HMIS/BBBP | [data.gov.in](https://www.data.gov.in/resource/stateut-and-district-wise-sex-ratio-birth-hmis-data-mohfw-100-districts-selected-under); [BehanBox](https://behanbox.com/2022/09/07/why-delhis-sex-ratio-ranks-among-the-worst-in-india/) | Both |
| 5 | Life expectancy at birth, by state (SRS) | [dataforindia.com](https://www.dataforindia.com/life-expectancy/); SRS 2018-22 life tables | Both |
| 6 | District MSME/Udyam registered enterprises | Live [dashboard.msme.gov.in](https://dashboard.msme.gov.in/udyam_dist_wise.aspx?stid=33); [data.gov.in](https://www.data.gov.in/resource/district-wise-total-msme-registered-enterprises-under-udyam-registration-till-last-date) | Analyst |
| 7 | UDISE+ district granularity (schools/enrolment/dropout/PTR) | [udise.net](https://udise.net/udise-school-data-dashboard-state-district-stats-india/); single-teacher-school stories | Analyst |
| 8 | Health infrastructure — beds/doctors/PHCs per district | [CBHI tables](https://cbhidghs.mohfw.gov.in/index4.php?lang=1&level=0&linkid=658&lid=664); shortfall reporting | Analyst |
| 9 | National Judicial Data Grid — district case pendency | Live [njdg.ecourts.gov.in](https://njdg.ecourts.gov.in/); [data.gov.in](https://www.data.gov.in/resource/court-wise-number-pending-cases-across-country-national-judicial-data-grid-njdg-portal-06) | Analyst |
| 10 | Internal migration, district in/out (Census D-series) | Academic codebook ([vanneman.umd.edu](http://vanneman.umd.edu/districts/codebook/notemig.html)); [EAC-PM study](https://eacpm.gov.in/wp-content/uploads/2024/12/FINAL-Internal-Migration-Project.docx-Publication-Version.pdf) | Analyst |

**Pattern**: public interest = identity-affirming rankings (income/poverty/water/sex-ratio "my district is #1") → SEO+viral+Wikipedia. Analyst interest = granular admin data (MSME, UDISE, judicial, migration) used for denominators/policy monitoring, not casual browsing.

## 3. Part 2 — Supply

### 3.1 District income / GDDP (highest-demand gap)

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| MoSPI/NSO | DDP Compilation Guideline (2022-23 base) | National, methodology only | Rel. 3 Jun 2026 | PDF | Unverified | 5 | [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2268392) |
| DES Karnataka | District Income & PCI + DDP report | District (30-31) | 2021-22 | CSV/PDF | **GODL** | 2 | [data.gov.in](https://www.data.gov.in/resource/district-income-and-capita-income) |
| DES Maharashtra | District Domestic Product of Maharashtra | District (36) | 2011-12–2022-23 (pub. Jun'24) | PDF | Not NC (attribution) | 2 | [mahades.maharashtra.gov.in](https://mahades.maharashtra.gov.in/files/report/DDP_2022-23_002.pdf) |
| DES Uttar Pradesh | District Domestic Product Estimates | District | 2019-20/20-21 (stale) | PDF | Unverified | 3 | [updes.up.nic.in](https://updes.up.nic.in/updes/dist_domestic_product.html) |
| DES Bihar | District Domestic Product volumes | District (38) | Verified only to 2007-08 | PDF | Unverified | 3 | [dse.bihar.gov.in](http://dse.bihar.gov.in/New-Publications/DDP%20Book-2004-05%20to%202007-08(BIHAR).pdf) |
| DES Madhya Pradesh | Estimates of DDP, MP | District | 2011-12–2020-21 (pub.'22) | PDF | **Doc states "no reproduction for sale w/o written permission"** | 2 (licence-blocked) | Archived [des.mp.gov.in](https://web.archive.org/web/20221212225624/http://des.mp.gov.in/Portals/0/ESTIMATES_DISTRICT_DOMESTIC_PRODUCTS_MP_2020-2021.pdf) |
| DES Rajasthan | Estimates of DDP of Rajasthan | District (33) | 2024-25 advance | PDF+dashboard | Unverified | 2 | [desddp.rajasthan.gov.in](https://desddp.rajasthan.gov.in/) |
| DES Tamil Nadu | District Income Estimates, 2011-12–2023-24P | District | 2011-12–2023-24P | PDF (Drive-hosted) | Unverified | 2 | [des.tn.gov.in](https://des.tn.gov.in/index.php/en/node/346) |
| BAES West Bengal | State & District DDP of WB | District | 2012-13(P), base 2004-05 | PDF | Unverified (self-contradictory ToU) | 4 | via [NITI mirror](https://www.nitiforstates.gov.in/public-assets/Policy/policy_files/RSS1154M000550.pdf) |
| DES Telangana | Socio-Economic Outlook — GDDP annexure | District | 2022-23 (SEO-2024) | PDF+CSV mirror | Unverified | 3 | [des.telangana.gov.in](https://des.telangana.gov.in/publications/Socio%20Economic%20Outlook-2024.pdf) |
| DES Odisha | — **confirmed dead end (current)**, 14yrs stale | District (historical) | 2011-12 | None live | Unverified | 5 | [desorissa.nic.in](http://www.desorissa.nic.in/ddp.html) |
| DES Kerala | GDDP/NDDP/PCI, 2011-12–2024-25(Q) | District (14) | **2024-25 Quick Est. — most current of all states** | PDF | Not NC | 2 | [ecostat.kerala.gov.in](https://ecostat.kerala.gov.in/storage/publications/1843.pdf) |
| ESOPB Punjab | DDP of Punjab, through 2020-21 | District | Through 2020-21 | PDF | Not NC (attribution) | 4 (site moved) | [Wayback mirror](https://web.archive.org/web/20240501212751/https://esopb.gov.in/static/Publications.html) |
| DES Jharkhand | Sectorwise GDDP/NDDP | District | Confirmed 1999-2000–2005-06 (stale); newer unconfirmed | XLS | Open (attribution) | 4 | [desjharkhand.nic.in](https://web.archive.org/web/20221210084802/https://desjharkhand.nic.in/stateincom.html) |
| E&S Himachal Pradesh | DDP of HP, 2011-12–2015-16 (no successor) | District (12, historical) | Confirmed absent thru 2024-25 | PDF | Not NC | 5 (no current vintage) | [himachalservices.nic.in](https://himachalservices.nic.in/economics/pdf/distt_dp_2015-16.pdf) |
| DES Uttarakhand | Estimates of DDP of Uttarakhand | District (13) | 2011-12–2021-22 (pub.Feb'23, still latest) | PDF | Not NC | 2 | [des.uk.gov.in](https://des.uk.gov.in/district-domestic-product-estimates/) |
| DES J&K (bonus UT) | District-wise Per Capita Income | District | Unverified — robots-blocked | Unverified | Unverified | 4 | [jk.data.gov.in](https://jk.data.gov.in/catalog/district-wise-capita-income-current-prices) |

**State-level only, no district GDDP ever/currently** (confirmed via primary DES/Economic Survey checks): Gujarat ([link](https://gujecostat.gujarat.gov.in/district-statistics)), Andhra Pradesh ([link](https://apfinance.gov.in/socio.html)), Haryana ([link](https://esaharyana.gov.in/website-policies/)), Assam ([link](https://des.assam.gov.in/portlets/state-income)), Chhattisgarh (never published — [Wayback CDX](https://web.archive.org/web/20221228143434/https://descg.gov.in/), 2170 URLs, zero DDP files).
**Not reached** (no check either way): 15 smaller states/UTs by population share — Goa, Delhi NCT, Puducherry, Chandigarh, Ladakh, and the NE states/Sikkim/A&N/DNH&DD/Lakshadweep.

### 3.2 Census 2011 sub-tables (migration, housing, language, disability)

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| RGI/ORGI | D-Series Migration (D-1–D-9) | District in-migration only; origin resolves to same-district/other-district/other-state buckets, **not a named origin district** | Ref. 2011, rel. 2015-16 | XLS (state DDW) | Unverified (TLS errors blocked reload) | 3 | [censusindia.gov.in/data/census-tables](https://censusindia.gov.in/census.website/data/census-tables) |
| RGI/ORGI | D-Series state-to-state matrix | State/UT only — **no district-to-district flow table** | Ref. 2011, rel.'16 | XLS | Unverified | 5 (dead end) | same |
| RGI/ORGI | HLPCA housing (house material, water/lighting source, latrine, assets) | Village/ward (district rollup trivial) | Houselisting 2010, data 2011-12 | XLS (same DDW family as held PCA/C-01) | Unverified — same pipeline as ingested PCA/C-01 | 2 | same |
| RGI Language Div. | C-16 Mother Tongue | **India + state/UT only — no district table** | Ref. 2011, rel. from 2018 | PDF/XLS | N/A | 5 (dead end) | — |
| RGI Language Div. | C-17 Bilingualism/Trilingualism | **India + state/UT only** | Ref. 2011, rel.'18-19 | PDF/XLS | N/A | 5 (dead end) | — |
| RGI/ORGI | C-20 Disability by type/age/sex | District | Ref. 2011, rel.'16 | XLS (same DDW family as C-01) | Unverified | 2 | same |

MoSPI's NSS76 disability module (survey_code=1) confirmed **state-only** via direct API check — not a district substitute.

### 3.3 Access & infrastructure

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| REC/Power Ministry | GARV-II village electrification | Village→district | Frozen 2015-19 | Dashboard | Unverified (site TLS error) | 5 | [garv.gov.in](https://garv.gov.in/dashboard/) |
| NITI Aayog | Champions of Change — Aspirational Districts/Blocks infra KPIs (electrification, water, financial inclusion, one dashboard) | District/block (112-612 of 735) | Ongoing monthly | Dashboard | Unverified | 4 | [championsofchange.gov.in](https://championsofchange.gov.in/) |
| BBNL/DoT | BharatNet gram-panchayat OFC/Wi-Fi | Gram panchayat | Current (214k/~255k GPs connected) | Dashboard, bulk export unconfirmed | Unverified | 4 | [bbnl.nic.in](https://bbnl.nic.in/) |
| MoSPI/NSSO | NSS 80th Telecom (CMST) | **State/UT only — confirmed no district param** | 2023-24 | JSON/XLSX API | Unverified | 2 (wrong level) | `esankhyiki.mospi.gov.in` |
| RBI | Basic Statistical Returns (BSR-1/2) | District + population group | Annual, ~18-24mo lag | PDF/XLS via DBIE | Unverified — not GODL | 3 | [rbi.org.in](https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Basic%20Statistical%20Returns) |
| RBI | Quarterly Stats on Deposits & Credit (QSDC) | District, pop. group, bank group | Quarterly, ~4-6mo lag — **best banking-below-state source, no login wall** | XLS/PDF via DBIE | Unverified | 3 | [rbi.org.in](https://www.rbi.org.in/Scripts/QuarterlyPublications.aspx?head=Quarterly%20Statistics%20on%20Deposits%20and%20Credit%20of%20Scheduled%20Commercial%20Banks) |
| Dept. Drinking Water | WQMIS — contamination-wise habitations, lab results | District/block/habitation | Live | Web reports | Unverified | 3 | [ejalshakti.gov.in](https://ejalshakti.gov.in/jjm/JJMReports/PhysicalProgressReport.aspx) |
| IIPS/MoHFW | NFHS-5 District Fact Sheets — water source, toilet type | District (~707) | 2019-21 (NFHS-6 status unconfirmed) | PDF per-district | Unverified | 4 | [rchiips.org](http://rchiips.org/nfhs/factsheet_NFHS-5.shtml) |
| Dept. Drinking Water | NARSS — district ODF/ODF+/ODF++ | District | Annual (latest round unconfirmed) | PDF | Unverified | 3 | [swachhbharatmission.ddws.gov.in](https://swachhbharatmission.ddws.gov.in/) |
| MoSPI | Economic Census EC6 (2013-14) — district establishments/workers, 24 sectors | District (confirmed via API) | 2013-14 (stale; no EC7 in API) | JSON API + data.gov.in | **GODL** | 2 | `esankhyiki.mospi.gov.in` (dataset=EC) |
| Dept. Rural Dev. | MGNREGA MIS — person-days, works, households | GP/block/district | Live | Web + GODL CSVs | GODL | 3 | [nrega.dord.gov.in](https://nrega.dord.gov.in/) |
| Labour Ministry | e-Shram registered unorganised workers | District | Live since Aug'21 | Dashboard (JS-rendered, depth unconfirmed) | Unverified | 3 | [eshram.gov.in](https://eshram.gov.in/) |
| PLFS (direct API check) | — **confirmed dead end for district** | State/UT×sector only, no district_code param | — | — | — | 5 | — |

**Dead ends**: CMIE district unemployment (paid/commercial, disqualifying). PMJDY district data (no open publication below state found). NSS76/78/79/80 for water/telecom/housing below state — all confirmed state-only via API.

### 3.4 Land use & groundwater

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| DES/DAC | Land Use Statistics at a Glance 2022-23 | **State/UT + All-India only** | 2022-23 | PDF | Unverified | 5 | [desagri.gov.in](https://desagri.gov.in/wp-content/uploads/2024/09/Final-file-of-LUS-2022-23-for-uploading.pdf) |
| DAC — aps.dac.gov.in | Land Use Statistics Info System (district drill-down) | District per description — **unreachable this session, not confirmed dead** | Unverified | Web query tool | GODL/NDSAP per catalog blurb, unverified live | 5 | [aps.dac.gov.in/LUS](https://aps.dac.gov.in/LUS/Public/Reports.aspx) — recheck live |
| ICRISAT | District Level Database (land-use incl.) | District (~571, old ~2015-16 boundaries) | 1966-2015-16 | Excel/CSV | **DISQUALIFIED**: "About" page claims CC BY 4.0, but Data Sharing Agreement gating downloads restricts to non-commercial use | 2 (disqualified) | [data.icrisat.org/dld](http://data.icrisat.org/dld/src/about-dld.html) |
| CGWB/Jal Shakti | National Compilation, Dynamic Ground Water Resources 2025 | **Unit = block/mandal/taluka (6,762) — district needs manual aggregation** | Ref. 2025, rel. 18 Dec 2025 (730 over-exploited, 201 critical nationally) | PDF (state chapters) | Unverified | 4 | [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2206073) |
| CGWB+IIT Hyderabad | IN-GRES web GIS | Block/mandal; district roll-up unconfirmed | Since 2020 cycle | Web GIS, unreachable this session | Unverified | 5 | [ingres.iith.ac.in](https://ingres.iith.ac.in/) |

**Dead ends**: no clean open-licence bulk district-level land-use source — DAC's product is state-only, the one genuinely-district portal was unreachable (needs live recheck), ICRISAT is licence-disqualified, IndiaStatDistricts is paywalled. Groundwater is *not* a coverage dead end (CGWB 2025 exists, current) but no route yet gives a ready district figure under a confirmed open licence.

### 3.5 Health, disaster, fertility & mortality

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| MoHFW/NHM | Health Dynamics of India (fka Rural Health Statistics) | District — SC/PHC/CHC/hospital counts | FY2022-23, rel. Sep'24 | PDF | Unverified | 3 | [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2053070) |
| NHM/OGD | Item-wise HMIS report, all states/districts, monthly | District, monthly | Rolling | CSV/API | **GODL** (confirmed) | 2 | [data.gov.in](https://www.data.gov.in/catalog/item-wise-hmis-report-all-states-and-districts-across-months) |
| BMTPC/MoHUA | Vulnerability Atlas of India, 3rd Edn — flood/quake/wind/landslide | District, all states (~640, 2011 list) | 2019 | PDF per-state + web viewer | Unverified | 3 | [vai.bmtpc.org](https://vai.bmtpc.org/Intro.html) — needs 2011→current crosswalk |
| NRSC/NDMA + State DMAs | Flood Hazard Atlas | District/sub-district — **flood-prone states only (Bihar, Assam, WB, AP)**, not all-India | Varies | PDF atlas + WebGIS, no bulk download | Restrictive/unverified | 4 | [ndma.gov.in](https://ndma.gov.in/flood-hazard-atlases) |
| RGI (CRS) | Vital Statistics of India Annual Report, Tables 6-9 — registered births/deaths/infant deaths | District | 2022 confirmed; 2023 released | PDF | Unverified | 3 | [crsorgi.gov.in](https://dc.crsorgi.gov.in/assets/download/Annual-Reports/crs/2022.pdf) |
| RGI (SRS) | SRS Statistical Report | **National + state only — no district by sample design** | SRS 2024 (rel.~May'26) | PDF | Unverified | 5 (dead end) | [catalog](https://censusindia.gov.in/nada/index.php/catalog/46178) |
| RGI (AHS) | Annual Health Survey — district CBR/CDR/IMR/TFR/U5MR | District, but only **284 districts, 9 EAG states+Assam** | 2010-13, discontinued | PDF + microdata | Unverified | 5 (stale/partial) | [GHDx](https://ghdx.healthdata.org/record/india-annual-health-survey-2012-2013) |

**Dead ends/flagged risky**: District health-centre availability (frozen 2011, superseded). IHME/GBD district U5/neonatal mortality — genuinely district-level, all-India, but **CC BY-NC-ND, disqualified**. DLHS-4 and academic district-TFR reconstructions — discontinued/one-off, no stable licence. **CRS-derived "district IMR" is a registration-completeness artefact, not a true rate** — under-registration worse in EAG states, would flatter already-worse-off states. Flagged should-not-ship (Part 4).

### 3.6 Blocked-source reassessment

| Item | Status | Detail |
|---|---|---|
| NDAP | Partial workaround | PIB release states data can be "downloaded and merged freely" — implies bulk UI download may bypass the Cognito API, but the SPA blocks automated confirmation. No mirror elsewhere (nitiforstates.gov.in bot-protected, 403). |
| RBI QSDCB | **Still blocked** | District Statements 4A/4B named "public," but `dbie.rbi.org.in` serves a mismatched TLS cert (confirmed via `openssl s_client`: presents `data.rbi.org.in`'s cert). Distinct from the general bot-wall issue: 3/3 other rbi.org.in/rbidocs.rbi.org.in docs downloaded fine via plain curl with correct CA bundle. Needs a human browser session specifically for dbie. |
| UDISE+ district | Still blocked | Only state-level booklets found (2024-25). Per-school PDFs are public but harvesting thousands per district is impractical at scale. |
| CPCB | Partial workaround | CCR dashboard (`app.cpcbccr.com/ccr`) export works — station/city-level, rate-limited, not district-native. **aqicn.org/WAQI mirror disqualified** — terms ban commercial/paid-app use. |
| Census 2001 | **Workaround found** | censusindia.gov.in's NADA archive hosts 2001 Primary Census Abstract/District Handbooks as direct per-district PDFs — replaces SHRUG's NC pc01. Licence unverified but legitimate. |

### 3.7 data.gov.in scan finds (not already held)

| Source | Dataset | Level | Licence | Diff | Route |
|---|---|---|---|---|---|
| Dept. Land Resources | Watershed Development KPIs (WDC-PMKSY 2.0) | District | GODL | 2 | [data.gov.in](https://www.data.gov.in/catalog/district-wise-key-performance-indicators) |
| MoSPI/CSO | District GDP, 2004-05 series | District | GODL | 2 | [data.gov.in](https://www.data.gov.in/catalog/district-wise-gdp-and-growth-rate-current-price2004-05) — stale, superseded by §3.1 |
| Ministry of MSME | District-wise MSME/Udyam registered enterprises | District | GODL | 1 | [data.gov.in](https://www.data.gov.in/resource/district-wise-total-msme-registered-enterprises-under-udyam-registration-till-last-date) |
| UIDAI | District-wise daily Aadhaar generation | District, daily | GODL | 2 | [data.gov.in](https://www.data.gov.in/catalog/district-wise-daily-details-aadhaar-generated) |
| eCommittee, Supreme Court | Court-wise e-Filed case counts | District court | GODL | 3 | [data.gov.in](https://www.data.gov.in/resource/court-wise-number-total-cases-e-filed-district-court-under-ecourts-mission-mode-project-31); live [njdg.ecourts.gov.in](https://njdg.ecourts.gov.in/) |
| Ministry of Jal Shakti | First Census of Water Bodies (2017-18) | District (within per-state PDF) | GODL | 3 | [data.gov.in](https://www.data.gov.in/catalog/first-census-water-bodies-data) |
| NMCG/Jal Shakti | District-wise Namami Ganga status | District (Ganga-basin only) | Unverified | 3 | [aikosh.indiaai.gov.in](https://aikosh.indiaai.gov.in/home/datasets/details/district_wise_namami_ganga_as_on_date.html) |

**MoSPI ecosystem**, directly verified via API: state-only confirmed for PLFS, NSS76/78/79/80, UDISE (indicator layer). **Economic Census is the one genuine district-level exception.** data.gov.in's catalog/search/sitemap paths are robots-blocked to automated fetch — manual browsing needed for further holdings.

**Census 2027 status**: gazette notification issued for the 16th Census — 1 Oct 2026 (Ladakh + snow-bound J&K/HP/Uttarakhand) and 1 Mar 2027 (rest of India); first fully digital census; caste enumeration included ([Drishti IAS](https://www.drishtiias.com/state-pcs-current-affairs/centre-issues-notification-for-the-2027-census); [India Briefing](https://www.india-briefing.com/news/indias-next-population-census-set-for-2027-38072.html/)). Table releases have historically lagged enumeration 2-5yrs (2011 PCA: 2011-13) — no near-term crosswalk impact, but delimitation is linked to this census; watch for boundary-revision signals once data releases (~2028+).

## 4. Part 3 — Good-to-have (remote sensing & differentiators)

| Source | Dataset | Level | Vintage | Format | Licence | Diff | Route |
|---|---|---|---|---|---|---|---|
| ESA/VITO | WorldCover 10m — built-up + cropland | Global 10m raster | 2020, 2021 (2 epochs only) | Cloud-Optimized GeoTIFF | **CC BY 4.0** (verified) | 2 | [esa-worldcover.org](https://esa-worldcover.org/en/data-access) — direct S3, no login |
| Google/WRI/NatGeo | Dynamic World V1 | Global 10m raster | 2015-present, updated 2-5 days | Earth Engine only | CC BY 4.0, but EE free tier is non-commercial — **needs paid GCP billing for ad-supported use** | 3 | [GEE catalog](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1) |
| EC Joint Research Centre | GHS-BUILT-S R2023A | Global 100m raster | 1975-2030, 5-yr steps (later epochs may be modelled, verify cutoff) | GeoTIFF | **CC BY 4.0** (verified) | 2 | [JRC/Copernicus](https://human-settlement.emergency.copernicus.eu/download.php) — only ~50yr built-up trend available |
| ISRO/NRSC | Bhuvan LULC | National, district-aggregable | ~1985-2016 + annual AWiFS | WMS viewing; shapefile for registered users only | **DISQUALIFIED** — ToS bars redistribution/resale and bulk download | — | Hard no |
| NASA Goddard/LP DAAC | Black Marble VNP46A2/3/4 (nightlights) | Global 500m raster | 2012-present, daily | HDF5 or GEE | **Public domain** — **recommended primary nightlights source, replaces SHRUG** | 3 | [GEE catalog](https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2) |
| EOG (Colorado Sch. of Mines) | VIIRS VNL annual composites | Global ~500m raster | 2012-2026 | GeoTIFF | Data public domain, but direct API **paid since 1 Jun 2026** | 3 (via GEE)/4 (direct) | Backup/cross-check only — [eogdata.mines.edu](https://eogdata.mines.edu/products/vnl/) |
| Dev Data Lab | SHRUG nightlights | shrid2 (stale geography) | DMSP-OLS/early VIIRS | CSV | **DISQUALIFIED — CC BY-NC-SA** | — | Superseded by Black Marble |
| NASA JPL/GSFC | SMAP L4 Soil Moisture | Global 9km raster | 2015-present, 3-hourly | HDF5/GEE | **Public domain** | 3 | [GEE catalog](https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008) — resolves inside all but smallest districts |
| Copernicus C3S/ECMWF | ERA5-Land (heatwave-day derivation) | Global 0.1° raster | 1950-present, monthly | NetCDF/GRIB via CDS API | **CC BY 4.0**, commercial explicit | 3 | [CDS](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land) |
| WashU ACAG | SatPM2.5 V6.GL.02.04 | Global 0.01°/0.1° raster | 1998-2023, annual | NetCDF/GeoTIFF | **CC BY 4.0** (verified) | 2 | [sites.wustl.edu/acag](https://sites.wustl.edu/acag/datasets/surface-pm2-5/) — possible upgrade to held UrbanEmissions/APnA PM2.5 |

**Not worth it**: Bhuvan/ISRO — ToS-disqualified regardless of topic. SHRUG nightlights — NC + stale geography, fully superseded. Global SPEI drought index — licence fine but 0.5°(~55km) grid too coarse for most districts, plus ODbL share-alike overhead. True crop-*type* classification (wheat/rice/cotton) — not an off-the-shelf remote-sensing product; use Agriculture-dept statistics instead. Building against eogdata.mines.edu directly — paid-gated since Jun 2026, use Black Marble instead.

## 5. Part 4 — Derived / combination metrics

All computable from already-held data (§4 of brief) plus new supply above. Formulas are illustrative field names.

| # | Metric | Formula | Trap |
|---|---|---|---|
| D1 | Dependency ratio | `(pop_0_14 + pop_60plus) / pop_15_59` (Census 2011 PCA) | 2011 age structure is 15yrs stale — label "2011," not "current" |
| D2 | Gender literacy gap | `male_literacy_pct − female_literacy_pct` (PCA) | Report as pp-gap not ratio (ratio distorts at low base); small-denominator instability in tiny UT districts |
| D3 | Gender work-participation gap | `male_WPR − female_WPR` (PCA worker categories) | Census "worker" def undercounts informal/unpaid female ag labour — gap partly a measurement artefact |
| D4 | Per-capita normalisations (UPI, MGNREGA, GST) | `metric / population` | **Denominator mismatch**: metric is 2024-25, population is 2011-derived — the brief's flagged "most likely error"; must state vintage or inflate population explicitly |
| D5 | Urban-rural differentials | `literacy_urban − literacy_rural`, similar for sanitation (Census/NFHS-5 rural-urban split) | Ecological aggregation masks ward-level variation (MAUP at sub-district scale) |
| D6 | GDDP per-capita (matched vintage) | `district_GDDP / population_est_same_year` (§3.1 states only) | Cross-state vintage mismatch (Kerala 2024-25 vs HP 2015-16) — don't rank without a visible vintage column; don't backfill missing states as zero |
| D7 | Composite development index | Weighted blend: NITI MPI (inv.) + NFHS-5 health z-scores + literacy + GDDP/capita | Arbitrary weights drive the ranking; inputs span 2011-2025 vintages; combining differently-built indices reintroduces MAUP |
| D8 | Residual: "literacy higher than income predicts" | Regress literacy on GDDP/capita (states with GDDP only); report residual | **Ecological fallacy**; only ~13/36 states have GDDP — excluded states aren't "average," they're missing; regression sensitive to outliers |
| D9 | Residual: "crime rate vs poverty predicted" | Regress NCRB crime rate on NITI MPI | Same ecological-fallacy risk; crime *reporting* varies by state policing culture, confounding the residual |
| D10 | Groundwater stress vs agri-dependency | `%area_over_exploited (CGWB, block-aggregated) vs %workforce_agri` (Census) | **MAUP, explicitly**: district = an aggregation choice over blocks; also 2011 workforce vs 2025 groundwater |
| D11 | Migration intensity vs income | `in_migration_rate (D-series) vs GDDP/capita` | Vintage mismatch (2011 vs 2020s); only in-migration exists, no district-pair corridor (§3.2) |
| D12 | Small-denominator instability (cross-cutting) | Any rate with numerator <~50 events | Simpson's-paradox-adjacent: state story built from wildly different district population bases can invert the true pattern; suppress/wide-interval-flag low-count districts |

**Should NOT ship**: CRS-derived "district IMR" without a heavy under-registration caveat (flatters already-worse-off states, see §3.5). Any per-capita metric using raw 2011 population for a 2023+ numerator without a visible vintage label. Cross-state GDDP ranking mixing vintages without a vintage column. A national D8/D9-style ranking when only ~13/36 states have inputs (implies non-covered = "average," not unmeasured). Any district-to-district migration "corridor" — the table doesn't exist, would require fabrication.

## 6. Prioritised Acquisition Backlog

Scored 1-5 on Demand(D)/Obtainability(O)/Licence-safety(L); Composite=D+O+L (max 15). Derived metrics interleaved — they're free.

| Rank | Item | Type | D | O | L | Score | Note |
|---|---|---|---|---|---|---|---|
| 1 | GDDP-per-capita, matched-vintage population | Derived | 4 | 5 | 5 | 14 | Ship alongside #3; no acquisition cost |
| 2 | Gender-gap composite (literacy+WPR) | Derived | 4 | 5 | 5 | 14 | Already-held data only |
| 3 | District GDDP — Kerala, Maharashtra, Rajasthan, Karnataka, Uttarakhand | Acquisition | 5 | 4 | 4 | 13 | Cleanest licence+vintage of the 13 available |
| 4 | NITI Aspirational Districts/Blocks composite | Acquisition | 5 | 4 | 3 | 12 | Verify licence before ingest |
| 5 | Economic Census EC6 (district establishments/workers) | Acquisition | 3 | 5 | 4 | 12 | Via MoSPI API; flag 2013-14 vintage |
| 6 | MSME/Udyam district registered enterprises | Acquisition | 3 | 5 | 4 | 12 | GODL, current/rolling |
| 7 | NASA Black Marble nightlights | Acquisition | 2 | 5 | 5 | 12 | Replaces SHRUG cleanly |
| 8 | ESA WorldCover built-up + cropland | Acquisition | 2 | 5 | 5 | 12 | One file, two Part-3 asks |
| 9 | Watershed Development KPIs (data.gov.in) | Acquisition | 2 | 5 | 5 | 12 | Easy GODL win |
| 10 | Groundwater-stress vs agri-dependency residual | Derived | 3 | 4 | 5 | 12 | Ship with prominent MAUP caveat; depends on #13 |
| 11 | Census D-series migration (in-migration only) | Acquisition | 3 | 4 | 3 | 10 | Same DDW pipeline as held PCA |
| 12 | Census HLPCA housing (village/ward→district) | Acquisition | 3 | 4 | 3 | 10 | Same pipeline as held PCA/C-01 |
| 13 | CGWB groundwater, block→district aggregation | Acquisition | 4 | 3 | 2 | 9 | High demand, needs aggregation work |
| 14 | Census C-20 disability | Acquisition | 2 | 4 | 3 | 9 | Same DDW pipeline, low difficulty |
| 15 | Rural Health Statistics facility counts | Acquisition | 3 | 3 | 2 | 8 | Licence needs manual re-check |

## 7. Dead ends

- **Census language tables** (C-16, C-17) — India/state-only, no district resolution despite a 7-year processing delay.
- **District-to-district migration corridors** — D-series only publishes state-to-state flows; no named-origin-district table exists.
- **RBI QSDCB automated access** — blocked by a `dbie.rbi.org.in`-specific TLS cert defect, distinct from the general rbi.org.in bot-wall (which is otherwise fixed). Needs a human browser session.
- **UDISE+ district-level** — still auth-walled; per-school PDF harvesting impractical at atlas scale.
- **Central bulk district-level land-use classification** — DAC's product is state-only; the one genuinely-district portal was unreachable (not confirmed dead); ICRISAT is licence-disqualified and uses obsolete boundaries.
- **District GDDP, confirmed no current publication**: Gujarat, Andhra Pradesh, Odisha (14yrs stale), Haryana, Assam, Chhattisgarh, Himachal Pradesh (stale one-off).
- **CPCB automated/API access** — no clean programmatic route; dashboard export only, rate-limited; common WAQI/aqicn.org mirror explicitly disqualified (commercial-use ban).
- **Bhuvan/ISRO, any layer** — disqualified outright by ToS, independent of topic.
- **True crop-type remote-sensing classification** — not an off-the-shelf product from any source checked; a research project, not an ingestion task. Use Agriculture-dept statistics instead.
- **District-level IMR/TFR from a genuinely separate, current, all-India source** — doesn't exist; NFHS-5 (held) remains the best proxy, SRS is state-only by design, AHS is 13+yrs stale (9 states only), CRS-derived rates are a registration artefact (should-not-ship, Part 4).
