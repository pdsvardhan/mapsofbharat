// Centroid containment — the pure half of the #565 guard.
//
// WHY THIS IS A .cjs AND NOT A .mjs (iter-45, #610). tests/centroid-containment.spec.ts
// needs these functions. Playwright transforms an imported module to CommonJS, and from
// Node 20.19.5 onward Node routes a .mjs through the ESM loader anyway — so that
// transformed CommonJS landed in an ESM scope and every run died with
// "ReferenceError: exports is not defined in ES module scope".
//
// Measured, not inferred: same repo, same Playwright 1.60.0, node:20.19.4-slim lists the
// 16 tests and node:20.19.5-slim throws. CI and the production image run 20.20.2 while the
// VAULT7A host runs 20.19.2, which is the whole reason this was red in CI and green
// locally — for long enough that "CI is red, pre-existing" became a to-do rather than a
// bug, and the ci.yml comment above the Node pin blamed Node 22 for it until iter-45
// corrected it in place.
//
// The fix is that no spec imports a .mjs at all. The logic lives here, in a file whose
// module format is unambiguous to both loaders; scripts/check-centroids.mjs is a thin CLI
// over it; and scripts/check-spec-imports.mjs fails the build if a spec ever reaches for
// a .mjs again.

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const GEO = join(__dirname, "..", "..", "public", "geo");

/** (polygon source, centroid output, the property promoteId uses) — mirrors
 *  LAYERS in pipeline/build_centroids.py. */
const LAYERS = [
  ["districts.geojson", "centroids-districts.geojson", "rid"],
  ["states.geojson", "centroids-states.geojson", "st_code"],
  ["districts-2011.geojson", "centroids-districts-2011.geojson", "rid"],
  ["states-2011.geojson", "centroids-states-2011.geojson", "st_code"],
];

/**
 * Is [x, y] inside this linear ring? Standard even-odd ray cast.
 *
 * The `(yi > y) !== (yj > y)` test counts an edge only when the ray genuinely
 * crosses it, and the half-open comparison is what stops a vertex exactly level
 * with the ray from being counted twice.
 */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the exterior ring and outside every hole. */
function pointInPolygon(x, y, rings) {
  if (!rings.length || !pointInRing(x, y, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(x, y, rings[h])) return false; // in a hole is not inside
  }
  return true;
}

/** Inside any part of a Polygon or MultiPolygon geometry. */
function pointInGeometry(x, y, geom) {
  if (!geom) return false;
  if (geom.type === "Polygon") return pointInPolygon(x, y, geom.coordinates);
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((rings) => pointInPolygon(x, y, rings));
  }
  return false;
}

/**
 * Check one layer. Returns { checked, missing, outside, absent }.
 *
 * `outside` is the finding that matters: a point that is not in the polygon it
 * claims to represent. `missing` means the centroid file names a region the
 * polygon source does not have, which is just as broken and silently invisible.
 */
function checkLayer(srcPath, centroidPath, idKey) {
  if (!existsSync(srcPath) || !existsSync(centroidPath)) {
    return { checked: 0, missing: [], outside: [], absent: true };
  }
  const src = JSON.parse(readFileSync(srcPath, "utf-8"));
  const pts = JSON.parse(readFileSync(centroidPath, "utf-8"));

  const byId = new Map();
  for (const f of src.features) {
    const code = f.properties?.[idKey];
    if (code != null) byId.set(String(code), f.geometry);
  }

  const missing = [];
  const outside = [];
  for (const f of pts.features) {
    const code = String(f.properties?.[idKey]);
    const geom = byId.get(code);
    if (!geom) {
      missing.push(code);
      continue;
    }
    const [x, y] = f.geometry.coordinates;
    if (!pointInGeometry(x, y, geom)) {
      outside.push({ code, name: f.properties?.name ?? code, lon: x, lat: y });
    }
  }
  return { checked: pts.features.length, missing, outside, absent: false };
}

function checkAll(geoDir = GEO) {
  const results = [];
  for (const [src, out, idKey] of LAYERS) {
    results.push({
      layer: out,
      ...checkLayer(join(geoDir, src), join(geoDir, out), idKey),
    });
  }
  return results;
}

module.exports = {
  GEO,
  LAYERS,
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  checkLayer,
  checkAll,
};
