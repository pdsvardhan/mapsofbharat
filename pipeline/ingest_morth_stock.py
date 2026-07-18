"""MoRTH total registered vehicle stock -> canonical store (iter-24 item 693).

Source: MoRTH, Table 20.4 "Total Registered Motor Vehicles" (in THOUSANDS, as on
31 March), raw-new/transport/Table-20.4_0.xlsx (sheet 'State wise'). The long series
runs 2001 -> latest column in the sheet (2015 here). Values carry a '*' footnote on
some estimated cells; TOTAL STATES / TOTAL UTs / GRAND TOTAL are aggregate rows.

One STATE-LEVEL metric, category 'transport', latest year in the table (2015):
  vehicles_per_1000  = registered vehicle stock (thousands) * 1000 / Census-2011 pop * 1000
                     = stock_thousands * 1e6 / pop2011

VINTAGE: the table's stock series stops at 2015; that year is stored and documented
(a decade-old stock, not current). Denominator is Census-2011 population (store
standard). D. & N. Haveli and Daman & Diu are separate rows here but a single merged
UT in the store, so their stock is summed. Telangana (formed 2014) carries a 2015 row.

Run: pipeline/.venv/bin/python pipeline/ingest_morth_stock.py
"""
import os, re, sqlite3
import pandas as pd
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(PIPE, "raw-new", "transport", "Table-20.4_0.xlsx")
SOURCE = "MoRTH, Table 20.4 — Total Registered Motor Vehicles (in thousands, as on 31 March)"
URL = "https://morth.nic.in/road-transport-year-books"
LICENSE = "Govt. of India publication (MoRTH)"
FETCHED = "2026-07-16T00:00:00Z"

SKIP = {"total states", "total uts", "grand total", "union territory:", "state"}
STATE_ALIASES = {
    "a and n islands": "andaman and nicobar islands",
    "d and n haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
    "chhatisgarh": "chhattisgarh",         # MoRTH prints one 't'
    "orissa": "odisha",
}


def num(v):
    if pd.isna(v):
        return None
    # MoRTH marks estimated/footnoted cells with '*' AND '#' (e.g. "6263#", "151*")
    s = re.sub(r"[*,#\s]", "", str(v))
    try:
        return float(s)
    except ValueError:
        return None


def main():
    raw = pd.read_excel(XLSX, sheet_name="State wise", header=None)
    hdr = next(i for i in range(len(raw))
               if str(raw.iat[i, 0]).strip().lower().startswith("state/union"))
    years = {}
    for c in range(1, raw.shape[1]):
        try:
            years[int(float(raw.iat[hdr, c]))] = c
        except (ValueError, TypeError):
            pass
    # latest year column that actually has data for >=20 rows
    def coverage(col):
        return sum(num(raw.iat[r, col]) is not None for r in range(hdr + 1, len(raw)))
    ycol = None
    for y in sorted(years, reverse=True):
        if coverage(years[y]) >= 20:
            ycol, yr = years[y], y
            break
    assert ycol is not None, "no year column with enough data"

    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode=DELETE;")
    m = RegionMatcher(con)
    pop_s = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='state' AND year=2011"))

    stock, unmatched = {}, []      # state_code -> stock in thousands (summed)
    for r in range(hdr + 1, len(raw)):
        label = raw.iat[r, 0]
        if pd.isna(label):
            continue
        name = str(label).strip()
        if name.lower() in SKIP or not name or name.isdigit():
            continue
        val = num(raw.iat[r, ycol])
        if val is None:
            continue
        sc = m.state_code(STATE_ALIASES.get(norm(name), name))
        if sc:
            stock[sc] = stock.get(sc, 0.0) + val
        else:
            unmatched.append(name)

    per1000 = {sc: round(v * 1e6 / pop_s[sc], 1)
               for sc, v in stock.items() if pop_s.get(sc, 0) > 0}
    print(f"latest year={yr}; states={len(per1000)}; unmatched={unmatched}")
    assert len(per1000) >= 28, f"only {len(per1000)} states matched"

    upsert_metric(
        con, "vehicles_per_1000", "Registered vehicles per 1,000 people", "transport",
        "per 1000", 1, None,
        f"Total registered motor vehicles per 1,000 people (MoRTH Table 20.4, stock as "
        f"on 31 March {yr}), over Census-2011 population. A stock (cumulative "
        f"registrations), latest year in MoRTH's long series.",
        SOURCE, URL, LICENSE, yr,
        methodology=(
            f"MoRTH Table 20.4 'Total Registered Motor Vehicles' (in thousands, as on "
            f"31 March {yr} — the latest year in this long series): stock x 1,000 / "
            f"Census-2011 population x 1,000 = vehicles per 1,000 residents. '*' "
            f"footnote markers stripped; region/all-India aggregate rows excluded; "
            f"Dadra & Nagar Haveli and Daman & Diu summed into the merged UT. A "
            f"{yr} stock over a 2011 denominator — a documented vintage gap."),
        default_scale="quantile")
    n = write_values(con, "vehicles_per_1000", "state", yr, per1000)
    log_load(con, "ingest_morth_stock.py", SOURCE, yr, LICENSE, FETCHED, n,
             f"1 transport metric (state, {yr}). vehicles_per_1000 states={len(per1000)}; "
             f"unmatched={unmatched}")
    con.commit(); con.close()
    print(f"WROTE {n} vehicles_per_1000 state values ({yr}).")
    if per1000:
        print("top vehicles_per_1000 (code,val):", sorted(per1000.items(), key=lambda x: -x[1])[:5])


if __name__ == "__main__":
    main()
