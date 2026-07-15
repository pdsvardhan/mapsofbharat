"""Census 2011 HH-14 household assets -> district asset metrics (item 591).

Source: Census 2011 Table HH-14 (Percentage of Households by Amenities and
Assets), one XLSX per district from the Census NADA portal
(raw-new/assets/hl14/HLPCA-<code>-2011_H14_census.xlsx; browser-downloaded).
Each file's district-total row (Tehsil code 00000, Rural/Urban = "Total",
area "District - ...") already carries percentages OF TOTAL HOUSEHOLDS for each
asset. Column map (pandas 0-index = census column number - 1):
  128 Television · 129 Computer+internet · 130 Computer no-internet ·
  135 Scooter/Motorcycle/Moped · 136 Car/Jeep/Van · 138 None of the assets

Metrics (district, category assets):
  assets_car        % households owning a car/jeep/van
  assets_computer   % households with a computer/laptop (with OR without internet)
  assets_tv         % households owning a television
  assets_scooter    % households owning a scooter/motorcycle/moped
  assets_none       % households owning NONE of the specified assets (deprivation)

Only the needed columns/rows are read (640 files), for speed. Where several
census districts map to one geometry district the percentages are AVERAGED
(these are household shares; no household counts are read here) and the collision
is logged — rare, since HH-14 uses 2011 codes matching the geometry vintage.

Run: pipeline/.venv/bin/python pipeline/ingest_assets.py
"""
import glob
import os
import sqlite3
from collections import defaultdict

import pandas as pd

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "assets", "hl14")
SOURCE = "Census of India 2011, Table HH-14 (Households by Amenities and Assets)"
URL = "https://censusindia.gov.in/nada/index.php/catalog/HH-14"
LICENSE = "Census of India, Govt. of India (open data)"
YEAR = 2011
FETCHED = "2026-07-16T00:35:00Z"
METHODOLOGY = (
    "Census 2011 Table HH-14 (Percentage of Households by Amenities and Assets), "
    "per-district files; the district-total row's published percentages of total "
    "households owning each asset. Computer = computer/laptop with OR without "
    "internet. 2011-vintage data. District names crosswalked to the current "
    "geometry (exact -> alias -> fuzzy, logged); where several census districts "
    "map to one stored district the shares are averaged.")

USECOLS = [0, 1, 2, 3, 4, 8, 9, 128, 129, 130, 135, 136, 138]
# metric -> (list of usecols positions to SUM for the value)
SPECS = [
    ("assets_car", "Households owning a car", "%", 0, [11]),          # col 136
    ("assets_computer", "Households with a computer", "%", 1, [8, 9]),  # 129+130
    ("assets_tv", "Households owning a television", "%", 1, [7]),      # col 128
    ("assets_scooter", "Households owning a two-wheeler", "%", 1, [10]),  # col 135
    ("assets_none", "Households owning none of the listed assets", "%", 0, [12]),  # 138
]

DIST_ALIASES = {
    "muktsar": "sri muktsar sahib", "sahibzada ajit singh nagar": "s a s nagar",
    "garhwal": "pauri garhwal", "dhaulpur": "dholpur", "kheri": "lakhimpur kheri",
    "allahabad": "prayagraj", "faizabad": "ayodhya", "sant ravidas nagar": "bhadohi",
    "jyotiba phule nagar": "amroha", "mahamaya nagar": "hathras",
    "kanshiram nagar": "kasganj", "the nilgiris": "nilgiris",
    "koch bihar": "cooch behar", "hugli": "hooghly", "haora": "howrah",
    "puruliya": "purulia", "maldah": "malda", "mumbai suburban": "mumbai",
    "north twenty four parganas": "north parganas",
    "south twenty four parganas": "south parganas",
    "north district": "north sikkim", "south district": "south sikkim",
    "east district": "east sikkim", "west district": "west sikkim",
}
STATE_REMAP = {"leh": "Ladakh", "kargil": "Ladakh"}
CENSUS_STATE_REMAP = {
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
}


def resolve_rid(m, state, name, norm):
    st = STATE_REMAP.get(norm(name)) or CENSUS_STATE_REMAP.get(norm(state), state)
    rid = m.match(st, name, extra_aliases=DIST_ALIASES)
    if rid:
        return rid
    if norm(state).startswith("andhra"):
        rid = m.match("Telangana", name, extra_aliases=DIST_ALIASES)
        if rid:
            return rid
    scode = m.state_code(st) or m.state_code(state)
    if scode and len(m.by_state.get(scode, {})) == 1:
        return next(iter(m.by_state[scode].values()))
    return None


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    from region_match import norm
    acc = {mid: defaultdict(list) for mid, *_ in SPECS}
    files = sorted(glob.glob(os.path.join(DIR, "*.xlsx")))
    assert len(files) >= 600, f"only {len(files)} HH-14 files"
    nrows, unmatched, bad = 0, [], 0

    for fp in files:
        try:
            # district-total row sits at raw index 7; read a small window
            df = pd.read_excel(fp, header=None, skiprows=7, nrows=3,
                               usecols=USECOLS, dtype=str)
        except Exception:
            bad += 1
            continue
        df.columns = list(range(len(USECOLS)))   # 0..12 aligned to USECOLS order
        # the district TOTAL row: tehsil(4)=="00000", area(8) startswith District, ru(9)=="Total"
        row = None
        for _, r in df.iterrows():
            if str(r[4]) == "00000" and str(r[6]).strip().lower() == "total" \
                    and str(r[5]).strip().startswith("District"):
                row = r
                break
        if row is None:
            bad += 1
            continue
        state, name = str(row[1]).strip(), str(row[3]).strip()
        nrows += 1
        rid = resolve_rid(m, state, name, norm)
        if not rid:
            unmatched.append(f"{state}/{name}")
            continue
        for mid, _, _, _, cols in SPECS:
            vals = [pd.to_numeric(row[c], errors="coerce") for c in cols]
            vals = [v for v in vals if pd.notna(v)]
            if vals:
                acc[mid][rid].append(round(sum(vals), 1))

    rate = (nrows - len(unmatched)) / max(nrows, 1) * 100
    print(f"district files: {nrows} (bad {bad}); match {nrows - len(unmatched)}/{nrows} "
          f"({rate:.1f}%); fuzzy {len(m.fuzzy_log)}")
    print("unmatched:", unmatched[:20], "..." if len(unmatched) > 20 else "")
    assert rate >= 90, f"match rate {rate:.1f}% below gate"

    total = 0
    for mid, name, unit, dec, cols in SPECS:
        vals = {rid: round(sum(vs) / len(vs), 1) for rid, vs in acc[mid].items() if vs}
        upsert_metric(con, mid, name, "assets", unit, dec, None,
                      name + " (Census 2011).", SOURCE, URL, LICENSE, YEAR,
                      methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {len(vals)} districts")

    log_load(con, "ingest_assets.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"5 asset metrics from {len(files)} HH-14 district files; {nrows} districts, "
             f"match {rate:.1f}% ({len(unmatched)} unmatched, logged); {bad} unreadable; "
             f"fuzzy {len(m.fuzzy_log)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across 5 metrics.")


if __name__ == "__main__":
    main()
