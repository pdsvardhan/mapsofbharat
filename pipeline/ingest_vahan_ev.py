"""Vahan EV registration share -> canonical store (iter-24 item 692).

Source: Vahan Dashboard (MoRTH / NIC), state-wise "Fuel Data" export for calendar
year 2025, raw-new/transport/vahan-statewise-fuel-cy2025.xlsx (sheet 'reportTable').
Columns are one per fuel type (BIO-CNG ... ELECTRIC(BOV) ... PURE EV ... PETROL ...
STRONG HYBRID EV); each cell is the count of vehicles REGISTERED in that state during
CY2025 with that fuel. Numbers are in the Indian grouping format (e.g. "1,12,664").

One STATE-LEVEL metric, new category 'transport', year 2025:
  ev_share_pct  = pure battery-electric registrations (ELECTRIC(BOV) + PURE EV) as a
                  percentage of ALL vehicle registrations in CY2025.

"Pure EV" here is battery-electric only: the ELECTRIC(BOV) and PURE EV columns (Vahan
uses both labels across periods). Plug-in / strong hybrids are NOT counted as EV. The
denominator is every fuel column, so the share is of all registrations that year. The
CY2026-partial file in the same folder is NOT used (incomplete year).

Run: pipeline/.venv/bin/python pipeline/ingest_vahan_ev.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(PIPE, "raw-new", "transport", "vahan-statewise-fuel-cy2025.xlsx")
SOURCE = "Vahan Dashboard (MoRTH), state-wise vehicle registrations by fuel, CY2025"
URL = "https://vahan.parivahan.gov.in/vahan4dashboard/"
LICENSE = "Govt. of India (MoRTH/NIC) dashboard data"
YEAR = 2025
FETCHED = "2026-07-16T00:00:00Z"
EV_COLS = {"ELECTRIC(BOV)", "PURE EV"}   # battery-electric only

STATE_ALIASES = {
    "ut of dnh and dd": "dadra and nagar haveli and daman and diu",
    "andaman and nicobar island": "andaman and nicobar islands",  # Vahan drops the 's'
}


def num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def main():
    raw = pd.read_excel(XLSX, sheet_name="reportTable", header=None)
    # fuel-type header is the row that contains 'DIESEL' and 'PETROL'
    hdr = next(i for i in range(min(8, len(raw)))
               if raw.iloc[i].astype(str).str.contains("DIESEL", case=False).any())
    fuels = {str(raw.iat[hdr, c]).strip(): c
             for c in range(2, raw.shape[1]) if not pd.isna(raw.iat[hdr, c])}
    ev_cols = [c for name, c in fuels.items() if name.upper() in EV_COLS]
    all_cols = list(fuels.values())
    assert ev_cols, f"no EV columns found in {sorted(fuels)}"

    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode=DELETE;")
    m = RegionMatcher(con)

    share, unmatched = {}, []
    nat_ev = nat_tot = 0.0
    for r in range(hdr + 1, len(raw)):
        label = raw.iat[r, 1]
        if pd.isna(label) or not str(label).strip() or str(label).strip().isdigit():
            continue
        name = str(label).strip()
        total = sum(num(raw.iat[r, c]) for c in all_cols)
        ev = sum(num(raw.iat[r, c]) for c in ev_cols)
        if total <= 0:
            continue
        nat_ev += ev; nat_tot += total
        sc = m.state_code(STATE_ALIASES.get(norm(name), name))
        if sc:
            share[sc] = round(ev / total * 100, 2)
        else:
            unmatched.append(name)

    nat = nat_ev / nat_tot * 100 if nat_tot else 0
    print(f"ev_share_pct: {len(share)} states; national EV share CY2025 = {nat:.2f}%; "
          f"unmatched={unmatched}")
    assert len(share) >= 30, f"only {len(share)} states matched"

    upsert_metric(
        con, "ev_share_pct", "Electric-vehicle share of registrations", "transport",
        "%", 2, 1,
        "Share of vehicles registered in CY2025 that are pure battery-electric "
        "(Vahan ELECTRIC(BOV) + PURE EV) out of all registrations that year — a "
        f"measure of EV adoption. National CY2025 ~{nat:.1f}%.",
        SOURCE, URL, LICENSE, YEAR,
        methodology=(
            "Vahan Dashboard state-wise fuel export for calendar year 2025: pure "
            "battery-electric registrations (the ELECTRIC(BOV) and PURE EV fuel "
            "columns) as a percentage of ALL vehicle registrations in CY2025 (sum of "
            "every fuel column). Plug-in and strong hybrids are excluded from the EV "
            "numerator. A flow (registrations in the year), not a stock. The "
            "CY2026-partial export is not used (incomplete year)."),
        default_scale="quantile")
    n = write_values(con, "ev_share_pct", "state", YEAR, share)
    log_load(con, "ingest_vahan_ev.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 transport metric (state, CY2025). ev_share_pct states={len(share)}; "
             f"national={nat:.2f}%; ev cols={[k for k in fuels if k.upper() in EV_COLS]}; "
             f"unmatched={unmatched}")
    con.commit(); con.close()
    print(f"WROTE {n} ev_share_pct state values.")
    if share:
        print("top ev_share states (code,%):", sorted(share.items(), key=lambda x: -x[1])[:5])


if __name__ == "__main__":
    main()
