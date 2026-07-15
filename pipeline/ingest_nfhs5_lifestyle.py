"""NFHS-5 lifestyle & vice indicators -> canonical store (iter-12 item 588).

Same source file and conventions as ingest_nfhs5.py (district factsheet
compilation, raw-new/health/): parenthesised small-sample estimates arrive as
negative numbers and are recovered as absolute values; '*' suppressions stay
absent; district level only. This adapter ships the "lifestyle pack" — the
shareable behavioural/clinical indicators the health vertical never used:
alcohol, tobacco, obesity, C-section, sex ratio at birth, teen motherhood,
blood pressure and blood sugar. New category: lifestyle.

Note on citation: rchiips.org factsheet URLs went dead in 2025-26 (404 +
expired cert); the NFHS home is now nfhsiips.in. Cited accordingly.

Run: pipeline/.venv/bin/python pipeline/ingest_nfhs5_lifestyle.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(PIPE, "raw-new", "health", "nfhs5_district_factsheets_provisional.csv")
SOURCE = "NFHS-5 (2019-21) District Factsheets, IIPS / MoHFW"
URL = "https://www.nfhsiips.in/nfhsuser/nfhs5.php"
LICENSE = "Govt. of India publication"
YEAR = 2021
FETCHED = "2026-06-10T20:30:00Z"
METHODOLOGY = ("Survey estimate from NFHS-5 (2019-21) district factsheets (IIPS/MoHFW). "
               "District names matched to current boundaries; Delhi sub-districts and a few "
               "renamed districts could not be mapped 1:1 and are absent. District level only — "
               "state factsheets are a separate series and unweighted district averages would "
               "be wrong. Small-sample estimates (25-49 unweighted cases, printed in "
               "parentheses by IIPS) are ingested at face value; suppressed cells (<25 cases) "
               "stay absent.")

# (metric_id, display name, source column prefix, unit, higher_is_better,
#  valid_range) — hib None where neither direction is "better" (C-section).
PICKS = [
    ("nfhs5_alcohol_men", "Men who consume alcohol",
     "Men age 15 years and above who consume alcohol", "%", 0, (0, 100)),
    ("nfhs5_alcohol_women", "Women who consume alcohol",
     "Women age 15 years and above who consume alcohol", "%", 0, (0, 100)),
    ("nfhs5_tobacco_men", "Men who use tobacco",
     "Men age 15 years and above who use any kind of tobacco", "%", 0, (0, 100)),
    ("nfhs5_tobacco_women", "Women who use tobacco",
     "Women age 15 years and above who use any kind of tobacco", "%", 0, (0, 100)),
    ("nfhs5_women_obese", "Women overweight or obese",
     "Women (age 15-49 years) who are overweight or obese", "%", 0, (0, 100)),
    ("nfhs5_women_bmi_low", "Women with below-normal BMI",
     "Women (age 15-49 years) whose Body Mass Index (BMI) is below normal", "%", 0, (0, 100)),
    ("nfhs5_csection", "Births by C-section",
     "Births delivered by caesarean section", "%", None, (0, 100)),
    ("nfhs5_csection_private", "C-sections in private facilities",
     "Births in a private health facility that were delivered by caesarean section",
     "%", None, (0, 100)),
    ("nfhs5_srb", "Sex ratio at birth (last 5 years)",
     "Sex ratio at birth for children born in the last five years",
     "F / 1000 M", 1, (300, 1500)),
    ("nfhs5_teen_mothers", "Teen mothers (15-19 already mothers/pregnant)",
     "Women age 15-19 years who were already mothers or pregnant", "%", 0, (0, 100)),
    ("nfhs5_bp_high_women", "Women with elevated blood pressure",
     "Women age 15 years and above wih Elevated blood pressure", "%", 0, (0, 100)),
    ("nfhs5_bp_high_men", "Men with elevated blood pressure",
     "Men age 15 years and above wih Elevated blood pressure", "%", 0, (0, 100)),
    ("nfhs5_sugar_high_women", "Women with high blood sugar",
     "Women age 15 years and above wih high or very high (>140 mg/dl) Blood sugar",
     "%", 0, (0, 100)),
    ("nfhs5_sugar_high_men", "Men with high blood sugar",
     "Men age 15 years and above wih high or very high (>140 mg/dl) Blood sugar",
     "%", 0, (0, 100)),
]


def main():
    df = pd.read_csv(CSV, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # loose prefix match — factsheet headers carry footnote digits/typos ("wih")
    def find_col(prefix):
        low = prefix.lower()
        hits = [c for c in df.columns if c.lower().startswith(low)]
        assert len(hits) == 1, f"column prefix {prefix!r} matched {len(hits)}: {hits[:3]}"
        return hits[0]

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
    assert cov >= 80, f"match coverage {cov:.1f}% below gate (80%)"

    total = 0
    for mid, name, prefix, unit, hib, (lo, hi) in PICKS:
        col = find_col(prefix)
        vals = {}
        for (key, rid) in rid_of.items():
            raw = df.loc[(df["State/UT"] == key[0]) & (df["District Names"] == key[1]), col]
            v = pd.to_numeric(raw.iloc[0] if len(raw) else None, errors="coerce")
            # negative = parenthesised small-sample estimate (see module docstring)
            if pd.notna(v) and -hi <= v < 0:
                v = -v
            if pd.notna(v) and lo <= v <= hi:
                vals[rid] = round(float(v), 1)
        upsert_metric(con, mid, name, "lifestyle", unit, 1, hib,
                      f"NFHS-5 district factsheet indicator: {col[:160]}",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {n} districts")
    log_load(con, "ingest_nfhs5_lifestyle.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"14 lifestyle indicators; match {len(rid_of)}/{len(df)}; "
             f"fuzzy {len(m.fuzzy_log)}; unmatched {len(unmatched)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across {len(PICKS)} metrics.")


if __name__ == "__main__":
    main()
