"""NCRB ADSI suicide rates (state-wise) -> canonical store.

Item 424 (iter-58): suicide_rate (per lakh, state level) from NCRB's
Accidental Deaths & Suicides in India, Table 2.2 (Incidence and Rate of
Suicides, State/UT-wise).

DEVIATION (stated): the acquired file is named NCRB_ADSI_2022_Publication.pdf
but is actually the ADSI *2023* edition (page headers "Accidental Deaths &
Suicides in India 2023"; Table 2.2 reports 2023). The 2022 rates the item's
spot-truths cite (national 12.4, Sikkim 43.1) exist in this edition only as
the LIST-2.3 top-5 trend excerpt — no full 2022 state table — so the full
official 2023 table is ingested (year=2023, national 12.3, Sikkim 40.2) and
the 2022 spot-truth values are asserted to appear in LIST-2.3 as a
reconciliation check.
Run: pipeline/.venv/bin/python pipeline/ingest_adsi.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "safety", "NCRB_ADSI_2022_Publication.pdf")
SOURCE = "NCRB, Accidental Deaths & Suicides in India (ADSI) 2023, Table 2.2"
URL = "https://www.ncrb.gov.in/accidental-deaths-suicides-in-india-adsi.html"
LICENSE = "Govt. of India publication (NCRB)"
YEAR = 2023
FETCHED = "2026-07-03T00:40:00Z"

ALIASES = {
    "a and n islands": "andaman and nicobar islands",
    "d and n haveli and daman and diu": "dadra and nagar haveli and daman and diu",
}

METHODOLOGY = (
    "NCRB ADSI 2023, Table 2.2 (State/UT-wise Incidence and Rate of Suicides): "
    "NCRB's own published rate — suicides per one lakh of the RGI projected "
    "mid-year 2023 population (NOT the Census-2011 denominator used by this "
    "atlas's crime metrics; the vintage difference is stated, not hidden). Parsed "
    "programmatically from the PDF (pypdf text + regex); the All-India row "
    "(171,418 suicides, rate 12.3) and Sikkim (40.2) are asserted as parse checks. "
    "Note: the raw file was catalogued as the 2022 publication but is the 2023 "
    "edition; the 2022 rates (national 12.4, Sikkim 43.1) appear only in its "
    "LIST-2.3 top-5 excerpt, so the full 2023 state table is ingested. As per "
    "data provided by States/UTs.")


def parse_table22():
    reader = PdfReader(PDF)
    fulltext_has_2022 = False
    block = None
    for page in reader.pages:
        t = page.extract_text() or ""
        if "States/UTs with Higher Suicide Rate during 2021 to 2023" in t:
            # LIST-2.3 carries the 2022 reference values from the item spot-truth
            fulltext_has_2022 = ("43.1" in t) and ("12.4" in t)
        if re.search(r"Incidence and Rate of Suicides\s*[–-]\s*2023", t) and "STATES" in t \
                and "UNION TERRITORIES" in t:
            block = t
    assert block, "Table 2.2 (State/UT-wise) page not found"
    text = re.sub(r"\s+", " ", block)
    body = text[text.index("STATES"):text.index("TOTAL (ALL INDIA)") + 60]
    rows = {}
    for mm in re.finditer(
            r"(?<![\d.])(\d{1,2})\s+([A-Z][A-Z&() ]*?)\s+(\d+)\s+(\d+\.\d)\s+([\d]+\.\d)\s+(\d+\.\d)",
            body):
        serial, name = int(mm.group(1)), mm.group(2).strip()
        rows[serial] = (name, int(mm.group(3)), float(mm.group(6)))
    tot = re.search(r"TOTAL \(ALL INDIA\)\s+(\d+)\s+[\d.]+\s+[\d.]+\s+(\d+\.\d)", body)
    assert tot, "All-India total row not parsed"
    return rows, int(tot.group(1)), float(tot.group(2)), fulltext_has_2022


def main():
    rows, nat_suicides, nat_rate, has_2022_ref = parse_table22()
    print(f"parsed {len(rows)} State/UT rows; All-India {nat_suicides} suicides, rate {nat_rate}")
    assert len(rows) == 36, f"expected 36 State/UT rows, got {len(rows)}"
    assert nat_suicides == 171418 and nat_rate == 12.3
    assert sum(v[1] for v in rows.values()) == nat_suicides, "state counts != national total"
    assert has_2022_ref, "LIST-2.3 2022 reference values (12.4 / 43.1) not found"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    vals, skipped = {}, []
    for serial, (name, _cnt, rate) in sorted(rows.items()):
        n = norm(name)  # "DELHI (UT)" -> "delhi", "A & N ISLANDS" -> "a and n islands"
        code = m.state_code(ALIASES.get(n, n))
        if not code:
            skipped.append(name)
            continue
        vals[code] = rate
    assert len(vals) == 36, f"unmatched State/UTs: {skipped}"
    print(f"spot: Sikkim rate {vals['11']} (expect 40.2; 2022 value in LIST-2.3 was 43.1)")
    assert vals["11"] == 40.2

    upsert_metric(
        con, "suicide_rate", "Suicide rate (ADSI)", "safety", "per lakh", 1, 0,
        "Suicides per one lakh population, 2023 (NCRB ADSI Table 2.2; RGI projected "
        "mid-year population denominator).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "suicide_rate", "state", YEAR, vals)
    log_load(con, "ingest_adsi.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 metric, state-level, {len(vals)} states; file catalogued ADSI-2022 "
             f"is the 2023 edition (deviation stated in methodology); "
             f"national checks 171418/12.3 passed")
    con.commit(); con.close()
    print(f"WROTE {n} state values.")


if __name__ == "__main__":
    main()
