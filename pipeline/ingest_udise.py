"""UDISE+ 2024-25 booklet: state education indicators -> canonical store.

Item 426 (iter-58): three cleanly-parsing state-level indicators from the
UDISE+ 2024-25 booklet ("existing" structure edition):
  udise_ger_secondary      Table 6.1  GER, Secondary (9-10), Total col
  udise_dropout_secondary  Table 6.13 Dropout Rate, Secondary (9-10), Total col
  udise_ptr_secondary      Table 4.12 Pupil Teacher Ratio, Secondary col

State level only: UDISE+ district report cards sit behind an interactive
authenticated portal (no headless-downloadable district dataset), noted in
each metric's methodology.
Run: pipeline/.venv/bin/python pipeline/ingest_udise.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "education", "UDISE+2024_25_Booklet_existing.pdf")
SOURCE = "Ministry of Education, UDISE+ 2024-25 Booklet (school education statistics)"
URL = "https://udiseplus.gov.in/"
LICENSE = "Govt. of India publication (MoE)"
YEAR = 2024
FETCHED = "2026-07-03T15:38:00Z"

# region labels as printed in the booklet tables (wrapped names re-joined)
NAMES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
    "Bihar", "Chandigarh", "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
    "Uttarakhand", "West Bengal",
]

METH_COMMON = (
    " Parsed programmatically from the booklet PDF (pypdf text + regex over the "
    "table page); the India row is asserted as a parse check. State level only — "
    "UDISE+ district report cards are only downloadable through an interactive "
    "authenticated portal session, so no district rows are published here. "
    "Academic year 2024-25 (recorded as 2024).")

TABLES = [
    ("udise_ger_secondary", "GER — secondary (UDISE+)",
     "Table 6.1: Gross Enrolment Ratio (GER) by Gender and Level of School Education",
     15, 11, 78.7, "%", 1, 1,
     "Gross enrolment ratio at secondary level (classes 9-10), all social groups, "
     "total (boys+girls), UDISE+ 2024-25 Table 6.1.",
     "GER secondary = enrolment in classes 9-10 (any age) / population of the "
     "official 14-15 age group, from UDISE+ 2024-25 Table 6.1 (All Social Groups, "
     "Total column). Values above 100 indicate over/under-age enrolment."),
    ("udise_dropout_secondary", "Dropout rate — secondary (UDISE+)",
     "Table 6.13: Dropout Rate by level of education and gender",
     9, 8, 11.5, "%", 1, 0,
     "Dropout rate at secondary level (classes 9-10), total (boys+girls), "
     "UDISE+ 2024-25 Table 6.13.",
     "Annual average dropout rate at secondary level (classes 9-10), Total column "
     "of UDISE+ 2024-25 Table 6.13 (cohort method on the student-wise database)."),
    ("udise_ptr_secondary", "Pupil-teacher ratio — secondary (UDISE+)",
     "Table 4.12: Pupil Teacher Ratio (PTR) by level of school education",
     4, 2, 15.0, "pupils/teacher", 0, 0,
     "Pupils per teacher at secondary level (classes 9-10), UDISE+ 2024-25 "
     "Table 4.12. RTE norm is 30:1; lower is better.",
     "Pupil-teacher ratio at secondary level, Secondary column of UDISE+ 2024-25 "
     "Table 4.12 (enrolment / teachers teaching at that level)."),
]


def page_text(reader, heading):
    for page in reader.pages:
        t = page.extract_text() or ""
        # "Source: UDISE" filters out the table-of-contents hit on the heading
        if heading in t and "Source: UDISE" in t:
            return re.sub(r"\s+", " ", t)
    raise AssertionError(f"page not found: {heading}")


def parse_table(text, ncols, idx):
    """{label: value} for every region row 'Name v1 .. vN' (N=ncols floats/ints/-)."""
    num = r"(?:-|\d+(?:\.\d+)?)"
    out = {}
    for label in ["India"] + NAMES:
        mm = re.search(rf"(?<![A-Za-z]){re.escape(label)}\s+({num}(?:\s+{num}){{{ncols - 1}}})(?!\S)",
                       text)
        if not mm:
            continue
        cell = mm.group(1).split()[idx]
        if cell != "-":
            out[label] = float(cell)
    return out


def main():
    reader = PdfReader(PDF)
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    total = 0
    counts = {}
    for mid, name, heading, ncols, idx, india_want, unit, dec, hib, desc, meth in TABLES:
        text = page_text(reader, heading)
        rows = parse_table(text, ncols, idx)
        india = rows.pop("India", None)
        print(f"{mid}: parsed {len(rows)} states; India {india} (expect {india_want})")
        assert india is not None and abs(india - india_want) < 0.05, \
            f"{mid}: India parse check failed ({india} vs {india_want})"
        assert len(rows) >= 35, f"{mid}: only {len(rows)} state rows parsed"
        vals, skipped = {}, []
        for label, v in rows.items():
            code = m.state_code(label)
            if not code:
                skipped.append(label)
                continue
            vals[code] = v
        assert not skipped, f"{mid}: unmatched states {skipped}"
        upsert_metric(con, mid, name, "education", unit, dec, hib, desc,
                      SOURCE, URL, LICENSE, YEAR, methodology=meth + METH_COMMON)
        n = write_values(con, mid, "state", YEAR, vals)
        counts[mid] = n
        total += n
    log_load(con, "ingest_udise.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             f"3 metrics, state-level: {counts}; India-row parse gates passed; "
             f"skip_reason (district level): UDISE+ district report cards are "
             f"auth-walled (interactive portal only)")
    con.commit(); con.close()
    print(f"WROTE {total} state values: {counts}")


if __name__ == "__main__":
    main()
