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

python3 add_rid.py        # assign canonical rid = "<st_code>_<dt_code>" to districts
python3 ingest_pca.py     # load Census 2011 PCA metrics
python3 reaggregate.py    # reaggregate sub-districts -> current districts (median-diff guard)
```

`reaggregate.py` refuses to write when a metric's reaggregated median differs by
>2% from the source, which is the first line of defence against silent data drift.

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
