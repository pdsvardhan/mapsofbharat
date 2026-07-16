"""Census 2011 HH-14 household assets -> district asset metrics (item 591/598).

Source: Census 2011 Table HH-14 (Percentage of Households by Amenities and
Assets), one XLSX per district (raw-new/assets/hl14/HLPCA-<code>-2011_H14.xlsx).

Re-aggregated onto CURRENT district boundaries (item 598): each file's
SUB-DISTRICT total rows (Tehsil != 00000, area "Sub-Dist", Rural/Urban="Total")
carry the asset percentages for that 2011 sub-district; we map each sub-district
to its current district via the `crosswalk` table and take the POPULATION-WEIGHTED
mean (weights = 2011 sub-district population from the official ORGI sub-district
PCA, the same source reaggregate.py uses; HH-14 has no clean total-households
column, and population is very nearly proportional to households within a state).
So post-2011 districts get their own asset profile instead of no-data.

Column map (pandas 0-index = census column number - 1):
  128 Television · 129 Computer+internet · 130 Computer no-internet ·
  135 Scooter/Motorcycle/Moped · 136 Car/Jeep/Van · 138 None of the assets

Metrics (district, category assets): assets_car, assets_computer, assets_tv,
assets_scooter, assets_none.

Run: pipeline/.venv/bin/python pipeline/ingest_assets.py
"""
import glob
import os
import sqlite3
from collections import defaultdict

import pandas as pd

from region_match import upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "assets", "hl14")
SUBPCA = os.path.join(PIPE, "raw", "2011-IndiaStateDistSbDist.xlsx")
SOURCE = "Census of India 2011, Table HH-14 (Households by Amenities and Assets)"
URL = "https://censusindia.gov.in/nada/index.php/catalog/HH-14"
LICENSE = "Census of India, Govt. of India (open data)"
YEAR = 2011
FETCHED = "2026-07-16T00:35:00Z"
METHODOLOGY = (
    "Census 2011 Table HH-14 (Percentage of Households by Amenities and Assets): "
    "sub-district asset percentages reaggregated onto current-day district "
    "boundaries via the census sub-district crosswalk (ADR-010), population-weighted "
    "(2011 sub-district population, official ORGI PCA), so districts created after "
    "2011 carry their own asset profile. Computer = computer/laptop with OR without "
    "internet. 2011 vintage.")

# usecols -> renamed 0..10: state,district,tehsil,area,ru,tv,comp_wi,comp_woi,scooter,car,none
USECOLS = [0, 2, 4, 8, 9, 128, 129, 130, 135, 136]
USECOLS_ALL = USECOLS + [138]
SPECS = [
    ("assets_car", "Households owning a car", "%", 0, [9]),
    ("assets_computer", "Households with a computer", "%", 1, [6, 7]),
    ("assets_tv", "Households owning a television", "%", 1, [5]),
    ("assets_scooter", "Households owning a two-wheeler", "%", 1, [8]),
    ("assets_none", "Households owning none of the listed assets", "%", 0, [10]),
]


def main():
    con = sqlite3.connect(DB)
    xw = dict(con.execute("SELECT sd_code, rid FROM crosswalk"))
    assert xw, "crosswalk empty — run reaggregate.py first"
    off = pd.read_excel(SUBPCA, sheet_name="Data", dtype=str)
    sdf = off[(off["Level"] == "SUB-DISTRICT") & (off["TRU"] == "Total")].copy()
    sdf["sdc"] = sdf["State"].str.zfill(2) + sdf["District"].str.zfill(3) + sdf["Subdistt"].str.zfill(5)
    sdpop = dict(zip(sdf["sdc"], pd.to_numeric(sdf["TOT_P"], errors="coerce")))

    # rid -> metric -> [weighted_sum, weight_sum]
    acc = {mid: defaultdict(lambda: [0.0, 0.0]) for mid, *_ in SPECS}
    files = sorted(glob.glob(os.path.join(DIR, "*.xlsx")))
    assert len(files) >= 600, f"only {len(files)} HH-14 files"
    n_sub, n_missing, bad = 0, 0, 0

    for fp in files:
        try:
            df = pd.read_excel(fp, header=None, usecols=USECOLS_ALL, dtype=str)
        except Exception:
            bad += 1
            continue
        df.columns = list(range(len(USECOLS_ALL)))   # 0..10
        sub = df[(df[2] != "00000") & (df[4].astype(str).str.strip() == "Total")
                 & (df[3].astype(str).str.strip().str.startswith("Sub-Dist"))]
        for _, r in sub.iterrows():
            sd_code = str(r[0]).zfill(2) + str(r[1]).zfill(3) + str(r[2]).zfill(5)
            rid = xw.get(sd_code)
            w = sdpop.get(sd_code)
            if rid is None or not w or w <= 0:
                n_missing += 1
                continue
            n_sub += 1
            for mid, _, _, _, cols in SPECS:
                vals = [pd.to_numeric(r[c], errors="coerce") for c in cols]
                vals = [v for v in vals if pd.notna(v)]
                if len(vals) == len(cols):
                    a = acc[mid][rid]
                    a[0] += sum(vals) * w
                    a[1] += w

    print(f"aggregated {n_sub} sub-districts -> {len(acc['assets_car'])} current districts; "
          f"{n_missing} unmatched; {bad} unreadable files")
    assert len(acc["assets_car"]) >= 700, "district coverage too low"

    total = 0
    for mid, name, unit, dec, cols in SPECS:
        vals = {rid: round(ws / w, 1) for rid, (ws, w) in acc[mid].items() if w > 0}
        upsert_metric(con, mid, name, "assets", unit, dec, None,
                      name + " (Census 2011).", SOURCE, URL, LICENSE, YEAR,
                      methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {len(vals)} districts")

    log_load(con, "ingest_assets.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"5 asset metrics reaggregated from HH-14 sub-districts via crosswalk "
             f"(population-weighted); {n_sub} sub-districts -> "
             f"{len(acc['assets_car'])} current districts (new districts included)")
    con.commit(); con.close()
    print(f"WROTE {total} values across 5 metrics.")


if __name__ == "__main__":
    main()
