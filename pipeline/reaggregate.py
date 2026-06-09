import geopandas as gpd, pandas as pd, json, sqlite3, os, statistics
import shapely.geometry as sg

PIPE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(PIPE)
RAW = os.path.join(PIPE, "raw"); SH = os.path.join(PIPE, "shrug")
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson"); DB = os.path.join(ROOT, "data", "mapsofbharat.db")
RAWCOLS = ["pc11_pca_tot_p","pc11_pca_tot_m","pc11_pca_tot_f","pc11_pca_p_06","pc11_pca_m_06","pc11_pca_f_06",
           "pc11_pca_p_sc","pc11_pca_p_st","pc11_pca_p_lit","pc11_pca_f_lit","pc11_pca_tot_work_p",
           "pc11_pca_main_cl_p","pc11_pca_main_al_p","pc11_pca_main_hh_p","pc11_pca_main_ot_p"]

def sd_key(st, di, su): return st.str.zfill(2) + di.str.zfill(3) + su.str.zfill(5)

sub = gpd.read_file(os.path.join(RAW, "subdistrict.gpkg"))[["pc11_state_id","pc11_district_id","pc11_subdistrict_id","geometry"]]
sub["sd"] = sd_key(sub["pc11_state_id"], sub["pc11_district_id"], sub["pc11_subdistrict_id"])
sub = sub.set_crs("EPSG:4326", allow_override=True)
sub["geometry"] = sub.geometry.representative_point()

# current districts keyed by UNIQUE rid (from add_rid)
feats = [{"rid": f["properties"]["rid"], "geometry": sg.shape(f["geometry"])}
         for f in json.load(open(GEO))["features"] if f["properties"].get("rid")]
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

total_pop = sum(v["pop_total"] for v in results.values() if v["pop_total"])
print(f"districts(rid) with data: {len(results)} / {len(dist)} ; total pop: {total_pop:,.0f}  (census = 1,210,854,977)")
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
print("VALIDATION:", "PASS" if ok else "FAIL")
if ok:
    con = sqlite3.connect(DB); con.execute("PRAGMA journal_mode=DELETE;")
    con.execute("DELETE FROM metric_values WHERE year=2011 AND region_level='district'")
    n = 0
    for rid, vals in results.items():
        for mid, v in vals.items():
            if v is None: continue
            con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)", (mid, rid, "district", 2011, v, 0)); n += 1
    con.commit(); con.close()
    print(f"WROTE {n} values across {len(results)} unique current-day districts (keyed by rid).")
else:
    print("NOT written.")
