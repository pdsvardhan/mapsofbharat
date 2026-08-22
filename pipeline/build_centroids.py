#!/usr/bin/env python3
"""Representative points for every region, for the proportional-symbol layer (#408, S1).

    pipeline/.venv/bin/python pipeline/build_centroids.py
    pipeline/.venv/bin/python pipeline/build_centroids.py --check   # verify, write nothing

Writes public/geo/centroids-<layer>.geojson — one Point per region, carrying the SAME
id property the polygon source promotes, so feature-state can be mirrored across the two
sources and symbol mode keeps every interaction polygon mode has.

WHY NOT A CENTROID. The arithmetic mean of a polygon's coordinates is frequently OUTSIDE
the polygon it belongs to. It happens whenever a shape is crescent-shaped, horseshoed
around a neighbour, or split into several parts — and India's districts are full of all
three. A coastal district whose mean falls in the sea would put its circle in the Arabian
Sea with nothing under it, and a district wrapped around another would put its circle on
top of its neighbour, labelling one district's quantity with another district's position.

So this uses shapely's representative_point(), which is *guaranteed* to lie inside the
geometry. For a MultiPolygon it is computed on the LARGEST PART, not on the collection:
the guarantee for a collection is only "inside some part", and for a district with a tiny
offshore island that can legitimately be the island — technically inside, visually absurd.
Largest-part is what a reader means by "where this district is".

Every point is then asserted to fall within its own polygon before anything is written.
That assertion is the whole value of the file; without it this is a slightly better guess.
"""
import json
import sys
from pathlib import Path

from shapely.geometry import shape, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "public" / "geo"

# (source geojson, output name, the property the map's promoteId uses)
LAYERS = [
    ("districts.geojson", "centroids-districts.geojson", "rid"),
    ("states.geojson", "centroids-states.geojson", "st_code"),
    ("districts-2011.geojson", "centroids-districts-2011.geojson", "rid"),
    ("states-2011.geojson", "centroids-states-2011.geojson", "st_code"),
]

NAME_KEYS = ("district", "st_nm")


def representative(geom):
    """A point guaranteed inside the geometry, on its largest part."""
    g = shape(geom)
    if not g.is_valid:
        g = g.buffer(0)
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda p: p.area)
    return g.representative_point(), shape(geom)


def build(check_only: bool) -> int:
    problems = 0
    for src_name, out_name, id_key in LAYERS:
        src = GEO / src_name
        if not src.exists():
            print(f"  SKIP {src_name} (not present)")
            continue
        data = json.loads(src.read_text(encoding="utf-8"))
        feats = []
        outside = []
        seen = set()

        for f in data["features"]:
            props = f["properties"]
            code = props.get(id_key)
            if code is None:
                problems += 1
                print(f"  {src_name}: a feature has no {id_key}")
                continue
            code = str(code)
            if code in seen:
                problems += 1
                print(f"  {src_name}: duplicate {id_key} {code}")
            seen.add(code)

            pt, whole = representative(f["geometry"])

            # The assertion this file exists for.
            if not whole.buffer(0).contains(Point(pt.x, pt.y)):
                outside.append(code)

            name = next((props[k] for k in NAME_KEYS if props.get(k)), code)
            feats.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(pt.x, 5), round(pt.y, 5)]},
                    "properties": {id_key: code, "name": name},
                }
            )

        if outside:
            problems += len(outside)
            print(f"  {src_name}: {len(outside)} point(s) fell OUTSIDE their polygon: {outside[:8]}")

        out = {"type": "FeatureCollection", "features": feats}
        target = GEO / out_name
        if check_only:
            if not target.exists():
                problems += 1
                print(f"  {out_name}: MISSING — run without --check")
            else:
                cur = json.loads(target.read_text(encoding="utf-8"))
                if len(cur["features"]) != len(feats):
                    problems += 1
                    print(f"  {out_name}: STALE — {len(cur['features'])} points vs {len(feats)} regions")
                elif outside:
                    print(f"  {out_name}: {len(outside)} point(s) outside their polygon")
                else:
                    print(f"  {out_name}: ok ({len(feats)} points, all inside their polygon)")
        elif outside:
            # Refuse. This branch used to write the file anyway and then print
            # "all inside their polygon" regardless — the docstring above calls
            # the containment assertion "the whole value of the file", and it was
            # being computed, counted, and then ignored at the only moment it
            # mattered. The non-zero exit came AFTER the bad points were already
            # on disk, where a later build would happily serve them.
            print(f"  {out_name}: REFUSING to write — {len(outside)} point(s) outside their polygon")
        else:
            target.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
            print(f"  {out_name}: wrote {len(feats)} points, all inside their polygon")

    return problems


def main():
    check_only = "--check" in sys.argv
    print(f"build_centroids: {'checking' if check_only else 'writing'} representative points")
    problems = build(check_only)
    if problems:
        print(f"\nbuild_centroids: {problems} problem(s)", file=sys.stderr)
        sys.exit(1)
    print("build_centroids: OK")


main()
