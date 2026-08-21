"""Census 2011 Table A-01 (villages/towns/households/population/area) -> canonical store.

Items 419 + 420 (iter-58): pop_density + urban_pct (district + state) and the
official state areas (area_km2, state level) that feed the Atlas
"Top 10 - Area" cohort.

District level replays the persisted sub-district crosswalk (the same mapping
that produced pop_total, ADR-010/012): A-01 sub-district rows are keyed by
sd_code = state(2)+district(3)+subdistrict(5) and reaggregated onto current
districts; orphan sub-districts fall back to the dominant piece of their 2011
parent district, exactly like ingest_ncrb.female_population.

Density divides that reaggregated population by the district area from
district_areas() — NOT, as it did until #548, by the sum of the sub-district area
column. That column is enumerated village/town area and omits unsurveyed and
uninhabited land, which is a rounding error across most of India and a disaster in
the mountains and the desert: Leh summed to 394 sq km against an official 45,110
and shipped a density of 339 people/sq km for a district that has 3. See
district_areas() for what replaced it.

Areas are ADMINISTERED area throughout — A-01 carries no rows for territory across
the LoC/LAC, while the boundaries this site draws do include it. Leh is 45,110 sq km
here and roughly 155,000 sq km as drawn. The methodology says so rather than
reconciling the two, because they answer different questions and the census offers
no claimed-area figure to choose instead.

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
    "dominant piece of their 2011 parent district. Urban share = reaggregated urban "
    "population / total population. Density = reaggregated population / the district "
    "area described below. ")
METH_AREA = (
    "Area is the official A-01 district figure for every district unchanged since "
    "2011. A district carved out after 2011 has no official area, so its area is the "
    "sum of the areas of the sub-districts the crosswalk places in it, and is marked "
    "re-aggregated. Both are ADMINISTERED area: A-01 carries no rows for territory "
    "across the LoC or LAC, so Leh is 45,110 sq km here while the boundary drawn on "
    "the map - which shows the full claimed extent - encloses roughly 155,000 sq km. "
    "Until 2026 density instead divided by the sum of the sub-district area column, "
    "which counts only enumerated village and town land; that understates any "
    "district with unsurveyed or uninhabited terrain and had put Leh on the map at "
    "339 people per sq km instead of 3. ")
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
    for c in ("pop", "area", "hh"):
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


def district_areas(con, df, sdmap):
    """(area per current district, provenance per current district) — the #548 fix.

    Where a current district IS exactly one 2011 district — it receives every
    sub-district of that district and draws from no other — the official A-01
    DISTRICT area row is used, and the value is that district's own measurement.
    That covers the twelve districts the old sum got wrong, eleven of them in J&K
    and Ladakh plus Kutch, whose Rann is real land that no village area counts.

    Everywhere else the district was carved after 2011 and no official area exists
    for it, so the crosswalk sum is the only figure there is, and it carries the same
    enumerated-land undercount for whatever unsurveyed terrain it contains. Those are
    returned in `derived` so the caller can report how many there are; the caveat is
    stated in METH_AREA, which is what a reader sees.

    They are deliberately NOT flagged estimated=1. Two reasons. fill_new_districts
    deletes every district estimate and refills only the inherited ones, so the flag
    does not survive the next pass. And the only kind that would fit, 'aggregated',
    promises "an exact sum of the underlying rows" — true of households, false of an
    area column that omits unsurveyed land. A label that overstates trust is worse
    than no label in the one place a reader goes to calibrate it.

    Checked against the 495 districts that have an official comparator: the old sum
    was within 2% for 483 of them, so this changes almost nothing outside the twelve.
    """
    sub = df[(df.level == "SUB-DISTRICT") & (df.tru == "Total")].copy()
    sub["sd"] = sub.scode + sub.dcode + sub.sdcode
    sub["d2011"] = sub.scode + sub.dcode
    sub["rid"] = sub.sd.map(sdmap)
    mapped = sub[sub.rid.notna()]

    dist = df[(df.level == "DISTRICT") & (df.tru == "Total")].copy()
    dist["d2011"] = dist.scode + dist.dcode
    official = dict(zip(dist.d2011, dist.area))

    listed = sub.groupby("d2011").size()          # sub-districts A-01 prints
    landed = mapped.groupby("d2011").size()       # ...that the crosswalk placed
    targets = mapped.groupby("d2011")["rid"].agg(lambda s: set(s))

    areas, derived = {}, set()
    for rid, g in mapped.groupby("rid"):
        parents = set(g.d2011)
        d = next(iter(parents)) if len(parents) == 1 else None
        whole = (d is not None
                 and targets[d] == {rid}                    # nothing else took a piece
                 and landed[d] == listed.get(d, -1)         # and nothing was dropped
                 and pd.notna(official.get(d)))
        if whole:
            areas[rid] = float(official[d])
        else:
            a = g.area.sum()
            if pd.notna(a) and a > 0:
                areas[rid] = float(a)
                derived.add(rid)
    return areas, derived


def main():
    con = sqlite3.connect(DB)
    df = load_a01()
    sdmap, _weights, dropped = subdistrict_rid_map(con, df)
    sub = df[df.level == "SUB-DISTRICT"].copy()
    sub["sd"] = sub.scode + sub.dcode + sub.sdcode
    sub["rid"] = sub.sd.map(sdmap)
    m = sub[sub.rid.notna()]

    tot = m[m.tru == "Total"].groupby("rid").agg(
        pop=("pop", "sum"), area=("area", "sum"), hh=("hh", "sum"))
    urb = m[m.tru == "Urban"].groupby("rid")["pop"].sum()
    area_d, derived_d = district_areas(con, df, sdmap)

    # cross-check against stored pop_total (same crosswalk -> should agree ~exactly)
    stored = dict(con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id='pop_total' "
        "AND region_level='district' AND year=2011"))
    diffs = [abs(p - stored[r]) / stored[r]
             for r, p in tot["pop"].items() if stored.get(r)]
    med = sorted(diffs)[len(diffs) // 2]
    print(f"pop_total agreement: {len(diffs)} districts, median diff {med * 100:.3f}%")
    assert med < 0.005, "A-01 reaggregation disagrees with stored pop_total"

    dens_d, urb_d, hh_d = {}, {}, {}
    for rid, row in tot.iterrows():
        a = area_d.get(rid)
        if a:
            dens_d[rid] = round(row["pop"] / a)
        u = float(urb.get(rid, 0) or 0)
        if row["pop"] and row["pop"] > 0:
            urb_d[rid] = round(u / row["pop"] * 100, 1)
        if pd.notna(row["hh"]) and row["hh"] > 0:
            hh_d[rid] = int(row["hh"])

    # ---- state level -------------------------------------------------------
    stt = df[(df.level == "STATE") & (df.tru == "Total")].set_index("scode")
    stu = df[(df.level == "STATE") & (df.tru == "Urban")].set_index("scode")
    area_s, dens_s, urb_s, hh_s = {}, {}, {}, {}
    for scode, row in stt.iterrows():
        if scode in SPLIT_2011:
            continue
        area_s[scode] = round(row["area"])
        dens_s[scode] = round(row["pop"] / row["area"])
        urb_s[scode] = round(float(stu.loc[scode, "pop"]) / row["pop"] * 100, 1)
        hh_s[scode] = int(row["hh"])
    # DNH&DD (26) = sum of the two official 2011 UT rows (25 Daman & Diu + 26 DNH)
    p26 = float(stt.loc["25", "pop"]) + float(stt.loc["26", "pop"])
    a26 = float(stt.loc["25", "area"]) + float(stt.loc["26", "area"])
    u26 = float(stu.loc["25", "pop"]) + float(stu.loc["26", "pop"])
    area_s["26"], dens_s["26"], urb_s["26"] = round(a26), round(p26 / a26), round(u26 / p26 * 100, 1)
    hh_s["26"] = int(stt.loc["25", "hh"]) + int(stt.loc["26", "hh"])
    # crosswalk-derived splits: J&K/Ladakh and Telangana/AP
    for st in DERIVED_STATES:
        rids = [r for r in tot.index if r.startswith(st + "_")]
        p = sum(tot.loc[r, "pop"] for r in rids)
        a = sum(area_d[r] for r in rids if r in area_d)
        u = sum(float(urb.get(r, 0) or 0) for r in rids)
        area_s[st], dens_s[st], urb_s[st] = round(a), round(p / a), round(u / p * 100, 1)
        hh_s[st] = int(sum(tot.loc[r, "hh"] for r in rids))

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
    # #548 pins. Leh is the case that exposed the bug: enumerated village area summed
    # to 394 sq km against an official 45,110, so a district of 3 people/sq km was
    # published as 339. Kargil was 750 against 10. These assert the fixed values, so a
    # regression in district_areas() stops the ingest instead of reaching the map.
    print("spot: Leh density {} (expect 3), Kargil {} (expect 10)".format(
        dens_d["38_3"], dens_d["38_4"]))
    assert dens_d["38_3"] == 3 and dens_d["38_4"] == 10, "#548 regression: Ladakh density"
    print("spot: Leh area {:,.0f} (expect 45,110)".format(area_d["38_3"]))
    assert area_d["38_3"] == 45110, "#548 regression: Leh area"
    print("spot: Ladakh state area {:,} (expect 59,146)".format(area_s["38"]))
    assert area_s["38"] == 59146, "#548 regression: Ladakh state area"

    upsert_metric(
        con, "pop_density", "Population density", "demographics", "people/km²", 0, 1,
        "Persons per square kilometre, Census 2011 (Table A-01). District values are "
        "on current boundaries via the sub-district crosswalk; state values are the "
        "official A-01 figures (derived for post-2011 splits, see methodology).",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_DISTRICT + METH_AREA + METH_STATE)
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
        "Geographic area in square kilometres, Census 2011 (Table A-01). Districts "
        "unchanged since 2011 carry their official area; districts carved out later "
        "carry the sum of the sub-districts placed in them, marked re-aggregated.",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_AREA + METH_STATE)
    n += write_values(con, "area_km2", "district", YEAR, area_d)
    n += write_values(con, "area_km2", "state", YEAR, area_s)

    upsert_metric(
        con, "households", "Households", "demographics", "households", 0, None,
        "Number of households, Census 2011 (Table A-01). A household is the group of "
        "people who normally live together and eat from a common kitchen.",
        SOURCE, URL, LICENSE, YEAR, methodology=METH_DISTRICT + METH_STATE)
    n += write_values(con, "households", "district", YEAR, hh_d)
    n += write_values(con, "households", "state", YEAR, hh_s)

    derived = len(derived_d)
    log_load(con, "ingest_census_a01.py", SOURCE, YEAR, LICENSE, FETCHED, n,
             f"pop_density {len(dens_d)}d+{len(dens_s)}s; urban_pct {len(urb_d)}d+{len(urb_s)}s; "
             f"area_km2 {len(area_d)}d+{len(area_s)}s ({derived} districts re-aggregated); "
             f"households {len(hh_d)}d+{len(hh_s)}s; orphan sub-districts dropped {len(dropped)}")
    con.commit(); con.close()
    print(f"WROTE {n} values: density {len(dens_d)}d/{len(dens_s)}s, "
          f"urban {len(urb_d)}d/{len(urb_s)}s, area {len(area_d)}d/{len(area_s)}s "
          f"({derived} re-aggregated), households {len(hh_d)}d/{len(hh_s)}s; "
          f"dropped sub-districts: {len(dropped)}")


if __name__ == "__main__":
    main()
