"""UrbanEmissions satellite-derived PM2.5 -> canonical store (iter-98 item 673).

Completes the environment vertical's air-quality slot. CPCB (the official
monitor network) refuses non-browser connections from this host — confirmed
repeatedly (to-do 201) — and the owner chose UrbanEmissions.info's
satellite-derived district concentrations as the cited workaround
(2026-07-18): open academic publication, headless-fetchable, national
coverage no monitor network matches (641 of 640 census-2011 districts vs
~250 NAMP cities).

Source file: SI-Satellite-Derived-District-Concentrations.xlsx (APnA
programme), annual mean PM2.5 per 2011 census district, 1998-2016, derived
from van Donkelaar et al. satellite AOD retrievals. Latest year (2016) is
ingested as the headline value — one row per region, same as every other
single-vintage metric (the app's metric API keys values by region alone).

Region mapping: the file's `censuscode` column is the census-2011 NATIONAL
district serial (DT_CEN_CD is the within-state code — 641 rows collapse onto
72 keys if you use it), which region_keys.census2011_dt_code maps straight
onto current rids — no name matching. Two shape mismatches handled explicitly:
  - Delhi renders as ONE current district (07_9000, synthetic code): it takes
    UrbanEmissions' own state-level Delhi value (their aggregation, data_bystate
    sheet), not an average invented here.
  - 2011 districts with no current polygon of their own (Mumbai Suburban's
    separate row) are skipped; their area's current polygon takes its own row.
Post-2011 districts (Telangana 2016 carve-outs etc.) are left to
fill_new_districts.py, which inherits intensive metrics from the lineage
sibling with the value and cites the donor (adr-018/020/021).

Run: pipeline/.venv/bin/python pipeline/ingest_urbanemissions.py
     (then fill_new_districts.py, then regen_expectations.py)
"""
import os
import sqlite3

import pandas as pd

from region_match import DB, log_load, upsert_metric, write_values

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(PIPE, "raw-new", "environment", "urbanemissions-satpm25-districts.xlsx")
MID = "pm25_satellite"
SOURCE = "UrbanEmissions.info (APnA) — satellite-derived annual PM2.5, district concentrations"
URL = "https://urbanemissions.info/india-apna/"
LICENSE = "UrbanEmissions.info open publication; cite urbanemissions.info"
YEAR = 2016
FETCHED = "2026-07-18T00:30:00Z"
METH = ("Annual-average ambient PM2.5 per district, satellite-derived (aerosol optical depth "
        "retrievals calibrated to ground monitors, van Donkelaar et al.), published by "
        "UrbanEmissions.info under the APnA city programme, keyed to census-2011 district codes "
        "and mapped to current districts via the canonical census-code key. Delhi is one district "
        "on this map, so it carries UrbanEmissions' own NCT-wide value. Latest published year "
        "(2016) shown. Chosen over CPCB NAMP because the official monitor network covers ~250 "
        "cities while this series covers every district; CPCB remains the official ground truth "
        "and is tracked for a browser-assisted ingest (to-do 201).")

df = pd.read_excel(XLSX, sheet_name="data_bydistrict")
ds = pd.read_excel(XLSX, sheet_name="data_bystate")
con = sqlite3.connect(DB)

code2rid = {str(int(c)): rid for rid, c in con.execute(
    "SELECT code, census2011_dt_code FROM region_keys "
    "WHERE level='district' AND census2011_dt_code IS NOT NULL")}

vals: dict[str, float] = {}
unmatched = []
for _, r in df.iterrows():
    rid = code2rid.get(str(int(r["censuscode"])))
    if rid is None:
        unmatched.append(f"{r['dist_name']} ({r['state_name']})")
        continue
    vals[rid] = round(float(r["Y2016"]), 1)

delhi = ds[ds["state_name"].astype(str).str.strip().str.lower().str.contains("delhi")]
if len(delhi) == 1 and "07_9000" not in vals:
    vals["07_9000"] = round(float(delhi.iloc[0]["Y2016"]), 1)
    print(f"Delhi (07_9000) <- UrbanEmissions state row: {vals['07_9000']}")
else:
    assert "07_9000" in vals, f"Delhi fallback failed: {len(delhi)} state rows matched 'delhi'"

print(f"matched {len(vals)} current districts / {len(df)} source rows; "
      f"unmatched source rows ({len(unmatched)}): {unmatched}")

# A national series should reach the overwhelming majority of the 735 current
# districts before inheritance; anything less means the code key broke.
assert len(vals) >= 580, f"only {len(vals)} districts matched — mapping regression"

upsert_metric(con, MID, "PM2.5 annual average", "environment", "µg/m³", 1, 0,
              "Satellite-derived annual-average fine particulate (PM2.5) concentration",
              SOURCE, URL, LICENSE, YEAR, METH, "jenks")
n = write_values(con, MID, "district", YEAR, vals)
log_load(con, "ingest_urbanemissions.py", SOURCE, YEAR, LICENSE, FETCHED, n,
         f"district={n} unmatched_2011_rows={len(unmatched)} delhi=state-row Y2016 headline")
con.commit()
con.close()
print(f"WROTE {n} district values for {MID}.")
