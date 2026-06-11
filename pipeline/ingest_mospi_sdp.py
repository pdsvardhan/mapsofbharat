"""MoSPI state-wise per-capita NSDP (current prices) -> canonical store (state level).

Source workbook: economy/mospi_state_wise_sdp_15032024.xls, sheet 'PC curr.'.
Columns repeat: first block = per-capita NSDP in Rs., second block (.1 suffix)
= growth rates; we read the first block and take the latest year with >= 30
states reporting.
Run: pipeline/.venv/bin/python pipeline/ingest_mospi_sdp.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLS = os.path.join(PIPE, "raw-new", "economy", "mospi_state_wise_sdp_15032024.xls")
SOURCE = "MoSPI, State-wise Per Capita NSDP at current prices (release 15.03.2024)"
URL = "https://www.mospi.gov.in/data"
LICENSE = "GODL-India"
FETCHED = "2026-06-10T20:30:00Z"


def main():
    xl = pd.ExcelFile(XLS)
    pc = xl.parse("PC curr.", header=4)
    pc = pc.rename(columns={pc.columns[1]: "state"})
    year_cols = [c for c in pc.columns if isinstance(c, str) and
                 c.count("-") == 1 and not c.endswith(".1") and c[:4].isdigit()]
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    best_col, best_year, best_vals = None, None, {}
    for col in year_cols:
        vals = {}
        for _, r in pc.iterrows():
            st = m.state_code(r["state"]) if pd.notna(r["state"]) else None
            v = pd.to_numeric(r[col], errors="coerce")
            # growth-rate block leaks are < 100; per-capita NSDP is always > 10000
            if st and pd.notna(v) and v > 10000:
                vals[st] = round(float(v))
        if len(vals) >= 30:
            best_col, best_vals = col, vals
            best_year = int(col[:4]) + 1  # '2022-23' -> FY ending 2023
    assert best_col, "no year column with >=30 states"
    print(f"picked {best_col} (year={best_year}): {len(best_vals)} states")

    mid = "econ_percapita_nsdp"
    upsert_metric(con, mid, "Per-capita NSDP", "economy", "₹/year", 0, 1,
                  f"Per capita Net State Domestic Product at current prices, FY {best_col} "
                  f"(MoSPI). State-level series; no district breakdown exists.",
                  SOURCE, URL, LICENSE, best_year)
    n = write_values(con, mid, "state", best_year, best_vals)
    log_load(con, "ingest_mospi_sdp.py", SOURCE, best_year, LICENSE, FETCHED, n,
             f"sheet 'PC curr.' col {best_col}; {len(best_vals)} states")
    con.commit(); con.close()
    print(f"WROTE {n} state values.")


if __name__ == "__main__":
    main()
