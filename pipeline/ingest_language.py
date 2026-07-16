"""Census 2011 C-16 mother tongue -> district language metrics (item 590/598).

Source: Census 2011 Table C-16 (Population by Mother Tongue), per-state XLSX from
the Census NADA portal (raw-new/language/c16/DDW-C16-STMT-MDDS-<SS>00.XLSX).

Re-aggregated onto CURRENT district boundaries (item 598): instead of reading the
2011 district-total rows (which leave post-2011 districts empty), we read the
SUB-DISTRICT language-group rows and map each 2011 sub-district to its current
district via the `crosswalk` table built by reaggregate.py (2011 sub-district ->
current rid, point-in-polygon). Language-group counts (mother-tongue code ending
"000" — the census groups that partition the population) are summed per current
rid, so newly-formed districts (Anakapalli, Alluri Sitharama Raju, ...) get their
OWN exact mother-tongue composition. Then per current district:

  language_top_share   % speaking the single most-common mother tongue
  language_hindi_pct   % Hindi mother tongue (group code 006000)
  language_diversity   Simpson diversity, 1 - sum(share^2), 0-1

Category: language. The national file (SS=00) is skipped.

Run: pipeline/.venv/bin/python pipeline/ingest_language.py
"""
import glob
import os
import sqlite3
from collections import defaultdict

import numpy as np
import pandas as pd

from region_match import upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "language", "c16")
SOURCE = "Census of India 2011, Table C-16 (Population by Mother Tongue)"
URL = "https://censusindia.gov.in/nada/index.php/catalog/C-16"
LICENSE = "Census of India, Govt. of India (open data)"
YEAR = 2011
FETCHED = "2026-07-15T23:56:00Z"
METHODOLOGY = (
    "Census 2011 Table C-16 (Population by Mother Tongue). Mother-tongue GROUP "
    "totals (which partition the population exactly) are read at 2011 sub-district "
    "level and reaggregated onto current-day district boundaries via the same "
    "sub-district->current-district crosswalk used for the census PCA (ADR-010), so "
    "districts created after 2011 carry their own exact composition. Per district: "
    "top-language share, Hindi (group 006000) share, and the Simpson diversity index "
    "1 - sum(share^2) (0 = one mother tongue, 1 = maximally mixed).")

COLS = ["tbl", "st", "dt", "sd", "area", "mtcode", "mtname", "P"]


def main():
    con = sqlite3.connect(DB)
    xw = dict(con.execute("SELECT sd_code, rid FROM crosswalk"))
    assert xw, "crosswalk table empty — run reaggregate.py first"

    by_rid = defaultdict(lambda: defaultdict(float))   # rid -> {mtcode: P}
    n_sub, n_missing = 0, 0
    files = sorted(glob.glob(os.path.join(DIR, "DDW-C16-STMT-MDDS-*.XLSX")))
    files = [f for f in files if not os.path.basename(f).endswith("-0000.XLSX")]
    assert len(files) >= 30, f"only {len(files)} C-16 state files"

    for fp in files:
        df = pd.read_excel(fp, header=None, skiprows=6, dtype=str)
        df = df.iloc[:, :len(COLS)]
        df.columns = COLS
        df["Pn"] = pd.to_numeric(df["P"], errors="coerce")
        # sub-district language-group rows (district != 000, sub-district != 00000,
        # mother-tongue group total)
        sub = df[(df.dt != "000") & (df.sd != "00000")
                 & (df.mtcode.str.endswith("000")) & df.Pn.notna()]
        for st, dt, sd, mtcode, p in zip(sub.st, sub.dt, sub.sd, sub.mtcode, sub.Pn):
            sd_code = st.zfill(2) + dt.zfill(3) + sd.zfill(5)
            rid = xw.get(sd_code)
            if rid is None:
                n_missing += 1
                continue
            by_rid[rid][mtcode] += float(p)
        n_sub += sub.sd.nunique()

    print(f"aggregated to {len(by_rid)} current districts; {n_missing} sub-district rows "
          f"had no crosswalk match")
    assert len(by_rid) >= 700, f"only {len(by_rid)} districts — crosswalk coverage low?"

    top_share, hindi_pct, diversity = {}, {}, {}
    for rid, counts in by_rid.items():
        ps = np.array(list(counts.values()), dtype="float64")
        tot = ps.sum()
        if tot <= 0:
            continue
        top_share[rid] = round(float(ps.max()) / tot * 100, 1)
        hindi_pct[rid] = round(counts.get("006000", 0.0) / tot * 100, 1)
        diversity[rid] = round(float(1 - np.sum((ps / tot) ** 2)), 3)

    specs = [
        ("language_top_share", "Share speaking the top language", "%", 1, None, top_share),
        ("language_hindi_pct", "Hindi mother-tongue speakers", "%", 1, None, hindi_pct),
        ("language_diversity", "Linguistic diversity", "index", 3, None, diversity),
    ]
    total = 0
    for mid, name, unit, dec, hib, vals in specs:
        upsert_metric(con, mid, name, "language", unit, dec, hib,
                      name + " (Census 2011).", SOURCE, URL, LICENSE, YEAR,
                      methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {len(vals)} districts")

    log_load(con, "ingest_language.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"3 language metrics reaggregated from C-16 sub-districts via crosswalk; "
             f"{len(by_rid)} current districts (new districts included); {n_missing} "
             f"unmatched sub-district rows")
    con.commit(); con.close()
    print(f"WROTE {total} values across 3 metrics.")


if __name__ == "__main__":
    main()
