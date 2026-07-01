"""PLFS (Periodic Labour Force Survey) state-level labour-market indicators -> canonical store.

Source: MoSPI Periodic Labour Force Survey Annual Reports, state/UT factsheet tables
served via the data.gov.in OGD API. State level only — PLFS publishes state
factsheets as survey estimates (usual status, ps+ss); there is no district-level
PLFS series, so no district rows here.

Three metrics, each on its OWN latest reliable state-wise year (a single common
recent year is NOT published for all three on OGD — LFPR/WPR persons series lag
UR by a year or two). Years are documented per metric below and in each metric's
methodology string:
  plfs_unemployment_rate : 2023-24 (all ages, ps+ss)  resource 302a4e58
  plfs_wpr               : 2022-23 (15+, usual status) resource f9f081b8
  plfs_lfpr              : 2020-21 (15+, persons)       resource ef49a955

Run: pipeline/.venv/bin/python pipeline/ingest_plfs.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, upsert_metric, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(PIPE, "raw-new", "economy")

SOURCE = "MoSPI Periodic Labour Force Survey (PLFS) Annual Report, via data.gov.in OGD"
URL = "https://data.gov.in/catalog/periodic-labour-force-survey-plfs"
METRIC_LICENSE = "GODL-India"          # underlying MoSPI publication licence
LOG_LICENSE = "data.gov.in OGD"        # OGD delivery channel (per iter-50 item 381 spec)
FETCHED = "2026-06-30T00:00:00Z"       # scout fetch date for the OGD resources

# National aggregate labels to always skip (never ingested as a region).
NATIONAL = {"all india", "all-india", "india", "all india "}

# source state-name -> canonical form the RegionMatcher understands.
# PLFS tables print A&N singular in the LFPR file and split the merged UT.
STATE_ALIASES = {
    "andaman and nicobar island": "Andaman and Nicobar Islands",
}

METRIC_IDS = ("plfs_unemployment_rate", "plfs_lfpr", "plfs_wpr")

METH_COMMON = (
    "MoSPI Periodic Labour Force Survey (PLFS) Annual Report, state/UT factsheet "
    "estimate on the usual-status (principal + subsidiary status, ps+ss) basis, "
    "served via the data.gov.in OGD API. State level only: PLFS state figures are "
    "sample-survey estimates (not a census and not district-level); there is no "
    "official district PLFS series, so no district rows are published here. "
    "National ('All India') rows and split Dadra & Nagar Haveli / Daman & Diu rows "
    "with no merged value are skipped (only states resolvable to a region_keys code "
    "are ingested).")


def num(v):
    """Coerce a cell to a plausible percentage, else None (drops 'NA', blanks)."""
    x = pd.to_numeric(v, errors="coerce")
    if pd.isna(x):
        return None
    x = float(x)
    if 0 <= x <= 100:
        return round(x, 1)
    return None


def collect(records, name_key, value_key, m):
    """records -> {state_code: value}, plus list of skipped/unmatched labels."""
    vals, skipped = {}, []
    for r in records:
        raw_name = str(r.get(name_key, "")).strip()
        if not raw_name or raw_name.lower() in NATIONAL:
            continue
        canon = STATE_ALIASES.get(raw_name.lower(), raw_name)
        code = m.state_code(canon)
        v = num(r.get(value_key))
        if code is None:
            skipped.append(f"{raw_name} (no region code)")
            continue
        if v is None:
            skipped.append(f"{raw_name} (no numeric value: {r.get(value_key)!r})")
            continue
        vals[code] = v          # last write wins (rows are unique per state)
    return vals, skipped


def write_state_values(con, mid, year, values: dict):
    n = 0
    for code, v in values.items():
        con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)",
                    (mid, code, "state", year, float(v), 0))
        n += 1
    return n


def load_json(fname):
    import json
    with open(os.path.join(RAW, fname), encoding="utf-8") as fh:
        return json.load(fh).get("records", [])


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # Idempotency: wipe any prior PLFS rows across all levels/years first.
    qs = ",".join("?" * len(METRIC_IDS))
    con.execute(f"DELETE FROM metric_values WHERE metric_id IN ({qs})", METRIC_IDS)

    # ---- Unemployment Rate: 2023-24, all ages, ps+ss (resource 302a4e58) ----
    ur_recs = load_json("plfs_state_ur_2019-20_to_2023-24.json")
    ur_vals, ur_skip = collect(ur_recs, "state_ut", "_2023_24", m)
    upsert_metric(
        con, "plfs_unemployment_rate", "Unemployment rate (PLFS)", "labour", "%", 1, 0,
        "PLFS unemployment rate, usual status (ps+ss), all ages, 2023-24 "
        "(share of the labour force that is unemployed). State-level survey estimate.",
        SOURCE, URL, METRIC_LICENSE, 2023,
        methodology=("Unemployment rate = unemployed / labour force, PLFS 2023-24, "
                     "usual status (ps+ss), all ages. " + METH_COMMON))
    n_ur = write_state_values(con, "plfs_unemployment_rate", 2023, ur_vals)

    # ---- Worker Population Ratio: 2022-23, 15+, usual status (resource f9f081b8) ----
    wpr_recs = load_json("plfs_state_wpr_2022-23.json")
    wpr_vals, wpr_skip = collect(wpr_recs, "states_uts", "_2022_23", m)
    upsert_metric(
        con, "plfs_wpr", "Worker population ratio (PLFS)", "labour", "%", 1, 1,
        "PLFS worker population ratio (WPR), usual status (ps+ss), persons aged 15+, "
        "2022-23 (employed persons as a share of population). State-level survey estimate.",
        SOURCE, URL, METRIC_LICENSE, 2022,
        methodology=("Worker population ratio = employed persons / population, PLFS 2022-23, "
                     "usual status (ps+ss), persons aged 15 years and above. " + METH_COMMON))
    n_wpr = write_state_values(con, "plfs_wpr", 2022, wpr_vals)

    # ---- Labour Force Participation Rate: 2020-21, 15+, persons (resource ef49a955) ----
    lfpr_recs = load_json("plfs_state_lfpr_2017-18_to_2020-21.json")
    lfpr_vals, lfpr_skip = collect(lfpr_recs, "states_ut", "_2020_21___persons", m)
    upsert_metric(
        con, "plfs_lfpr", "Labour force participation rate (PLFS)", "labour", "%", 1, 1,
        "PLFS labour force participation rate (LFPR), usual status (ps+ss), persons aged 15+, "
        "2020-21 (labour force as a share of population). State-level survey estimate; latest "
        "state-wise persons LFPR published on data.gov.in OGD.",
        SOURCE, URL, METRIC_LICENSE, 2020,
        methodology=("Labour force participation rate = labour force / population, PLFS 2020-21, "
                     "usual status (ps+ss), persons aged 15 years and above. 2020-21 is the latest "
                     "state-wise persons LFPR available on OGD (later years are published only for "
                     "UR and WPR at state level). " + METH_COMMON))
    n_lfpr = write_state_values(con, "plfs_lfpr", 2020, lfpr_vals)

    total = n_ur + n_wpr + n_lfpr
    notes = (f"3 metrics (labour), state-level. "
             f"UR 2023-24 states={n_ur} skipped={ur_skip}; "
             f"WPR 2022-23 states={n_wpr} skipped={wpr_skip}; "
             f"LFPR 2020-21 states={n_lfpr} skipped={lfpr_skip}. "
             f"Latest-per-metric year policy (no common recent state-wise year for all three on OGD).")
    log_load(con, "ingest_plfs.py", SOURCE, 2023, LOG_LICENSE, FETCHED, total, notes)

    con.commit()
    con.close()
    print(f"WROTE {total} state values: UR={n_ur} WPR={n_wpr} LFPR={n_lfpr}")
    print("UR skipped:", ur_skip)
    print("WPR skipped:", wpr_skip)
    print("LFPR skipped:", lfpr_skip)


if __name__ == "__main__":
    main()
