"""GST state-wise collections -> canonical store (iter-12 item 592).

Source: GSTN "GST Statistics" — statewise_GST_collection_<FY>.xlsx, direct
download from tutorial.gst.gov.in (verified fetchable from the server;
FY 2017-18 through 2026-27 files in raw-new/finance/). We ship the most recent
COMPLETE fiscal year (2025-26, "Data upto: 31st Mar 2026"), sheet
"Collections-Statewise": per-state domestic CGST/SGST/IGST/TOTAL for the FY.

Two metrics (new category: finance):
  - gst_total       state gross domestic GST collection, Rs crore, FY 2025-26
  - gst_per_capita  Rs per person, denominator Census 2011 population (the
                    project's standard denominator, disclosed in methodology)

Import-IGST is not attributable to a state and is excluded by using the
domestic statewise sheet (the source's own scope).

Run: pipeline/.venv/bin/python pipeline/ingest_gst.py
"""
import os
import sqlite3

import pandas as pd

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(PIPE, "raw-new", "finance", "statewise_GST_collection_2025-26.xlsx")
SOURCE = "GSTN — GST Statistics, state-wise domestic collection FY 2025-26 (data up to 31 Mar 2026)"
URL = "https://www.gst.gov.in/download/gststatistics"
LICENSE = "Govt. of India (GSTN) publication"
YEAR = 2026  # FY 2025-26
FETCHED = "2026-07-15T16:20:00Z"

METHODOLOGY = (
    "GSTN 'GST Statistics' state-wise domestic collection workbook for FY 2025-26 "
    "(sheet 'Collections-Statewise', data up to 31 Mar 2026): CGST+SGST+IGST domestic "
    "collection per state, Rs crore. Import IGST is not attributable to a state and is "
    "excluded by the source's own scope. Per-capita uses Census 2011 population (the "
    "canonical store's standard denominator; current population would lower per-capita "
    "values roughly proportionally everywhere).")


def main():
    df = pd.read_excel(XLSX, "Collections-Statewise", header=None)
    # header rows 4-5; data rows start at 6: [State CD, State, CGST, SGST, IGST, TOTAL]
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # GST still lists the pre-2020 UTs separately; our geometry has the merged
    # "Dadra and Nagar Haveli and Daman and Diu" — map both and SUM.
    MERGE = {"dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
             "daman and diu": "dadra and nagar haveli and daman and diu"}

    totals = {}
    skipped = []
    for i in range(6, len(df)):
        name = df.iloc[i, 1]
        tot = pd.to_numeric(df.iloc[i, 5], errors="coerce")
        if not isinstance(name, str) or pd.isna(tot):
            continue
        name = name.strip()
        if name.lower() in ("total", "grand total", "note :"):
            continue
        scode = m.state_code(MERGE.get(name.lower(), name))
        if not scode:
            # e.g. "Other Territory", "OIDAR" — genuinely not mappable to a state
            skipped.append(f"{name} ({tot:.0f} cr)")
            continue
        totals[scode] = round(totals.get(scode, 0.0) + float(tot), 1)

    assert len(totals) >= 30, f"only {len(totals)} states matched — sheet layout changed?"
    print(f"states matched: {len(totals)}; skipped rows: {skipped}")

    # per-capita from Census 2011 state population
    pop = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='state'"))
    percap = {}
    for scode, cr in totals.items():
        p = pop.get(scode)
        if p and p > 0:
            percap[scode] = round(cr * 1e7 / p, 0)   # crore Rs -> Rs per person
    print(f"per-capita computed for {len(percap)} states")

    upsert_metric(con, "gst_total", "GST collection (domestic)", "finance",
                  "₹ crore", 0, 1,
                  "State-wise domestic GST collection (CGST+SGST+IGST), FY 2025-26.",
                  SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "gst_total", "state", YEAR, totals)

    upsert_metric(con, "gst_per_capita", "GST collection per person", "finance",
                  "₹/year", 0, 1,
                  "Domestic GST collected per person (Census 2011 denominator), FY 2025-26.",
                  SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n += write_values(con, "gst_per_capita", "state", YEAR, percap)

    log_load(con, "ingest_gst.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"2 finance metrics from FY 2025-26 statewise sheet; {len(totals)} states; "
             f"unmappable rows skipped with values logged: {skipped}")
    con.commit(); con.close()
    print(f"WROTE {n} values across 2 metrics.")


if __name__ == "__main__":
    main()
