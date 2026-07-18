"""NPCI UPI district payments vertical -> canonical store (iter-23 item 690).

Source: NPCI "State-wise UPI Product Statistics" workbook, Jun 2026 sheet,
pipeline/raw-new/payments/npci-upi-districtwise-2026-06.xlsx. Columns: State/UT,
District, Volume (in Mn) [monthly UPI transaction count], Value (in Cr.) [monthly
UPI value, Rs crore]. NPCI operates UPI and is the only publisher of the DISTRICT
breakdown (RBI publishes national/aggregate only), so it is the authoritative
source for this cut.

Two district-level metrics, new category 'payments', year 2026 (Jun 2026 snapshot):
  upi_value_per_capita  monthly UPI value, Rs per person   = Value_Cr * 1e7 / pop2011
  upi_txn_per_capita     monthly UPI transactions per person = Volume_Mn * 1e6 / pop2011

State-level values come from the workbook's explicit "<STATE> Total" rows, which sum
every district in the state (including ones we cannot region-match), divided by the
state's Census-2011 population -- so state coverage is exact even when a few district
names miss.

LOCATION-UNCLASSIFIED DISCLOSURE (to-do 203): the workbook's final "Unclassified #"
row carries transactions NPCI could not attribute to any district. In Jun 2026 that
is 10,005.78 Mn (44.05% of national volume) and Rs 11,25,377 Cr (38.91% of value).
District and state values therefore describe only the location-attributed remainder;
the exact share is computed below, written into the methodology, and printed by the
loader so it is never silently dropped.

Denominator: Census-2011 population (pop_total, the store's standard denominator). A
monthly-flow numerator over a 2011 denominator is a documented vintage gap -- current
population would lower per-capita values roughly proportionally everywhere.

Rows with District == "-" are non-district (the "<STATE> Total" subtotals and the
"Unclassified #" row) and are excluded from the district pass. District names are
matched onto the stored 733-district geometry via RegionMatcher (exact -> paren-
preserved -> alias -> fuzzy, logged); paren content is preserved before matching so
"BENGALURU (URBAN)" / "(RURAL)" resolve to the correct stored districts. Where several
source districts map to one stored district, their Volume and Value are SUMMED before
the per-capita rate. Unmatched districts are logged, never guessed, and still count
toward their state value via the "<STATE> Total" rows.

Run: pipeline/.venv/bin/python pipeline/ingest_npci_upi.py
"""
import os, re, sqlite3
import pandas as pd
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(PIPE, "raw-new", "payments", "npci-upi-districtwise-2026-06.xlsx")
SOURCE = "NPCI — State-wise UPI Product Statistics, district-level, Jun 2026"
URL = "https://www.npci.org.in/what-we-do/upi/upi-ecosystem-statistics/statewise"
LICENSE = "NPCI published statistics (National Payments Corporation of India)"
YEAR = 2026  # Jun 2026 snapshot
FETCHED = "2026-07-17T00:00:00Z"

# NPCI district spellings -> stored geometry names (normalised both sides).
# ONLY documented renames/spellings of the SAME unit -- never a guess at a split.
# Seeded from ingest_jjm.py's map + NPCI-specific forms; refined against the run's
# unmatched log. Keys are the norm() form the matcher sees (after paren-preserving).
DIST_ALIASES = {
    # renames (same unit, new name) — verified against region_keys spellings
    "chhatrapati sambhaji nagar": "aurangabad",     # MH renamed 2023
    "ahilyanagar": "ahmednagar",                    # MH renamed 2023
    "dharashiv": "osmanabad",                       # MH renamed 2022
    "kumuram bheem": "komaram bheem",               # TG (NPCI KumUram spelling)
    "hanumakonda": "warangal urban",                # TG renamed 2021
    "warangal": "warangal rural",                   # TG renamed 2021 (old Warangal Rural)
    "narmadapuram": "hoshangabad",                  # MP renamed 2021
    "sribhumi": "karimganj",                         # AS renamed 2024
    "korea": "koriya",                               # CG spelling
    # alternate transliterations of the SAME existing district
    "the nilgiris": "nilgiris",                      # TN
    "dr b r ambedkar konaseema": "konaseema",       # AP
    "kheri": "lakhimpur kheri",                      # UP
    "haora": "howrah",                               # WB
    "hugli": "hooghly",                              # WB
    "koch bihar": "cooch behar",                     # WB
    "north twenty four parganas": "north parganas",  # WB (store norm form)
    "kamrup metro": "kamrup metropolitan",           # AS
    "kamrup rural": "kamrup",                         # AS
    "south salmara": "south salmara mankachar",       # AS
    "nuaparha": "nuapada",                            # OD
    "riasi": "reasi",                                 # J&K spelling
    # printed with an old name in parentheses (paren content preserved before match)
    "keonjhar kendujhar": "kendujhar",               # OD
    "kaimur bhabua": "kaimur",                        # BR
    "kawardha kabirdham": "kabeerdham",              # CG
    "sas nagar sahibzada ajit singh nagar": "s a s nagar",  # PB (store 'S.A.S. Nagar')
    # store merged Mumbai City + Suburban into one 'Mumbai' district -> both NPCI
    # rows sum into it (adapter sums vol/val per rid).
    "mumbai suburban": "mumbai",
}

METHODOLOGY_TMPL = (
    "NPCI 'State-wise UPI Product Statistics', district table for {month}: monthly "
    "UPI {what} per person, computed as the workbook's district {col} divided by the "
    "district's Census-2011 population (pop_total, the store's standard denominator; a "
    "monthly flow over a 2011 denominator is a documented vintage gap). State values use "
    "the workbook's explicit '<STATE> Total' rows divided by state population, so a "
    "state covers every district including any this loader could not name-match. "
    "LOCATION-UNCLASSIFIED: {uncl_pct:.1f}% of national UPI {what2} in {month} is not "
    "attributable to any district by NPCI (the workbook's 'Unclassified #' row) and is "
    "therefore excluded from all district and state figures. NPCI operates UPI and is "
    "the only publisher of the district breakdown. Administrative product statistics, "
    "not a survey.")


def to_num(s):
    return pd.to_numeric(pd.Series(s).astype(str).str.replace(",", "", regex=False),
                         errors="coerce")


def main():
    df = pd.read_excel(XLSX, sheet_name="Sheet1", header=1)
    df.columns = [str(c).strip() for c in df.columns]
    scol = next(c for c in df.columns if "State" in c)
    dcol = next(c for c in df.columns if "District" in c)
    vcol = next(c for c in df.columns if "Volume (in" in c)
    ucol = next(c for c in df.columns if "Value (in" in c)
    df[scol] = df[scol].astype(str).str.strip()
    df[dcol] = df[dcol].astype(str).str.strip()
    df["_vol"] = to_num(df[vcol])   # Mn transactions
    df["_val"] = to_num(df[ucol])   # Rs crore

    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode=DELETE;")
    m = RegionMatcher(con)
    pop_d = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='district' AND year=2011"))
    pop_s = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='state' AND year=2011"))

    # ---- partition rows -------------------------------------------------
    is_total = df[scol].str.endswith("Total")
    is_uncl = df[scol].str.startswith("Unclassified")
    is_dist = (df[dcol] != "-") & (~df[dcol].isin(["", "nan"])) & ~is_total & ~is_uncl

    # national totals for the unclassified disclosure
    state_tot_vol = float(df.loc[is_total, "_vol"].sum())
    state_tot_val = float(df.loc[is_total, "_val"].sum())
    uncl_vol = float(df.loc[is_uncl, "_vol"].sum())
    uncl_val = float(df.loc[is_uncl, "_val"].sum())
    nat_vol = state_tot_vol + uncl_vol
    nat_val = state_tot_val + uncl_val
    uncl_pct_vol = uncl_vol / nat_vol * 100 if nat_vol else 0.0
    uncl_pct_val = uncl_val / nat_val * 100 if nat_val else 0.0

    # ---- district pass: sum vol/val per stored rid ----------------------
    rid_vol, rid_val = {}, {}
    matched_val = 0.0
    n_dist_rows = 0
    unmatched = []
    for _, r in df[is_dist].iterrows():
        n_dist_rows += 1
        state, dist = r[scol], r[dcol]
        vol, val = r["_vol"], r["_val"]
        if pd.isna(vol) or pd.isna(val):
            unmatched.append(f"{state}/{dist} (bad numbers)")
            continue
        dclean = dist.replace("(", " ").replace(")", " ")  # preserve paren content
        rid = m.match(state, dclean, extra_aliases=DIST_ALIASES)
        if not rid:
            scode = m.state_code(state)
            if scode and len(m.by_state.get(scode, {})) == 1:  # single-district UT
                rid = next(iter(m.by_state[scode].values()))
        if rid:
            rid_vol[rid] = rid_vol.get(rid, 0.0) + vol
            rid_val[rid] = rid_val.get(rid, 0.0) + val
            matched_val += val
        else:
            unmatched.append(f"{state}/{dist}")

    attributed_val = float(df.loc[is_dist, "_val"].sum())
    val_cover = matched_val / attributed_val * 100 if attributed_val else 0.0
    cnt_rate = (n_dist_rows - len(unmatched)) / n_dist_rows * 100 if n_dist_rows else 0.0
    print(f"district rows={n_dist_rows} matched-by-count={cnt_rate:.1f}% "
          f"value-coverage={val_cover:.2f}% fuzzy={len(m.fuzzy_log)}")
    print(f"unmatched ({len(unmatched)}): {unmatched}")
    print(f"UNCLASSIFIED share: volume={uncl_pct_vol:.2f}% value={uncl_pct_val:.2f}%")
    assert val_cover >= 90.0, f"district value-coverage {val_cover:.2f}% below 90% gate"

    # ---- state pass: '<STATE> Total' rows / state pop -------------------
    st_vol, st_val = {}, {}
    for _, r in df[is_total].iterrows():
        name = r[scol][:-len("Total")].strip()  # drop trailing 'Total'
        scode = m.state_code(name)
        if not scode:
            unmatched.append(f"STATE {name} (no code)")
            continue
        st_vol[scode] = r["_vol"]
        st_val[scode] = r["_val"]

    # ---- rates ----------------------------------------------------------
    def value_pc(vol_val_map, pop):  # Rs per person
        return {c: round(v * 1e7 / pop[c], 0)
                for c, v in vol_val_map.items() if pop.get(c, 0) > 0}

    def txn_pc(vol_map, pop):        # transactions per person
        return {c: round(v * 1e6 / pop[c], 2)
                for c, v in vol_map.items() if pop.get(c, 0) > 0}

    d_val_pc = value_pc(rid_val, pop_d)
    d_txn_pc = txn_pc(rid_vol, pop_d)
    s_val_pc = value_pc(st_val, pop_s)
    s_txn_pc = txn_pc(st_vol, pop_s)

    meth_val = METHODOLOGY_TMPL.format(
        month="Jun 2026", what="value", what2="value", col="'Value (in Cr.)'",
        uncl_pct=uncl_pct_val)
    meth_txn = METHODOLOGY_TMPL.format(
        month="Jun 2026", what="transactions", what2="volume", col="'Volume (in Mn)'",
        uncl_pct=uncl_pct_vol)

    upsert_metric(
        con, "upi_value_per_capita", "UPI value per person (monthly)", "payments",
        "₹/person/mo", 0, 1,
        "Monthly UPI transaction value per person (Rs), NPCI State-wise UPI Product "
        "Statistics, Jun 2026, over Census-2011 population. A measure of how much money "
        "flows through UPI per resident. ~"
        f"{uncl_pct_val:.0f}% of national value is location-unclassified by NPCI and "
        "excluded.",
        SOURCE, URL, LICENSE, YEAR, methodology=meth_val, default_scale="quantile")
    upsert_metric(
        con, "upi_txn_per_capita", "UPI transactions per person (monthly)", "payments",
        "txn/person/mo", 2, 1,
        "Monthly UPI transactions per person, NPCI State-wise UPI Product Statistics, "
        "Jun 2026, over Census-2011 population. A measure of UPI usage intensity per "
        "resident. ~"
        f"{uncl_pct_vol:.0f}% of national volume is location-unclassified by NPCI and "
        "excluded.",
        SOURCE, URL, LICENSE, YEAR, methodology=meth_txn, default_scale="quantile")

    n = 0
    n += write_values(con, "upi_value_per_capita", "district", YEAR, d_val_pc)
    n += write_values(con, "upi_value_per_capita", "state", YEAR, s_val_pc)
    n += write_values(con, "upi_txn_per_capita", "district", YEAR, d_txn_pc)
    n += write_values(con, "upi_txn_per_capita", "state", YEAR, s_txn_pc)

    notes = (f"2 metrics (payments, district+state, Jun 2026). district rows={n_dist_rows}, "
             f"value-coverage={val_cover:.2f}%, count-match={cnt_rate:.1f}%, "
             f"fuzzy={len(m.fuzzy_log)}, unmatched={len(unmatched)} "
             f"(new/unmatched districts logged, not guessed; still counted in state via "
             f"'<STATE> Total'). value_pc: {len(d_val_pc)} districts + {len(s_val_pc)} states; "
             f"txn_pc: {len(d_txn_pc)} districts + {len(s_txn_pc)} states. "
             f"LOCATION-UNCLASSIFIED excluded: volume={uncl_pct_vol:.2f}%, value={uncl_pct_val:.2f}%. "
             f"unmatched sample: {unmatched[:12]}")
    log_load(con, "ingest_npci_upi.py", SOURCE, YEAR, LICENSE, FETCHED, n, notes)
    con.commit(); con.close()

    print(f"WROTE {n} values. value_pc districts={len(d_val_pc)} states={len(s_val_pc)}; "
          f"txn_pc districts={len(d_txn_pc)} states={len(s_txn_pc)}")
    if d_val_pc:
        top = sorted(d_val_pc.items(), key=lambda x: -x[1])[:5]
        print("top value_pc districts (rid, Rs/person/mo):", top)
    print(f"fuzzy sample: {m.fuzzy_log[:12]}")


if __name__ == "__main__":
    main()
