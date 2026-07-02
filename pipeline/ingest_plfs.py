"""PLFS (Periodic Labour Force Survey) state-level labour-market indicators -> canonical store.

Source: MoSPI Periodic Labour Force Survey Annual Report 2023-24, state/UT table
served via the data.gov.in OGD API. State level only — PLFS publishes state
figures as survey estimates (usual status, ps+ss); there is no district-level
PLFS series, so no district rows here.

All THREE metrics come from ONE round and ONE table (iter-52 item 399 — mixed
vintages made cross-metric reads impossible, e.g. WPR from one year exceeding
LFPR from another):
  plfs_lfpr, plfs_wpr, plfs_unemployment_rate : PLFS 2023-24, usual status
  (ps+ss), persons of ALL AGES — OGD resource b2bbea16-8b7f-4dfd-a8b1-67ccdbbd76dc
  ("State/UT-wise Details of LFPR, WPR and UR according to usual status (ps+ss)
  for the persons of all ages during PLFS 2023-24").

Because the three columns come from the same round/basis, the arithmetic
identity WPR <= LFPR (and WPR ~= LFPR*(1-UR/100)) holds per state; both are
asserted below before anything is written.

Run: pipeline/.venv/bin/python pipeline/ingest_plfs.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, upsert_metric, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(PIPE, "raw-new", "economy")
PLFS_2324 = "plfs_state_lfpr_wpr_ur_2023-24.json"   # OGD resource b2bbea16 (fetched 2026-07-02)

SOURCE = "MoSPI Periodic Labour Force Survey (PLFS) Annual Report 2023-24, via data.gov.in OGD"
URL = "https://data.gov.in/catalog/periodic-labour-force-survey-plfs"
METRIC_LICENSE = "GODL-India"          # underlying MoSPI publication licence
LOG_LICENSE = "data.gov.in OGD"        # OGD delivery channel (per iter-50 item 381 spec)
FETCHED = "2026-07-02T15:30:00Z"       # fetch date for OGD resource b2bbea16
YEAR = 2023                            # PLFS July 2023 - June 2024 round

# National aggregate labels to always skip (never ingested as a region).
NATIONAL = {"all india", "all-india", "india", "all india "}

# source state-name -> canonical form the RegionMatcher understands.
STATE_ALIASES = {
    "andaman and nicobar island": "Andaman and Nicobar Islands",
}

METRIC_IDS = ("plfs_unemployment_rate", "plfs_lfpr", "plfs_wpr")

METH_COMMON = (
    "MoSPI Periodic Labour Force Survey (PLFS) Annual Report 2023-24 (July 2023 - "
    "June 2024), state/UT estimate on the usual-status (principal + subsidiary "
    "status, ps+ss) basis for persons of ALL ages, served via the data.gov.in OGD "
    "API (resource b2bbea16-8b7f-4dfd-a8b1-67ccdbbd76dc: LFPR, WPR and UR in one "
    "state-wise table, so all three labour metrics share one round and one basis "
    "and WPR <= LFPR holds by construction). State level only: PLFS state figures "
    "are sample-survey estimates (not a census and not district-level); there is "
    "no official district PLFS series, so no district rows are published here. "
    "National ('All India') rows are skipped (only states resolvable to a "
    "region_keys code are ingested).")


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

    recs = load_json(PLFS_2324)
    lfpr_vals, lfpr_skip = collect(recs, "state_ut", "lfpr", m)
    wpr_vals, wpr_skip = collect(recs, "state_ut", "wpr", m)
    ur_vals, ur_skip = collect(recs, "state_ut", "ur", m)

    # single-round arithmetic identities (the point of item 399): for every
    # state, WPR <= LFPR, and WPR ~= LFPR * (1 - UR/100) within rounding.
    for code, lf in lfpr_vals.items():
        w = wpr_vals.get(code)
        if w is None:
            continue
        assert w <= lf, f"state {code}: WPR {w} > LFPR {lf} — not a single round?"
        u = ur_vals.get(code)
        if u is not None:
            implied = lf * (1 - u / 100)
            assert abs(implied - w) <= 0.3, \
                f"state {code}: LFPR*(1-UR) = {implied:.2f} vs WPR {w} — basis mismatch?"

    # Idempotency: wipe any prior PLFS rows across all levels/years first
    # (previous ingest had three different years: LFPR 2020, WPR 2022, UR 2023).
    qs = ",".join("?" * len(METRIC_IDS))
    con.execute(f"DELETE FROM metric_values WHERE metric_id IN ({qs})", METRIC_IDS)

    upsert_metric(
        con, "plfs_lfpr", "Labour force participation rate (PLFS)", "labour", "%", 1, 1,
        "PLFS labour force participation rate (LFPR), usual status (ps+ss), persons of all "
        "ages, 2023-24 (labour force as a share of population). State-level survey estimate.",
        SOURCE, URL, METRIC_LICENSE, YEAR,
        methodology=("Labour force participation rate = labour force / population, PLFS "
                     "2023-24, usual status (ps+ss), persons of all ages. " + METH_COMMON))
    n_lfpr = write_state_values(con, "plfs_lfpr", YEAR, lfpr_vals)

    upsert_metric(
        con, "plfs_wpr", "Worker population ratio (PLFS)", "labour", "%", 1, 1,
        "PLFS worker population ratio (WPR), usual status (ps+ss), persons of all ages, "
        "2023-24 (employed persons as a share of population). State-level survey estimate.",
        SOURCE, URL, METRIC_LICENSE, YEAR,
        methodology=("Worker population ratio = employed persons / population, PLFS 2023-24, "
                     "usual status (ps+ss), persons of all ages. " + METH_COMMON))
    n_wpr = write_state_values(con, "plfs_wpr", YEAR, wpr_vals)

    upsert_metric(
        con, "plfs_unemployment_rate", "Unemployment rate (PLFS)", "labour", "%", 1, 0,
        "PLFS unemployment rate, usual status (ps+ss), persons of all ages, 2023-24 "
        "(share of the labour force that is unemployed). State-level survey estimate.",
        SOURCE, URL, METRIC_LICENSE, YEAR,
        methodology=("Unemployment rate = unemployed / labour force, PLFS 2023-24, "
                     "usual status (ps+ss), persons of all ages. " + METH_COMMON))
    n_ur = write_state_values(con, "plfs_unemployment_rate", YEAR, ur_vals)

    total = n_ur + n_wpr + n_lfpr
    notes = (f"3 metrics (labour), state-level, SINGLE round PLFS 2023-24 all-ages ps+ss "
             f"(OGD resource b2bbea16, item 399). "
             f"LFPR states={n_lfpr} skipped={lfpr_skip}; "
             f"WPR states={n_wpr} skipped={wpr_skip}; "
             f"UR states={n_ur} skipped={ur_skip}. "
             f"WPR<=LFPR and LFPR*(1-UR)~=WPR asserted per state before write.")
    log_load(con, "ingest_plfs.py", SOURCE, YEAR, LOG_LICENSE, FETCHED, total, notes)

    con.commit()
    con.close()
    print(f"WROTE {total} state values: LFPR={n_lfpr} WPR={n_wpr} UR={n_ur} (all year {YEAR})")
    print("LFPR skipped:", lfpr_skip)
    print("WPR skipped:", wpr_skip)
    print("UR skipped:", ur_skip)


if __name__ == "__main__":
    main()
