import datetime
import geopandas as gpd, pandas as pd, json, sqlite3, os, statistics
import shapely.geometry as sg

PIPE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(PIPE)
RAW = os.path.join(PIPE, "raw"); SH = os.path.join(PIPE, "shrug")
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")
GEO_ST = os.path.join(ROOT, "public", "geo", "states.geojson")
DB = os.path.join(ROOT, "data", "mapsofbharat.db")
RAWCOLS = ["pc11_pca_tot_p","pc11_pca_tot_m","pc11_pca_tot_f","pc11_pca_p_06","pc11_pca_m_06","pc11_pca_f_06",
           "pc11_pca_p_sc","pc11_pca_p_st","pc11_pca_p_lit","pc11_pca_f_lit","pc11_pca_tot_work_p",
           "pc11_pca_main_cl_p","pc11_pca_main_al_p","pc11_pca_main_hh_p","pc11_pca_main_ot_p"]

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

def sd_key(st, di, su): return st.str.zfill(2) + di.str.zfill(3) + su.str.zfill(5)

sub = gpd.read_file(os.path.join(RAW, "subdistrict.gpkg"))[["pc11_state_id","pc11_district_id","pc11_subdistrict_id","geometry"]]
sub["sd"] = sd_key(sub["pc11_state_id"], sub["pc11_district_id"], sub["pc11_subdistrict_id"])
sub = sub.set_crs("EPSG:4326", allow_override=True)
sub["geometry"] = sub.geometry.representative_point()

# current districts keyed by UNIQUE rid (from add_rid)
dist_feats = json.load(open(GEO))["features"]
feats = [{"rid": f["properties"]["rid"], "geometry": sg.shape(f["geometry"])}
         for f in dist_feats if f["properties"].get("rid")]
dist = gpd.GeoDataFrame(feats, geometry="geometry", crs="EPSG:4326")

j = gpd.sjoin(sub, dist, how="left", predicate="within").drop_duplicates(subset="sd")
miss = j["rid"].isna()
print(f"within-matched: {(~miss).sum()} / {len(j)} ; nearest-fallback: {int(miss.sum())}")
if miss.any():
    nn = gpd.sjoin_nearest(sub[sub["sd"].isin(j.loc[miss, "sd"])], dist, how="left").drop_duplicates(subset="sd")
    j.loc[miss, "rid"] = j.loc[miss, "sd"].map(dict(zip(nn["sd"], nn["rid"])))
sd2rid = j[["sd", "rid"]].dropna()

pca = pd.read_csv(os.path.join(SH, "pc11_subdist_pca.tab"), sep="\t", dtype=str)
pca["sd"] = sd_key(pca["pc11_state_id"], pca["pc11_district_id"], pca["pc11_subdistrict_id"])
for c in RAWCOLS: pca[c] = pd.to_numeric(pca[c], errors="coerce")
pca = pca.groupby("sd")[RAWCOLS].sum(min_count=1).reset_index()
m = sd2rid.merge(pca, on="sd", how="left")
agg = m.groupby("rid")[RAWCOLS].sum(min_count=1)

# state-level aggregation: rid prefix is the current-day st_code shared by both geojsons
m["st"] = m["rid"].str.split("_").str[0]
agg_st = m.groupby("st")[RAWCOLS].sum(min_count=1)

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
results = {rid: metrics(row) for rid, row in agg.iterrows()}
results_st = {st: metrics(row) for st, row in agg_st.iterrows()}

total_pop = sum(v["pop_total"] for v in results.values() if v["pop_total"])
print(f"districts(rid) with data: {len(results)} / {len(dist)} ; total pop: {total_pop:,.0f}  (census = 1,210,854,977)")
total_pop_st = sum(v["pop_total"] for v in results_st.values() if v["pop_total"])
print(f"states with data: {len(results_st)} / 36 ; state-sum pop: {total_pop_st:,.0f} (must equal district total)")

# validate vs official district file, keyed by state_alldistrict rid (disambiguates AP/MH collisions)
off = pd.read_excel(os.path.join(RAW, "2011-IndiaStateDist.xlsx"), sheet_name="Data", dtype=str)
off = off[(off["Level"] == "DISTRICT") & (off["TRU"] == "Total")]
diffs = []
for stc, dc, tp in zip(off["State"], off["District"], pd.to_numeric(off["TOT_P"], errors="coerce")):
    if isinstance(dc, str) and dc.isdigit() and not pd.isna(tp):
        rid = f"{str(stc).split('.')[0].zfill(2)}_{int(dc)}"
        if rid in results and results[rid]["pop_total"]:
            diffs.append(abs(results[rid]["pop_total"] - float(tp)) / float(tp) * 100)
med = statistics.median(diffs) if diffs else 99
print(f"vs official (matched rid, n={len(diffs)}): median={med:.2f}%  mean={statistics.mean(diffs):.2f}%  within2%={sum(1 for d in diffs if d<2)}  worst={ [round(x,1) for x in sorted(diffs,reverse=True)[:4]] }")
ok = abs(total_pop - 1.210854977e9) / 1.210854977e9 < 0.03 and med < 2
# state pass internal consistency: state sums must reproduce the district total
ok_st = total_pop_st is not None and abs(total_pop_st - total_pop) < 1
print("VALIDATION:", "PASS" if (ok and ok_st) else "FAIL", "(district)", "PASS" if ok_st else "FAIL", "(state-consistency)")

if ok and ok_st:
    con = sqlite3.connect(DB); con.execute("PRAGMA journal_mode=DELETE;")
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

    # persist the crosswalk actually used (within-match or nearest-fallback)
    con.execute("DELETE FROM crosswalk")
    nearest = set(j.loc[miss, "sd"]) if miss.any() else set()
    for sd, rid in sd2rid.itertuples(index=False):
        con.execute("INSERT OR REPLACE INTO crosswalk VALUES(?,?,?)",
                    (sd, rid, "nearest" if sd in nearest else "within"))

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

    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute("INSERT INTO load_log (adapter, source, year, license, fetched_at, loaded_at, rows_written, notes) VALUES (?,?,?,?,?,?,?,?)",
                ("reaggregate.py", "Census of India 2011 PCA via SHRUG sub-district + DataMeet boundaries",
                 2011, "GODL-India", "2026-06-08T00:00:00Z", now, n + n_st,
                 f"district={n} state={n_st} crosswalk={len(sd2rid)}"))
    con.commit(); con.close()
    print(f"WROTE {n} district + {n_st} state values; crosswalk {len(sd2rid)} rows; region_keys persisted; load_log appended.")
else:
    print("NOT written.")
