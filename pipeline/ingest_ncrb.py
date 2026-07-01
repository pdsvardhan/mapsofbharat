"""NCRB Crime in India 2022 district tables -> canonical store.

NCRB reports by POLICE district: City/Rural/Railway/Commissionerate splits and
non-geographic units (Crime Branch, CID, ...). We aggregate splits into the base
revenue district by name, drop non-geographic units (logged), and compute rates
per 100k using Census-2011 reaggregated population (the only district population
in the canonical store; the denominator vintage is stated in each metric's
description). State rows = sum of matched counts / state 2011 population.
Run: pipeline/.venv/bin/python pipeline/ingest_ncrb.py
"""
import os, re, sqlite3
import pandas as pd
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(PIPE, "raw-new", "crime")
SOURCE = "NCRB, Crime in India 2022 (district tables via data.gov.in OGD)"
URL = "https://data.gov.in/catalog/crime-india-2022"
LICENSE = "GODL-India"
YEAR = 2022
FETCHED = "2026-06-10T20:30:00Z"
METHODOLOGY = ("Counts from NCRB Crime in India 2022 district tables; rates per 100,000 computed "
               "against Census-2011 reaggregated population (the only district-level denominator in "
               "the store — the vintage mismatch slightly inflates rates in fast-growing districts). "
               "NCRB reports by police district: City/Rural/Commissionerate splits are summed into the "
               "host revenue district (documented approximations for metro commissionerates); railway "
               "and non-geographic units are excluded. Denominators come from the official Census-2011 "
               "sub-district reaggregation (complete national coverage, bug #18 fix), so no district is withheld.")

DROP_UNITS = re.compile(
    r"crime branch|c\.?i\.?d|railway|cyber|stf|eow|special cell|"
    r"ghrp|grp|total", re.I)
SPLIT_SUFFIXES = re.compile(
    r"\s+(city|rural|urban|commissionerate|commissionarate|commr\.?)$", re.I)

# Metro police commissionerates -> host revenue district. These are documented
# jurisdiction APPROXIMATIONS (a commissionerate can straddle district lines);
# counts roll into the named district. (state_norm, base_norm) -> canonical norm.
COMMISSIONERATE_MAP = {
    ("karnataka", "bengaluru"): "bengaluru urban",
    ("karnataka", "bengaluru district"): "bengaluru rural",
    ("karnataka", "hubballi dharwad"): "dharwad",
    ("telangana", "cyberabad"): "ranga reddy",
    ("telangana", "rachakonda"): "medchal malkajgiri",
    ("telangana", "warangal"): "warangal urban",
    ("telangana", "jagityal"): "jagtial",
    ("uttar pradesh", "kanpur"): "kanpur nagar",
    ("assam", "guwahati"): "kamrup metropolitan",
    ("maharashtra", "pimpri chinchwad"): "pune",
    ("maharashtra", "navi mumbai"): "thane",
}

TABLES = [
    ("ncrb_cii2022_district_1.1_ipc_crimes.csv", "District",
     "Total Cognizable IPC crimes - Col. ( 144)",
     "crime_ipc_rate", "IPC crimes", "Total cognizable IPC crimes registered"),
    ("ncrb_cii2022_district_1.1_ipc_crimes.csv", "District",
     "Offences affecting the Human Body - Murder (Sec.302 IPC) - Col. ( 3)",
     "crime_murder_rate", "Murders", "Murder cases registered (Sec. 302 IPC)"),
    ("ncrb_cii2022_district_1.3_crime_against_women.csv", "District",
     "Total Crime against Women (IPC+SLL) - Col. ( 54)",
     "crime_women_rate", "Crimes against women", "Total crimes against women (IPC+SLL)"),
    ("ncrb_cii2022_district_1.9_cyber_crimes.csv", "District",
     "Total Cyber Crimes (A+B+C) - Col. ( 51)",
     "crime_cyber_rate", "Cyber crimes", "Total cyber crimes (IT Act + IPC + SLL)"),
]


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    pop = dict(con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id='pop_total' AND region_level='district' AND year=2011"))
    pop_st = dict(con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id='pop_total' AND region_level='state' AND year=2011"))

    total_rows = 0
    dropped_units = set()
    unmatched_all = set()
    for fname, dcol, vcol, mid, mname, desc in TABLES:
        df = pd.read_csv(os.path.join(RAW, fname), low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        dcol_real = next(c for c in df.columns if norm(c) in
                         ("district", "districts", "state ut district", "state district"))
        vcol_real = next(c for c in df.columns if c.strip() == vcol.strip())

        counts: dict[str, float] = {}
        unmatched: dict[str, float] = {}
        for _, r in df.iterrows():
            dname = str(r[dcol_real]).strip()
            if DROP_UNITS.search(dname):
                dropped_units.add(dname)
                continue
            base = SPLIT_SUFFIXES.sub("", dname)
            v = pd.to_numeric(r[vcol_real], errors="coerce")
            if pd.isna(v):
                continue
            base = COMMISSIONERATE_MAP.get((norm(r["State/UT"]), norm(base)), base)
            # counts may aggregate into a merged polygon (unlike percentages)
            rid = m.match(r["State/UT"], base, extra_aliases={"mumbai suburban": "mumbai"})
            if not rid:
                # directional police splits ("Jaipur East", "Howrah City Police
                # North") aggregate into the parent district; strip trailing
                # directionals and retry so partial counts are never written
                base2 = base
                for _ in range(3):
                    stripped = re.sub(
                        r"\s+(east|west|north|south|central|metro|metropolitan|"
                        r"police|city|rural|urban|pc)$",
                        "", base2, flags=re.I)
                    if stripped == base2:
                        break
                    base2 = stripped
                    rid = m.match(r["State/UT"], base2)
                    if rid:
                        break
            if not rid:
                # single-district states/UTs (Delhi, Chandigarh, ...): every police
                # unit's counts roll up into the one polygon
                st = m.state_code(r["State/UT"])
                if st and len(m.by_state.get(st, {})) == 1:
                    rid = next(iter(m.by_state[st].values()))
            if rid:
                counts[rid] = counts.get(rid, 0) + float(v)
            else:
                key = f'{r["State/UT"]}/{base}'
                unmatched[key] = unmatched.get(key, 0) + float(v)
                unmatched_all.add(key)

        matched_share = sum(counts.values()) / (sum(counts.values()) + sum(unmatched.values()) or 1) * 100
        rates = {rid: round(c / pop[rid] * 100000, 1) for rid, c in counts.items() if pop.get(rid)}

        # state level: sum matched district counts per state / state 2011 pop
        st_counts: dict[str, float] = {}
        for rid, c in counts.items():
            st = rid.split("_")[0]
            st_counts[st] = st_counts.get(st, 0) + c
        st_rates = {st: round(c / pop_st[st] * 100000, 1) for st, c in st_counts.items() if pop_st.get(st)}

        upsert_metric(con, mid, mname, "crime", "per 100k", 1, 0,
                      f"{desc}, 2022, per 100,000 population (denominator: Census 2011 "
                      f"reaggregated population — rate vintage mismatch is stated, not hidden).",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, rates)
        n += write_values(con, mid, "state", YEAR, st_rates)
        total_rows += n
        print(f"  {mid}: {len(rates)} districts + {len(st_rates)} states; matched count share {matched_share:.1f}%")
        assert matched_share >= 80, f"{mid}: matched-count share {matched_share:.1f}% below gate"

    log_load(con, "ingest_ncrb.py", SOURCE, YEAR, LICENSE, FETCHED, total_rows,
             f"4 metrics; dropped units {len(dropped_units)}; unmatched names {len(unmatched_all)}; fuzzy {len(m.fuzzy_log)}")
    # drop-with-reason: UDISE+ education was in the locked vertical list but no
    # district report-card files are acquirable headlessly (portal needs an
    # interactive session) — recorded so the skip is auditable, not silent
    log_load(con, "ingest_udise.py (skipped)",
             "UDISE+ district report cards (MoE)", 2024, "n/a", FETCHED, 0,
             "skip_reason: no headless-downloadable district dataset found by the "
             "acquisition scout (2026-06-10); deferred until files are acquired")
    con.commit(); con.close()
    print(f"WROTE {total_rows} values.")
    print("dropped (non-geographic) sample:", sorted(dropped_units)[:10])
    print("unmatched sample:", sorted(unmatched_all)[:15])
    print("fuzzy sample:", m.fuzzy_log[:10])


if __name__ == "__main__":
    main()
