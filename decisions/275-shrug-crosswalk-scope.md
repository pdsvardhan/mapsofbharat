# To-do 275 — scoping a replacement for the SHRUG sub-district geometry

Prepared 2026-07-27. **Scope only — no decision taken, no code changed.**

## What is actually SHRUG-derived

Narrower than the to-do implied, and the to-do's file path was wrong.

| Input | Source | Licence | Status |
|---|---|---|---|
| Sub-district PCA counts (`pipeline/raw/2011-IndiaStateDistSbDist.xlsx`) | **Official ORGI** | Government | Clean |
| District PCA (`2011-IndiaStateDist.xlsx`) | **Official ORGI** | Government | Clean |
| `public/geo/districts.geojson` (735) | Survey-of-India compliant, in repo | — | Clean |
| `public/geo/districts-2011.geojson` (632) | Survey-of-India compliant, in repo | — | Clean |
| **`pipeline/raw/subdistrict.gpkg` (91 MB)** | **SHRUG** ([decisions/2026-06-09](2026-06-09-reaggregate-subdistrict-crosswalk.md):27) | **CC-BY-NC-SA** | **The whole problem** |

The to-do said `reaggregate.py` builds the crosswalk from
`pipeline/shrug/shrid2_spatial_stats.dta`. It does not — that file is read only by
`inspect_shrug.py`, an inspection script. `reaggregate.py:11` reads
`pipeline/raw/subdistrict.gpkg`, which is SHRUG's sub-district boundary file moved
into `raw/`. So exactly **one** input is contaminated, and it is geometry, not data.

Note the licence bites on *use*, not only redistribution: NC restricts commercial
exploitation of derived output, so "we never ship the .gpkg" does not clear it.

## The one legal nuance that widens the options

**The crosswalk geometry never reaches a user.** It is a build-time input used to
compute representative points for a point-in-polygon assignment; nothing is rendered
from it, and it is gitignored. Therefore the Survey-of-India boundary-depiction rules
— which are why `public/geo/*` is curated — **do not bind this file**. Only the
licence does.

That matters: a third-party boundary set that depicts J&K or Aksai Chin in a
non-Indian convention is normally disqualifying for this project, but is acceptable
for a build-time allocation step, provided no geometry from it is ever published.

## How much precision is actually at stake

Measured directly from the two boundary sets we already own:

```
current districts nesting >=98% inside ONE 2011 district ...... 735 of 735 (100%)
2011 parents that produced more than one current district .....  78 of 632
current districts SHARING a parent (need sub-district split) .. 181 of 735 (24.6%)
current districts alone in their parent (1:1, nothing needed).. 554 of 735 (75.4%)

fan-out:  1 child x554   2 x62   3 x11   4 x2   5 x2   6 x1
worst:    Warangal -> 6 · West Siang -> 5 · Mahbubnagar -> 5 · Adilabad -> 4 · Karimnagar -> 4
```

Concentrated in Telangana, Andhra Pradesh, Chhattisgarh and Arunachal — the states
that reorganised hardest after 2011.

So sub-district geometry earns its place for **181 districts**. For the other 554 the
mapping is 1:1 and needs no geometry beyond the district sets already in the repo.

## Options

### A — Drop sub-district geometry entirely. Zero new data.
Build the crosswalk from `districts-2011.geojson` → `districts.geojson` by areal
overlap. Both owned, both compliant, both already committed.

- **Cost:** the 181 shared-parent districts can no longer *derive* their Census-2011
  values; they would inherit the parent's rate and gain the existing `estimated`
  badge (adr-018/019 machinery already handles exactly this). Roughly a quarter of
  districts lose real 2011 values across every 2011-vintage metric — literacy, sex
  ratio, SC/ST, workers, assets, religion.
- **Effort:** low. ~1 day, plus re-verification against Census totals.
- **Licence risk:** eliminated.

### B — Re-source sub-district geometry under a clean licence.
Candidates: **geoBoundaries ADM3** (CC BY 4.0, [geoboundaries.org](https://www.geoboundaries.org/countryDownloads.html),
also on [HDX](https://data.humdata.org/dataset/geoboundaries-admin-boundaries-for-india)),
and LGD-derived tehsil sets such as [bharatlas](https://bharatlas.com/).

- **The blocker is keying, not availability.** `reaggregate.py` joins geometry to the
  ORGI PCA on a constructed 2011 census key (`state(2)+district(3)+subdistt(5)`),
  which SHRUG's file carries as `pc11_*` fields. geoBoundaries carries its own ids and
  a *current* vintage, not 2011 — so it needs a name-and-spatial match against ~5,969
  2011 sub-districts, which is exactly the error-prone step this pipeline was built to
  avoid. Any mismatch silently misallocates population.
- **Effort:** medium-high, and the risk is silent wrongness rather than failure.
- **Unverified:** whether any open-licence source publishes geometry keyed to **2011
  census sub-district codes**. That is the single question worth answering before
  choosing B, and I have not answered it.

### C — Keep SHRUG, accept and document.
Not recommended, and inconsistent: SHRUG's *data* was formally declined for this exact
reason (adr-024, to-do 204), while its *geometry* silently underpins far more.

## Recommendation

**Answer B's open question first — it is cheap and it decides everything.** If an
open-licence sub-district set keyed to 2011 census codes exists, B is clearly right and
costs nothing in accuracy. If none does, A is the honest fallback and its cost is now
quantified: 181 districts move from derived to inherited, with the badge already built.

Do not pick between A and B before that check.

## Not done here

- No verification that geoBoundaries ADM3 covers 2011-vintage sub-districts.
- No check of whether LGD publishes 2011-vintage sub-district boundaries directly.
- No re-run of `reaggregate.py` under either option.
- No assessment of whether the 181 affected districts skew the national picture (they
  are geographically clustered, so they might).
