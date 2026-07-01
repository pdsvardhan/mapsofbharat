import json, sqlite3, os, re
from collections import defaultdict
import pandas as pd

PIPE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(PIPE)
PCA = os.path.join(PIPE, "raw", "2011-IndiaStateDist.xlsx")
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")
DB  = os.path.join(ROOT, "data", "mapsofbharat.db")
SRC = "Census of India 2011, Primary Census Abstract (ORGI)"
SRCURL = "https://censusindia.gov.in/census.website/data/population-finder"; LIC = "GODL-India"
RAW = ["No_HH","TOT_P","TOT_M","TOT_F","P_06","M_06","F_06","P_SC","P_ST","P_LIT","M_LIT","F_LIT",
       "TOT_WORK_P","MAIN_CL_P","MAIN_AL_P","MAIN_HH_P","MAIN_OT_P"]

df = pd.read_excel(PCA, sheet_name="Data", dtype=str)
d = df[(df["Level"] == "DISTRICT") & (df["TRU"] == "Total")].copy()
for c in RAW:
    d[c] = pd.to_numeric(d[c], errors="coerce")

def norm(s): return re.sub(r"[^a-z0-9]", "", str(s).lower())

geo = json.load(open(GEO))
def center(geom):
    xs, ys = [], []
    def w(c):
        if isinstance(c[0], (int, float)): xs.append(c[0]); ys.append(c[1])
        else:
            for x in c: w(x)
    w(geom["coordinates"]); return ((min(xs)+max(xs))/2, (min(ys)+max(ys))/2)

feats = []
for f in geo["features"]:
    p = f["properties"]
    if not p.get("dt_code"): continue
    st = int(p["st_code"]) if str(p.get("st_code", "")).strip() not in ("", "None") else -1
    cx, cy = center(f["geometry"])
    feats.append({"code": str(int(p["dt_code"])), "st": st, "nm": norm(p.get("district")), "cx": cx, "cy": cy})
by_code = set(int(x["code"]) for x in feats)
by_state_name = {(str(x["st"]).zfill(2), x["nm"]): x["code"] for x in feats}
by_name = defaultdict(list)
for x in feats: by_name[x["nm"]].append(x["code"])
state_count = defaultdict(int)
for x in feats: state_count[x["st"]] += 1
print(f"geojson coded features: {len(feats)}")

def resolve(row):
    dc = row["District"]
    if isinstance(dc, str) and dc.isdigit() and int(dc) in by_code: return str(int(dc))
    st = str(row["State"]).zfill(2); nm = norm(row["Name"])
    if (st, nm) in by_state_name: return by_state_name[(st, nm)]
    if len(by_name.get(nm, [])) == 1: return by_name[nm][0]
    return None

def compute(r):
    g = lambda k: (None if (r.get(k) is None or (isinstance(r.get(k), float) and pd.isna(r.get(k)))) else float(r.get(k)))
    def rate(n, dd): return None if (n is None or dd is None or dd == 0) else round(n/dd*100, 1)
    def ratio(n, dd): return None if (n is None or dd is None or dd == 0) else round(n/dd*1000, 0)
    TP, P06, TF, F06, TM, M06, tw = g("TOT_P"), g("P_06"), g("TOT_F"), g("F_06"), g("TOT_M"), g("M_06"), g("TOT_WORK_P")
    return {
      "pop_total": TP,
      "literacy_rate": rate(g("P_LIT"), (TP-P06) if (TP is not None and P06 is not None) else None),
      "female_literacy_rate": rate(g("F_LIT"), (TF-F06) if (TF is not None and F06 is not None) else None),
      "sex_ratio": ratio(TF, TM), "child_sex_ratio": ratio(F06, M06),
      "sc_pct": rate(g("P_SC"), TP), "st_pct": rate(g("P_ST"), TP),
      "work_participation": rate(tw, TP),
      "cultivators_pct": rate(g("MAIN_CL_P"), tw), "agri_labourers_pct": rate(g("MAIN_AL_P"), tw),
      "household_industry_pct": rate(g("MAIN_HH_P"), tw), "other_workers_pct": rate(g("MAIN_OT_P"), tw),
    }

d["dt_code"] = d.apply(resolve, axis=1)
results, estimated = {}, set()
for _, r in d.iterrows():
    code = r["dt_code"]
    if code and code not in results: results[code] = compute(r)
exact = len(results)

for x in feats:                       # whole-state aggregation (single-polygon states e.g. Delhi)
    if x["code"] in results or state_count[x["st"]] != 1: continue
    rows = d[d["State"] == str(x["st"]).zfill(2)]
    if len(rows):
        sums = {c: float(rows[c].sum()) for c in RAW}
        results[x["code"]] = compute(sums); estimated.add(x["code"])
agg = len(results) - exact

COUNT = {"pop_total"}                  # nearest-parent inheritance (rates only, never counts)
base = set(results.keys())
for x in feats:
    if x["code"] in results: continue
    cands = [g for g in feats if g["st"] == x["st"] and g["code"] in base]
    if not cands: cands = [g for g in feats if g["code"] in base]   # fallback: global nearest (e.g. Telangana <- AP)
    if not cands: continue
    near = min(cands, key=lambda g: (g["cx"]-x["cx"])**2 + (g["cy"]-x["cy"])**2)
    results[x["code"]] = {k: (None if k in COUNT else v) for k, v in results[near["code"]].items()}
    estimated.add(x["code"])
inh = len(results) - exact - agg

METRICS = [
  ("pop_total","Total population","demographics","people",0,None,"Total persons (2011 Census)."),
  ("literacy_rate","Literacy rate","demographics","%",1,1,"Literates as % of population aged 7+."),
  ("female_literacy_rate","Female literacy rate","demographics","%",1,1,"Female literates as % of females aged 7+."),
  ("sex_ratio","Sex ratio","demographics","F / 1000 M",0,1,"Females per 1000 males."),
  ("child_sex_ratio","Child sex ratio (0-6)","demographics","F / 1000 M",0,1,"Girls per 1000 boys aged 0-6."),
  ("sc_pct","Scheduled Caste share","demographics","%",1,None,"SC population as % of total."),
  ("st_pct","Scheduled Tribe share","demographics","%",1,None,"ST population as % of total."),
  ("work_participation","Work participation rate","demographics","%",1,None,"Workers as % of total population."),
  ("cultivators_pct","Cultivators (% of workers)","livelihood","%",1,None,"Cultivators as % of total workers."),
  ("agri_labourers_pct","Agricultural labourers (% of workers)","livelihood","%",1,None,"Agricultural labourers as % of total workers."),
  ("household_industry_pct","Household industry (% of workers)","livelihood","%",1,1,"Household-industry workers as % of total workers."),
  ("other_workers_pct","Other / non-farm workers (% of workers)","livelihood","%",1,1,"Non-farm workers as % of total workers."),
]

os.makedirs(os.path.dirname(DB), exist_ok=True)
con = sqlite3.connect(DB); con.execute("PRAGMA journal_mode=DELETE;")
con.executescript("""
DROP TABLE IF EXISTS metric_values;
CREATE TABLE metric_values(metric_id TEXT, region_code TEXT, region_level TEXT, year INTEGER, value REAL, estimated INTEGER DEFAULT 0, PRIMARY KEY(metric_id,region_code,region_level,year));
CREATE INDEX idx_mv ON metric_values(metric_id,region_level,year);
CREATE TABLE IF NOT EXISTS metrics(id TEXT PRIMARY KEY, name TEXT, category TEXT, unit TEXT, decimals INTEGER, higher_is_better INTEGER, default_scale TEXT, description TEXT, source TEXT, source_url TEXT, license TEXT, year INTEGER, methodology TEXT, last_updated TEXT);
""")
con.execute("DELETE FROM metrics")
for mid,name,cat,unit,dec,hib,desc in METRICS:
    con.execute("INSERT OR REPLACE INTO metrics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (mid,name,cat,unit,dec,hib,"viridis",desc,SRC,SRCURL,LIC,2011,None,None))
written = 0
for code, vals in results.items():
    est = 1 if code in estimated else 0
    for mid, v in vals.items():
        if v is None: continue
        con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)", (mid, code, "district", 2011, v, est))
        written += 1
con.commit()
print(f"coverage: exact={exact} + aggregated={agg} + inherited={inh} = {len(results)} / {len(feats)} coded districts ({estimated.__len__()} estimated)")
print("metric_values written:", written, "| districts with data:", con.execute("SELECT COUNT(DISTINCT region_code) FROM metric_values").fetchone()[0])
con.close(); print("DB ->", DB)
