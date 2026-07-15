"""ISFR 2023 district forest cover -> canonical store (iter-12 item 594).

Source: FSI India State of Forest Report 2023, Volume 2 (state chapters),
direct PDF in raw-new/environment/. Each state chapter carries a
"Table <n> District-wise Forest Cover in <State>" text table:

  District  CalcArea  VDF  MDF  OF  Total  %ofArea  Change_vs_2021  Scrub

Extraction integrity (this PDF renders BOLD headings with every character
doubled — "IInnddiiaa" — so heading matching uses a de-doubling helper, while
NUMBERS are parsed from raw body text only, which is not doubled):
  * checksum 1: VDF + MDF + OF == Total     (tolerance 0.05 km2)
  * checksum 2: Total / CalcArea * 100 == % (tolerance 0.2 pp)
  Rows failing either are rejected and logged — never guessed.

Metrics (district, category environment):
  forest_cover_pct   forest cover as % of geographic area (2023)
  forest_change_km2  change in forest cover vs ISFR 2021 (km2)

Run: pipeline/.venv/bin/python pipeline/ingest_isfr.py
"""
import os
import re
import sqlite3
from collections import defaultdict

import pdfplumber

from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "environment", "isfr2023_vol2.pdf")
SOURCE = "FSI — India State of Forest Report 2023, Volume 2 (district-wise forest cover tables)"
URL = "https://fsi.nic.in/uploads/isfr2023/isfr_book_eng-vol-2_2023.pdf"
LICENSE = "Forest Survey of India, MoEFCC, Govt. of India"
YEAR = 2023
FETCHED = "2026-07-15T18:35:00Z"
METHODOLOGY = (
    "FSI ISFR 2023 Vol-2 per-state 'District-wise Forest Cover' tables: 2023 "
    "assessment of very dense + moderately dense + open forest per district (km2) "
    "and as % of the district's calculated geographic area (SoI), plus change vs "
    "ISFR 2021. Every row is validated against the table's own arithmetic "
    "(VDF+MDF+OF=Total; Total/Area=%); failing rows are dropped, not guessed. "
    "FSI prints current administrative districts; names are crosswalked onto the "
    "stored 733-district geometry (exact -> alias -> fuzzy, logged). Where several "
    "FSI districts map to one stored district, km2 SUM and the percentage is "
    "recomputed from summed totals over summed areas. Scrub is excluded from "
    "forest cover (FSI's own definition).")

# numbers print with or without decimals depending on the state chapter
# (e.g. Assam's calculated area is "2,444" while AP's is "12,446.54")
NUM = r"-?[\d,]+(?:\.\d{1,2})?"
ROW = re.compile(
    rf"^([A-Za-z][A-Za-z().'&\- ]+?)\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s*$")
TITLE = re.compile(r"District-?\s*wise Forest Cover in (.+?)\s*$", re.IGNORECASE)


def dedouble(s: str) -> str:
    out, i = [], 0
    while i < len(s):
        if i + 1 < len(s) and s[i] == s[i + 1]:
            out.append(s[i]); i += 2
        else:
            out.append(s[i]); i += 1
    return "".join(out)


def num(s):
    return float(s.replace(",", ""))


# Collapsed double letters from de-doubled BOLD titles (dedouble("Assam") ->
# "Asam") plus FSI's own typos. Raw titles are tried first, so these only fire
# for genuinely bold-doubled title lines.
STATE_FIX = {
    "chatisgarh": "Chhattisgarh",
    "asam": "Assam",
    "sikim": "Sikkim",
    "utar pradesh": "Uttar Pradesh",
    "utarakhand": "Uttarakhand",
    "jamu & kashmir": "Jammu & Kashmir",
    "lakshadwep": "Lakshadweep",
    "puduchery": "Puducherry",
    # ISFR sometimes titles the merged UT by its first half only
    "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
}

# Documented renames/spellings FSI prints vs stored geometry names. Mumbai City
# + Mumbai Suburban both map to the stored merged "Mumbai" (km2 SUM on collision
# is correct for areas); Saitual (2019 district) attributes to its 2011 parent
# Aizawl per adr-013's attribution convention.
DIST_ALIASES = {
    "korea": "koriya",
    "muktsar": "sri muktsar sahib",
    "kheri": "lakhimpur kheri",
    "hanumakonda": "warangal urban",
    "warangal": "warangal rural",
    "the nilgiris": "nilgiris",
    "baleswar": "balasore",
    "dhaulpur": "dholpur",
    "shriganga nagar": "ganganagar",
    "bengaluru": "bengaluru urban",
    "mumbai city": "mumbai",
    "mumbai suburban": "mumbai",
    "saitual": "aizawl",
    "siaha": "saiha",
    "garhwal": "pauri garhwal",
}


def main():
    pdf = pdfplumber.open(PDF)
    state = None
    in_table = False   # ONLY rows inside a District-wise table count — the same
    #                    8-number row shape also appears in Forest-DIVISION-wise
    #                    tables (Bhimavaram, Tirhut, "DD Giddalur"...), which must
    #                    never be ingested as districts.
    raw_rows = []      # (state, district, calc_area, total_km2, pct, change)
    rejected = []
    for pg in pdf.pages:
        t = pg.extract_text() or ""
        for ln in t.split("\n"):
            ln = ln.strip()
            ded = dedouble(ln)
            # RAW first — dedoubling a raw title corrupts real double letters
            # ("Assam" -> "Asam"); the dedoubled form is only the fallback for
            # genuinely bold-doubled headings.
            mt = TITLE.search(ln) or TITLE.search(ded)
            if mt:
                state = mt.group(1).strip()
                state = STATE_FIX.get(state.lower(), state)
                in_table = True
                continue
            # any OTHER TABLE heading ends the district table (division-wise
            # tables carry their own "Table x.y.z ..." title). Figure captions
            # interleave harmlessly inside the table's text flow and must NOT
            # end capture.
            if in_table and re.match(r"Table\s+\d", ded, re.IGNORECASE) \
                    and not TITLE.search(ded):
                in_table = False
                continue
            if not (state and in_table):
                continue
            m = ROW.match(ln)
            if not m:
                continue
            name = m.group(1).strip()
            if name.lower().startswith(("total", "grand total")):
                continue
            area, vdf, mdf, of, total, pct, change, scrub = (num(m.group(i)) for i in range(2, 10))
            # integrity checksums from the table's own arithmetic
            if abs((vdf + mdf + of) - total) > 0.05:
                rejected.append(f"{state}/{name} sum {vdf + mdf + of:.2f}!={total:.2f}")
                continue
            if area <= 0 or abs(total / area * 100 - pct) > 0.2:
                rejected.append(f"{state}/{name} pct {total / max(area, 1e-9) * 100:.2f}!={pct:.2f}")
                continue
            raw_rows.append((state, name, area, total, pct, change))

    print(f"parsed rows: {len(raw_rows)}; rejected by checksum: {len(rejected)}")
    if rejected:
        print("rejected sample:", rejected[:8])
    assert len(raw_rows) >= 600, f"only {len(raw_rows)} district rows — structure changed?"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])   # rid -> [area, total, change]
    unmatched = []
    for state, name, area, total, pct, change in raw_rows:
        rid = m.match(state, name, extra_aliases=DIST_ALIASES)
        if not rid and name.endswith("H"):
            # footnote marker glued to the name ("Dibang ValleyH", "UnakotiH")
            rid = m.match(state, name[:-1], extra_aliases=DIST_ALIASES)
        if not rid:
            scode = m.state_code(state)
            if scode and len(m.by_state.get(scode, {})) == 1:
                rid = next(iter(m.by_state[scode].values()))
        if not rid:
            unmatched.append(f"{state}/{name}")
            continue
        a = acc[rid]
        a[0] += area; a[1] += total; a[2] += change

    rate = (len(raw_rows) - len(unmatched)) / len(raw_rows) * 100
    print(f"district match: {len(raw_rows) - len(unmatched)}/{len(raw_rows)} ({rate:.1f}%); "
          f"fuzzy={len(m.fuzzy_log)}")
    print("unmatched:", unmatched[:20], "..." if len(unmatched) > 20 else "")
    assert rate >= 90, f"match rate {rate:.1f}% below gate"

    pct_vals = {rid: round(t / a * 100, 2) for rid, (a, t, c) in acc.items() if a > 0}
    chg_vals = {rid: round(c, 2) for rid, (a, t, c) in acc.items()}

    upsert_metric(con, "forest_cover_pct", "Forest cover", "environment", "%", 2, 1,
                  "Forest cover (very dense + moderately dense + open forest) as % of "
                  "district geographic area, ISFR 2023.",
                  SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "forest_cover_pct", "district", YEAR, pct_vals)
    upsert_metric(con, "forest_change_km2", "Forest cover change since 2021", "environment",
                  "km²", 2, 1,
                  "Change in forest cover vs ISFR 2021 (km2); negative = loss.",
                  SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n += write_values(con, "forest_change_km2", "district", YEAR, chg_vals)

    log_load(con, "ingest_isfr.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"2 environment metrics; {len(raw_rows)} rows parsed, {len(rejected)} "
             f"checksum-rejected, match {rate:.1f}% ({len(unmatched)} unmatched, logged "
             f"not guessed); collisions summed then pct recomputed; fuzzy {len(m.fuzzy_log)}")
    con.commit(); con.close()
    print(f"WROTE {n} values across 2 metrics.")


if __name__ == "__main__":
    main()
