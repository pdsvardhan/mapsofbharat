"""CEA General Review 2025: per-capita electricity consumption -> canonical store.

Item 428 (iter-58): percapita_power_kwh (kWh, 2023-24, state level).

TABLE CHOICE (stated deviation): the item named Table 9.7, but 9.7 is "Per
Capita ULTIMATE Consumption" from UTILITIES ONLY (All-India 967 kWh) — it
cannot match the item's own spot-truth of ~1,395 kWh. The figure the spot-truth
describes is Table 9.9, "Annual Per Capita Consumption of Electricity —
State-wise (Utilities & Non Utilities)" (All-India 1,400 kWh for 2023-24, the
CEA headline number), so Table 9.9 is ingested and the choice is documented.

J&K and Ladakh are printed as one combined row ("UT of J&K and Ladakh"); the
combined per-capita value is applied to both states WITH disclosure in the
methodology (per-capita parent attribution, same spirit as the religion
apportionment).
Run: pipeline/.venv/bin/python pipeline/ingest_cea.py
"""
import os, re, sqlite3
from pypdf import PdfReader
from region_match import RegionMatcher, norm, upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(PIPE, "raw-new", "power",
                   "CEA_General_Review_2025_AllIndia_Electricity_Statistics.pdf")
SOURCE = "CEA, General Review 2025 (All India Electricity Statistics), Table 9.9"
URL = "https://cea.nic.in/general-review-report/?lang=en"
LICENSE = "Govt. of India publication (CEA)"
YEAR = 2024  # FY 2023-24 (FY-ending convention, as with the RBI fiscal metrics)
FETCHED = "2026-07-03T15:02:00Z"

ALIASES = {
    "andaman nicobar": "andaman and nicobar islands",
    "daman and diu and dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
}
COMBINED_JK = "ut of j and k and ladakh"

METHODOLOGY = (
    "Annual per-capita consumption of electricity for FY 2023-24 from CEA General "
    "Review 2025, Table 9.9 (State-wise, UTILITIES & NON-UTILITIES: gross energy "
    "consumed incl. captive self-generation / RGI projected mid-year population). "
    "The iteration brief named Table 9.7, but that table is per-capita ULTIMATE "
    "consumption from utilities only (All-India 967 kWh) and cannot match the "
    "~1,395-1,400 kWh headline figure; Table 9.9 (All-India 1,400 kWh) is the "
    "official total per-capita series and is used instead — deviation stated. "
    "CEA prints J&K and Ladakh as a single combined row; the combined per-capita "
    "value is applied to BOTH states (parent attribution, disclosed). Parsed "
    "programmatically from the PDF (pypdf text + regex); the All-India row "
    "(1,400 kWh) is asserted as a parse check. Year recorded as 2024 (FY ending).")


def parse_table99():
    reader = PdfReader(PDF)
    text = None
    for page in reader.pages:
        t = page.extract_text() or ""
        if "(Utilities & Non Utilities)" in t and "Per Capita" in t and "All India" in t \
                and "Gross Consumption" in t:
            text = t
            break
    assert text, "Table 9.9 (Contd.) page not found"
    rows, allindia = {}, None
    for line in text.splitlines():
        mm = re.match(r"^\s*([A-Za-z][A-Za-z&.\- ]*?)\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s*$",
                      line)
        if not mm:
            continue
        name, percap = mm.group(1).strip(), int(mm.group(5))
        if name.endswith("Region"):
            continue
        if name == "All India":
            allindia = percap
            continue
        rows[name] = percap
    return rows, allindia


def main():
    rows, allindia = parse_table99()
    print(f"parsed {len(rows)} rows; All-India {allindia} kWh (expect 1400)")
    assert allindia == 1400, "All-India per-capita 1,400 kWh not parsed — wrong table?"
    assert len(rows) == 35, f"expected 35 printed rows, got {len(rows)}: {sorted(rows)}"

    con = sqlite3.connect(DB)
    m = RegionMatcher(con)
    vals, skipped = {}, []
    for name, v in rows.items():
        n = norm(name)
        if n == COMBINED_JK:
            vals["01"] = v  # Jammu and Kashmir — combined row, disclosed
            vals["38"] = v  # Ladakh — combined row, disclosed
            continue
        code = m.state_code(ALIASES.get(n, n))
        if not code:
            skipped.append(name)
            continue
        vals[code] = v
    assert len(vals) == 36 and not skipped, \
        f"expected 36 states, got {len(vals)}; skipped={skipped}"
    top = max(vals, key=vals.get)
    print(f"spot: Goa {vals['30']}, Gujarat {vals['24']} (high); "
          f"Bihar {vals['10']}, Manipur {vals['14']} (low); max is code {top}")
    assert vals["30"] > 3000 and vals["24"] > 2000 and vals["10"] < 500

    upsert_metric(
        con, "percapita_power_kwh", "Per-capita electricity use", "infrastructure",
        "kWh/year", 0, 1,
        "Annual per-capita electricity consumption (utilities + non-utilities incl. "
        "captive), FY 2023-24 (CEA General Review 2025, Table 9.9).",
        SOURCE, URL, LICENSE, YEAR, methodology=METHODOLOGY)
    n = write_values(con, "percapita_power_kwh", "state", YEAR, vals)
    log_load(con, "ingest_cea.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"1 metric, state-level, {len(vals)} states; Table 9.9 used instead of "
             f"9.7 (utilities-only) — deviation stated; J&K+Ladakh combined row "
             f"applied to both (disclosed); All-India check 1400 passed")
    con.commit(); con.close()
    print(f"WROTE {n} state values.")


if __name__ == "__main__":
    main()
