import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")
geo = json.load(open(GEO))
cnt = collections.Counter()
for f in geo["features"]:
    p = f["properties"]
    st = str(p.get("st_code", "")).split(".")[0].strip().zfill(2)
    dt = str(int(p["dt_code"])) if str(p.get("dt_code", "")).strip().isdigit() else "x"
    p["rid"] = f"{st}_{dt}"
    cnt[p["rid"]] += 1
json.dump(geo, open(GEO, "w"))
dups = {k: v for k, v in cnt.items() if v > 1}
print(f"features {len(geo['features'])} | unique rid {len(cnt)} | still-colliding rid {len(dups)} (legit multi-polygon districts)")
print("residual collisions:", list(dups.items())[:10])
