# As-reported-2011 vintage (iter-98 item 671, adr-003's held must-have).
#
# adr-003 stores data at the finest unit and renders onto CURRENT-day boundaries
# via the crosswalk; the as-reported toggle is the other half of that promise:
# the same Census 2011 numbers, on the 2011 districts the census actually
# reported, with no crosswalk in the path at all.
#
# Data: the official ORGI sub-district PCA workbook carries DISTRICT- and
# STATE-level rows of its own, so the as-reported values are read straight off
# the census file — not aggregated, not crosswalked, not estimated. Same
# metrics() math as reaggregate.py (rates recomputed from raw counts, adr-010).
#
# Geometry: 2011 district polygons are dissolved from our own committed
# SoI-compliant current-day districts.geojson, grouping each current district
# under its population-dominant 2011 parent (from the persisted crosswalk).
# Deliberately NOT taken from SHRUG's gpkg: SHRUG is CC BY-NC-SA and the owner
# declined extending its use (to-do 204, 2026-07-18); the gpkg stays confined
# to the representative-point matching reaggregate.py already does. Dissolving
# splits back together is exact wherever 2011 districts split cleanly into
# current ones (the overwhelming case) and approximate only where sub-district
# transfers crossed old district lines — disclosed in the methodology note.
#
# Writes (only when validation passes):
#   metric_values  region_level IN ('district2011','state2011'), year=2011
#   region_keys    level IN ('district2011','state2011')
#   public/geo/districts-2011.geojson  (props: rid, district, st_code, st_nm)
#   public/geo/states-2011.geojson     (props: st_code, st_nm)

import datetime
import json
import os
import sqlite3

import pandas as pd
import shapely.geometry as sg
from shapely.ops import unary_union

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(PIPE)
RAW = os.path.join(PIPE, "raw")
SUBPCA = os.path.join(RAW, "2011-IndiaStateDistSbDist.xlsx")
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")
OUT_D = os.path.join(ROOT, "public", "geo", "districts-2011.geojson")
OUT_S = os.path.join(ROOT, "public", "geo", "states-2011.geojson")
DB = os.path.join(ROOT, "data", "mapsofbharat.db")

CENSUS_TOTAL = 1_210_854_977

# Same columns and metric math as reaggregate.py — one source of truth would be
# an import, but reaggregate is a script with heavy top-level work; keep the
# mapping verbatim and let test_pipeline pin both.
NUMCOLS = ["TOT_P", "TOT_M", "TOT_F", "P_06", "M_06", "F_06", "P_SC", "P_ST",
           "P_LIT", "F_LIT", "TOT_WORK_P", "MAIN_CL_P", "MAIN_AL_P", "MAIN_HH_P", "MAIN_OT_P"]


def metrics(r):
    g = lambda k: (None if pd.isna(r[k]) else float(r[k]))
    rate = lambda n, d: (None if (n is None or d is None or d == 0) else round(n / d * 100, 1))
    ratio = lambda n, d: (None if (n is None or d is None or d == 0) else round(n / d * 1000, 0))
    TP, P06, TF, F06, TM, M06, tw = g("TOT_P"), g("P_06"), g("TOT_F"), g("F_06"), g("TOT_M"), g("M_06"), g("TOT_WORK_P")
    return {"pop_total": TP,
            "literacy_rate": rate(g("P_LIT"), (TP - P06) if (TP and P06 is not None) else None),
            "female_literacy_rate": rate(g("F_LIT"), (TF - F06) if (TF and F06 is not None) else None),
            "sex_ratio": ratio(TF, TM), "child_sex_ratio": ratio(F06, M06),
            "sc_pct": rate(g("P_SC"), TP), "st_pct": rate(g("P_ST"), TP),
            "work_participation": rate(tw, TP), "cultivators_pct": rate(g("MAIN_CL_P"), tw),
            "agri_labourers_pct": rate(g("MAIN_AL_P"), tw), "household_industry_pct": rate(g("MAIN_HH_P"), tw),
            "other_workers_pct": rate(g("MAIN_OT_P"), tw)}


# ── as-reported values straight off the official workbook ────────────────────
df = pd.read_excel(SUBPCA, sheet_name="Data", dtype=str)
df = df[df["TRU"] == "Total"].copy()
for c in NUMCOLS:
    df[c] = pd.to_numeric(df[c], errors="coerce")

drows = df[df["Level"] == "DISTRICT"].copy()
srows = df[df["Level"] == "STATE"].copy()
drows["scode"] = drows["State"].str.zfill(2)
drows["dcode"] = drows["scode"] + "_" + drows["District"].astype(int).astype(str)
srows["scode"] = srows["State"].str.zfill(2)

dist_raw = {r["dcode"]: r[NUMCOLS].copy() for _, r in drows.iterrows()}
state_vals = {r["scode"]: metrics(r) for _, r in srows.iterrows()}
dist_names = dict(zip(drows["dcode"], drows["Name"].str.strip()))
state_names = dict(zip(srows["scode"], srows["Name"].str.strip().str.title()))
dist_state = dict(zip(drows["dcode"], drows["scode"]))

print(f"as-reported: {len(dist_raw)} districts, {len(state_vals)} states/UTs")

# ── geometry: dissolve current districts under their dominant 2011 parent ────
con = sqlite3.connect(DB)
xw = pd.read_sql_query("SELECT sd_code, rid FROM crosswalk", con)
xw["dcode"] = xw["sd_code"].str[:2] + "_" + xw["sd_code"].str[2:5].astype(int).astype(str)

sub = df[df["Level"] == "SUB-DISTRICT"].copy()
sub["sd_code"] = sub["State"].str.zfill(2) + sub["District"].str.zfill(3) + sub["Subdistt"].str.zfill(5)
xw = xw.merge(sub[["sd_code", "TOT_P"]], on="sd_code", how="left")
xw["TOT_P"] = xw["TOT_P"].fillna(0)

# rid -> 2011 parent that contributed the most population
dom = xw.groupby(["rid", "dcode"])["TOT_P"].sum().reset_index()
dom = dom.sort_values("TOT_P", ascending=False).drop_duplicates(subset="rid")
rid2dcode = dict(zip(dom["rid"], dom["dcode"]))

fc = json.load(open(GEO))
groups: dict[str, list] = {}
passthrough = []  # rids with no crosswalk rows at all: the PoK districts
                  # (Mirpur, Muzaffarabad) — never enumerated by Census 2011,
                  # but an SoI-compliant map must still draw them (must-have).
for f in fc["features"]:
    rid = f["properties"].get("rid")
    dc = rid2dcode.get(rid)
    if dc is None:
        passthrough.append(f)
        continue
    groups.setdefault(dc, []).append(sg.shape(f["geometry"]))
print(f"dissolve: {len(fc['features'])} current districts -> {len(groups)} 2011 groups; "
      f"passthrough (no census rows): {[f['properties'].get('rid') for f in passthrough]}")

# ── un-renderable 2011 districts fold into their host polygon, counts intact ─
# Where the CURRENT map itself cannot separate the old districts, the vintage
# map cannot either: Delhi is one polygon today (nine 2011 districts), Mumbai
# City sits inside the single Mumbai polygon (with Suburban), and Mahe has no
# polygon of its own. Merge at RAW-COUNT level and recompute rates, so every
# merged figure is still exactly what the census reported for the combined
# area. Disclosed in the feature name and the toggle's note.
merged_into: dict[str, str] = {}
no_geom = sorted(set(dist_raw) - set(groups))
sd_home = xw.groupby(["dcode", "rid"])["TOT_P"].sum().reset_index() \
            .sort_values("TOT_P", ascending=False).drop_duplicates(subset="dcode")
dcode_home = dict(zip(sd_home["dcode"], sd_home["rid"]))
for dc in no_geom:
    host_rid = dcode_home.get(dc)
    host = rid2dcode.get(host_rid)
    if host is None or host not in dist_raw:
        continue
    dist_raw[host] = dist_raw[host].add(dist_raw[dc], fill_value=0)
    del dist_raw[dc]
    merged_into[dc] = host
still_missing = sorted(set(dist_raw) - set(groups))
print(f"merged into host polygon: { {dc: merged_into[dc] for dc in merged_into} }")
print(f"still without geometry after merge ({len(still_missing)}): {[dist_names.get(d, d) for d in still_missing]}")

# names: a host that absorbed 3+ old districts is really its whole state (Delhi);
# smaller absorptions name the union explicitly.
absorbed: dict[str, list] = {}
for src, host in merged_into.items():
    absorbed.setdefault(host, []).append(dist_names.get(src, src))
vintage_name = {}
for dc in dist_raw:
    base = dist_names.get(dc, dc)
    if dc in absorbed:
        vintage_name[dc] = (f"{state_names.get(dc.split('_')[0], base)} (NCT)"
                            if len(absorbed[dc]) >= 3
                            else f"{base} + {' + '.join(absorbed[dc])}")
    else:
        vintage_name[dc] = base

dist_vals = {dc: metrics(raw) for dc, raw in dist_raw.items()}
pop_d = sum(v["pop_total"] for v in dist_vals.values() if v["pop_total"])
pop_s = sum(v["pop_total"] for v in state_vals.values() if v["pop_total"])
print(f"pop sums: districts={pop_d:,.0f} states={pop_s:,.0f} census={CENSUS_TOTAL:,}")

dfeats = []
sgroups: dict[str, list] = {}
for dc, geoms in sorted(groups.items()):
    u = unary_union(geoms)
    if not u.is_valid:
        u = u.buffer(0)
    sgroups.setdefault(dc.split("_")[0], []).append(u)
    dfeats.append({"type": "Feature",
                   "properties": {"rid": dc, "district": vintage_name.get(dc, dist_names.get(dc, dc)),
                                  "st_code": dc.split("_")[0],
                                  "st_nm": state_names.get(dc.split("_")[0], "")},
                   "geometry": sg.mapping(u)})
for f in passthrough:
    p = f["properties"]
    geom = sg.shape(f["geometry"])
    sgroups.setdefault(str(p.get("st_code", "")).split(".")[0].zfill(2), []).append(geom)
    dfeats.append({"type": "Feature",
                   "properties": {"rid": str(p.get("rid")), "district": str(p.get("district", "")),
                                  "st_code": str(p.get("st_code", "")).split(".")[0].zfill(2),
                                  "st_nm": state_names.get(str(p.get("st_code", "")).split(".")[0].zfill(2), "")},
                   "geometry": f["geometry"]})
sfeats = []
for sc, geoms in sorted(sgroups.items()):
    u = unary_union(geoms)
    if not u.is_valid:
        u = u.buffer(0)
    sfeats.append({"type": "Feature",
                   "properties": {"st_code": sc, "st_nm": state_names.get(sc, sc)},
                   "geometry": sg.mapping(u)})

# ── validate, then write ──────────────────────────────────────────────────────
ok_pop = abs(pop_d - CENSUS_TOTAL) / CENSUS_TOTAL < 0.001 and abs(pop_s - pop_d) < 1
ok_counts = len(state_vals) == 35 and len(dist_vals) >= 620
ok_geom = not still_missing
print("VALIDATION:", "PASS" if (ok_pop and ok_counts and ok_geom) else "FAIL",
      f"(pop={ok_pop} counts={ok_counts} geom={ok_geom})")

if not (ok_pop and ok_counts and ok_geom):
    print("NOT written.")
    raise SystemExit(1)

json.dump({"type": "FeatureCollection", "features": dfeats}, open(OUT_D, "w"))
json.dump({"type": "FeatureCollection", "features": sfeats}, open(OUT_S, "w"))
print(f"wrote {OUT_D} ({os.path.getsize(OUT_D)//1024} KB, {len(dfeats)} features)")
print(f"wrote {OUT_S} ({os.path.getsize(OUT_S)//1024} KB, {len(sfeats)} features)")

con.execute("PRAGMA journal_mode=DELETE;")
con.execute("DELETE FROM metric_values WHERE region_level IN ('district2011','state2011')")
n = 0
for dc, vals in dist_vals.items():
    for mid, v in vals.items():
        if v is None:
            continue
        con.execute("INSERT OR REPLACE INTO metric_values(metric_id,region_code,region_level,year,value,estimated) VALUES(?,?,?,?,?,0)",
                    (mid, dc, "district2011", 2011, v))
        n += 1
for sc, vals in state_vals.items():
    for mid, v in vals.items():
        if v is None:
            continue
        con.execute("INSERT OR REPLACE INTO metric_values(metric_id,region_code,region_level,year,value,estimated) VALUES(?,?,?,?,?,0)",
                    (mid, sc, "state2011", 2011, v))
        n += 1

con.execute("DELETE FROM region_keys WHERE level IN ('district2011','state2011')")
for dc in dist_vals:
    con.execute("INSERT OR REPLACE INTO region_keys(level,code,name,st_code,census2011_dt_code,iso_3166_2,lgd_code) VALUES('district2011',?,?,?,?,NULL,NULL)",
                (dc, vintage_name.get(dc, dist_names.get(dc, dc)), dist_state.get(dc), dc.split("_")[1]))
for sc in state_vals:
    con.execute("INSERT OR REPLACE INTO region_keys(level,code,name,st_code,census2011_dt_code,iso_3166_2,lgd_code) VALUES('state2011',?,?,?,NULL,NULL,NULL)",
                (sc, state_names.get(sc, sc), sc))

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
con.execute("INSERT INTO load_log (adapter, source, year, license, fetched_at, loaded_at, rows_written, notes) VALUES (?,?,?,?,?,?,?,?)",
            ("build_vintage_2011.py",
             "Census of India 2011 PCA (ORGI) official district/state rows, as reported; vintage geometry dissolved from committed current-day districts",
             2011, "GODL-India", "2026-06-08T00:00:00Z", now, n,
             f"district2011={len(dist_vals)} state2011={len(state_vals)} merged={list(merged_into)} no-SHRUG"))
con.commit()
con.close()
print(f"WROTE {n} vintage metric values; region_keys for {len(dist_vals)}+{len(state_vals)} vintage regions; load_log appended.")
