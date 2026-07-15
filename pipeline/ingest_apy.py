"""APY (Area, Production, Yield) district crop statistics -> canonical store (#141).

Source: data.gov.in "District-wise, season-wise crop production statistics"
(Directorate of Economics & Statistics, DA&FW), crop_year 2014 snapshot on disk
at pipeline/raw-new/agriculture/datagov_APY_district_season_crop_2014.json —
10,973 rows of (state, district, season, crop, area_ha, production). Coverage is
PARTIAL: 22 states / ~427 source districts (APY 2014 did not report every state).

Three district metrics, chosen to be unit-clean and duplicate-free:
  - agri_rice_production   (tonnes)   crop == "Rice"
  - agri_wheat_production  (tonnes)   crop == "Wheat"
  - agri_cropped_area      (hectares) sum of area_ over individual crops

DATA TRAPS handled (verified against the raw file, iter-11):
  * The crop column mixes individual crops with PRE-AGGREGATED rows
    ("Total foodgrain", "Pulses total", "Oilseeds total"). These are excluded
    from the cropped-area sum so oilseeds/pulses are not double-counted.
  * "Paddy" appears ONLY for Assam and is an exact duplicate of that state's
    "Rice" rows (identical area+production per district+season). It is excluded
    everywhere so Assam rice/area is not doubled; "Rice" is the canonical entry.
  * area_/production_ are a mix of int and string; coerced with a tolerant
    parser (non-numeric -> skipped).

Gross cropped area counts each crop-season sowing (a field cropped twice in a
year contributes twice) — the standard "gross cropped area" concept.

Crosswalk: RegionMatcher (exact -> alias -> fuzzy, logged), >=90% district match
gate. Where several source districts map to one stored district, values SUM.
State value = sum over the state's source rows (independent of district match).

Run: pipeline/.venv/bin/python pipeline/ingest_apy.py
"""
import json
import os
import sqlite3
from collections import defaultdict

from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
SRC_FILE = os.path.join(PIPE, "raw-new", "agriculture", "datagov_APY_district_season_crop_2014.json")
SOURCE = ("Directorate of Economics & Statistics, DA&FW (data.gov.in) — "
          "District-wise, season-wise crop area & production (APY), crop year 2014")
URL = "https://data.gov.in/catalog/district-wise-season-wise-crop-production-statistics"
LICENSE = "Government Open Data License – India (data.gov.in)"
YEAR = 2014
FETCHED = "2026-07-01T19:08:00Z"

# never summed: pre-aggregated totals + Assam's duplicate "Paddy"
EXCLUDE_CROPS = {"Total foodgrain", "Pulses total", "Oilseeds total", "Paddy"}

# Documented renames / spelling variants APY-2014 prints vs the current geometry.
# Every value is verified present in region_keys for the relevant (in-scope) state
# — ONLY renames of the SAME unit, never a guess at a post-2014 split. Genuine
# splits (Bardhaman -> Purba/Paschim, Warangal -> Rural/Urban) and territorial
# reorgs (Leh/Kargil moved J&K -> Ladakh UT) are left unmatched, logged not guessed.
DIST_ALIASES = {
    "faizabad": "ayodhya",                         # UP (renamed 2018; guards vs a
                                                   # false fuzzy hit on "Firozabad")
    "poonch": "punch",                             # Jammu & Kashmir
    "kanker": "uttar bastar kanker",               # Chhattisgarh
    "korea": "koriya",                             # Chhattisgarh
    "paraganas south": "south parganas",           # West Bengal ("24" stripped by norm)
    "paraganas north": "north parganas",
    "medinipur west": "paschim medinipur",
    "medinipur east": "purba medinipur",
    "muktsar": "sri muktsar sahib",                # Punjab
    "nawanshahr": "shahid bhagat singh nagar",     # Punjab
    "spsr nellore": "sri potti sriramulu nellore", # Andhra Pradesh
    "kadapa": "ysr",                               # Andhra Pradesh
    "allahabad": "prayagraj",                      # Uttar Pradesh (renamed 2018)
    "kheri": "lakhimpur kheri",
    "sant kabeer nagar": "sant kabir nagar",
    "kushi nagar": "kushinagar",
    "sant ravidas nagar": "bhadohi",
    "kamrup metro": "kamrup metropolitan",         # Assam
    "purbi champaran": "east champaran",           # Bihar
    "east district": "east sikkim",                # Sikkim (pre-2021 four-district names)
    "north district": "north sikkim",
    "south district": "south sikkim",
    "west district": "west sikkim",
    "sonepur": "subarnapur",                       # Odisha
    "buldhana": "buldana",                         # Maharashtra
    "ahmadnagar": "ahmednagar",
}


def tonum(x):
    if x is None:
        return 0.0
    try:
        return float(x)
    except (ValueError, TypeError):
        return 0.0


def main():
    recs = json.load(open(SRC_FILE, encoding="utf-8"))["records"]
    assert recs and {"state_name", "district_name", "crop", "area_", "production_"} <= set(recs[0]), \
        f"unexpected fields: {list(recs[0].keys()) if recs else None}"

    # aggregate per (state, district)
    d_area, d_rice, d_wheat = defaultdict(float), defaultdict(float), defaultdict(float)
    for r in recs:
        st, dn, crop = r["state_name"].strip(), r["district_name"].strip(), r["crop"]
        key = (st, dn)
        a, p = tonum(r["area_"]), tonum(r["production_"])
        if crop not in EXCLUDE_CROPS and a > 0:
            d_area[key] += a
        if crop == "Rice" and p > 0:
            d_rice[key] += p
        if crop == "Wheat" and p > 0:
            d_wheat[key] += p

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # crosswalk district-level, sum on collisions; keep state totals independent
    rid_area, rid_rice, rid_wheat = defaultdict(float), defaultdict(float), defaultdict(float)
    st_area, st_rice, st_wheat = defaultdict(float), defaultdict(float), defaultdict(float)
    src_districts = set(d_area) | set(d_rice) | set(d_wheat)
    unmatched = []
    for (st, dn) in src_districts:
        scode = m.state_code(st)
        if scode:
            st_area[scode] += d_area.get((st, dn), 0.0)
            st_rice[scode] += d_rice.get((st, dn), 0.0)
            st_wheat[scode] += d_wheat.get((st, dn), 0.0)
        rid = m.match(st, dn, extra_aliases=DIST_ALIASES)
        if not rid and scode and len(m.by_state.get(scode, {})) == 1:
            rid = next(iter(m.by_state[scode].values()))
        if rid:
            rid_area[rid] += d_area.get((st, dn), 0.0)
            rid_rice[rid] += d_rice.get((st, dn), 0.0)
            rid_wheat[rid] += d_wheat.get((st, dn), 0.0)
        else:
            unmatched.append(f"{st}/{dn}")

    matched = len(src_districts) - len(unmatched)
    rate = matched / len(src_districts) * 100
    print(f"district match: {matched}/{len(src_districts)} ({rate:.1f}%); fuzzy={len(m.fuzzy_log)}")
    print("unmatched:", unmatched)
    assert rate >= 90, f"match rate {rate:.1f}% below 90% gate"

    # drop zero/empty entries; round to whole units
    def clean(d):
        return {k: round(v) for k, v in d.items() if v and v > 0}

    metrics = [
        ("agri_rice_production", "Rice production", "tonnes",
         "District rice production (tonnes), APY crop year 2014. 'Rice' crop only; "
         "Assam's duplicate 'Paddy' rows are excluded. Not every district grows "
         "rice, so coverage is a subset of reporting districts.",
         clean(rid_rice), clean(st_rice)),
        ("agri_wheat_production", "Wheat production", "tonnes",
         "District wheat production (tonnes), APY crop year 2014. 'Wheat' crop "
         "only. Wheat is a rabi crop grown mainly in the north and west, so many "
         "districts have no wheat rows.",
         clean(rid_wheat), clean(st_wheat)),
        ("agri_cropped_area", "Gross cropped area", "hectares",
         "District gross cropped area (hectares), APY crop year 2014: sum of sown "
         "area across all individual crops and seasons (a field cropped in two "
         "seasons counts twice). Pre-aggregated rows ('Total foodgrain', 'Pulses "
         "total', 'Oilseeds total') and Assam's duplicate 'Paddy' are excluded to "
         "avoid double-counting.",
         clean(rid_area), clean(st_area)),
    ]

    total = 0
    for mid, name, unit, methodology, dvals, svals in metrics:
        short = methodology.split(".")[0] + "."
        upsert_metric(con, mid, name, "agriculture", unit, 0, None,
                      short, SOURCE, URL, LICENSE, YEAR, methodology=(
                          methodology + " Source: data.gov.in APY (DES, DA&FW). Coverage: "
                          "22 states / ~427 reporting districts in the 2014 snapshot — "
                          "not a complete all-India census. District names crosswalked to "
                          "current geometry (exact -> alias -> fuzzy, logged); collisions "
                          "sum. State value = sum over the state's source rows."))
        n = write_values(con, mid, "district", YEAR, dvals)
        n += write_values(con, mid, "state", YEAR, svals)
        total += n
        print(f"{mid}: {len(dvals)} districts, {len(svals)} states, {n} values")

    log_load(con, "ingest_apy.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"3 agriculture metrics (rice/wheat production, gross cropped area) from "
             f"APY 2014; district match {rate:.1f}% ({len(unmatched)} unmatched, logged "
             f"not guessed); Paddy + pre-aggregate rows excluded; fuzzy {len(m.fuzzy_log)}; "
             f"skip_reason: 22-state partial coverage is the APY 2014 snapshot's own extent")
    con.commit()
    con.close()
    print(f"WROTE {total} values across 3 metrics. fuzzy sample: {m.fuzzy_log[:10]}")


if __name__ == "__main__":
    main()
