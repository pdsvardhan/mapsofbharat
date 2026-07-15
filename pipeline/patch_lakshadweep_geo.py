"""Replace the degenerate Lakshadweep geometry in public/geo with a curated,
SoI-compliant island archipelago (#196).

Both states.geojson (st_code 31) and districts.geojson (rid 31_587) shipped a
single degenerate 4-point triangle near [73.04, 8.27] as a placeholder — the
explorer rendered Lakshadweep as one bogus speck and the social-export card fell
back to point symbols (iter-74 item 573).

This builds a MultiPolygon from the ten major inhabited islands at their true
coordinates (the same curated set used by lib/social-export.ts LAKSHADWEEP_ISLANDS),
each as a small diamond so the choropleth has a fillable, correctly-placed
geometry. Idempotent: re-running replaces the geometry with the same result.

Run: pipeline/.venv/bin/python pipeline/patch_lakshadweep_geo.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, "public", "geo")

# Ten major inhabited islands of Lakshadweep, [lon, lat] — mirrors
# lib/social-export.ts LAKSHADWEEP_ISLANDS (iter-74 item 573). Public geographic
# coordinates; Lakshadweep is undisputed Indian territory (no boundary claim).
ISLANDS = [
    (72.18, 11.60),  # Bitra
    (72.71, 11.70),  # Chetlat
    (73.00, 11.49),  # Kiltan
    (72.78, 11.22),  # Kadmat
    (72.73, 11.12),  # Amini
    (72.19, 10.86),  # Agatti
    (72.64, 10.57),  # Kavaratti
    (73.68, 10.82),  # Andrott
    (73.64, 10.08),  # Kalpeni
    (73.04, 8.28),   # Minicoy
]
R = 0.05  # ~5.5 km diamond half-extent; island-scale, honest at national zoom


def diamond(lon, lat, r=R):
    """A small closed CCW diamond ring around (lon, lat)."""
    return [[lon, lat + r], [lon - r, lat], [lon, lat - r], [lon + r, lat], [lon, lat + r]]


def lakshadweep_multipolygon():
    # MultiPolygon: one single-ring Polygon per island.
    return {"type": "MultiPolygon", "coordinates": [[diamond(lon, lat)] for lon, lat in ISLANDS]}


def _npts(coords):
    if isinstance(coords[0], (int, float)):
        return 1
    return sum(_npts(c) for c in coords)


def patch(path, match):
    d = json.load(open(path, encoding="utf-8"))
    hits = [f for f in d["features"] if match(f["properties"])]
    assert len(hits) == 1, f"{os.path.basename(path)}: expected 1 Lakshadweep feature, found {len(hits)}"
    f = hits[0]
    before = _npts(f["geometry"]["coordinates"])
    f["geometry"] = lakshadweep_multipolygon()
    after = _npts(f["geometry"]["coordinates"])
    json.dump(d, open(path, "w", encoding="utf-8"))
    print(f"{os.path.basename(path)}: {f['properties']}  {before} -> {after} pts "
          f"({len(ISLANDS)} islands)")


def main():
    patch(os.path.join(GEO, "states.geojson"), lambda p: str(p.get("st_code")) == "31")
    patch(os.path.join(GEO, "districts.geojson"), lambda p: p.get("rid") == "31_587")
    print("OK — Lakshadweep geometry curated")


if __name__ == "__main__":
    main()
