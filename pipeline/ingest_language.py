"""Census 2011 C-16 mother tongue -> district language metrics (item 590).

Source: Census 2011 Table C-16 (Population by Mother Tongue), per-state XLSX from
the Census NADA portal (raw-new/language/c16/DDW-C16-STMT-MDDS-<SS>00.XLSX;
downloaded via a browser session since NADA blocks the server). Columns:
  Table | State | District | Sub-district | Area name | MT code | MT name | P M F ...

Rows whose mother-tongue code ends in "000" are the LANGUAGE-GROUP totals (the
scheduled languages + non-scheduled groups); these partition the population
exactly (verified: Nandurbar group-sum P = 1,648,295 = its Census 2011
population). We read district-total rows (district code != 000, sub-district
00000) and, over the group rows, compute:

  language_top_share   % speaking the single most-common mother tongue
  language_hindi_pct   % whose mother tongue is Hindi (group code 006000)
  language_diversity   Simpson linguistic diversity, 1 - sum(share^2), 0-1
                       (higher = more linguistically mixed)

New category: language. The national file (SS=00) is skipped.

Run: pipeline/.venv/bin/python pipeline/ingest_language.py
"""
import glob
import os
import sqlite3

import numpy as np
import pandas as pd

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "language", "c16")
SOURCE = "Census of India 2011, Table C-16 (Population by Mother Tongue)"
URL = "https://censusindia.gov.in/nada/index.php/catalog/C-16"
LICENSE = "Census of India, Govt. of India (open data)"
YEAR = 2011
FETCHED = "2026-07-15T23:56:00Z"
METHODOLOGY = (
    "Census 2011 Table C-16 (Population by Mother Tongue), per-state files. For "
    "each district the language-group totals (the census's mother-tongue groups, "
    "which partition the population exactly) are summed; the top-language share is "
    "the largest group's share, Hindi is group code 006000, and diversity is the "
    "Simpson index 1 - sum(share^2) over all groups (0 = everyone shares one mother "
    "tongue, 1 = maximally mixed). District names crosswalked to the current "
    "geometry (exact -> alias -> fuzzy, logged); this is 2011-vintage data.")

COLS = ["tbl", "st", "dt", "sd", "area", "mtcode", "mtname",
        "P", "M", "F", "rP", "rM", "rF", "uP", "uM", "uF"]

# 2011 census district names -> current geometry names (verified renames only;
# norm() strips any "(...)" parenthetical). Leh/Kargil sit under J&K in the 2011
# census but under the Ladakh UT in the current geometry — remapped by state.
DIST_ALIASES = {
    "muktsar": "sri muktsar sahib",
    "sahibzada ajit singh nagar": "s a s nagar",
    "garhwal": "pauri garhwal",
    "dhaulpur": "dholpur",
    "jyotiba phule nagar": "amroha",
    "mahamaya nagar": "hathras",
    "kheri": "lakhimpur kheri",
    "allahabad": "prayagraj",
    "faizabad": "ayodhya",
    "sant ravidas nagar": "bhadohi",
    "the nilgiris": "nilgiris",
    "kanshiram nagar": "kasganj",
    "koch bihar": "cooch behar",
    "hugli": "hooghly", "haora": "howrah",
    "north twenty four parganas": "north parganas",
    "south twenty four parganas": "south parganas",
    "north district": "north sikkim", "south district": "south sikkim",
    "east district": "east sikkim", "west district": "west sikkim",
    "puruliya": "purulia", "maldah": "malda",
    "mumbai suburban": "mumbai",   # merged into Mumbai in the current geometry
}
# norm() strips "(...)" so "Leh(Ladakh)" -> "leh"; both sit under J&K in 2011
# but the Ladakh UT in the current geometry.
STATE_REMAP = {"leh": "Ladakh", "kargil": "Ladakh"}
# 2011 census states that later split / merged, keyed by norm(census-state name)
CENSUS_STATE_REMAP = {
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
}


def resolve_rid(m, state, name, norm):
    """Crosswalk a 2011-census (state, district) to a current-geometry rid,
    handling the state reorganisations that post-date the 2011 census."""
    st = STATE_REMAP.get(norm(name)) or CENSUS_STATE_REMAP.get(norm(state), state)
    rid = m.match(st, name, extra_aliases=DIST_ALIASES)
    if rid:
        return rid
    # undivided Andhra Pradesh in 2011 -> its Telangana districts live under the
    # Telangana state in the current geometry
    if norm(state).startswith("andhra"):
        rid = m.match("Telangana", name, extra_aliases=DIST_ALIASES)
        if rid:
            return rid
    # single-district states/UTs (Delhi consolidates 9 census districts -> 1):
    # the one polygon takes the row; aggregation by rid keeps shares correct
    scode = m.state_code(st) or m.state_code(state)
    if scode and len(m.by_state.get(scode, {})) == 1:
        return next(iter(m.by_state[scode].values()))
    return None


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    from region_match import norm
    # rid -> {mtcode: P}, aggregating across census districts that share a rid
    # (e.g. Delhi's 9 census districts -> the single geometry district). Shares
    # and diversity are computed AFTER aggregation, never averaged.
    by_rid = {}
    nrows = 0
    unmatched = []
    files = sorted(glob.glob(os.path.join(DIR, "DDW-C16-STMT-MDDS-*.XLSX")))
    files = [f for f in files if not os.path.basename(f).endswith("-0000.XLSX")]
    assert len(files) >= 30, f"only {len(files)} C-16 state files"

    for fp in files:
        df = pd.read_excel(fp, header=None, skiprows=6, dtype=str)
        df = df.iloc[:, :len(COLS)]
        df.columns = COLS[:df.shape[1]]
        df["Pn"] = pd.to_numeric(df["P"], errors="coerce")
        df = df.dropna(subset=["Pn", "dt", "sd", "mtcode"])
        st_row = df[(df.dt == "000") & (df.sd == "00000")]
        state = st_row.area.iloc[0].strip().title() if len(st_row) else None
        if not state:
            continue
        dd = df[(df.dt != "000") & (df.sd == "00000") & (df.mtcode.str.endswith("000"))]
        for dcode, g in dd.groupby("dt"):
            name = g.area.iloc[0].strip()
            if g.Pn.sum() <= 0:
                continue
            nrows += 1
            rid = resolve_rid(m, state, name, norm)
            if not rid:
                unmatched.append(f"{state}/{name}")
                continue
            acc = by_rid.setdefault(rid, {})
            for code, p in zip(g.mtcode, g.Pn):
                acc[code] = acc.get(code, 0.0) + float(p)

    rate = (nrows - len(unmatched)) / max(nrows, 1) * 100
    print(f"districts: {nrows}; match {nrows - len(unmatched)}/{nrows} ({rate:.1f}%); "
          f"aggregated rids {len(by_rid)}; fuzzy {len(m.fuzzy_log)}")
    print("unmatched:", unmatched[:20], "..." if len(unmatched) > 20 else "")
    assert rate >= 90, f"match rate {rate:.1f}% below gate"

    top_share, hindi_pct, diversity = {}, {}, {}
    for rid, counts in by_rid.items():
        ps = np.array(list(counts.values()), dtype="float64")
        tot = ps.sum()
        if tot <= 0:
            continue
        top_share[rid] = round(float(ps.max()) / tot * 100, 1)
        hindi_pct[rid] = round(counts.get("006000", 0.0) / tot * 100, 1)
        diversity[rid] = round(float(1 - np.sum((ps / tot) ** 2)), 3)

    specs = [
        ("language_top_share", "Share speaking the top language", "%", 1, None, top_share),
        ("language_hindi_pct", "Hindi mother-tongue speakers", "%", 1, None, hindi_pct),
        ("language_diversity", "Linguistic diversity", "index", 3, None, diversity),
    ]
    total = 0
    for mid, name, unit, dec, hib, vals in specs:
        upsert_metric(con, mid, name, "language", unit, dec, hib,
                      name + " (Census 2011).", SOURCE, URL, LICENSE, YEAR,
                      methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, vals)
        total += n
        print(f"  {mid}: {len(vals)} districts")

    log_load(con, "ingest_language.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"3 language metrics from {len(files)} C-16 state files; {nrows} districts, "
             f"match {rate:.1f}% ({len(unmatched)} unmatched, logged); Simpson diversity; "
             f"fuzzy {len(m.fuzzy_log)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across 3 metrics.")


if __name__ == "__main__":
    main()
