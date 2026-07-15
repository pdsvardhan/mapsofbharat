"""20th Livestock Census (2019) district livestock -> canonical store (item 596).

Source: data.gov.in, 35 per-state "District-wise Details of Livestock Population
in <State> - 20th Livestock Census 2019" API resources (DAHD), pulled with the
project's OGD key into raw-new/livestock/<state>.json (manifest with resource
UUIDs at raw-new/livestock-manifest.csv; discovery method documented there).
Known source gaps: Delhi has no dataset in the catalog; Ladakh is inside the
J&K file (2019 vintage); DNH and DD appear as separate pre-merger UTs.

Record shape: {state_name, district_name, cattle, buffalo, sheep, goat, horse,
pony, mule, donkey, camel, pig, total_poultry}. Names are mostly 2011-era
(e.g. "Belgaum"), which the global ALIASES already map.

Metrics (district + state, category agriculture):
  livestock_cattle     cattle head count
  livestock_buffalo    buffalo head count
  livestock_goat       goat head count
  livestock_poultry    total poultry count
  cattle_per_1000      cattle per 1,000 people (Census 2011 population)

Counts SUM on crosswalk collisions. State value = sum over the state's source
rows (independent of district match). Per-1000 uses the stored pop_total.

Run: pipeline/.venv/bin/python pipeline/ingest_livestock.py
"""
import glob
import json
import os
import sqlite3
from collections import defaultdict

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "livestock")
SOURCE = ("20th Livestock Census 2019, DAHD (Dept. of Animal Husbandry & Dairying) "
          "— district-wise tables via data.gov.in")
URL = "https://www.data.gov.in/catalog/20th-livestock-census"
LICENSE = "Government Open Data License – India (data.gov.in)"
YEAR = 2019
FETCHED = "2026-07-16T00:55:00Z"
METHODOLOGY = (
    "20th Livestock Census (2019) district tables published by DAHD on data.gov.in "
    "(35 per-state resources; Delhi absent from the source catalog; Ladakh counted "
    "inside the J&K file). 2019 district names crosswalked onto the stored geometry "
    "(exact -> alias -> fuzzy, logged); counts SUM where several source districts "
    "map to one stored district. State value = sum of the state's source rows. "
    "cattle_per_1000 divides by Census 2011 population (the store's standard "
    "denominator, disclosed).")

SPECIES = [("cattle", "livestock_cattle", "Cattle", "head"),
           ("buffalo", "livestock_buffalo", "Buffaloes", "head"),
           ("goat", "livestock_goat", "Goats", "head"),
           ("total_poultry", "livestock_poultry", "Poultry", "birds")]

DIST_ALIASES = {
    "kheri": "lakhimpur kheri",
    "allahabad": "prayagraj",
    "faizabad": "ayodhya",
    "the nilgiris": "nilgiris",
    "garhwal": "pauri garhwal",
    "korea": "koriya",
    "muktsar": "sri muktsar sahib",
    "warangal": "warangal rural",
    "spsr nellore": "sri potti sriramulu nellore",
    "south salmara": "south salmara mankachar",
    "soraideu": "charaideo",
    "purbi champaran": "east champaran",
    "kanker": "uttar bastar kanker",
    "east nimar": "khandwa",
    "west nimar": "khargone",
    "siaha": "saiha",
    "sonepur": "subarnapur",
    "nawanshahr": "shahid bhagat singh nagar",
    "poonch": "punch",
    "leh ladakh": "leh",
    "north district": "north sikkim", "south district": "south sikkim",
    "east district": "east sikkim", "west district": "west sikkim",
    "tuticorin": "thoothukkudi",
    "kumuram bheem asifabad": "komaram bheem",
    "sant ravidas nagar": "bhadohi",
    "paraganas north": "north parganas", "paraganas south": "south parganas",
    "medinipur west": "paschim medinipur", "medinipur east": "purba medinipur",
    # NOT aliased: WB "Bardhaman" (the file prints the undivided pre-2017
    # district; a COUNT cannot be split across Purba/Paschim halves) and
    # Puducherry/Mahe (exclave absent from geometry) — logged, never guessed.
}

# 2019 files use pre-merger/pre-reorg states: DNH and DD (merged UT in our
# geometry) and Leh/Kargil printed under J&K (Ladakh UT in our geometry).
STATE_OVERRIDE = {
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
}
LADAKH_DISTRICTS = {"leh ladakh", "kargil", "leh"}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    d_acc = {mid: defaultdict(float) for _, mid, _, _ in SPECIES}
    s_acc = {mid: defaultdict(float) for _, mid, _, _ in SPECIES}
    unmatched, nrows = [], 0
    files = sorted(glob.glob(os.path.join(DIR, "*.json")))
    assert len(files) >= 30, f"only {len(files)} livestock files"

    for fp in files:
        recs = json.load(open(fp)).get("records", [])
        for r in recs:
            state, name = str(r.get("state_name", "")).strip(), str(r.get("district_name", "")).strip()
            if not state or not name:
                continue
            nrows += 1
            from region_match import norm
            state = STATE_OVERRIDE.get(norm(state), state)
            if norm(name) in LADAKH_DISTRICTS:
                state = "Ladakh"   # 2019 file predates the J&K/Ladakh reorg
            scode = m.state_code(state)
            if scode:
                for col, mid, _, _ in SPECIES:
                    s_acc[mid][scode] += num(r.get(col))
            rid = m.match(state, name, extra_aliases=DIST_ALIASES)
            if not rid and scode and len(m.by_state.get(scode, {})) == 1:
                rid = next(iter(m.by_state[scode].values()))
            if not rid:
                unmatched.append(f"{state}/{name}")
                continue
            for col, mid, _, _ in SPECIES:
                d_acc[mid][rid] += num(r.get(col))

    rate = (nrows - len(unmatched)) / max(nrows, 1) * 100
    print(f"rows: {nrows}; match {nrows - len(unmatched)}/{nrows} ({rate:.1f}%); "
          f"fuzzy {len(m.fuzzy_log)}")
    print("unmatched:", unmatched[:20], "..." if len(unmatched) > 20 else "")
    assert rate >= 90, f"match rate {rate:.1f}% below gate"

    total = 0
    for col, mid, label, unit in SPECIES:
        upsert_metric(con, mid, label, "agriculture", unit, 0, None,
                      f"{label} population per district, 20th Livestock Census 2019.",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        # keep TRUE ZEROS — a district with 0 buffalo is real data, not missing
        # (verifier-596: dropping them undercounted buffalo coverage).
        dvals = {k: round(v) for k, v in d_acc[mid].items()}
        svals = {k: round(v) for k, v in s_acc[mid].items()}
        n = write_values(con, mid, "district", YEAR, dvals)
        n += write_values(con, mid, "state", YEAR, svals)
        total += n
        print(f"  {mid}: {len(dvals)} districts, {len(svals)} states (stored)")

    # cattle per 1000 people (Census 2011 population)
    pop_d = dict(con.execute("SELECT region_code, value FROM metric_values "
                             "WHERE metric_id='pop_total' AND region_level='district'"))
    pop_s = dict(con.execute("SELECT region_code, value FROM metric_values "
                             "WHERE metric_id='pop_total' AND region_level='state'"))
    dv = {k: round(v / pop_d[k] * 1000, 1) for k, v in d_acc["livestock_cattle"].items()
          if pop_d.get(k, 0) > 0}
    sv = {k: round(v / pop_s[k] * 1000, 1) for k, v in s_acc["livestock_cattle"].items()
          if pop_s.get(k, 0) > 0}
    upsert_metric(con, "cattle_per_1000", "Cattle per 1,000 people", "agriculture",
                  "per 1000", 1, None,
                  "Cattle (2019) per 1,000 people (Census 2011 population).",
                  SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    total += write_values(con, "cattle_per_1000", "district", YEAR, dv)
    total += write_values(con, "cattle_per_1000", "state", YEAR, sv)
    print(f"  cattle_per_1000: {len(dv)} districts, {len(sv)} states")

    log_load(con, "ingest_livestock.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"5 livestock metrics from 35 data.gov.in resources; {nrows} rows, match "
             f"{rate:.1f}% ({len(unmatched)} unmatched, logged not guessed); Delhi absent "
             f"from source; counts summed on collisions; fuzzy {len(m.fuzzy_log)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across 5 metrics.")


if __name__ == "__main__":
    main()
