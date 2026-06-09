import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, "public", "geo", "districts.geojson")

d = json.load(open(GEO))
seen = set()
for f in d["features"]:
    c = str(f["properties"].get("dt_code", ""))
    if c.isdigit():
        seen.add(int(c))

nxt = 9000
patched = []
for f in d["features"]:
    p = f["properties"]
    if not p.get("dt_code"):
        while nxt in seen:
            nxt += 1
        p["dt_code"] = str(nxt)
        seen.add(nxt)
        patched.append((str(nxt), p.get("st_code"), p.get("st_nm"), p.get("district")))
        nxt += 1

json.dump(d, open(GEO, "w"))
print(f"patched {len(patched)} uncoded features:")
for r in patched:
    print("  ", r)
