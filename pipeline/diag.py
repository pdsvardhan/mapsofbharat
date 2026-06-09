import json, sqlite3, pandas as pd, os
from collections import Counter
PIPE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(PIPE)
DB = os.path.join(ROOT, "data", "mapsofbharat.db"); GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")

con = sqlite3.connect(DB)
pop = {r[0]: r[1] for r in con.execute("SELECT region_code, value FROM metric_values WHERE metric_id='pop_total'")}
have = set(r[0] for r in con.execute("SELECT DISTINCT region_code FROM metric_values"))

name, st = {}, {}
for f in json.load(open(GEO))["features"]:
    p = f["properties"]; c = str(int(p["dt_code"])) if str(p.get("dt_code","")).isdigit() else None
    if c: name[c] = p.get("district"); st[c] = p.get("st_nm")

unc = [(st[c], name[c]) for c in name if c not in have]
print("uncovered districts:", len(unc), "by state:", dict(Counter(s for s, _ in unc)))
tg = [c for c in name if st.get(c) == "Telangana"]
print("Telangana:", len(tg), "districts,", sum(1 for c in tg if c in have), "with data")

off = pd.read_excel(os.path.join(PIPE, "raw", "2011-IndiaStateDist.xlsx"), sheet_name="Data", dtype=str)
off = off[(off["Level"] == "DISTRICT") & (off["TRU"] == "Total")]
rows = []
for cr, tp, nm in zip(off["District"], pd.to_numeric(off["TOT_P"], errors="coerce"), off["Name"]):
    if isinstance(cr, str) and cr.isdigit() and not pd.isna(tp):
        c = str(int(cr))
        if c in pop and pop[c]:
            rows.append((abs(pop[c]-float(tp))/float(tp)*100, c, name.get(c), nm, int(pop[c]), int(tp)))
rows.sort(reverse=True)
print("\nworst 8 diffs (diff%, code, geojson_name, official_name, reaggr_pop, official_pop):")
for r in rows[:8]: print(" ", round(r[0],1), r[1], "|", r[2], "vs", r[3], "|", f"{r[4]:,}", "vs", f"{r[5]:,}")
print(f"\ndistricts within 2% of official: {sum(1 for r in rows if r[0]<2)} / {len(rows)}")
