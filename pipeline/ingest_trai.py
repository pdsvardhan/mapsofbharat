"""TRAI QPIR (Oct-Dec 2025): state teledensity + internet subs -> canonical store.

Item 427 (iter-58): teledensity + internet_subs_per_100 (state level) from the
TRAI Quarterly Performance Indicators Report for QE Dec-2025 (published
2026-03).

Circle handling (the item's explicit question): TRAI collects by LICENSED
SERVICE AREA, but this report also publishes official State/UT-wise tables —
Table 1.6 (total tele-density) and Table 1.41 (internet subscribers per 100
population) — in which TRAI itself attributes circle data to states: the metro
circles are folded into their host states ("Maharashtra Incl. Mumbai",
"West Bengal incl. Kolkata", "Tamil Nadu incl. Chennai"), "UP (East)+UP (West)"
are combined into Uttar Pradesh, and the North East / combined circles are
broken out per state by TRAI. These official state tables are ingested as-is,
so NO state is skipped and no local circle->state apportionment was invented;
the attribution is disclosed in each metric's methodology.
Run: pipeline/.venv/bin/python pipeline/ingest_trai.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "telecom", "TRAI_QPIR_2026-03.pdf")
SOURCE = "TRAI, The Indian Telecom Services Performance Indicators, Oct-Dec 2025 (QPIR, published Mar 2026)"
URL = "https://www.trai.gov.in/release-publication/reports/performance-indicators-reports"
LICENSE = "TRAI (Govt. of India) publication"
YEAR = 2025
FETCHED = "2026-07-03T12:57:00Z"

ALIASES = {
    "maharashtra incl mumbai": "maharashtra",
    "west bengal incl kolkata": "west bengal",
    "tamil nadu incl chennai": "tamil nadu",
    "chattisgarh": "chhattisgarh",
    "lakshdweep": "lakshadweep",
    "puduchery": "puducherry",
    "dadar and nagar haweli": "dadra and nagar haveli and daman and diu",
    "dadra and nagar haveli and daman and diu": "dadra and nagar haveli and daman and diu",
}

METH_COMMON = (
    " TRAI collects subscriber data by licensed service area; this report's own "
    "State/UT-wise tables are ingested, in which TRAI attributes circles to "
    "states (Mumbai/Kolkata/Chennai metro circles folded into Maharashtra/West "
    "Bengal/Tamil Nadu; UP East + UP West combined into Uttar Pradesh; North-East "
    "and other combined circles broken out per state by TRAI) — no state skipped, "
    "no local apportionment invented. Denominators are TRAI's population "
    "projections. Quarter ending 31 Dec 2025 (report published Mar 2026); year "
    "recorded as 2025. Parsed programmatically from the PDF (pypdf text + regex); "
    "the all-India row is asserted as a parse check.")

NUM = r"(?:-|\d+\.\d{1,3})"  # Table 1.41 prints Lakshadweep's 0.004 with 3 decimals


def block_between(reader, start, stops):
    """Joined text from the page containing `start` up to the first of `stops`
    (which may sit on the following page)."""
    pages = [p.extract_text() or "" for p in reader.pages]
    for i, t in enumerate(pages):
        if start in t:
            txt = t[t.index(start):] + "\n" + (pages[i + 1] if i + 1 < len(pages) else "")
            cut = len(txt)
            for s in stops:
                j = txt.find(s)
                if j != -1:
                    cut = min(cut, j)
            return re.sub(r"\s+", " ", txt[:cut])
    raise AssertionError(f"heading not found: {start}")


def parse_rows(text, ncols, take_idx):
    """serial + name + ncols numeric/dash cells -> {norm_name: value}."""
    out = {}
    for mm in re.finditer(
            rf"(?<![\d.])(\d{{1,2}})\s+([A-Za-z][A-Za-z&.,()+/\- ]*?)\s+({NUM}(?:\s+{NUM}){{{ncols - 1}}})(?!\S)",
            text):
        name = norm(mm.group(2))
        cell = mm.group(3).split()[take_idx]
        if cell != "-":
            out[name] = float(cell)
    return out


def to_codes(m, rows, metric):
    vals, skipped = {}, []
    for name, v in rows.items():
        code = m.state_code(ALIASES.get(name, name))
        if not code:
            skipped.append(name)
            continue
        assert code not in vals, f"{metric}: duplicate state {code} ({name})"
        vals[code] = v
    return vals, skipped


def main():
    reader = PdfReader(PDF)
    con = sqlite3.connect(DB)
    m = RegionMatcher(con)

    # Table 1.6: State/UT wise total tele-density (Total | Rural | Urban)
    t16 = block_between(reader, "Table 1.6: State/UT wise total Tele-density",
                        ["Table 1.7"])
    tele_rows = parse_rows(t16, 3, 0)
    all_tele = [float(x.group(1)) for x in
                re.finditer(rf"(?<![A-Za-z] )Total\s+(\d+\.\d\d)\s+{NUM}\s+{NUM}", t16)]
    tele, tele_skip = to_codes(m, tele_rows, "teledensity")
    print(f"teledensity: {len(tele)} states (skipped: {tele_skip}); "
          f"all-India row candidates {all_tele}")
    assert 91.74 in all_tele, "all-India tele-density 91.74 not found (parse check)"
    assert len(tele) == 36, f"expected 36 states, got {len(tele)}"

    # Table 1.41: State/UT wise internet subscribers per 100 population
    # (Rural | Urban | Total subscribers, then Rural | Urban | Total per-100)
    t141 = block_between(reader, "Table 1.41", ["Table 1.42", "ISP Connectivity"])
    net_rows = parse_rows(t141, 6, 5)
    all_net = [float(x.group(1)) for x in
               re.finditer(rf"Total\s+{NUM}\s+{NUM}\s+{NUM}\s+{NUM}\s+{NUM}\s+(\d+\.\d\d)", t141)]
    net, net_skip = to_codes(m, net_rows, "internet_subs_per_100")
    print(f"internet: {len(net)} states (skipped: {net_skip}); "
          f"all-India row candidates {all_net}")
    assert 72.24 in all_net, "all-India internet-per-100 72.24 not found (parse check)"
    assert len(net) == 36, f"expected 36 states, got {len(net)}"

    upsert_metric(
        con, "teledensity", "Teledensity (TRAI)", "infrastructure",
        "per 100 people", 1, 1,
        "Telephone connections (wireless + wireline) per 100 population, quarter "
        "ending Dec 2025 (TRAI QPIR Table 1.6). Values above 100 reflect multiple "
        "SIMs per person.",
        SOURCE, URL, LICENSE, YEAR,
        methodology="Total tele-density (wireless + wireline, rural + urban) from "
                    "TRAI QPIR Table 1.6." + METH_COMMON)
    n = write_values(con, "teledensity", "state", YEAR, tele)

    upsert_metric(
        con, "internet_subs_per_100", "Internet subscribers (TRAI)", "infrastructure",
        "per 100 people", 1, 1,
        "Internet subscribers (wired + wireless) per 100 population, quarter ending "
        "Dec 2025 (TRAI QPIR Table 1.41).",
        SOURCE, URL, LICENSE, YEAR,
        methodology="Internet subscribers per 100 population (Total column) from "
                    "TRAI QPIR Table 1.41." + METH_COMMON)
    n += write_values(con, "internet_subs_per_100", "state", YEAR, net)

    log_load(con, "ingest_trai.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"2 metrics, state-level, 36 states each; TRAI's own State/UT tables "
             f"used (circle->state attribution by TRAI, disclosed); all-India "
             f"checks 91.74 / 72.24 passed")
    con.commit(); con.close()
    print(f"WROTE {n} state values.")


if __name__ == "__main__":
    main()
