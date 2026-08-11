# MapsOfBharat — Data Pipeline

ETL that turns official Indian statistics into the canonical store
(`data/mapsofbharat.db`) the app reads. Everything here is **reproducible**: the
DB and large raw inputs are gitignored and rebuilt from the scripts below.

## Inputs (gitignored — download separately)

| Dir | Contents | Where to get it |
|---|---|---|
| `pipeline/raw/` | Census 2011 PCA workbooks (`.xlsx`) | Census of India — PCA / Primary Census Abstract downloads |
| `pipeline/shrug/` | SHRUG sub-district crosswalk (`.tab` / `.gpkg`) | [devdatalab SHRUG](https://www.devdatalab.org/shrug) |

Boundaries (`public/geo/districts.geojson`, `states.geojson`) are Survey-of-India
compliant current-day boundaries committed to the repo.

## Reproduce the canonical store

```bash
cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # openpyxl, pandas, shapely, etc.

python3 add_rid.py        # 1. assign canonical rid = "<st_code>_<dt_code>" to districts
python3 ingest_pca.py     # 2. load Census 2011 PCA metrics
python3 reaggregate.py    # 3. reaggregate sub-districts -> current districts (median-diff guard)
                          # 4. then every other ingest_*.py vertical, in any order

python3 fill_new_districts.py   # 5. MUST RUN LAST of the data passes (ADR-018)
python3 set_default_scales.py   # 6. data-driven class-break method per metric
python3 regen_expectations.py   # 7. re-baseline the standing drift guard
```

`reaggregate.py` refuses to write when a metric's reaggregated median differs by
>2% from the source, which is the first line of defence against silent data drift.

### Ordering is load-bearing: `fill_new_districts.py` runs last

`fill_new_districts.py` (ADR-018) fills post-2011 districts that a survey never
covered with an `estimated = 1` value inherited from their 2011-lineage sibling.
It needs every other adapter's real values already in place to pick a donor, so it
can only run after them. Without it the map is grey for 102 districts on PM2.5, 74
on each ASER indicator, 41 on MPI poverty, 39 on each NFHS-5 indicator, 14 on each
crime rate, and 13 on forest cover.

**Re-running one adapter re-opens the hole.** `write_values()` clears its
`(metric_id, region_level, year)` scope before inserting, which also deletes the
inherited rows sitting in that scope — and the adapter cannot rewrite them, because
inheritance needs the whole store to choose a donor. Measured 2026-08-11:
`ingest_ncrb.py` run standalone writes 692 districts + 36 states per crime metric
and destroys all 14 inherited rows, greying out Agar Malwa, Bametara, Bastar,
Dakshin Bastar Dantewada, Jangaon, Mancherial, North/South/West Tripura, Paschim
Bardhaman, South Salmara Mankachar, Warangal Rural, West Karbi Anglong and Yadadri
Bhuvanagiri.

Those rows are deleted rather than preserved on purpose: an inherited value is a
*copy* of its donor's current real value, so keeping it across a re-ingest that
moved the donor would leave a number that its own citation no longer explains — the
drift ADR-020 exists to prevent. Grey is honest; a stale estimate wearing a citation
is not.

**So: after re-running any adapter, re-run `fill_new_districts.py`.** It is
idempotent and takes seconds.

```bash
python3 ingest_ncrb.py          # or any other adapter
python3 fill_new_districts.py   # ALWAYS — restores the inherited rows just deleted
python3 validate_drift.py       # confirm the store is whole again
```

You are not relied on to remember. `write_values()` prints a loud warning at exit
naming every `(metric, year)` whose inherited rows it dropped, and the store stays
*detectably* broken until the fill re-runs: the deleted values leave their citations
behind in `district_estimate_source`, and both `validate_drift.py` and
`test_pipeline.py` fail while any citation explains no estimate.

## Canonical keys

- **`rid`** = `"<st_code>_<dt_code>"` (e.g. `27_521`) — the join key between
  `metric_values.region_code` and the `rid` property in `districts.geojson`.
- Adding the official **LGD** code as a second key is anticipated (ADR-002).

## Standing integrity checks

```bash
pytest -q test_pipeline.py            # structure, coverage, orphans, finiteness
python3 validate_drift.py             # re-validate live DB vs pipeline/expectations.json
```

`validate_drift.py` compares the live DB against `expectations.json` (metric
count, district coverage, per-metric counts) and exits non-zero on drift beyond
2%. Wire it via cron with `../scripts/validate-and-notify.sh`, which posts a
notification to the in-app error sink (`/api/log`) on failure.

It also enforces one invariant *structurally*, outside the 2% band: every citation
in `district_estimate_source` must still explain a live estimate. Percentage drift
cannot police that — losing all 14 inherited rows from a 706-district metric is
1.983% drift, which passed the 2% tolerance and reported a damaged store as `OK`
(measured 2026-08-11). Coverage loss this small is invisible as a ratio and total as
an outcome: the district goes grey.

To (re)generate the expectations baseline after an intentional data change:

```bash
python3 - <<'PY'
import json, sqlite3
c = sqlite3.connect("../data/mapsofbharat.db")
cov = c.execute("SELECT COUNT(DISTINCT region_code) FROM metric_values WHERE region_level='district'").fetchone()[0]
per = {mid: n for mid, n in c.execute("SELECT metric_id, COUNT(*) FROM metric_values WHERE region_level='district' GROUP BY metric_id")}
mc  = c.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]
json.dump({"metric_count": mc, "district_coverage": cov, "per_metric_district_count": per},
          open("expectations.json", "w"), indent=2)
print("wrote expectations.json")
PY
```

## Known data limitations (expected, documented)

- Reaggregated total population ≈ 1.191 B vs 1.211 B census (−1.6%) — sub-districts
  with no PCA row / failed point-in-polygon land in no current district (ADR-010).
- Merged districts (e.g. Mumbai City + Suburban) intentionally differ from
  official single-district figures; unchanged districts match exactly (0.00% median diff).
- Coverage is 730 / 732 unique current districts (2 gaps tracked in the backlog).
