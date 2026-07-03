"""ECI Lok Sabha 2024 state-wise voter turnout -> canonical store.

Item 422 (iter-58): voter_turnout_ls2024 (%, state level) from ECI GE-2024
Statistical Report 12 (State Wise Voters Turn Out). The workbook is a real
BIFF .xls whose OLE directory trips xlrd's strict corruption check
(seen[2] == 4); Excel/LibreOffice open it fine, so it is read with
xlrd.open_workbook(ignore_workbook_corruption=True) — no hand-typing.

Turnout ingested is the report's own VTR% column (total voters incl. postal /
total electors incl. service electors); the national rate is recomputed from
the sheet's elector/voter totals as a parse check.
Run: pipeline/.venv/bin/python pipeline/ingest_ls2024.py
"""
import os, sqlite3
import xlrd
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLS = os.path.join(PIPE, "raw-new", "elections", "LS2024_12_State_Wise_Voters_Turn_Out.xls")
SOURCE = "Election Commission of India, General Election to Lok Sabha 2024 — Statistical Report 12: State Wise Voters Turn Out"
URL = "https://www.eci.gov.in/ge-2024-statistical-reports"
LICENSE = "Govt. of India publication (ECI)"
YEAR = 2024
FETCHED = "2026-07-03T14:35:00Z"

METHODOLOGY = (
    "ECI GE-2024 Statistical Report 12 (state-wise voters turnout), VTR% column: "
    "total votes polled (EVM + postal) as a share of total electors (general incl. "
    "NRIs + service electors). Parsed directly from the published .xls (opened with "
    "xlrd ignore_workbook_corruption=True — the file's OLE directory trips xlrd's "
    "strict check but the BIFF stream is intact). National turnout recomputed from "
    "the sheet's elector/voter totals (~66.1%) as a parse check. State level only — "
    "the constituency report (Report 13) is a separate series.")


def main():
    wb = xlrd.open_workbook(XLS, ignore_workbook_corruption=True)
    sh = wb.sheet_by_index(0)
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    vals, skipped = {}, []
    tot_electors = tot_voters = 0.0
    for r in range(sh.nrows):
        name = str(sh.cell_value(r, 0)).strip()
        if not name or name.lower().startswith(("12.", "name of")):
            continue
        try:
            electors = float(sh.cell_value(r, 4))
            voters = float(sh.cell_value(r, 7))
            vtr = float(sh.cell_value(r, 8))
        except (ValueError, TypeError):
            continue
        if name.lower() in ("total", "grand total", "all india"):
            continue
        code = m.state_code(name)
        if not code:
            skipped.append(name)
            continue
        vals[code] = round(vtr, 2)
        tot_electors += electors
        tot_voters += voters

    national = tot_voters / tot_electors * 100
    print(f"parsed {len(vals)} states; national turnout {national:.2f}% (expect ~66.1)")
    assert abs(national - 66.1) < 0.5, "national turnout drifts from ECI's ~66.1%"
    lk = vals.get("31")
    print(f"spot: Lakshadweep {lk} (expect ~84)")
    assert lk and abs(lk - 84) < 1.5
    assert len(vals) >= 35, f"only {len(vals)} states matched; skipped={skipped}"

    upsert_metric(
        con, "voter_turnout_ls2024", "Voter turnout (Lok Sabha 2024)", "elections",
        "%", 1, 1,
        "Votes polled (EVM + postal) as a share of registered electors in the 2024 "
        "Lok Sabha general election. State/UT level (ECI Statistical Report 12).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "voter_turnout_ls2024", "state", YEAR, vals)
    log_load(con, "ingest_ls2024.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 metric, state-level; {len(vals)} states; skipped={skipped}; "
             f"national check {national:.2f}%")
    con.commit(); con.close()
    print(f"WROTE {n} state values. skipped: {skipped}")


if __name__ == "__main__":
    main()
