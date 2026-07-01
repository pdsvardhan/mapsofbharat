"""NFHS-5 (2019-21) district factsheet indicators -> canonical store.

Source: IIPS/MoHFW district factsheet compilation (raw-new/health/). District
level only — state factsheets are published separately and unweighted district
averages would be wrong, so no state rows here.
Run: pipeline/.venv/bin/python pipeline/ingest_nfhs5.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(PIPE, "raw-new", "health", "nfhs5_district_factsheets_provisional.csv")
SOURCE = "NFHS-5 (2019-21) District Factsheets, IIPS / MoHFW"
URL = "http://rchiips.org/nfhs/districtfactsheet_NFHS-5.shtml"
LICENSE = "Govt. of India publication"
YEAR = 2021
FETCHED = "2026-06-10T20:30:00Z"
METHODOLOGY = ("Survey estimate from NFHS-5 (2019-21) district factsheets (IIPS/MoHFW). "
               "District names matched to current boundaries (95% match); Delhi sub-districts "
               "and a few renamed districts could not be mapped 1:1 and are absent. District level only — "
               "state factsheets are a separate series and unweighted district averages would be wrong.")

# (metric_id, display name, source column, higher_is_better)
PICKS = [
    ("nfhs5_stunting_u5", "Children under 5 stunted",
     "Children under 5 years who are stunted (height-for-age)18 (%)", 0),
    ("nfhs5_underweight_u5", "Children under 5 underweight",
     "Children under 5 years who are underweight (weight-for-age)18 (%)", 0),
    ("nfhs5_women_anaemia", "Women (15-49) anaemic",
     "All women age 15-49 years who are anaemic22 (%)", 0),
    ("nfhs5_institutional_births", "Institutional births",
     "Institutional births (in the 5 years before the survey) (%)", 1),
    ("nfhs5_full_immunization", "Children 12-23m fully vaccinated",
     "Children age 12-23 months fully vaccinated based on information from either vaccination card or mother's recall11 (%)", 1),
    ("nfhs5_improved_sanitation", "Households with improved sanitation",
     "Population living in households that use an improved sanitation facility2 (%)", 1),
    ("nfhs5_clean_fuel", "Households using clean cooking fuel",
     "Households using clean fuel for cooking3 (%)", 1),
    ("nfhs5_health_insurance", "Households with health insurance",
     "Households with any usual member covered under a health insurance/financing scheme (%)", 1),
    ("nfhs5_child_marriage", "Women 20-24 married before 18",
     "Women age 20-24 years married before age 18 years (%)", 0),
]


def main():
    df = pd.read_csv(CSV, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # resolve picked columns (factsheet headers carry footnote digits; match loosely)
    def find_col(want):
        if want in df.columns:
            return want
        base = want[:60].lower()
        for c in df.columns:
            if c.lower().startswith(base[:40]):
                return c
        raise KeyError(want)

    rid_of = {}
    unmatched = []
    for _, r in df.iterrows():
        rid = m.match(r["State/UT"], r["District Names"])
        if rid:
            rid_of[(r["State/UT"], r["District Names"])] = rid
        else:
            unmatched.append(f'{r["State/UT"]}/{r["District Names"]}')
    cov = len(rid_of) / len(df) * 100
    print(f"NFHS district match: {len(rid_of)}/{len(df)} ({cov:.1f}%) ; fuzzy={len(m.fuzzy_log)}")
    if unmatched:
        print("unmatched:", unmatched[:20])
    assert cov >= 80, f"match coverage {cov:.1f}% below gate (80%)"

    total = 0
    for mid, name, col, hib in PICKS:
        col = find_col(col)
        vals = {}
        for (key, rid) in rid_of.items():
            raw = df.loc[(df["State/UT"] == key[0]) & (df["District Names"] == key[1]), col]
            v = pd.to_numeric(raw.iloc[0] if len(raw) else None, errors="coerce")
            if pd.notna(v) and 0 <= v <= 100:
                # last-write-wins on duplicate rid (factsheet rows are unique anyway)
                vals[rid] = round(float(v), 1)
        upsert_metric(con, mid, name, "health", "%", 1, hib,
                      f"NFHS-5 district factsheet indicator: {col[:160]}",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {n} districts")
    log_load(con, "ingest_nfhs5.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"9 indicators; match {len(rid_of)}/{len(df)}; fuzzy {len(m.fuzzy_log)}; unmatched {len(unmatched)}")
    con.commit(); con.close()
    print(f"WROTE {total} values. fuzzy mappings: {m.fuzzy_log[:12]}")


if __name__ == "__main__":
    main()
