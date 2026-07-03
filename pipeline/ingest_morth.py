"""MoRTH Road Accidents in India 2023: state death rates -> canonical store.

Item 425 (iter-58): road_accident_death_rate (per lakh, state level) =
2023 persons killed (Table 5.6, State/UT-wise) / Census-2011 state population
x 100,000 — the house convention shared with the NCRB crime metrics; the
2011 denominator vintage is DOCUMENTED in the methodology (MoRTH's own
normalised table covers accidents, not deaths, so deaths are normalised here).

Handled specials:
  - "Daman & Diu" prints NA for 2022/2023 (reported under Dadra & Nagar
    Haveli after the 2020 merger) -> skipped with reason; the "Dadra & Nagar
    Haveli" row is treated as the merged UT (code 26).
  - "J & K #" excludes Ladakh from 2021 on (footnote), matching the store's
    J&K (01) vs Ladakh (38) population split.
Run: pipeline/.venv/bin/python pipeline/ingest_morth.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "safety", "MoRTH_Road_Accidents_India_2023.pdf")
SOURCE = "MoRTH, Road Accidents in India 2023, Table 5.6 (State/UT-wise persons killed)"
URL = "https://morth.nic.in/road-accident-in-india"
LICENSE = "Govt. of India publication (MoRTH)"
YEAR = 2023
FETCHED = "2026-07-03T00:40:00Z"

# Table 5.6 row labels in print order (serial, label). Kept verbatim so the
# regex anchors on the exact published strings (wrapped names re-joined).
ROWS = [
    (1, "Andhra Pradesh"), (2, "Arunachal Pradesh"), (3, "Assam"), (4, "Bihar"),
    (5, "Chhattisgarh"), (6, "Goa"), (7, "Gujarat"), (8, "Haryana"),
    (9, "Himachal Pradesh"), (10, "Jharkhand"), (11, "Karnataka"), (12, "Kerala"),
    (13, "Madhya Pradesh"), (14, "Maharashtra"), (15, "Manipur"), (16, "Meghalaya"),
    (17, "Mizoram"), (18, "Nagaland"), (19, "Odisha"), (20, "Punjab"),
    (21, "Rajasthan"), (22, "Sikkim"), (23, "Tamil Nadu"), (24, "Telangana"),
    (25, "Tripura"), (26, "Uttarakhand"), (27, "Uttar Pradesh"), (28, "West Bengal"),
    (29, "Andaman & Nicobar Islands"), (30, "Chandigarh"),
    (31, "Dadra & Nagar Haveli"), (32, "Daman & Diu"), (33, "Delhi"),
    (34, "J & K #"), (35, "Ladakh"), (36, "Lakshadweep"), (37, "Puducherry"),
]
ALIASES = {
    "j and k": "jammu and kashmir",
    # merged-UT reporting: post-2020 deaths for the combined UT print under DNH
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
}
NATIONAL_2023 = 172890  # Total (all India) row, used as a parse gate

METHODOLOGY = (
    "Persons killed in road accidents during 2023 (MoRTH Road Accidents in India "
    "2023, Table 5.6), per 100,000 computed against the Census-2011 state "
    "population held in this store — the same denominator convention as the NCRB "
    "crime metrics; the 2011-vs-2023 vintage mismatch slightly inflates rates in "
    "fast-growing states and is stated, not hidden (MoRTH's own normalised table "
    "covers accidents per lakh, not deaths, so deaths are normalised here). Parsed "
    "programmatically from the PDF (pypdf text + regex); parsed state counts are "
    "asserted to sum to the printed national total (172,890). 'Daman & Diu' prints "
    "NA for 2023 (reported under the merged UT) and is skipped with reason; the "
    "'Dadra & Nagar Haveli' row is taken as the merged UT. 'J & K' excludes "
    "Ladakh (footnoted), matching the store's split populations.")


def parse_table56():
    reader = PdfReader(PDF)
    text = None
    for page in reader.pages:
        t = page.extract_text() or ""
        # the national-total figure filters out the list-of-tables hit
        if "Table 5.6" in t and "1,72,890" in t:
            text = re.sub(r"\s+", " ", t)
            break
    assert text, "Table 5.6 page not found"
    deaths, na_rows = {}, []
    for serial, label in ROWS:
        pat = (rf"(?<![\d.]){serial}\s+{re.escape(label)}\s+"
               rf"((?:[\d,]+|NA)(?:\s+(?:[\d,]+|NA)){{4}})")
        mm = re.search(pat, text)
        assert mm, f"row not found: {serial} {label}"
        counts = mm.group(1).split()
        y2023 = counts[4]
        if y2023 == "NA":
            na_rows.append(label)
            continue
        deaths[label] = int(y2023.replace(",", ""))
    tot = re.search(r"1,58,984\s+1,38,383\s+1,53,972\s+1,68,491\s+(1,72,890)", text)
    assert tot, "national total row not found"
    assert sum(deaths.values()) == NATIONAL_2023, \
        f"parsed state deaths sum {sum(deaths.values())} != national {NATIONAL_2023}"
    return deaths, na_rows


def main():
    deaths, na_rows = parse_table56()
    print(f"parsed {len(deaths)} states (2023 deaths), NA rows: {na_rows}")

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    pop_st = dict(con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id='pop_total' "
        "AND region_level='state' AND year=2011"))
    vals, skipped = {}, []
    for label, d in deaths.items():
        n = norm(label)
        code = m.state_code(ALIASES.get(n, n))
        if not code or not pop_st.get(code):
            skipped.append(label)
            continue
        vals[code] = round(d / pop_st[code] * 100000, 1)
    assert len(vals) == 36, f"expected 36 states, got {len(vals)}; skipped={skipped}"
    nat_rate = NATIONAL_2023 / sum(pop_st.values()) * 100000
    print(f"national death rate vs 2011 pop: {nat_rate:.1f} per lakh "
          f"(MoRTH's own 2023-population figure is ~12.1)")

    upsert_metric(
        con, "road_accident_death_rate", "Road accident deaths", "safety",
        "per lakh", 1, 0,
        "Persons killed in road accidents, 2023, per 100,000 population "
        "(denominator: Census 2011 state population — rate vintage mismatch is "
        "stated, not hidden).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "road_accident_death_rate", "state", YEAR, vals)
    log_load(con, "ingest_morth.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 metric, state-level, {len(vals)} states; national-sum gate passed "
             f"(172,890); skip_reason: Daman & Diu prints NA for 2023 (reported "
             f"under merged UT row) -> folded into code 26")
    con.commit(); con.close()
    print(f"WROTE {n} state values. skipped: {skipped}")


if __name__ == "__main__":
    main()
