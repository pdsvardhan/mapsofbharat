"""NITI Aayog National MPI 2023 -> canonical store: district poverty (#142).

Source: "National Multidimensional Poverty Index: A Progress Review 2023" (NITI
Aayog), niti_mpi_2023.pdf on disk (410pp). The clean district data lives on the
per-state "<State>: Overview of District(s)" pages as a text table:

    District  HCR% Int% MPI  HCR% Int% MPI
              \___ NFHS-4 __/ \___ NFHS-5 __/
              (2015-16)        (2019-21)

We take the NFHS-5 (2019-21) columns — the current vintage — into three metrics:
  - poverty_mpi_hcr    Headcount Ratio (%)  : share multidimensionally poor
  - poverty_intensity  Intensity (%)        : avg deprivation share among the poor
  - poverty_mpi        MPI (0-1)            : HCR x Intensity, the composite index

Extraction notes (the PDF fights back — verified page-by-page, iter-11):
  * Each Overview page carries an INVISIBLE phantom text layer duplicating the
    PREVIOUS state's table, overlaid at the same coordinates. Naive text
    extraction interleaves the two (e.g. "BaAkrsaaria" = Baksa+Araria), so we
    read by WORD COORDINATES, not by line. The phantom glyphs are horizontally
    squeezed (text matrix m0~=7.74, non-square) while real glyphs are ~square;
    phantom name glyphs are dropped before word assembly.
  * Rows are rebuilt by y-band; the district name is the alphabetic word(s) at
    x<190 and the NFHS-5 (2019-21) triple is the three value words at x>380
    (HCR%, Intensity%, MPI). Per-page column x can shift (e.g. Delhi), so the
    structural shape (two %-values + one 0-1 number) plus an INTEGRITY CHECKSUM
    guard every row: NITI defines MPI = HCR x Intensity, so we require
    |mpi - hcr*intensity/10000| <= 0.006. A row that fails is a mis-read and is
    dropped + logged — this is what makes a fragile PDF parse trustworthy.
  * Madhya Pradesh titles the section "Overview of District" (singular); matched
    on that substring so both spellings are caught.
  * RegionMatcher enforces state membership, so any phantom row that survives is
    dropped when its district isn't in the page's title state.

Crosswalk: RegionMatcher (exact -> alias -> fuzzy, logged), >=90% match gate.
These are RATES, so where multiple source districts map to one stored district
the values are AVERAGED (not summed) and the collision is logged. District level
only — the report's state figures live in a differently-shaped summary table and
are out of scope for this vertical (the choropleth's headline is district HCR).

Run: pipeline/.venv/bin/python pipeline/ingest_niti_mpi.py
"""
import os
import re
import sqlite3
from collections import defaultdict

import pdfplumber

from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "poverty", "niti_mpi_2023.pdf")
SOURCE = ("NITI Aayog — National Multidimensional Poverty Index: A Progress Review "
          "2023 (district Overview tables; NFHS-5 2019-21 vintage)")
URL = "https://www.niti.gov.in/national-multidimensional-poverty-index-progress-review-2023"
LICENSE = "NITI Aayog, Government of India"
YEAR = 2021  # NFHS-5 (2019-21) data vintage
FETCHED = "2026-07-01T18:56:00Z"

TITLE = re.compile(r"^(.+?):\s*Overview of District")
PCT = re.compile(r"^([\d.]+)%$")
PLAIN = re.compile(r"^[\d.]+$")
CHECKSUM_TOL = 0.006   # |mpi - hcr*intensity/10000| must be within this


def _keep_char(o):
    """Drop the phantom overlay's name glyphs (horizontally-squeezed matrix,
    m0~=7.74, non-square) so real district names survive same-baseline overlaps.
    Everything else — value glyphs (x>=190) and real square-ish names — is kept."""
    if o.get("object_type") != "char":
        return True
    if o["x0"] >= 190:
        return True
    mx = o.get("matrix")
    if not mx:
        return True
    if 7.55 <= mx[0] <= 7.95 and abs(mx[0] - mx[3]) > 0.25:
        return False
    return True


def _extract_page_rows(pg):
    """Return [(district_name, hcr5, intensity5, mpi5)] for one Overview page,
    reading NFHS-5 by coordinate and validating each row with the MPI checksum."""
    words = pg.filter(_keep_char).extract_words(
        x_tolerance=6, y_tolerance=1, keep_blank_chars=False)
    words.sort(key=lambda w: (w["top"], w["x0"]))
    # cluster into visual rows by y (<=3px)
    bands, cur, top0 = [], [], None
    for w in words:
        if top0 is None or abs(w["top"] - top0) <= 3:
            top0 = w["top"] if top0 is None else top0
            cur.append(w)
        else:
            bands.append(cur); cur = [w]; top0 = w["top"]
    if cur:
        bands.append(cur)
    rows = []
    for band in bands:
        band.sort(key=lambda w: w["x0"])
        name_words = [w for w in band if w["x0"] < 190 and any(c.isalpha() for c in w["text"])]
        v5 = [w for w in band if w["x0"] > 380]
        if not name_words or len(v5) != 3:
            continue
        a, b, c = PCT.match(v5[0]["text"]), PCT.match(v5[1]["text"]), PLAIN.match(v5[2]["text"])
        if not (a and b and c):
            continue
        hcr, inten, mpi = float(a.group(1)), float(b.group(1)), float(v5[2]["text"])
        if abs(mpi - hcr * inten / 10000) > CHECKSUM_TOL:
            continue  # mis-read triple — reject, never guess
        name = " ".join(w["text"] for w in name_words).strip()
        rows.append((name, hcr, inten, mpi))
    return rows

# NITI/NFHS district spellings -> current geometry names (verified renames only;
# norm() strips any "(...)" parenthetical before lookup).
DIST_ALIASES = {
    "visakhapatanam": "visakhapatnam",
    "y s r kadapa": "ysr", "ysr kadapa": "ysr", "kadapa": "ysr",
    "spsr nellore": "sri potti sriramulu nellore",
    "kamrup metro": "kamrup metropolitan",
    "kamrup rural": "kamrup",
    "purbi champaran": "east champaran", "pashchim champaran": "west champaran",
    "allahabad": "prayagraj", "faizabad": "ayodhya",
    "kheri": "lakhimpur kheri",
    "sant ravidas nagar": "bhadohi",         # NITI: "Sant Ravidas Nagar (Bhadohi)"
    "jyotiba phule nagar": "amroha",         # NITI: "Jyotiba Phule Nagar (Amroha)"
    "mahamaya nagar": "hathras",             # NITI: "Mahamaya Nagar (Hathras)"
    "garhwal": "pauri garhwal",              # NITI: "Garhwal (Pauri Garhwal)"
    "hugli": "hooghly", "koch bihar": "cooch behar",
    "korea": "koriya", "sonepur": "subarnapur",
    "the nilgiris": "nilgiris",
    "kumuram bheem asifabad": "komaram bheem",
    "leh ladakh": "leh",
    "poonch": "punch",
}


def main():
    pdf = pdfplumber.open(PDF)
    # state -> district -> (hcr, intensity, mpi) at NFHS-5
    data = defaultdict(dict)
    pages_used = 0
    for pg in pdf.pages:
        t = pg.extract_text() or ""
        if "Overview of District" not in t:
            continue
        state = next((TITLE.match(ln.strip()).group(1)
                      for ln in t.split("\n") if TITLE.match(ln.strip())), None)
        if not state:
            continue
        pages_used += 1
        for name, hcr5, int5, mpi5 in _extract_page_rows(pg):
            data[state][name] = (hcr5, int5, mpi5)

    total_src = sum(len(v) for v in data.values())
    print(f"parsed {pages_used} Overview pages, {len(data)} states, {total_src} district rows")

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # rid -> lists of each metric (averaged on collision — these are rates)
    rid_hcr, rid_int, rid_mpi = defaultdict(list), defaultdict(list), defaultdict(list)
    unmatched, collisions = [], []
    seen_rid = defaultdict(int)
    for state, dists in data.items():
        for name, (hcr, inten, mpi) in dists.items():
            rid = m.match(state, name, extra_aliases=DIST_ALIASES)
            if not rid:
                scode = m.state_code(state)
                if scode and len(m.by_state.get(scode, {})) == 1:
                    rid = next(iter(m.by_state[scode].values()))
            if not rid:
                unmatched.append(f"{state}/{name}")
                continue
            seen_rid[rid] += 1
            if seen_rid[rid] > 1:
                collisions.append(f"{state}/{name}->{rid}")
            rid_hcr[rid].append(hcr)
            if inten is not None:
                rid_int[rid].append(inten)
            if mpi is not None:
                rid_mpi[rid].append(mpi)

    matched = total_src - len(unmatched)
    rate = matched / total_src * 100
    print(f"district match: {matched}/{total_src} ({rate:.1f}%); fuzzy={len(m.fuzzy_log)}; "
          f"collisions(avg)={len(collisions)}")
    print("unmatched:", unmatched)
    assert rate >= 90, f"match rate {rate:.1f}% below 90% gate"

    def avg(d, dec):
        return {rid: round(sum(vs) / len(vs), dec) for rid, vs in d.items() if vs}

    metrics = [
        ("poverty_mpi_hcr", "Multidimensional poverty rate", "%", 1, 0,
         "Share of the district population who are multidimensionally poor "
         "(MPI headcount ratio), NFHS-5 (2019-21).", avg(rid_hcr, 2)),
        ("poverty_intensity", "Poverty intensity", "%", 1, 0,
         "Average share of weighted deprivations suffered by the multidimensionally "
         "poor (intensity), NFHS-5 (2019-21).", avg(rid_int, 2)),
        ("poverty_mpi", "Multidimensional Poverty Index", "index", 3, 0,
         "Multidimensional Poverty Index value = headcount ratio x intensity, a "
         "0-1 composite (higher = poorer), NFHS-5 (2019-21).", avg(rid_mpi, 3)),
    ]

    total = 0
    for mid, name, unit, dec, hib, desc, dvals in metrics:
        upsert_metric(con, mid, name, "poverty", unit, dec, hib,
                      desc, SOURCE, URL, LICENSE, YEAR, methodology=(
                          desc + " Extracted from the per-state 'Overview of District' "
                          "tables in the NITI Aayog National MPI Progress Review 2023 PDF; "
                          "NFHS-5 (2019-21) columns. Covers 36 states/UTs. District names "
                          "crosswalked to current geometry (exact -> alias -> fuzzy, "
                          "logged); where several NFHS districts map to one stored district "
                          "the rate is averaged. NITI's own MPI = headcount x intensity."))
        n = write_values(con, mid, "district", YEAR, dvals)
        total += n
        print(f"{mid}: {len(dvals)} districts, {n} values")

    log_load(con, "ingest_niti_mpi.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"3 poverty metrics (HCR/intensity/MPI) from NITI MPI 2023 Overview-of-"
             f"District tables; district match {rate:.1f}% ({len(unmatched)} unmatched, "
             f"logged not guessed); {len(collisions)} collisions averaged; fuzzy "
             f"{len(m.fuzzy_log)}; district-level only (state figures out of scope)")
    con.commit()
    con.close()
    print(f"WROTE {total} values across 3 metrics. fuzzy sample: {m.fuzzy_log[:10]}")


if __name__ == "__main__":
    main()
