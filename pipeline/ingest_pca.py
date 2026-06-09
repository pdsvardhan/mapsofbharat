import json, sqlite3, os, re
import pandas as pd

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(PIPE)
PCA  = os.path.join(PIPE, "raw", "2011-IndiaStateDist.xlsx")
GEO  = os.path.join(ROOT, "public", "geo", "districts.geojson")
DB   = os.path.join(ROOT, "data", "mapsofbharat.db")
SRC  = "Census of India 2011, Primary Census Abstract (ORGI)"
SRCURL = "https://censusindia.gov.in/census.website/data/population-finder"
LIC  = "GODL-India"

df = pd.read_excel(PCA, sheet_name="Data", dtype=str)
d = df[(df["Level"] == "DISTRICT") & (df["TRU"] == "Total")].copy()
for c in ["No_HH","TOT_P","TOT_M","TOT_F","P_06","M_06","F_06","P_SC","P_ST","P_LIT","M_LIT","F_LIT","TOT_WORK_P"]:
    d[c] = pd.to_numeric(d[c], errors="coerce")
print("PCA district(Total) rows:", len(d))

geo = json.load(open(GEO))
feats = [f["properties"] for f in geo["features"]]
def norm(s): return re.sub(r"[^a-z0-9]", "", str(s).lower())
geo_codes = set()
geo_by_name = {}
for p in feats:
    c = str(p.get("dt_code"))
    if c.isdigit(): geo_codes.add(int(c))
    geo_by_name[(str(p.get("st_code")).zfill(2), norm(p.get("district")))] = str(int(p["dt_code"])) if str(p.get("dt_code")).isdigit() else None

def resolve(row):
    dc = row["District"]
    if isinstance(dc, str) and dc.isdigit() and int(dc) in geo_codes:
        return str(int(dc))
    key = (str(row["State"]).zfill(2), norm(row["Name"]))
    return geo_by_name.get(key)

d["dt_code"] = d.apply(resolve, axis=1)
matched = int(d["dt_code"].notna().sum())
print(f"resolved dt_code: {matched} / {len(d)} PCA districts (geojson coded districts: {len(geo_codes)})")
print("unresolved sample:\n", d[d["dt_code"].isna()][["State","District","Name"]].head(12).to_string())

def rate(n, dd):
    return None if (pd.isna(n) or pd.isna(dd) or dd == 0) else round(float(n)/float(dd)*100, 1)
def ratio(n, dd):
    return None if (pd.isna(n) or pd.isna(dd) or dd == 0) else round(float(n)/float(dd)*1000, 0)

METRICS = [
  ("pop_total","Total population","demographics","people",0,None,"Total persons (2011 Census)."),
  ("literacy_rate","Literacy rate","demographics","%",1,1,"Literates as % of population aged 7+."),
  ("female_literacy_rate","Female literacy rate","demographics","%",1,1,"Female literates as % of females aged 7+."),
  ("sex_ratio","Sex ratio","demographics","F / 1000 M",0,1,"Females per 1000 males."),
  ("child_sex_ratio","Child sex ratio (0-6)","demographics","F / 1000 M",0,1,"Girls per 1000 boys aged 0-6."),
  ("sc_pct","Scheduled Caste share","demographics","%",1,None,"SC population as % of total."),
  ("st_pct","Scheduled Tribe share","demographics","%",1,None,"ST population as % of total."),
  ("work_participation","Work participation rate","demographics","%",1,None,"Workers as % of total population."),
]

os.makedirs(os.path.dirname(DB), exist_ok=True)
con = sqlite3.connect(DB)
con.execute("PRAGMA journal_mode=DELETE;")
con.executescript("""
CREATE TABLE IF NOT EXISTS metrics(
  id TEXT PRIMARY KEY, name TEXT, category TEXT, unit TEXT, decimals INTEGER,
  higher_is_better INTEGER, default_scale TEXT, description TEXT,
  source TEXT, source_url TEXT, license TEXT, year INTEGER);
CREATE TABLE IF NOT EXISTS metric_values(
  metric_id TEXT, region_code TEXT, region_level TEXT, year INTEGER, value REAL,
  PRIMARY KEY(metric_id, region_code, region_level, year));
CREATE INDEX IF NOT EXISTS idx_mv ON metric_values(metric_id, region_level, year);
""")
con.execute("DELETE FROM metric_values WHERE year=2011 AND region_level='district'")
for mid,name,cat,unit,dec,hib,desc in METRICS:
    con.execute("INSERT OR REPLACE INTO metrics VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (mid,name,cat,unit,dec,hib,"viridis",desc,SRC,SRCURL,LIC,2011))

written = 0
for _, r in d.iterrows():
    code = r["dt_code"]
    if not code: continue
    vals = {
      "pop_total": None if pd.isna(r["TOT_P"]) else float(r["TOT_P"]),
      "literacy_rate": rate(r["P_LIT"], (r["TOT_P"]-r["P_06"]) if (pd.notna(r["TOT_P"]) and pd.notna(r["P_06"])) else float("nan")),
      "female_literacy_rate": rate(r["F_LIT"], (r["TOT_F"]-r["F_06"]) if (pd.notna(r["TOT_F"]) and pd.notna(r["F_06"])) else float("nan")),
      "sex_ratio": ratio(r["TOT_F"], r["TOT_M"]),
      "child_sex_ratio": ratio(r["F_06"], r["M_06"]),
      "sc_pct": rate(r["P_SC"], r["TOT_P"]),
      "st_pct": rate(r["P_ST"], r["TOT_P"]),
      "work_participation": rate(r["TOT_WORK_P"], r["TOT_P"]),
    }
    for mid, v in vals.items():
        if v is None: continue
        con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?)", (mid, code, "district", 2011, v))
        written += 1
con.commit()
print("metric_values written:", written)
print("districts with data:", con.execute("SELECT COUNT(DISTINCT region_code) FROM metric_values").fetchone()[0])
for mid,name,*_ in METRICS:
    mn,mx,cnt = con.execute("SELECT MIN(value),MAX(value),COUNT(*) FROM metric_values WHERE metric_id=?", (mid,)).fetchone()
    print(f"  {mid:24s} n={cnt} min={mn} max={mx}")
con.close()
print("DB ->", DB)
