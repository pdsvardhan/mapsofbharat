"""ASER 2024 rural district learning outcomes -> canonical store (item 595).

Source: ASER Centre "ASER 2024" per-state District-Estimates PDFs (direct
download, no login), raw-new/education/aser/*.pdf — one page per state:

  District  %govt-enrol  %not-in-school  %read-Std2(III-V)  %subtract(III-V)
            %read-Std2(VI-VIII)  %division(VI-VIII)

RURAL-only survey (ASER's design) — disclosed in every metric's methodology.
"Data is not presented where sample size is insufficient": a row with fewer
than 6 numbers has ambiguous column identity and is SKIPPED and logged, never
guessed. ASER prints current district names; crosswalked via RegionMatcher.

Metrics (district, category education):
  aser_read_std3_5      Std III-V children who can read a Std II text (%)
  aser_subtract_std3_5  Std III-V children who can do subtraction (%)
  aser_division_std6_8  Std VI-VIII children who can do division (%)
  aser_out_of_school    children 6-14 not enrolled in school (%)
  aser_govt_school      children 6-14 enrolled in government schools (%)

Run: pipeline/.venv/bin/python pipeline/ingest_aser.py
"""
import glob
import os
import re
import sqlite3

import pdfplumber

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(PIPE, "raw-new", "education", "aser")
SOURCE = "ASER 2024 (Annual Status of Education Report), ASER Centre / Pratham — district estimates"
URL = "https://asercentre.org/aser-2024/"
LICENSE = "ASER Centre (Pratham), open publication"
YEAR = 2024
FETCHED = "2026-07-15T23:57:00Z"
METHODOLOGY = (
    "ASER 2024 household survey, RURAL districts only (ASER's design — urban "
    "areas are not covered; treat values as rural estimates). District tables "
    "from the per-state 'District-Estimates' PDFs. Rows where ASER suppressed "
    "any cell for insufficient sample size are skipped entirely (column "
    "identity would be ambiguous), never guessed. District names crosswalked "
    "onto the stored geometry (exact -> alias -> fuzzy, logged); where several "
    "ASER districts map to one stored district the values are AVERAGED (rates).")

ROW = re.compile(r"^([A-Za-z][A-Za-z().'&\- ]+?)((?:\s+\d{1,3}\.\d)\s*(?:\s+\d{1,3}\.\d){5})\s*$")

DIST_ALIASES = {
    "korea": "koriya",
    "kheri": "lakhimpur kheri",
    "muktsar": "sri muktsar sahib",
    "the nilgiris": "nilgiris",
    "garhwal": "pauri garhwal",
    "allahabad": "prayagraj",
    "faizabad": "ayodhya",
    "sribhumi": "karimganj",   # Assam, renamed Nov 2024
    "dhaulpur": "dholpur",
    "east": "east sikkim", "north": "north sikkim",       # ASER prints Sikkim's
    "south": "south sikkim", "west": "west sikkim",       # districts bare
    "warangal": "warangal rural",
    # NOT aliased: GPM (2020 split, absent from 2011 geometry) and WB
    # "Barddhaman" (pre-2017 undivided district — a rate cannot be attributed
    # to either half) — both stay logged, never guessed.
}

# state comes from the PDF's first text line; fix ASER filename/label variants
STATE_FIX = {"andhra prades": "Andhra Pradesh"}

METRICS = [
    ("aser_govt_school", "Children in government schools (rural)", 0, None),
    ("aser_out_of_school", "Children out of school (rural)", 1, 0),
    ("aser_read_std3_5", "Std III-V who can read a Std II text (rural)", 2, 1),
    ("aser_subtract_std3_5", "Std III-V who can do subtraction (rural)", 3, 1),
    ("aser_division_std6_8", "Std VI-VIII who can do division (rural)", 5, 1),
]


def main():
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    per_metric = {mid: {} for mid, *_ in METRICS}
    counts = {mid: {} for mid, *_ in METRICS}   # rid -> [sum, n] for averaging
    skipped, unmatched = [], []
    files = sorted(glob.glob(os.path.join(DIR, "*District*Estimates*.pdf")))
    assert len(files) >= 20, f"only {len(files)} ASER PDFs on disk"

    total_rows = 0
    for fp in files:
        pdf = pdfplumber.open(fp)
        # Most files are one page, but NOT all: Uttar Pradesh spans 2 pages
        # (verifier-595 caught 35 silently-dropped districts on page 2).
        # Read EVERY page; the state name comes from page 1's first line, and
        # repeated headers/summary rows on later pages are filtered as usual.
        lines = []
        for pg in pdf.pages:
            lines.extend((pg.extract_text() or "").split("\n"))
        state = lines[0].strip()
        state = STATE_FIX.get(state.lower(), state)
        for ln in lines[1:]:
            ln = ln.strip()
            mrow = ROW.match(ln)
            if not mrow:
                # a district-looking line with SOME numbers but not 6 = suppressed cells
                if re.match(r"^[A-Za-z][A-Za-z().'&\- ]+\s+\d", ln) and not ln.lower().startswith(
                        ("govt", "district", "data", "performance", "government", "rural")):
                    skipped.append(f"{state}/{ln[:40]}")
                continue
            name = mrow.group(1).strip()
            # every PDF ends with a state-total summary row named after the
            # state itself ("Bihar 78.2 ...") — a summary, not a district
            if name.lower().replace("&", "and") == state.lower().replace("&", "and"):
                continue
            nums = [float(x) for x in mrow.group(2).split()]
            if len(nums) != 6 or not all(0 <= v <= 100 for v in nums):
                skipped.append(f"{state}/{name}")
                continue
            total_rows += 1
            rid = m.match(state, name, extra_aliases=DIST_ALIASES)
            if not rid:
                unmatched.append(f"{state}/{name}")
                continue
            for mid, _, ci, _ in METRICS:
                s = counts[mid].setdefault(rid, [0.0, 0])
                s[0] += nums[ci]; s[1] += 1

    for mid, _, _, _ in METRICS:
        per_metric[mid] = {rid: round(s / n, 1) for rid, (s, n) in counts[mid].items() if n}

    rate = (total_rows - len(unmatched)) / max(total_rows, 1) * 100
    print(f"rows: {total_rows}; match {total_rows - len(unmatched)}/{total_rows} ({rate:.1f}%); "
          f"suppressed-skipped {len(skipped)}; fuzzy {len(m.fuzzy_log)}")
    print("unmatched:", unmatched[:15], "..." if len(unmatched) > 15 else "")
    assert rate >= 90, f"match rate {rate:.1f}% below gate"

    total = 0
    for mid, name, ci, hib in METRICS:
        upsert_metric(con, mid, name, "education", "%", 1, hib,
                      f"ASER 2024 rural district estimate: {name.lower()}.",
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
        n = write_values(con, mid, "district", YEAR, per_metric[mid])
        total += n
        print(f"  {mid}: {n} districts")

    log_load(con, "ingest_aser.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"5 education metrics from {len(files)} state PDFs; {total_rows} rows, match "
             f"{rate:.1f}%; {len(skipped)} suppressed rows skipped not guessed; "
             f"rural-only disclosed; fuzzy {len(m.fuzzy_log)}")
    con.commit(); con.close()
    print(f"WROTE {total} values across 5 metrics.")


if __name__ == "__main__":
    main()
