"""NFHS-5 dietary habits by state (FR375 Table 10.27) -> canonical store.

Iter-12 item 597 — the veg/non-veg India map. Source: NFHS-5 India report
FR375 (IIPS/MoHFW, published via The DHS Program), Tables 10.27.1 (women) and
10.27.2 (men): percentage of adults age 15-49 consuming specific foods AT LEAST
ONCE A WEEK, by state/UT, 2019-21. The two tables print side by side on one
page; every page in this PDF is duplicated, so the parser reads the first page
containing the table and de-duplicates.

Honest-scope note: FR375 gives the "never consumes" split (a true vegetarian
share) only nationally (Table 10.25); state-wise data is weekly-consumption
frequency. Metrics are therefore named and described as WEEKLY consumption —
"never eats meat" per state is NOT derivable from this table and is not claimed.

Line shape (both tables on one text line):
  <State> w1..w10 <State> m1..m10
columns: milk/curd, pulses, leafy veg, fruits, eggs, fish, chicken-meat,
fish-chicken-or-meat, fried foods, aerated drinks.

Ships 6 state metrics (category: lifestyle):
  diet_nonveg_weekly_men / _women   (fish, chicken or meat at least weekly, col 8)
  diet_eggs_weekly_men / _women     (eggs at least weekly, col 5)
  diet_aerated_weekly_men / _women  (aerated drinks at least weekly, col 10)

Run: pipeline/.venv/bin/python pipeline/ingest_fr375_diet.py
"""
import os
import re
import sqlite3

import pdfplumber

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "diet", "NFHS5_India_Report_FR375.pdf")
SOURCE = "NFHS-5 (2019-21) India Report (FR375), IIPS/MoHFW — Tables 10.27.1/10.27.2"
URL = "https://dhsprogram.com/pubs/pdf/FR375/FR375.pdf"
LICENSE = "Govt. of India publication (via The DHS Program)"
YEAR = 2021
FETCHED = "2026-07-15T18:40:00Z"
METHODOLOGY = (
    "NFHS-5 India report FR375, Tables 10.27.1 (women) / 10.27.2 (men): share of "
    "adults age 15-49 consuming the food at least once a week, by state/UT, 2019-21. "
    "State-wise data is weekly-consumption frequency only — the 'never consumes' "
    "split (a true vegetarian share) is published nationally, not per state, and is "
    "not claimed here. J&K figure includes Ladakh rows as printed separately by "
    "NFHS; both are ingested individually.")

TABLE_MARK = "food consumption by state/union territory"
# a state row: name, 10 numbers, same name, up to 10 numbers
ROW = re.compile(r"^([A-Za-z][A-Za-z&.\- ]+?)((?:\s+\d{1,3}\.\d){10})\s+\1((?:\s+\d{1,3}\.\d){1,10})\s*$")

# (metric_id, label, women-or-men, column index 0-based in the 10-number block)
PICKS = [
    ("diet_nonveg_weekly_women", "Women eating fish/chicken/meat weekly", "w", 7),
    ("diet_nonveg_weekly_men", "Men eating fish/chicken/meat weekly", "m", 7),
    ("diet_eggs_weekly_women", "Women eating eggs weekly", "w", 4),
    ("diet_eggs_weekly_men", "Men eating eggs weekly", "m", 4),
    ("diet_aerated_weekly_women", "Women having aerated drinks weekly", "w", 9),
    ("diet_aerated_weekly_men", "Men having aerated drinks weekly", "m", 9),
]

SKIP_ROWS = {"india", "north", "central", "east", "northeast", "west", "south"}


def main():
    pdf = pdfplumber.open(PDF)
    page = None
    for pg in pdf.pages:
        t = pg.extract_text() or ""
        low = t.lower()
        # the ToC also contains the title string — the real table page also
        # carries the column header "Type of food"
        if TABLE_MARK in low and "type of food" in low:
            page = t
            break
    assert page, "state-wise food consumption table not found"

    rows = {}
    prev_nodigit = None
    for ln in page.split("\n"):
        ln = ln.strip()
        m = ROW.match(ln)
        if not m:
            # long UT names wrap: a digit-free line carries the first fragment
            # duplicated once per side-by-side table ("Dadra & Nagar Haveli and
            # Dadra & Nagar Haveli and"), the values follow on the next line.
            prev_nodigit = ln if ln and not any(c.isdigit() for c in ln) else None
            continue
        name = m.group(1).strip()
        if prev_nodigit:
            words = prev_nodigit.split()
            half = words[: len(words) // 2]
            # prepend ONLY for a genuine name wrap: the fragment is duplicated
            # (once per side-by-side table) AND ends mid-name with "and"
            # ("Dadra & Nagar Haveli and" + "Daman & Diu ..."). Region headers
            # ("Central Central") are also duplicated digit-free lines but never
            # end with "and" — they must NOT be prepended.
            if half and half == words[len(words) // 2:] and half[-1].lower() == "and":
                name = " ".join(half) + " " + name
            prev_nodigit = None
        if name.lower() in SKIP_ROWS:
            continue
        w = [float(x) for x in m.group(2).split()]
        men = [float(x) for x in m.group(3).split()]
        rows[name] = (w, men)
    print(f"parsed {len(rows)} state rows")
    assert len(rows) >= 30, f"only {len(rows)} states parsed — layout changed?"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    total = 0
    unmatched = set()
    for mid, label, sex, ci in PICKS:
        vals = {}
        for name, (w, men) in rows.items():
            arr = w if sex == "w" else men
            if len(arr) <= ci:
                continue  # truncated men block — logged via count below
            v = arr[ci]
            if not (0 <= v <= 100):
                continue
            scode = m.state_code(name)
            if not scode:
                unmatched.add(name)
                continue
            vals[scode] = v
        upsert_metric(con, mid, label, "lifestyle", "%", 1,
                      1 if "nonveg" in mid or "eggs" in mid else 0,
                      f"NFHS-5 FR375 Table 10.27: {label.lower()}, at least once a week.",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "state", YEAR, vals)
        total += n
        print(f"  {mid}: {n} states")
    if unmatched:
        print("unmatched state names:", sorted(unmatched))
    log_load(con, "ingest_fr375_diet.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"6 dietary metrics from Tables 10.27.1/10.27.2; {len(rows)} state rows; "
             f"unmatched {sorted(unmatched)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across {len(PICKS)} metrics.")


if __name__ == "__main__":
    main()
