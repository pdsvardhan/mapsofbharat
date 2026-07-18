"""MGNREGA district rural-employment metrics -> canonical store.

Source: MoRD MGNREGA "District-wise MGNREGA Data at a Glance", Ministry of Rural
Development, served via the data.gov.in OGD API (resource
ee03643a-ee4c-48c2-ac30-9f2ff26ab722). Financial year 2025-26, MARCH year-end
snapshot (the resource carries only the March cumulative row per FY). District
level; state figures are AGGREGATED from the deduplicated district totals (not
averaged), so state and district stay internally consistent.

Data-quality handling (documented, never hidden):
 - The OGD resource APPENDS successive daily refresh snapshots with no timestamp
   field, so each district has 1-13 near-duplicate rows for the same (FY, March).
   ~7% of districts (52/741) carry a spurious ~2x double-count snapshot. Dedup:
   within each district drop rows whose cumulative persondays exceed 1.4x the
   district median (the doubles), then take the MAX-persondays survivor as the
   final year-end cumulative; ALL of a district's metrics come from that one row.
 - percentage_payments_gererated_within_15_days is NOT ingested: 87.5% of source
   snapshot rows report >100% (the MIS computes payments-generated as a share that
   routinely exceeds 100 via prior-period backlog clearance) -> not a clean 0-100
   map metric. Drop-with-reason (bedrock rule 7), logged below.
 - mgnrega_active_workers_per_1000 uses the Census-2011 district population
   denominator (the only district population in the store); the 2025-vs-2011
   vintage mismatch is stated, and total (not rural) population slightly
   understates the rate.

Run: pipeline/.venv/bin/python pipeline/ingest_mgnrega.py
"""
import json, os, sqlite3, statistics
from collections import defaultdict
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(PIPE, "raw-new", "labour")
SRC_FILE = os.path.join(RAW, "mgnrega_district_2025-26_march.json")

SOURCE = ("MGNREGA 'District-wise MGNREGA Data at a Glance', Ministry of Rural "
          "Development, via data.gov.in OGD (resource "
          "ee03643a-ee4c-48c2-ac30-9f2ff26ab722), FY 2025-26 (March year-end)")
URL = "https://www.data.gov.in/resource/district-wise-mgnrega-data-glance"
METRIC_LICENSE = "GODL-India"          # underlying MoRD publication licence
LOG_LICENSE = "data.gov.in OGD"        # OGD delivery channel
FETCHED = "2026-07-18T02:00:00Z"
YEAR = 2025                            # FY 2025-26 (Apr 2025 - Mar 2026), March cumulative

METH_COMMON = (
    "MoRD MGNREGA 'District-wise Data at a Glance' via the data.gov.in OGD API "
    "(resource ee03643a), FY 2025-26 year-end (March) cumulative snapshot. The OGD "
    "resource appends successive daily refresh snapshots with no timestamp field; "
    "each district's 1-13 near-duplicate rows are deduplicated by dropping spurious "
    ">1.4x-median-persondays double-counts, then taking the max-persondays survivor "
    "(the final year-end cumulative). District level; state figures are aggregated "
    "from the deduplicated district totals, not averaged.")

# fields carried on the representative row (raw strings in the source JSON)
F_PD   = "Persondays_of_Central_Liability_so_far"
F_WPD  = "Women_Persondays"
F_SC   = "SC_persondays"
F_ST   = "ST_persondays"
F_HH   = "Total_Households_Worked"
F_HH100= "Total_No_of_HHs_completed_100_Days_of_Wage_Employment"
F_AW   = "Total_No_of_Active_Workers"
F_WAGES= "Wages"                       # total wages paid, Rs LAKH (verified: Wages*1e5/PD == avg wage/day)
F_AVGW = "Average_Wage_rate_per_day_per_person"
F_AVGD = "Average_days_of_employment_provided_per_Household"

# MoRD district name (normalized) -> region_keys name (normalized). Recent official
# renames the shared ALIASES map doesn't carry; every target verified to exist in
# region_keys before inclusion (a wrong alias would mis-map a district, worse than
# leaving it unmatched). Genuinely NEW post-2011 districts (Sakti, Bajali,
# Gaurela-Pendra-Marwahi, ...) have no polygon in region_keys and stay unmatched
# (drop-with-reason), never force-mapped.
RENAMES = {
    "ahilyanagar": "ahmednagar",
    "chatrapati sambhaji nagar": "aurangabad",
    "chhatrapati sambhaji nagar": "aurangabad",
    "dharashiv": "osmanabad",
    "narmadapuram": "hoshangabad",
    "gayaji": "gaya",
    "sribhumi": "karimganj",
    "purbi champaran": "east champaran",
    "the nilgiris": "nilgiris",
    "ropar": "rupnagar",
    "mukatsar": "sri muktsar sahib",
    "bengaluru": "bengaluru urban",
    "sonepur": "subarnapur",
}

# Below this participation level MGNREGA barely operates (urban districts), so the
# rate metrics (avg wage/day, avg days/HH) computed on a near-zero persondays base
# are noise, not a district statistic — suppressed (see main()).
LOW_ACTIVITY = 5.0   # active workers per 1,000 population


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def dedup(rows):
    """One representative year-end snapshot per district: drop spurious ~2x
    double-count rows (persondays > 1.4x district median), then take the
    max-persondays survivor (the final cumulative). Returns the chosen row or None."""
    pds = [(r, fnum(r.get(F_PD))) for r in rows]
    pds = [(r, p) for r, p in pds if p and p > 0]
    if not pds:
        return None
    med = statistics.median([p for _, p in pds])
    keep = [(r, p) for r, p in pds if p <= 1.4 * med] or pds
    dropped = len(pds) - len(keep)
    return max(keep, key=lambda rp: rp[1])[0], dropped


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    pop = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='district' AND year=2011"))
    pop_st = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='state' AND year=2011"))

    recs = json.load(open(SRC_FILE, encoding="utf-8"))
    by = defaultdict(list)
    for r in recs:
        by[(r["state_name"], r["district_code"], r["district_name"])].append(r)

    dist_row = {}                       # rid -> representative row
    st_tot = defaultdict(lambda: defaultdict(float))   # st_code -> field -> sum
    unmatched, outlier_districts = [], 0
    for (sname, dcode, dname), rows in by.items():
        res = dedup(rows)
        if res is None:
            continue
        chosen, dropped = res
        if dropped:
            outlier_districts += 1
        rid = m.match(sname, dname, extra_aliases=RENAMES)
        if not rid:
            unmatched.append(f"{sname}/{dname}")
            continue
        dist_row[rid] = chosen
        st = rid.split("_")[0]
        for k in (F_PD, F_WPD, F_SC, F_ST, F_HH, F_HH100, F_AW, F_WAGES):
            v = fnum(chosen.get(k))
            if v is not None:
                st_tot[st][k] += v

    matched_share = len(dist_row) / (len(dist_row) + len(unmatched) or 1) * 100
    print(f"districts: matched {len(dist_row)}, unmatched {len(unmatched)}, "
          f"match share {matched_share:.1f}%; outlier-dedup districts {outlier_districts}")
    assert matched_share >= 90, f"district match share {matched_share:.1f}% below 90% gate"

    METRICS = {
        "mgnrega_avg_wage_day": dict(
            name="MGNREGA average wage per day", cat="labour", unit="₹", dec=0, hib=1,
            desc="Average MGNREGA wage rate paid per person per day (₹), FY 2025-26."),
        "mgnrega_avg_days_employment_hh": dict(
            name="MGNREGA days of work per household", cat="labour", unit="days", dec=0, hib=1,
            desc="Average days of MGNREGA wage employment provided per participating household, FY 2025-26."),
        "mgnrega_pct_hh_100_days": dict(
            name="MGNREGA households completing 100 days", cat="labour", unit="%", dec=1, hib=1,
            desc="Share of participating households that completed the full 100 days of MGNREGA wage employment, FY 2025-26."),
        "mgnrega_women_persondays_share": dict(
            name="MGNREGA women persondays share", cat="labour", unit="%", dec=1, hib=1,
            desc="Women's share of total MGNREGA persondays generated, FY 2025-26 (descriptive share)."),
        "mgnrega_scst_persondays_share": dict(
            name="MGNREGA SC+ST persondays share", cat="labour", unit="%", dec=1, hib=1,
            desc="SC and ST combined share of total MGNREGA persondays generated, FY 2025-26 (descriptive share)."),
        "mgnrega_active_workers_per_1000": dict(
            name="MGNREGA active workers per 1,000 people", cat="labour", unit="per 1,000", dec=1, hib=1,
            desc="MGNREGA active workers per 1,000 population, FY 2025-26 (descriptive intensity; "
                 "Census-2011 total-population denominator)."),
    }

    dv = {mid: {} for mid in METRICS}
    for rid, r in dist_row.items():
        pd_ = fnum(r.get(F_PD)); hh = fnum(r.get(F_HH)); aw = fnum(r.get(F_AW))
        wpd = fnum(r.get(F_WPD)); sc = fnum(r.get(F_SC)); stp = fnum(r.get(F_ST))
        hh100 = fnum(r.get(F_HH100)); awage = fnum(r.get(F_AVGW)); adays = fnum(r.get(F_AVGD))
        if awage is not None:
            dv["mgnrega_avg_wage_day"][rid] = round(awage, 0)
        if adays is not None:
            dv["mgnrega_avg_days_employment_hh"][rid] = round(adays, 0)
        if hh and hh100 is not None:
            dv["mgnrega_pct_hh_100_days"][rid] = round(hh100 / hh * 100, 1)
        if pd_ and wpd is not None:
            dv["mgnrega_women_persondays_share"][rid] = round(wpd / pd_ * 100, 1)
        if pd_ and (sc is not None or stp is not None):
            dv["mgnrega_scst_persondays_share"][rid] = round(((sc or 0) + (stp or 0)) / pd_ * 100, 1)
        if aw is not None and pop.get(rid):
            dv["mgnrega_active_workers_per_1000"][rid] = round(aw / pop[rid] * 1000, 1)

    sv = {mid: {} for mid in METRICS}
    for st, t in st_tot.items():
        pd_ = t.get(F_PD, 0); hh = t.get(F_HH, 0)
        if hh:
            sv["mgnrega_avg_days_employment_hh"][st] = round(pd_ / hh, 0)
            sv["mgnrega_pct_hh_100_days"][st] = round(t.get(F_HH100, 0) / hh * 100, 1)
        if pd_:
            sv["mgnrega_women_persondays_share"][st] = round(t.get(F_WPD, 0) / pd_ * 100, 1)
            sv["mgnrega_scst_persondays_share"][st] = round((t.get(F_SC, 0) + t.get(F_ST, 0)) / pd_ * 100, 1)
            sv["mgnrega_avg_wage_day"][st] = round(t.get(F_WAGES, 0) * 1e5 / pd_, 0)  # Wages in Rs lakh
        if pop_st.get(st):
            sv["mgnrega_active_workers_per_1000"][st] = round(t.get(F_AW, 0) / pop_st[st] * 1000, 1)

    # Suppress rate metrics where MGNREGA participation is negligible: an average
    # wage/day or days/HH computed over a near-zero persondays base is noise, not a
    # district statistic (e.g. urban Ghaziabad computed ₹717/day off ~0 workers).
    # The participation metric itself correctly stays low there.
    low = [rid for rid, v in dv["mgnrega_active_workers_per_1000"].items() if v < LOW_ACTIVITY]
    for rid in low:
        dv["mgnrega_avg_wage_day"].pop(rid, None)
        dv["mgnrega_avg_days_employment_hh"].pop(rid, None)
    print(f"rate metrics suppressed for {len(low)} negligible-activity (<{LOW_ACTIVITY}/1000) districts: {low}")

    # sanity gates (catch unit errors before writing)
    def med(d):
        return statistics.median(list(d.values())) if d else 0
    assert 150 <= med(dv["mgnrega_avg_wage_day"]) <= 450, f"avg_wage median {med(dv['mgnrega_avg_wage_day'])} implausible"
    assert 20 <= med(dv["mgnrega_avg_days_employment_hh"]) <= 120, f"avg_days median {med(dv['mgnrega_avg_days_employment_hh'])} implausible"

    # Share metrics: SC/ST/Women persondays are reported against TOTAL persondays
    # generated, while our denominator is CENTRAL-LIABILITY persondays, so a few
    # districts with a large state-liability share compute marginally >100%. A share
    # >100 is physically impossible, so NULL those districts (never fabricate a cap)
    # and gate that this stays a rare artifact (<2%), not a systemic denominator bug.
    share_drops = {}
    for pid in ("mgnrega_pct_hh_100_days", "mgnrega_women_persondays_share", "mgnrega_scst_persondays_share"):
        bad = {k: v for k, v in dv[pid].items() if not (0 <= v <= 100)}
        for k in bad:
            del dv[pid][k]
        if bad:
            share_drops[pid] = bad
        frac = len(bad) / (len(bad) + len(dv[pid]) or 1)
        assert frac < 0.02, f"{pid}: {len(bad)} districts out of [0,100] ({frac:.1%}) — denominator bug, not an artifact: {list(bad.items())[:5]}"
        # state level: same physical guard
        for k in [k for k, v in sv[pid].items() if not (0 <= v <= 100)]:
            del sv[pid][k]
    assert 25 <= med(dv["mgnrega_women_persondays_share"]) <= 70, "women share median implausible"
    if share_drops:
        print("share >100 nulled (central-liability denominator):", share_drops)

    # idempotency: clear any prior rows for these metric ids across all levels/years
    ids = tuple(METRICS)
    con.execute(f"DELETE FROM metric_values WHERE metric_id IN ({','.join('?'*len(ids))})", ids)

    total = 0
    for mid, meta in METRICS.items():
        upsert_metric(con, mid, meta["name"], meta["cat"], meta["unit"], meta["dec"],
                      meta["hib"], meta["desc"], SOURCE, URL, METRIC_LICENSE, YEAR,
                      methodology=METH_COMMON)
        total += write_values(con, mid, "district", YEAR, dv[mid])
        total += write_values(con, mid, "state", YEAR, sv[mid])
        print(f"  {mid}: {len(dv[mid])} districts + {len(sv[mid])} states "
              f"(median {med(dv[mid])})")

    log_load(con, "ingest_mgnrega.py", SOURCE, YEAR, LOG_LICENSE, FETCHED, total,
             f"6 metrics (labour), district+state, FY2025-26 March cumulative. "
             f"matched {len(dist_row)}/{len(dist_row)+len(unmatched)} districts "
             f"({matched_share:.1f}%); snapshot-dedup outlier districts {outlier_districts}; "
             f"fuzzy {len(m.fuzzy_log)}; unmatched {unmatched[:8]}. "
             f"SC/ST/women shares use central-liability persondays denominator; "
             f"districts nulled for share>100 (physically impossible): "
             f"{ {k: len(v) for k, v in share_drops.items()} }. "
             f"avg_wage/avg_days suppressed for {len(low)} negligible-activity "
             f"(<{LOW_ACTIVITY}/1000) urban districts (near-zero persondays base -> noisy rate). "
             f"DROPPED metric percentage_payments_gererated_within_15_days: 87.5% of source "
             f"snapshot rows report >100% (MIS backlog-clearance artifact) -> not a clean "
             f"0-100 map metric (drop-with-reason, bedrock rule 7).")
    con.commit(); con.close()
    print(f"WROTE {total} values. unmatched districts:", unmatched)
    print("fuzzy sample:", m.fuzzy_log[:10])


if __name__ == "__main__":
    main()
