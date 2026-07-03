"""Census 2011 Table C-01 (population by religious community) -> canonical store.

Item 421 (iter-58): hindu_pct / muslim_pct / christian_pct / sikh_pct /
buddhist_pct / jain_pct, district + state, shares of total district population
(Total residence rows, not Rural/Urban).

C-01 is published per 2011 district only (no sub-district split), so post-2011
district changes are handled by POPULATION-WEIGHTED PARENT ATTRIBUTION: each
2011 district's religious counts are apportioned onto the current districts it
feeds, proportional to the 2011 population each current district inherited
(weights come from the persisted sub-district crosswalk via
ingest_census_a01.subdistrict_rid_map — the same mapping behind pop_total).
Districts carved out after 2011 therefore inherit their parent's composition;
this approximation is stated here and in every metric's methodology. For
unchanged districts the arithmetic reduces to the printed C-01 share exactly.

State level aggregates the same apportioned counts by current state, which
reproduces the printed C-01 state shares for unchanged states and derives
Telangana/AP and J&K/Ladakh consistently.

Run: pipeline/.venv/bin/python pipeline/ingest_religion_c01.py
"""
import glob, os, re, sqlite3
import pandas as pd
from region_match import upsert_metric, write_values, log_load, DB
from ingest_census_a01 import subdistrict_rid_map

PIPE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(PIPE, "raw-new", "religion", "census2011_C01_states")
SOURCE = "Census of India 2011, Table C-01: Population by religious community (ORGI)"
URL = "https://censusindia.gov.in/census.website/data/census-tables"
LICENSE = "GODL-India"
YEAR = 2011
FETCHED = "2026-07-03T13:56:00Z"

COLS = ["table", "scode", "dcode", "tehsil", "town", "name", "tru",
        "tot_p", "tot_m", "tot_f", "hindu_p", "hindu_m", "hindu_f",
        "muslim_p", "muslim_m", "muslim_f", "christian_p", "christian_m", "christian_f",
        "sikh_p", "sikh_m", "sikh_f", "buddhist_p", "buddhist_m", "buddhist_f",
        "jain_p", "jain_m", "jain_f", "other_p", "other_m", "other_f",
        "notstated_p", "notstated_m", "notstated_f"]

RELIGIONS = [
    ("hindu_pct", "hindu_p", "Hindu population share"),
    ("muslim_pct", "muslim_p", "Muslim population share"),
    ("christian_pct", "christian_p", "Christian population share"),
    ("sikh_pct", "sikh_p", "Sikh population share"),
    ("buddhist_pct", "buddhist_p", "Buddhist population share"),
    ("jain_pct", "jain_p", "Jain population share"),
]

METHODOLOGY = (
    "Census 2011 Table C-01 district Total-residence rows (35 state workbooks, "
    "DDWxxC-01_MDDS; rows selected by MDDS code — district code set, tehsil/town "
    "zero): community population as a share of total district population. "
    "C-01 has no sub-district split, so 2011 districts are mapped to current "
    "boundaries by population-weighted parent attribution: each 2011 district's "
    "counts are apportioned to the current districts it feeds, proportional to the "
    "2011 population inherited via the persisted sub-district crosswalk (the same "
    "mapping behind pop_total). Districts carved out after 2011 inherit their "
    "parent's religious composition — a stated approximation; unchanged districts "
    "carry the printed C-01 share exactly. State values aggregate the same "
    "apportioned counts by current state (derives Telangana/AP and J&K/Ladakh; "
    "matches printed state shares elsewhere). Shares are of TOTAL population "
    "(religions not listed here — 'Other religions & persuasions' and 'Religion "
    "not stated' — account for the remainder to 100%).")


def load_counts():
    """{d2011: {tot, hindu, muslim, christian, sikh, buddhist, jain}} + state rows."""
    counts, state_rows = {}, {}
    files = sorted(glob.glob(os.path.join(RAW, "DDW*C-01_MDDS.XLS")))
    files = [f for f in files if re.search(r"DDW(\d\d)C", f).group(1) != "00"]
    assert len(files) == 35, f"expected 35 state C-01 workbooks, found {len(files)}"
    for f in files:
        df = pd.read_excel(f, header=None, dtype=str)
        df = df[df[0].astype(str).str.startswith("C01", na=False)]
        assert df.shape[1] == len(COLS), f"{f}: unexpected column count {df.shape[1]}"
        df.columns = COLS
        num_cols = [c for c in COLS if c.endswith(("_p", "_m", "_f"))]
        for c in num_cols:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        # district rows by CODE, not label: dcode set, tehsil/town zero. (The
        # Tripura workbook prints districts without the "District - " prefix,
        # and "Area not under any Sub-district" rows carry tehsil 99999.)
        d = df[(df.tru == "Total") & (df.dcode != "000")
               & (df.tehsil == "00000") & (df.town == "000000")]
        for _, r in d.iterrows():
            key = r.scode + "_" + str(int(r.dcode))
            counts[key] = {"tot": r.tot_p, **{mid: r[col] for mid, col, _ in RELIGIONS}}
        s = df[(df.tru == "Total") & df.name.str.startswith("State - ", na=False)]
        for _, r in s.iterrows():
            state_rows[r.scode] = {"tot": r.tot_p, **{mid: r[col] for mid, col, _ in RELIGIONS}}
    return counts, state_rows


def main():
    con = sqlite3.connect(DB)
    counts, state_rows = load_counts()
    assert len(counts) == 640, f"expected all 640 census-2011 districts, got {len(counts)}"
    _sdmap, weights, _dropped = subdistrict_rid_map(con)
    print(f"C-01 districts: {len(counts)}; weighted 2011 districts: {len(weights)}")

    num = {mid: {} for mid, _, _ in RELIGIONS}
    den: dict[str, float] = {}
    unweighted = []
    for d2011, c in counts.items():
        w = weights.get(d2011)
        if not w:
            unweighted.append(d2011)
            continue
        W = sum(w.values())
        for rid, wr in w.items():
            share = wr / W
            den[rid] = den.get(rid, 0) + c["tot"] * share
            for mid, _, _ in RELIGIONS:
                num[mid][rid] = num[mid].get(rid, 0) + c[mid] * share
    match_rate = (len(counts) - len(unweighted)) / len(counts) * 100
    print(f"2011-district weight coverage: {match_rate:.1f}% "
          f"(unweighted: {unweighted[:10]})")
    assert match_rate >= 98, "2011-district -> current-district weights below gate"

    # national reconciliation (ADR-010: crosswalk drops ~1.6% of population)
    nat = sum(den.values())
    assert abs(nat - 1_210_854_977) / 1_210_854_977 < 0.02

    # state aggregation of the same apportioned counts
    den_st, num_st = {}, {mid: {} for mid, _, _ in RELIGIONS}
    for rid, v in den.items():
        st = rid.split("_")[0]
        den_st[st] = den_st.get(st, 0) + v
    for mid, _, _ in RELIGIONS:
        for rid, v in num[mid].items():
            st = rid.split("_")[0]
            num_st[mid][st] = num_st[mid].get(st, 0) + v

    # spot truths (state level, unchanged states -> printed values)
    for st, mid, want in (("03", "sikh_pct", 57.7), ("32", "muslim_pct", 26.6),
                          ("15", "christian_pct", 87.2)):
        got = num_st[mid][st] / den_st[st] * 100
        print(f"spot: state {st} {mid} = {got:.1f} (expect {want})")
        assert abs(got - want) < 0.2, f"spot-truth failed for {st}/{mid}"
    # cross-check apportioned state totals vs the printed C-01 state rows
    worst = 0.0
    for scode, c in state_rows.items():
        if scode in ("01", "25", "26", "28"):
            continue  # split/merged units compared post-derivation only
        if den_st.get(scode):
            worst = max(worst, abs(den_st[scode] - c["tot"]) / c["tot"])
    print(f"state-total reconciliation vs printed C-01 rows: worst diff {worst * 100:.2f}%")

    total = 0
    for mid, _, name in RELIGIONS:
        d_vals = {rid: round(num[mid][rid] / den[rid] * 100, 1)
                  for rid in den if den[rid] > 0}
        s_vals = {st: round(num_st[mid][st] / den_st[st] * 100, 1)
                  for st in den_st if den_st[st] > 0}
        upsert_metric(
            con, mid, name, "society", "%", 1, None,
            f"{name}, Census 2011 (Table C-01): community population as a share of "
            "total population. Descriptive composition — no better/worse direction.",
            SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, d_vals)
        n += write_values(con, mid, "state", YEAR, s_vals)
        total += n
        print(f"  {mid}: {len(d_vals)} districts + {len(s_vals)} states")

    log_load(con, "ingest_religion_c01.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"6 share metrics; 2011-district weight coverage {match_rate:.1f}%; "
             f"post-2011 splits by population-weighted parent attribution; "
             f"unweighted 2011 districts: {len(unweighted)}")
    con.commit(); con.close()
    print(f"WROTE {total} values.")


if __name__ == "__main__":
    main()
