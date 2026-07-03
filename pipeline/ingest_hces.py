"""MoSPI HCES 2023-24 factsheet: state MPCE (rural/urban) -> canonical store.

Item 423 (iter-58): mpce_rural + mpce_urban (Rs/month, state level) parsed
programmatically (pypdf text + regex) from Statement 7 of the HCES 2023-24
factsheet — the WITHOUT-imputation variant (All-India rural Rs 4,122 / urban
Rs 6,996). The factsheet's parallel Statement 15 ("with imputed values of
items received free through social welfare programmes", All-India 4,247 /
7,078) is NOT ingested; the choice is stated in each metric's methodology.

YEAR follows the PLFS house precedent for MoSPI survey rounds spanning two
calendar years: 2023 (survey period Aug 2023 - Jul 2024).
Run: pipeline/.venv/bin/python pipeline/ingest_hces.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "consumption", "HCES_FactSheet_2023-24.pdf")
SOURCE = "MoSPI, Household Consumption Expenditure Survey (HCES) 2023-24 — Fact Sheet, Statement 7"
URL = "https://mospi.gov.in/publication"
LICENSE = "Govt. of India publication (MoSPI)"
YEAR = 2023
FETCHED = "2026-07-03T00:40:00Z"

ALIASES = {"andaman and n islands": "andaman and nicobar islands"}

METHODOLOGY = (
    "Average monthly per-capita consumption expenditure (MPCE) by State/UT from "
    "Statement 7 of the MoSPI HCES 2023-24 Fact Sheet — the WITHOUT-imputation "
    "variant (does not impute values of items received free through social welfare "
    "programmes; the factsheet's Statement 15 'with imputation' variant is not "
    "ingested). Parsed programmatically from the PDF (pypdf text + regex); the "
    "All-India row (rural Rs 4,122 / urban Rs 6,996) is asserted as a parse check. "
    "Survey period Aug 2023 - Jul 2024 (year recorded as 2023, PLFS precedent). "
    "State-level survey estimate; no district series exists.")


def parse_statement7():
    reader = PdfReader(PDF)
    block = None
    for page in reader.pages:
        t = page.extract_text() or ""
        if "Statement 7: Average MPCE for each State/UT" in t:
            block = t[t.index("Statement 7:"):]
            break
    assert block, "Statement 7 heading not found"
    rows = {}
    for line in block.splitlines():
        mm = re.match(r"^\s*([A-Za-z][A-Za-z&.\- ]+?)\s+([\d,]{3,})\s+([\d,]{3,})\s*$",
                      line.strip())
        if not mm:
            continue
        name = mm.group(1).strip()
        if name.lower().startswith(("state/ut", "rural", "statement")):
            continue
        rows[name] = (int(mm.group(2).replace(",", "")), int(mm.group(3).replace(",", "")))
    return rows


def main():
    rows = parse_statement7()
    allindia = rows.pop("All-India", None) or rows.pop("All India", None)
    print(f"parsed {len(rows)} states + All-India {allindia}")
    assert allindia == (4122, 6996), \
        f"All-India row {allindia} != (4122, 6996) — wrong statement/variant?"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    rural, urban, skipped = {}, {}, []
    for name, (r_val, u_val) in rows.items():
        n = norm(name)  # "Andaman & N Islands" -> "andaman and n islands"
        code = m.state_code(ALIASES.get(n, n))
        if not code:
            skipped.append(name)
            continue
        rural[code] = r_val
        urban[code] = u_val
    assert len(rural) >= 35, f"only {len(rural)} states matched; skipped={skipped}"

    for mid, name, vals, desc in (
        ("mpce_rural", "MPCE — rural (HCES)", rural,
         "Average monthly per-capita consumption expenditure, RURAL households, "
         "HCES 2023-24 (without imputation)."),
        ("mpce_urban", "MPCE — urban (HCES)", urban,
         "Average monthly per-capita consumption expenditure, URBAN households, "
         "HCES 2023-24 (without imputation)."),
    ):
        upsert_metric(con, mid, name, "economy", "₹/month", 0, 1, desc,
                      SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "mpce_rural", "state", YEAR, rural)
    n += write_values(con, "mpce_urban", "state", YEAR, urban)
    log_load(con, "ingest_hces.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"2 metrics, state-level, Statement 7 (WITHOUT imputation); "
             f"{len(rural)} states; skipped={skipped}; All-India check {allindia}")
    con.commit(); con.close()
    print(f"WROTE {n} state values ({len(rural)} rural + {len(urban)} urban). "
          f"skipped: {skipped}")


if __name__ == "__main__":
    main()
