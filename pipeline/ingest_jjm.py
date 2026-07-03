"""JJM Har Ghar Jal district tap-water coverage -> canonical store.

Item 429 (iter-58): tap_water_pct (district + state) from the Jal Jeevan
Mission dashboard district CSV (snapshot 2026-07-03). RURAL households with a
functional household tap connection (FHTC) as a share of total rural
households.

Crosswalk: JJM prints ~754 current administrative districts; our geometry has
733. Matched via RegionMatcher (exact -> alias -> fuzzy, logged); where several
JJM districts land on one stored district (post-geometry splits), HOUSEHOLD
COUNTS are summed before the percentage is taken. Unmatched JJM districts are
logged with names — never guessed — but still count toward their state's
totals, so state values cover every JJM household. State level = sum(FHTC
households) / sum(total households), NOT an average of district percentages.
Year = 2026 (dashboard snapshot, date in methodology).
Run: pipeline/.venv/bin/python pipeline/ingest_jjm.py
"""
import csv, os, sqlite3
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(PIPE, "raw-new", "water", "JJM_HarGharJal_district_coverage_2026-07-03.csv")
SOURCE = "Jal Jeevan Mission (Har Ghar Jal) dashboard, DDWS / Ministry of Jal Shakti — district coverage snapshot 2026-07-03"
URL = "https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx"
LICENSE = "Govt. of India (DDWS/MoJS) dashboard data"
YEAR = 2026
FETCHED = "2026-07-03T14:58:00Z"

# JJM's abbreviated state labels -> canonical state names
STATE_ALIASES = {
    "d and nh and d and d": "dadra and nagar haveli and daman and diu",
    "a and n islands": "andaman and nicobar islands",
}
# post-2011 renames / spellings JJM prints vs the stored geometry names.
# ONLY documented renames of the SAME unit — never a guess at a split.
DIST_ALIASES = {
    "poonch": "punch",
    "hanumakonda": "warangal urban",              # renamed 2021
    "warangal": "warangal rural",                 # renamed 2021
    "kumuram bheem asifabad": "komaram bheem",
    "south andamans": "south andaman",
    "siaha": "saiha",
    "leh ladakh": "leh",
    "narmadapuram": "hoshangabad",                # renamed 2021
    "kheri": "lakhimpur kheri",
    "purbi champaran": "east champaran",
    "dharashiv": "osmanabad",                     # renamed 2022
    "chhatrapati sambhajinagar": "aurangabad",    # renamed 2022 (Maharashtra)
    "kamrup metro": "kamrup metropolitan",
    "balodabazar bhatapara": "baloda bazar",
    "balrampur ramanujganj": "balrampur",
    "korea": "koriya",
    "sonepur": "subarnapur",
    "the nilgiris": "nilgiris",
    "dr b r ambedkar konaseema": "konaseema",
}

METHODOLOGY = (
    "Jal Jeevan Mission 'Har Ghar Jal' dashboard, district table snapshot of "
    "2026-07-03: RURAL households with a functional household tap connection "
    "(FHTC, 'Value' column) as a share of total rural households ('Total' "
    "column). RURAL programme only — urban households are out of JJM's scope. "
    "JJM prints current administrative districts (~754); names are matched onto "
    "the stored 733-district geometry (exact -> alias -> fuzzy, logged); where "
    "several JJM districts map to one stored district, household COUNTS are "
    "summed before the share is taken. Unmatched JJM districts are logged, not "
    "guessed, and still roll into their state's totals. State value = sum(FHTC "
    "households)/sum(total households) over ALL the state's JJM districts (never "
    "an average of percentages). Administrative reporting data, not a survey.")


def main():
    with open(CSV, encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    assert rows and {"StateName", "Name", "Value", "Total"} <= set(rows[0]), \
        f"unexpected CSV columns: {rows[0].keys() if rows else None}"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    hh = {}          # rid -> [fhtc, total]
    st_hh = {}       # state code -> [fhtc, total]
    unmatched = []
    for r in rows:
        state, name = r["StateName"].strip(), r["Name"].strip()
        try:
            v, t = float(r["Value"]), float(r["Total"])
        except ValueError:
            unmatched.append(f"{state}/{name} (bad numbers)")
            continue
        if t <= 0:
            continue
        sn = norm(state)
        state = STATE_ALIASES.get(sn, state)
        scode = m.state_code(state)
        if scode:
            a = st_hh.setdefault(scode, [0.0, 0.0])
            a[0] += v; a[1] += t
        rid = m.match(state, name, extra_aliases=DIST_ALIASES)
        if not rid:
            # single-district states/UTs: the one polygon takes the counts
            if scode and len(m.by_state.get(scode, {})) == 1:
                rid = next(iter(m.by_state[scode].values()))
        if rid:
            a = hh.setdefault(rid, [0.0, 0.0])
            a[0] += v; a[1] += t
        else:
            unmatched.append(f"{state}/{name}")

    match_rate = (len(rows) - len(unmatched)) / len(rows) * 100
    print(f"district match: {len(rows) - len(unmatched)}/{len(rows)} "
          f"({match_rate:.1f}%); fuzzy={len(m.fuzzy_log)}")
    print("unmatched:", unmatched)
    assert match_rate >= 90, f"match rate {match_rate:.1f}% below gate"

    d_vals = {rid: round(v / t * 100, 1) for rid, (v, t) in hh.items() if t > 0}
    s_vals = {st: round(v / t * 100, 1) for st, (v, t) in st_hh.items() if t > 0}
    nat = sum(v for v, _ in st_hh.values()) / sum(t for _, t in st_hh.values()) * 100
    print(f"{len(d_vals)} districts, {len(s_vals)} states; national {nat:.1f}% of "
          f"rural households with tap water")

    upsert_metric(
        con, "tap_water_pct", "Rural households with tap water (JJM)",
        "infrastructure", "%", 1, 1,
        "Rural households with a functional tap connection under Jal Jeevan "
        "Mission (Har Ghar Jal), share of total rural households — dashboard "
        "snapshot 2026-07-03.",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "tap_water_pct", "district", YEAR, d_vals)
    n += write_values(con, "tap_water_pct", "state", YEAR, s_vals)
    log_load(con, "ingest_jjm.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 metric; {len(d_vals)} districts + {len(s_vals)} states; JJM-name "
             f"match {match_rate:.1f}% ({len(unmatched)} unmatched = post-geometry "
             f"new districts, logged not guessed: {[u for u in unmatched][:12]}...); "
             f"state=household-sum ratio; fuzzy {len(m.fuzzy_log)}; skip_reason "
             f"(states): Delhi & Chandigarh absent from the JJM district CSV "
             f"(no rural JJM reporting)")
    con.commit(); con.close()
    print(f"WROTE {n} values. fuzzy sample: {m.fuzzy_log[:12]}")


if __name__ == "__main__":
    main()
