"""MoT India Tourism Data Compendium 2025: state tourist visits -> canonical store.

Item 430 (iter-58): tourist_visits_domestic + tourist_visits_foreign (state
level). The 2025 compendium's Table 4.1.2 (State/UT-wise Domestic and Foreign
Tourist Visits, 2023-2024) parses cleanly, so the NEWER year (2024) is used —
the 2024 edition would only offer 2023.

Rows are keyed on the printed serial numbers 1-36 (names wrap across lines in
the PDF text layer); each captured name is asserted to start with the expected
token so a renumbered table cannot silently mis-assign states.
Run: pipeline/.venv/bin/python pipeline/ingest_tourism.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "tourism", "India_Tourism_Data_Compendium_2025_bonus.pdf")
SOURCE = "Ministry of Tourism, India Tourism Data Compendium 2025, Table 4.1.2 (State/UT-wise tourist visits, 2024)"
URL = "https://tourism.gov.in/market-research-and-statistics"
LICENSE = "Govt. of India publication (MoT)"
YEAR = 2024
FETCHED = "2026-07-03T14:35:00Z"

# Table 4.1.2 print order: serial -> (expected first name token, state code)
SERIAL = {
    1: ("Chandigarh", "04"), 2: ("Delhi", "07"), 3: ("Haryana", "06"),
    4: ("Himachal", "02"), 5: ("Jammu", "01"), 6: ("Ladakh", "38"),
    7: ("Punjab", "03"), 8: ("Rajasthan", "08"), 9: ("Uttar", "09"),
    10: ("Uttarakhand", "05"), 11: ("Andaman", "35"), 12: ("Bihar", "10"),
    13: ("Jharkhand", "20"), 14: ("Odisha", "21"), 15: ("West", "19"),
    16: ("Arunachal", "12"), 17: ("Assam", "18"), 18: ("Manipur", "14"),
    19: ("Meghalaya", "17"), 20: ("Mizoram", "15"), 21: ("Nagaland", "13"),
    22: ("Sikkim", "11"), 23: ("Tripura", "16"), 24: ("Chhattisgarh", "22"),
    25: ("Goa", "30"), 26: ("Gujarat", "24"), 27: ("Madhya", "23"),
    28: ("Maharashtra", "27"), 29: ("UT", "26"), 30: ("Andhra", "37"),
    31: ("Karnataka", "29"), 32: ("Kerala", "32"), 33: ("Lakshad", "31"),
    34: ("Puducherry", "34"), 35: ("Tamil", "33"), 36: ("Telangana", "36"),
}

METHODOLOGY = (
    "State/UT-wise domestic and foreign tourist VISITS (not unique tourists; one "
    "person visiting two states counts twice) for calendar 2024, from Table 4.1.2 "
    "of the MoT India Tourism Data Compendium 2025 — the newer 2024 column is "
    "used in preference to the 2024 edition's 2023 data. Underlying source: "
    "State/UT tourism departments; Delhi and Maharashtra 2024 are MoT estimates "
    "(all-India growth rate applied to 2023); 2023 baselines for Ladakh, "
    "Uttarakhand, Mizoram, Arunachal Pradesh and DNH&DD were revised by MoT. "
    "Parsed programmatically from the PDF (pypdf text + regex keyed on the "
    "table's serial numbers, names asserted); the Overall row (2,948.19 M "
    "domestic / 20.94 M foreign) is asserted as a parse check. Stored as visit "
    "counts (millions in the source, converted).")


def parse_table412():
    reader = PdfReader(PDF)
    pages = [p.extract_text() or "" for p in reader.pages]
    idx = [i for i, t in enumerate(pages)
           if "State/UT-wise Domestic and" in t or
              ("Table 4.1.2" in t and re.search(r"\d+\s+Chandigarh", t))]
    assert idx, "Table 4.1.2 pages not found"
    i0 = idx[0]
    text = re.sub(r"\s+", " ", pages[i0] + "\n" + pages[i0 + 1])
    NUM = r"-?\d+(?:\.\d+)?"
    rows = {}
    for mm in re.finditer(
            rf"(?<![\d.])(\d{{1,2}})\s+([A-Za-z][A-Za-z&()#*.\- ]*?)\s+({NUM}(?:\s+{NUM}){{7}})(?!\S)",
            text):
        serial = int(mm.group(1))
        if serial not in SERIAL or serial in rows:
            continue
        name, nums = mm.group(2).strip(), mm.group(3).split()
        want, code = SERIAL[serial]
        if not name.startswith(want):
            continue  # e.g. a stray paragraph number — serial key must agree with name
        d24, f24 = float(nums[2]), float(nums[3])
        rows[serial] = (code, d24, f24)
    overall = re.search(rf"Overall\s+{NUM}\s+{NUM}\s+({NUM})\s+({NUM})", text)
    assert overall, "Overall row not found"
    return rows, float(overall.group(1)), float(overall.group(2))


def main():
    rows, tot_d, tot_f = parse_table412()
    assert len(rows) == 36, f"expected 36 state rows, got {len(rows)}: missing " \
                            f"{sorted(set(SERIAL) - set(rows))}"
    sum_d = sum(d for _, d, _ in rows.values())
    sum_f = sum(f for _, _, f in rows.values())
    print(f"parsed 36 states; domestic sum {sum_d:.2f}M vs Overall {tot_d}M; "
          f"foreign sum {sum_f:.2f}M vs Overall {tot_f}M")
    assert abs(sum_d - tot_d) < 1 and abs(sum_f - tot_f) < 0.1, "sums drift from Overall row"
    dom = {code: round(d * 1e6) for code, d, _ in rows.values()}
    frn = {code: round(f * 1e6) for code, _, f in rows.values()}
    top = max(dom, key=dom.get)
    print(f"spot: top domestic state code {top} ({dom[top]:,}) — expect UP (09) leading")
    assert top == "09" and abs(dom["09"] - 646_807_000) < 5e5

    con = sqlite3.connect(DB)
    upsert_metric(
        con, "tourist_visits_domestic", "Domestic tourist visits", "economy",
        "visits", 0, 1,
        "Domestic tourist visits during 2024 (MoT compendium 2025, Table 4.1.2; "
        "visits, not unique tourists).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "tourist_visits_domestic", "state", YEAR, dom)
    upsert_metric(
        con, "tourist_visits_foreign", "Foreign tourist visits", "economy",
        "visits", 0, 1,
        "Foreign tourist visits during 2024 (MoT compendium 2025, Table 4.1.2; "
        "visits, not unique tourists).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n += write_values(con, "tourist_visits_foreign", "state", YEAR, frn)
    log_load(con, "ingest_tourism.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"2 metrics, state-level, 36 states each; 2025 compendium's 2024 "
             f"column used (newer than 2024 edition); Overall-row sums check "
             f"passed; Delhi/Maharashtra 2024 are MoT estimates (disclosed)")
    con.commit(); con.close()
    print(f"WROTE {n} state values.")


if __name__ == "__main__":
    main()
