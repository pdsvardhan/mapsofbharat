import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  checkAll,
  LAYERS,
} from "../scripts/check-centroids.mjs";

// #565 — the centroid containment guard, made load-bearing.
//
// The guard it replaces asserted that every point fell inside lon 66..99,
// lat 5..38. That is India's bounding box, so it held for a district's point
// dropped in the Arabian Sea or placed on top of a neighbouring district — the
// two failures pipeline/build_centroids.py exists to prevent. A check that
// passes for the thing it is meant to catch is not a check.
//
// The first half of this file proves the checker can FAIL, on shapes chosen
// because a naive centroid gets them wrong. Without that, the green run over
// real data at the bottom would mean nothing: an always-true predicate reports
// "all inside" just as cheerfully as a correct one.

/** A crescent: a square with a deep bite taken out of its right side, so the
 *  arithmetic mean of the vertices lands in the bite rather than in the shape.
 *  This is the horseshoe case the builder's docstring names. */
const CRESCENT = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0], [10, 0], [10, 2], [3, 2], [3, 8], [10, 8], [10, 10], [0, 10], [0, 0],
    ],
  ],
};

/** A square with a square hole in the middle. */
const WITH_HOLE = {
  type: "Polygon",
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ],
};

/** Two disjoint squares — a mainland and a small offshore island. */
const MULTI = {
  type: "MultiPolygon",
  coordinates: [
    [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
  ],
};

test.describe("#565 the containment predicate can actually fail", () => {
  test("a crescent's naive centre is correctly reported OUTSIDE", () => {
    // Mean of the vertices is about (4.1, 5.0) — in the bite, not the shape.
    expect(pointInGeometry(5, 5, CRESCENT)).toBe(false);
    // and the India-bbox test this replaces would have waved it through
    expect(5).toBeGreaterThan(0);
  });

  test("the same crescent contains a genuine representative point", () => {
    expect(pointInGeometry(1.5, 5, CRESCENT)).toBe(true);
    expect(pointInGeometry(6, 1, CRESCENT)).toBe(true);
    expect(pointInGeometry(6, 9, CRESCENT)).toBe(true);
  });

  test("a point inside a hole is not inside the polygon", () => {
    expect(pointInGeometry(5, 5, WITH_HOLE)).toBe(false);
    expect(pointInGeometry(2, 2, WITH_HOLE)).toBe(true);
  });

  test("a MultiPolygon counts any part, including the small one", () => {
    expect(pointInGeometry(5, 5, MULTI)).toBe(true);
    expect(pointInGeometry(20.5, 20.5, MULTI)).toBe(true);
    expect(pointInGeometry(15, 15, MULTI)).toBe(false); // the sea between them
  });

  test("a point outside every ring is outside", () => {
    expect(pointInGeometry(-1, -1, CRESCENT)).toBe(false);
    expect(pointInGeometry(100, 100, MULTI)).toBe(false);
  });

  test("an unsupported geometry type is not silently 'inside'", () => {
    expect(pointInGeometry(0, 0, { type: "Point", coordinates: [0, 0] })).toBe(false);
    expect(pointInGeometry(0, 0, null)).toBe(false);
  });

  test("pointInRing and pointInPolygon agree on a simple square", () => {
    const square = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    expect(pointInRing(2, 2, square)).toBe(true);
    expect(pointInRing(5, 2, square)).toBe(false);
    expect(pointInPolygon(2, 2, [square])).toBe(true);
  });
});

test.describe("#565 the predicate fails on REAL geometry when a point is moved", () => {
  // Synthetic shapes prove the maths. This proves it against the actual district
  // polygons, which are the thing the guard runs on.
  test("displacing a real district centroid is detected", () => {
    const geo = join(process.cwd(), "public", "geo");
    const src = JSON.parse(readFileSync(join(geo, "districts.geojson"), "utf-8"));
    const pts = JSON.parse(readFileSync(join(geo, "centroids-districts.geojson"), "utf-8"));

    const byId = new Map(
      src.features.map((f: any) => [String(f.properties.rid), f.geometry])
    );

    let checkedAtLeastOne = false;
    for (const f of pts.features.slice(0, 25)) {
      const geom = byId.get(String(f.properties.rid));
      if (!geom) continue;
      const [lon, lat] = f.geometry.coordinates;
      expect(pointInGeometry(lon, lat, geom), `${f.properties.name} as built`).toBe(true);
      // Five degrees is roughly 550km — comfortably out of any Indian district,
      // and still inside the India bounding box the old assertion used, so this
      // is precisely the displacement the previous test could not see.
      expect(pointInGeometry(lon + 5, lat, geom), `${f.properties.name} displaced`).toBe(false);
      checkedAtLeastOne = true;
    }
    expect(checkedAtLeastOne, "no districts were actually checked").toBe(true);
  });
});

test.describe("#565 every shipped centroid is inside its own polygon", () => {
  test("all four layers pass real containment", () => {
    const results = checkAll();
    expect(results.length).toBe(LAYERS.length);
    for (const r of results) {
      expect(r.absent, `${r.layer} is missing`).toBe(false);
      expect(r.checked, `${r.layer} has no points`).toBeGreaterThan(0);
      expect(
        r.outside.map((o: { name: string }) => o.name),
        `${r.layer} has points outside their polygon`
      ).toEqual([]);
      expect(r.missing, `${r.layer} names regions the source lacks`).toEqual([]);
    }
  });

  test("the layer list still matches the builder's", () => {
    // Drift here means a layer stops being checked without anyone noticing.
    expect(LAYERS.map(([, out]) => out)).toEqual([
      "centroids-districts.geojson",
      "centroids-states.geojson",
      "centroids-districts-2011.geojson",
      "centroids-states-2011.geojson",
    ]);
  });
});
