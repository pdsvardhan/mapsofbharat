"""RBI banking state-wise vertical -> canonical store (iter-24 item 691).

Source: RBI, Handbook of Statistics on the Indian Economy 2024-25 — Table 152
(number of SCB offices), Table 155 (aggregate deposits, Rs crore) and Table 156
(gross bank credit, Rs crore), all STATE-WISE, "as at end-March". Files land in
raw-new/finance/ as rbi-handbook-2024-25-table15{2,5,6}-*.xlsx. Each workbook has
two sheets; sheet (ii) carries the recent years, latest = 2025 (end-March 2025).

Four STATE-LEVEL metrics, category 'finance', year 2025, over Census-2011 pop:
  bank_deposits_per_capita  Rs/person  = deposits(Rs cr) * 1e7 / pop2011
  bank_credit_per_capita    Rs/person  = credit(Rs cr)   * 1e7 / pop2011
  bank_offices_per_lakh     per 1e5    = offices          / pop2011 * 1e5
  credit_deposit_ratio      %          = credit / deposits * 100  (classic C-D ratio)

The workbook groups states under region headers (NORTHERN REGION, SOUTHERN REGION,
...) and an all-India line; those rows carry no state code from RegionMatcher and
are skipped automatically. J&K and Ladakh are separate rows (Ladakh reported from
2020), matching the store's J&K(01)/Ladakh(38) split.

Denominator: Census-2011 population (pop_total, store standard). 2025 banking stocks
over a 2011 denominator is a documented vintage gap (per-capita values would fall
roughly proportionally everywhere on current population).

Run: pipeline/.venv/bin/python pipeline/ingest_rbi_banking.py
"""
import os, sqlite3
import pandas as pd
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

# RBI prints one "Dadra & Nagar Haveli*" row that (since 2020) includes Daman & Diu —
# the store's single merged UT. Keyed by the norm() form.
STATE_ALIASES = {"dadra and nagar haveli": "dadra and nagar haveli and daman and diu"}

PIPE = os.path.dirname(os.path.abspath(__file__))
FIN = os.path.join(PIPE, "raw-new", "finance")
FILES = {
    "offices":  ("rbi-handbook-2024-25-table152-scb-offices-statewise.xlsx", "T_152(ii)"),
    "deposits": ("rbi-handbook-2024-25-table155-scb-deposits-statewise.xlsx", "T_155(ii)"),
    "credit":   ("rbi-handbook-2024-25-table156-scb-credit-statewise.xlsx", "T_156(ii)"),
}
SOURCE = "RBI, Handbook of Statistics on the Indian Economy 2024-25, Tables 152/155/156 (state-wise SCB offices, deposits, credit; end-March 2025)"
URL = "https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook+of+Statistics+on+Indian+Economy"
LICENSE = "Govt. of India / RBI publication"
YEAR = 2025
FETCHED = "2026-07-17T00:00:00Z"


def read_latest(path, sheet):
    """Return {state_label: value} for the latest (max) year column in the sheet."""
    raw = pd.read_excel(path, sheet_name=sheet, header=None)
    hdr = next(i for i in range(len(raw))
               if str(raw.iat[i, 1]).strip().lower().startswith("region/state"))
    years = {}
    for c in range(2, raw.shape[1]):
        try:
            years[int(float(raw.iat[hdr, c]))] = c
        except (ValueError, TypeError):
            pass
    ycol = years[max(years)]
    out = {}
    for r in range(hdr + 1, len(raw)):
        label = raw.iat[r, 1]
        if pd.isna(label):
            continue
        out[str(label).strip()] = raw.iat[r, ycol]
    return out, max(years)


def num(v):
    try:
        f = float(str(v).replace(",", "").strip())
        return f
    except (ValueError, TypeError):
        return None


def main():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode=DELETE;")
    m = RegionMatcher(con)
    pop_s = dict(con.execute(
        "SELECT region_code, value FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='state' AND year=2011"))

    raw_by_kind, yr = {}, None
    for kind, (fn, sheet) in FILES.items():
        raw_by_kind[kind], yr = read_latest(os.path.join(FIN, fn), sheet)

    dep, cred, off = {}, {}, {}   # state_code -> value
    unmatched = set()
    for kind, target in (("deposits", dep), ("credit", cred), ("offices", off)):
        for label, v in raw_by_kind[kind].items():
            low = str(label).strip()
            if ":" in low or low[:1] in "*-" or low.lower().startswith(("source", "note")):
                continue  # footnote / source line, not a state
            sc = m.state_code(STATE_ALIASES.get(norm(label), label))
            val = num(v)
            if sc is None:
                # region headers / all-India carry no state code — skip
                if val is not None and not low.isupper():
                    unmatched.add(low)
                continue
            if val is not None:
                target[sc] = val

    dep_pc, cred_pc, off_pl, cd_ratio = {}, {}, {}, {}
    for sc, p in pop_s.items():
        if p and p > 0:
            if sc in dep:
                dep_pc[sc] = round(dep[sc] * 1e7 / p, 0)
            if sc in cred:
                cred_pc[sc] = round(cred[sc] * 1e7 / p, 0)
            if sc in off:
                off_pl[sc] = round(off[sc] / p * 1e5, 2)
        if sc in dep and sc in cred and dep[sc] > 0:
            cd_ratio[sc] = round(cred[sc] / dep[sc] * 100, 1)

    print(f"latest year={yr}; states: dep={len(dep_pc)} cred={len(cred_pc)} "
          f"off={len(off_pl)} cd={len(cd_ratio)}; unmatched non-region labels={sorted(unmatched)}")
    assert len(dep_pc) >= 30, f"only {len(dep_pc)} states matched — check names"

    meth = ("RBI Handbook of Statistics on the Indian Economy 2024-25, state-wise "
            "{tbl} (end-March 2025), {calc}. Region sub-totals and the all-India line "
            "are excluded. Denominator is Census-2011 population (the store's standard; "
            "2025 stock over a 2011 denominator is a documented vintage gap). "
            "Administrative banking statistics, not a survey.")

    upsert_metric(con, "bank_deposits_per_capita", "Bank deposits per person", "finance",
                  "₹/person", 0, 1,
                  "Aggregate scheduled-commercial-bank deposits per person (Rs), RBI "
                  "Handbook 2024-25 Table 155 (end-March 2025), over Census-2011 population.",
                  SOURCE, URL, LICENSE, YEAR,
                  methodology=meth.format(tbl="aggregate deposits (Table 155, Rs crore)",
                                          calc="deposits x 1e7 / population"),
                  default_scale="quantile")
    upsert_metric(con, "bank_credit_per_capita", "Bank credit per person", "finance",
                  "₹/person", 0, 1,
                  "Gross scheduled-commercial-bank credit per person (Rs), RBI Handbook "
                  "2024-25 Table 156 (end-March 2025), over Census-2011 population.",
                  SOURCE, URL, LICENSE, YEAR,
                  methodology=meth.format(tbl="gross bank credit (Table 156, Rs crore)",
                                          calc="credit x 1e7 / population"),
                  default_scale="quantile")
    upsert_metric(con, "bank_offices_per_lakh", "Bank branches per lakh people", "finance",
                  "per lakh", 2, 1,
                  "Scheduled-commercial-bank offices per 100,000 people, RBI Handbook "
                  "2024-25 Table 152 (end-March 2025), over Census-2011 population — a "
                  "measure of physical banking access.",
                  SOURCE, URL, LICENSE, YEAR,
                  methodology=meth.format(tbl="number of bank offices (Table 152)",
                                          calc="offices / population x 100,000"),
                  default_scale="quantile")
    upsert_metric(con, "credit_deposit_ratio", "Credit-deposit ratio", "finance",
                  "%", 1, 1,
                  "Credit-Deposit ratio: gross bank credit as a percentage of aggregate "
                  "deposits (RBI Handbook 2024-25 Tables 156/155, end-March 2025). Higher "
                  "means more of local deposits is deployed as local credit.",
                  SOURCE, URL, LICENSE, YEAR,
                  methodology=("credit (Table 156) / deposits (Table 155) x 100, both "
                               "end-March 2025 state-wise. A pure ratio — no population "
                               "denominator. Region sub-totals and all-India excluded."),
                  default_scale=None)

    n = 0
    n += write_values(con, "bank_deposits_per_capita", "state", YEAR, dep_pc)
    n += write_values(con, "bank_credit_per_capita", "state", YEAR, cred_pc)
    n += write_values(con, "bank_offices_per_lakh", "state", YEAR, off_pl)
    n += write_values(con, "credit_deposit_ratio", "state", YEAR, cd_ratio)
    log_load(con, "ingest_rbi_banking.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"4 finance metrics (state-level, {yr}). deposits_pc={len(dep_pc)}, "
             f"credit_pc={len(cred_pc)}, offices_per_lakh={len(off_pl)}, "
             f"cd_ratio={len(cd_ratio)}; unmatched non-region labels={sorted(unmatched)}")
    con.commit(); con.close()
    print(f"WROTE {n} finance values across 4 metrics ({yr}).")
    if dep_pc:
        top = sorted(dep_pc.items(), key=lambda x: -x[1])[:5]
        print("top deposits_pc (code, Rs/person):", top)


if __name__ == "__main__":
    main()
