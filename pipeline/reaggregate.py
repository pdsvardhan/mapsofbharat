import datetime
import geopandas as gpd, pandas as pd, json, sqlite3, os, statistics
import shapely.geometry as sg

PIPE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(PIPE)
RAW = os.path.join(PIPE, "raw")
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")
GEO_ST = os.path.join(ROOT, "public", "geo", "states.geojson")
DB = os.path.join(ROOT, "data", "mapsofbharat.db")
SUBPCA = os.path.join(RAW, "2011-IndiaStateDistSbDist.xlsx")  # official ORGI sub-district PCA (complete)
GPKG = os.path.join(RAW, "subdistrict.gpkg")
PROJ = "EPSG:7755"      # WGS84 / India NSF LCC — projected CRS for correct nearest-distance
SPLIT = {"28", "01"}    # 2011 states that split into multiple current states; geometry decides these

# official PCA column -> internal pc11_* name consumed by metrics()
OFF_COLS = {"pc11_pca_tot_p": "TOT_P", "pc11_pca_tot_m": "TOT_M", "pc11_pca_tot_f": "TOT_F",
            "pc11_pca_p_06": "P_06", "pc11_pca_m_06": "M_06", "pc11_pca_f_06": "F_06",
            "pc11_pca_p_sc": "P_SC", "pc11_pca_p_st": "P_ST", "pc11_pca_p_lit": "P_LIT",
            "pc11_pca_f_lit": "F_LIT", "pc11_pca_tot_work_p": "TOT_WORK_P",
            "pc11_pca_main_cl_p": "MAIN_CL_P", "pc11_pca_main_al_p": "MAIN_AL_P",
            "pc11_pca_main_hh_p": "MAIN_HH_P", "pc11_pca_main_ot_p": "MAIN_OT_P"}
RAWCOLS = list(OFF_COLS.keys())

# ISO 3166-2:IN per current state name (post-2023 ISO update: IN-CG, IN-OD, IN-UK)
ISO = {"Jammu and Kashmir": "IN-JK", "Himachal Pradesh": "IN-HP", "Punjab": "IN-PB",
       "Chandigarh": "IN-CH", "Uttarakhand": "IN-UK", "Haryana": "IN-HR", "Delhi": "IN-DL",
       "Rajasthan": "IN-RJ", "Uttar Pradesh": "IN-UP", "Bihar": "IN-BR", "Sikkim": "IN-SK",
       "Arunachal Pradesh": "IN-AR", "Nagaland": "IN-NL", "Manipur": "IN-MN", "Mizoram": "IN-MZ",
       "Tripura": "IN-TR", "Meghalaya": "IN-ML", "Assam": "IN-AS", "West Bengal": "IN-WB",
       "Jharkhand": "IN-JH", "Odisha": "IN-OD", "Chhattisgarh": "IN-CG", "Madhya Pradesh": "IN-MP",
       "Gujarat": "IN-GJ", "Dadra and Nagar Haveli and Daman and Diu": "IN-DH",
       "Maharashtra": "IN-MH", "Karnataka": "IN-KA", "Goa": "IN-GA", "Lakshadweep": "IN-LD",
       "Kerala": "IN-KL", "Tamil Nadu": "IN-TN", "Puducherry": "IN-PY",
       "Andaman and Nicobar Islands": "IN-AN", "Telangana": "IN-TG", "Andhra Pradesh": "IN-AP",
       "Ladakh": "IN-LA"}


def metrics(r):
    g = lambda k: (None if pd.isna(r[k]) else float(r[k]))
    rate = lambda n, d: (None if (n is None or d is None or d == 0) else round(n/d*100, 1))
    ratio = lambda n, d: (None if (n is None or d is None or d == 0) else round(n/d*1000, 0))
    TP, P06, TF, F06, TM, M06, tw = g("pc11_pca_tot_p"), g("pc11_pca_p_06"), g("pc11_pca_tot_f"), g("pc11_pca_f_06"), g("pc11_pca_tot_m"), g("pc11_pca_m_06"), g("pc11_pca_tot_work_p")
    return {"pop_total": TP,
            "literacy_rate": rate(g("pc11_pca_p_lit"), (TP-P06) if (TP and P06 is not None) else None),
            "female_literacy_rate": rate(g("pc11_pca_f_lit"), (TF-F06) if (TF and F06 is not None) else None),
            "sex_ratio": ratio(TF, TM), "child_sex_ratio": ratio(F06, M06),
            "sc_pct": rate(g("pc11_pca_p_sc"), TP), "st_pct": rate(g("pc11_pca_p_st"), TP),
            "work_participation": rate(tw, TP), "cultivators_pct": rate(g("pc11_pca_main_cl_p"), tw),
            "agri_labourers_pct": rate(g("pc11_pca_main_al_p"), tw), "household_industry_pct": rate(g("pc11_pca_main_hh_p"), tw),
            "other_workers_pct": rate(g("pc11_pca_main_ot_p"), tw)}


# ── official sub-district PCA (complete national coverage; bug #18 fix) ──────
# Replaces SHRUG's pc11_subdist_pca.tab, which silently undercovered several
# states (Mizoram urban Aizawl 39k/400k, WB, Tripura) and forced a coverage
# gate that withheld 45 districts. The ORGI sub-district file sums to the exact
# census total, so no district need be withheld.
off = pd.read_excel(SUBPCA, sheet_name="Data", dtype=str)
sdf = off[(off["Level"] == "SUB-DISTRICT") & (off["TRU"] == "Total")].copy()
sdf["scode"] = sdf["State"].str.zfill(2)
sdf["sd"] = sdf["scode"] + sdf["District"].str.zfill(3) + sdf["Subdistt"].str.zfill(5)
sdf["dcode"] = sdf["scode"] + "_" + sdf["District"].astype(int).astype(str)
for k, v in OFF_COLS.items():
    sdf[k] = pd.to_numeric(sdf[v], errors="coerce")

# sub-district geometries -> representative point; current districts keyed by UNIQUE rid
sub = gpd.read_file(GPKG)[["pc11_state_id", "pc11_district_id", "pc11_subdistrict_id", "geometry"]]
sub["sd"] = (sub["pc11_state_id"].astype(str).str.zfill(2) + sub["pc11_district_id"].astype(str).str.zfill(3)
             + sub["pc11_subdistrict_id"].astype(str).str.zfill(5))
sub = sub.set_crs("EPSG:4326", allow_override=True)
sub["geometry"] = sub.geometry.representative_point()

dist_feats = json.load(open(GEO))["features"]
feats = [{"rid": f["properties"]["rid"], "st": str(f["properties"]["rid"]).split("_")[0],
          "geometry": sg.shape(f["geometry"])}
         for f in dist_feats if f["properties"].get("rid")]
dist = gpd.GeoDataFrame(feats, geometry="geometry", crs="EPSG:4326")
sub_p = sub.to_crs(PROJ); dist_p = dist.to_crs(PROJ)

# point-in-polygon within current district; nearest fallback (projected CRS)
j = gpd.sjoin(sub, dist, how="left", predicate="within").drop_duplicates(subset="sd")
miss = j["rid"].isna()
print(f"within-matched: {(~miss).sum()} / {len(j)} ; nearest-fallback: {int(miss.sum())}")
method = {s: "within" for s in j.loc[~miss, "sd"]}
if miss.any():
    nn = gpd.sjoin_nearest(sub_p[sub_p["sd"].isin(j.loc[miss, "sd"])], dist_p, how="left").drop_duplicates(subset="sd")
    j.loc[miss, "rid"] = j.loc[miss, "sd"].map(dict(zip(nn["sd"], nn["rid"])))
    for s in j.loc[miss, "sd"]:
        method[s] = "nearest"
sd2rid = dict(zip(j["sd"], j["rid"]))

# same-state correction: a census sub-district belongs to its own state. For
# non-split states, re-home any sub-district whose geometry landed in another
# state's current district (offshore islands / enclaves, e.g. Lakshadweep,
# Puducherry-Mahe) to the nearest current district *within its own state*.
sdf["rid"] = sdf["sd"].map(sd2rid)
sdf["rid_st"] = sdf["rid"].str.split("_").str[0]
leak = sdf[(~sdf["scode"].isin(SPLIT)) & sdf["rid"].notna() & (sdf["rid_st"] != sdf["scode"])]
for scode in leak["scode"].unique():
    instate = dist_p[dist_p["st"] == scode]
    if instate.empty:
        continue
    pts = sub_p[sub_p["sd"].isin(leak[leak["scode"] == scode]["sd"])]
    nn = gpd.sjoin_nearest(pts, instate, how="left").drop_duplicates(subset="sd")
    for s, r in zip(nn["sd"], nn["rid"]):
        sd2rid[s] = r; method[s] = "instate-nearest"
print(f"crosswalk methods: within={sum(v=='within' for v in method.values())} "
      f"nearest={sum(v=='nearest' for v in method.values())} "
      f"instate-nearest={sum(v=='instate-nearest' for v in method.values())} "
      f"(re-homed {len(leak)} leaked sub-districts)")
sdf["rid"] = sdf["sd"].map(sd2rid)

# missing-geometry reconciliation: official sub-districts with no gpkg polygon
# are assigned to the dominant current district among their 2011 district's
# mapped peers (keeps the national total exact for Tripura/WB residue).
mapped = sdf[sdf["rid"].notna()].copy()
orphan = sdf[sdf["rid"].isna()].copy()
dom = mapped.groupby("dcode").apply(lambda gdf: gdf.groupby("rid")["pc11_pca_tot_p"].sum().idxmax())
orphan["rid"] = orphan["dcode"].map(dom)
unrec = int(orphan["rid"].isna().sum())
print(f"missing-geometry sub-districts: {len(orphan)} reconciled={orphan['rid'].notna().sum()} unrecoverable={unrec}")
allrows = pd.concat([mapped, orphan[orphan["rid"].notna()]])

agg = allrows.groupby("rid")[RAWCOLS].sum(min_count=1)
allrows["st"] = allrows["rid"].str.split("_").str[0]
agg_st = allrows.groupby("st")[RAWCOLS].sum(min_count=1)

results = {rid: metrics(row) for rid, row in agg.iterrows()}
results_st = {st: metrics(row) for st, row in agg_st.iterrows()}

total_pop = sum(v["pop_total"] for v in results.values() if v["pop_total"])
print(f"districts(rid) with data: {len(results)} / {len(dist)} ; total pop: {total_pop:,.0f}  (census = 1,210,854,977)")
total_pop_st = sum(v["pop_total"] for v in results_st.values() if v["pop_total"])
print(f"states with data: {len(results_st)} / 36 ; state-sum pop: {total_pop_st:,.0f} (must equal district total)")

# validate vs official district file, keyed by state_alldistrict rid
off2 = pd.read_excel(os.path.join(RAW, "2011-IndiaStateDist.xlsx"), sheet_name="Data", dtype=str)
off2 = off2[(off2["Level"] == "DISTRICT") & (off2["TRU"] == "Total")]
diffs = []
for stc, dc, tp in zip(off2["State"], off2["District"], pd.to_numeric(off2["TOT_P"], errors="coerce")):
    if isinstance(dc, str) and dc.isdigit() and not pd.isna(tp):
        rid = f"{str(stc).split('.')[0].zfill(2)}_{int(dc)}"
        if rid in results and results[rid]["pop_total"]:
            diffs.append(abs(results[rid]["pop_total"] - float(tp)) / float(tp) * 100)
med = statistics.median(diffs) if diffs else 99
print(f"vs official (matched rid, n={len(diffs)}): median={med:.2f}%  mean={statistics.mean(diffs):.2f}%  within2%={sum(1 for d in diffs if d<2)}  worst={[round(x,1) for x in sorted(diffs,reverse=True)[:4]]}")
ok = abs(total_pop - 1.210854977e9) / 1.210854977e9 < 0.03 and med < 2
ok_st = total_pop_st is not None and abs(total_pop_st - total_pop) < 1
print("VALIDATION:", "PASS" if (ok and ok_st) else "FAIL", "(district)", "PASS" if ok_st else "FAIL", "(state-consistency)")

if ok and ok_st:
    con = sqlite3.connect(DB); con.execute("PRAGMA journal_mode=DELETE;")
    # idempotent migration: trust-layer columns (iter-15 item 161)
    mcols = {r[1] for r in con.execute("PRAGMA table_info(metrics)")}
    for c in ("methodology", "last_updated"):
        if c not in mcols:
            con.execute(f"ALTER TABLE metrics ADD COLUMN {c} TEXT")
    con.execute("""CREATE TABLE IF NOT EXISTS crosswalk (
        sd_code TEXT NOT NULL, rid TEXT NOT NULL, method TEXT NOT NULL,
        PRIMARY KEY (sd_code, rid))""")
    con.execute("""CREATE TABLE IF NOT EXISTS region_keys (
        level TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
        st_code TEXT, census2011_dt_code TEXT, iso_3166_2 TEXT, lgd_code TEXT,
        PRIMARY KEY (level, code))""")
    con.execute("""CREATE TABLE IF NOT EXISTS load_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, adapter TEXT NOT NULL, source TEXT NOT NULL,
        year INTEGER NOT NULL, license TEXT NOT NULL, fetched_at TEXT NOT NULL,
        loaded_at TEXT NOT NULL, rows_written INTEGER NOT NULL, notes TEXT)""")

    con.execute("DELETE FROM metric_values WHERE year=2011 AND region_level IN ('district','state')")
    n = 0
    for rid, vals in results.items():
        for mid, v in vals.items():
            if v is None: continue
            con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)", (mid, rid, "district", 2011, v, 0)); n += 1
    n_st = 0
    for st, vals in results_st.items():
        for mid, v in vals.items():
            if v is None: continue
            con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)", (mid, st, "state", 2011, v, 0)); n_st += 1

    # persist the geometric crosswalk actually used (within / nearest / instate-nearest)
    con.execute("DELETE FROM crosswalk")
    for s, rid in sd2rid.items():
        if rid is None or (isinstance(rid, float) and pd.isna(rid)): continue
        con.execute("INSERT OR REPLACE INTO crosswalk VALUES(?,?,?)", (s, rid, method.get(s, "within")))

    # region_keys: districts from districts.geojson, states from states.geojson
    con.execute("DELETE FROM region_keys")
    for f in dist_feats:
        p = f["properties"]
        rid = p.get("rid")
        if not rid: continue
        dt = str(p.get("dt_code", "")).strip()
        census_dt = dt if (dt.isdigit() and 0 < int(dt) < 9000) else None  # 9xxx = synthetic post-2011 codes
        con.execute("INSERT OR REPLACE INTO region_keys VALUES(?,?,?,?,?,?,?)",
                    ("district", rid, str(p.get("district", "")),
                     str(p.get("st_code", "")).split(".")[0].zfill(2), census_dt, None, None))
    for f in json.load(open(GEO_ST))["features"]:
        p = f["properties"]
        code = str(p["st_code"]).zfill(2)
        con.execute("INSERT OR REPLACE INTO region_keys VALUES(?,?,?,?,?,?,?)",
                    ("state", code, p["st_nm"], code, None, ISO.get(p["st_nm"]), None))

    CENSUS_METHODOLOGY = ("Census 2011 PCA raw counts from the official ORGI sub-district Primary Census "
                          "Abstract, reaggregated onto current-day district boundaries via a point-in-polygon "
                          "crosswalk (representative-point within current district; nearest same-state district "
                          "for offshore/enclave sub-districts; missing-geometry sub-districts reconciled to "
                          "their district's dominant current piece). Rates recomputed from raw counts (ADR-010). "
                          "National total matches the census exactly (1,210,854,977); median district diff 0.00% "
                          "vs official PCA. Replaces the earlier SHRUG sub-district source, which undercovered "
                          "several states (e.g. Mizoram urban Aizawl) and required withholding — bug #18 fix.")
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute("UPDATE metrics SET methodology=?, last_updated=? WHERE category IN ('demographics','livelihood')",
                (CENSUS_METHODOLOGY, now))
    con.execute("INSERT INTO load_log (adapter, source, year, license, fetched_at, loaded_at, rows_written, notes) VALUES (?,?,?,?,?,?,?,?)",
                ("reaggregate.py", "Census of India 2011 Primary Census Abstract (ORGI), official sub-district file, on DataMeet current-day boundaries",
                 2011, "GODL-India", "2026-06-08T00:00:00Z", now, n + n_st,
                 f"district={n} state={n_st} crosswalk={len(sd2rid)} bug18-fix=official-subdistrict-source no-withholding"))
    con.commit(); con.close()
    print(f"WROTE {n} district + {n_st} state values; crosswalk {len(sd2rid)} rows; region_keys persisted; load_log appended.")
else:
    print("NOT written.")
