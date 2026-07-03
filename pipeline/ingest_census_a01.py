"""Census 2011 Table A-01 (villages/towns/households/population/area) -> canonical store.

Items 419 + 420 (iter-58): pop_density + urban_pct (district + state) and the
official state areas (area_km2, state level) that feed the Atlas
"Top 10 - Area" cohort.

District level replays the persisted sub-district crosswalk (the same mapping
that produced pop_total, ADR-010/012): A-01 sub-district rows are keyed by
sd_code = state(2)+district(3)+subdistrict(5) and reaggregated onto current
districts; orphan sub-districts fall back to the dominant piece of their 2011
parent district, exactly like ingest_ncrb.female_population. Density divides
reaggregated population by reaggregated geographic area (administered area
only: PoK / Aksai Chin polygons carry no census rows).

State level uses the official A-01 STATE rows verbatim for states unchanged
since 2011 (so Rajasthan's 342,239 sq km and Delhi's 11,320 people/sq km are
the printed figures); the four boundary-change cases are derived and
documented:
  - Telangana (36) / Andhra Pradesh (37): split of 2011 AP (28) via the
    sub-district crosswalk (handles Bhadrachalam's 2014 move to AP).
  - Ladakh (38) / Jammu & Kashmir (01): split of 2011 J&K via the crosswalk.
    Sums are ADMINISTERED area only; the official 2011 J&K state row
    (222,236 sq km) also counts territory under occupation across the LoC/LAC,
    which no sub-district row carries.
  - Dadra & Nagar Haveli and Daman & Diu (26): sum of the two official 2011
    UT state rows (25 + 26).
Run: pipeline/.venv/bin/python pipeline/ingest_census_a01.py
"""
import os, sqlite3
import pandas as pd
from region_match import upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(
    PIPE, "raw-new", "demographics",
    "census2011_A01_villages_towns_households_population_area_district_subdistrict.xlsx")
SOURCE = "Census of India 2011, Table A-01: Number of villages, towns, households, population and area (ORGI)"
URL = "https://censusindia.gov.in/census.website/data/census-tables"
LICENSE = "GODL-India"
YEAR = 2011
FETCHED = "2026-07-03T14:04:00Z"

# 2011 state codes whose unit no longer exists 1:1 today
SPLIT_2011 = {"01", "25", "26", "28"}
# current state codes derived from the crosswalk instead of an official row
DERIVED_STATES = ("01", "38", "36", "37")

METH_DISTRICT = (
    "Census 2011 Table A-01 sub-district rows (Total residence) reaggregated onto "
    "current districts via the persisted sub-district crosswalk — the same mapping "
    "that produced pop_total (ADR-010/012); orphan sub-districts fall back to the "
    "dominant piece of their 2011 parent district. Density = reaggregated population "
    "/ reaggregated geographic area (sq km); urban share = reaggregated urban "
    "population / total population. Areas are the administered areas printed in "
    "A-01 (PoK / Aksai Chin carry no census rows and are absent). ")
METH_STATE = (
    "State rows use the official A-01 STATE figures verbatim for every state "
    "unchanged since 2011. Four boundary changes are derived and disclosed: "
    "Telangana/Andhra Pradesh and Ladakh/Jammu & Kashmir are split from their 2011 "
    "parents via the sub-district crosswalk (J&K/Ladakh areas are administered area "
    "only — the official 2011 J&K row also counts occupied territory, which no "
    "sub-district row carries); 'Dadra and Nagar Haveli and Daman and Diu' is the "
    "sum of the two official 2011 UT rows.")


def load_a01():
    df = pd.read_excel(XLSX, sheet_name=0, header=None, skiprows=4, dtype=str)
    df.columns = ["scode", "dcode", "sdcode", "level", "name", "tru", "vil_inh",
                  "vil_uninh", "towns", "hh", "pop", "m", "f", "area", "density"]
    # a handful of stray/malformed rows carry numbers in level/tru — drop strictly
    df = df[df.level.isin(["INDIA", "STATE", "DISTRICT", "SUB-DISTRICT"])
            & df.tru.isin(["Total", "Rural", "Urban"])].copy()
    for c in ("pop", "area"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def subdistrict_rid_map(con, df=None):
    """(sd_code -> rid) replaying the persisted crosswalk with the dominant-piece
    fallback for orphan sub-districts (same reconciliation as pop_total /
    ingest_ncrb.female_population). Also returns per-(2011-district, rid)
    population weights used by percentage sources (ingest_religion_c01)."""
    if df is None:
        df = load_a01()
    sub = df[(df.level == "SUB-DISTRICT") & (df.tru == "Total")].copy()
    sub["sd"] = sub.scode + sub.dcode + sub.sdcode
    sub["d2011"] = sub.scode + "_" + sub.dcode.astype(int).astype(str)
    xw = dict(con.execute("SELECT sd_code, rid FROM crosswalk"))
    sub["rid"] = sub.sd.map(xw)
    mapped = sub[sub.rid.notna()]
    orphan = sub[sub.rid.isna()].copy()
    if len(orphan):
        dom = mapped.groupby("d2011").apply(
            lambda g: g.groupby("rid")["pop"].sum().idxmax())
        orphan["rid"] = orphan.d2011.map(dom)
        mapped = pd.concat([mapped, orphan[orphan.rid.notna()]])
        orphan = orphan[orphan.rid.isna()]
    sdmap = dict(zip(mapped.sd, mapped.rid))
    weights: dict[str, dict[str, float]] = {}
    for d2011, rid, p in mapped[["d2011", "rid", "pop"]].itertuples(index=False):
        if pd.isna(p):
            continue
        weights.setdefault(d2011, {})[rid] = weights.get(d2011, {}).get(rid, 0) + float(p)
    total = mapped["pop"].sum()
    assert abs(total - 1_210_854_977) / 1_210_854_977 < 0.02, \
        f"reaggregated national population {total:,.0f} drifts >2% (ADR-010 gate)"
    return sdmap, weights, list(orphan.sd)


def main():
    con = sqlite3.connect(DB)
    df = load_a01()
    sdmap, _weights, dropped = subdistrict_rid_map(con, df)
    sub = df[df.level == "SUB-DISTRICT"].copy()
    sub["sd"] = sub.scode + sub.dcode + sub.sdcode
    sub["rid"] = sub.sd.map(sdmap)
    m = sub[sub.rid.notna()]

    tot = m[m.tru == "Total"].groupby("rid").agg(pop=("pop", "sum"), area=("area", "sum"))
    urb = m[m.tru == "Urban"].groupby("rid")["pop"].sum()

    # cross-check against stored pop_total (same crosswalk -> should agree ~exactly)
    stored = dict(con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id='pop_total' "
        "AND region_level='district' AND year=2011"))
    diffs = [abs(p - stored[r]) / stored[r]
             for r, p in tot["pop"].items() if stored.get(r)]
    med = sorted(diffs)[len(diffs) // 2]
    print(f"pop_total agreement: {len(diffs)} districts, median diff {med * 100:.3f}%")
    assert med < 0.005, "A-01 reaggregation disagrees with stored pop_total"

    dens_d, urb_d = {}, {}
    for rid, row in tot.iterrows():
        if row["area"] and row["area"] > 0 and pd.notna(row["area"]):
            dens_d[rid] = round(row["pop"] / row["area"])
        u = float(urb.get(rid, 0) or 0)
        if row["pop"] and row["pop"] > 0:
            urb_d[rid] = round(u / row["pop"] * 100, 1)

    # ---- state level -------------------------------------------------------
    stt = df[(df.level == "STATE") & (df.tru == "Total")].set_index("scode")
    stu = df[(df.level == "STATE") & (df.tru == "Urban")].set_index("scode")
    area_s, dens_s, urb_s = {}, {}, {}
    for scode, row in stt.iterrows():
        if scode in SPLIT_2011:
            continue
        area_s[scode] = round(row["area"])
        dens_s[scode] = round(row["pop"] / row["area"])
        urb_s[scode] = round(float(stu.loc[scode, "pop"]) / row["pop"] * 100, 1)
    # DNH&DD (26) = sum of the two official 2011 UT rows (25 Daman & Diu + 26 DNH)
    p26 = float(stt.loc["25", "pop"]) + float(stt.loc["26", "pop"])
    a26 = float(stt.loc["25", "area"]) + float(stt.loc["26", "area"])
    u26 = float(stu.loc["25", "pop"]) + float(stu.loc["26", "pop"])
    area_s["26"], dens_s["26"], urb_s["26"] = round(a26), round(p26 / a26), round(u26 / p26 * 100, 1)
    # crosswalk-derived splits: J&K/Ladakh and Telangana/AP
    for st in DERIVED_STATES:
        rids = [r for r in tot.index if r.startswith(st + "_")]
        p = sum(tot.loc[r, "pop"] for r in rids)
        a = sum(tot.loc[r, "area"] for r in rids)
        u = sum(float(urb.get(r, 0) or 0) for r in rids)
        area_s[st], dens_s[st], urb_s[st] = round(a), round(p / a), round(u / p * 100, 1)

    # ---- spot truths -------------------------------------------------------
    ind = df[df.level == "INDIA"].set_index("tru")
    india_urb = float(ind.loc["Urban", "pop"]) / float(ind.loc["Total", "pop"]) * 100
    print(f"spot: India urban {india_urb:.2f}% (expect ~31.1)")
    assert abs(india_urb - 31.1) < 0.2
    print(f"spot: Delhi state density {dens_s['07']} (expect ~11320)")
    assert abs(dens_s["07"] - 11320) <= 5
    print(f"spot: Rajasthan area {area_s['08']:,} (expect 342,239) — "
          f"largest: {max(area_s, key=area_s.get) == '08'}")
    assert area_s["08"] == 342239 and max(area_s, key=area_s.get) == "08"

    upsert_metric(
        con, "pop_density", "Population density", "demographics", "people/km²", 0, 1,
        "Persons per square kilometre, Census 2011 (Table A-01). District values are "
        "on current boundaries via the sub-district crosswalk; state values are the "
        "official A-01 figures (derived for post-2011 splits, see methodology).",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_DISTRICT + METH_STATE)
    n = write_values(con, "pop_density", "district", YEAR, dens_d)
    n += write_values(con, "pop_density", "state", YEAR, dens_s)

    upsert_metric(
        con, "urban_pct", "Urban population share", "demographics", "%", 1, 1,
        "Share of population living in urban areas (towns/statutory+census), "
        "Census 2011 (Table A-01).",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_DISTRICT + METH_STATE)
    n += write_values(con, "urban_pct", "district", YEAR, urb_d)
    n += write_values(con, "urban_pct", "state", YEAR, urb_s)

    upsert_metric(
        con, "area_km2", "Geographic area", "demographics", "km²", 0, None,
        "Official geographic area in square kilometres, Census 2011 (Table A-01). "
        "State level only — powers the Atlas 'Top 10 · Area' cohort.",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_STATE + (
            " State level only: current-district areas would repeat the crosswalk "
            "approximation without an official per-district publication to anchor them."))
    n += write_values(con, "area_km2", "state", YEAR, area_s)

    log_load(con, "ingest_census_a01.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"pop_density {len(dens_d)}d+{len(dens_s)}s; urban_pct {len(urb_d)}d+{len(urb_s)}s; "
             f"area_km2 {len(area_s)}s; orphan sub-districts dropped {len(dropped)}")
    con.commit(); con.close()
    print(f"WROTE {n} values: density {len(dens_d)}d/{len(dens_s)}s, "
          f"urban {len(urb_d)}d/{len(urb_s)}s, area {len(area_s)}s; "
          f"dropped sub-districts: {len(dropped)}")


if __name__ == "__main__":
    main()
