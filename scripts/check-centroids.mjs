#!/usr/bin/env node
// Every centroid must lie inside its OWN polygon (#565).
//
// WHAT WAS WRONG. pipeline/build_centroids.py holds the real containment proof —
// shapely's representative_point() on the largest part — but it wrote the file
// whether or not the check passed, and printed "all inside their polygon"
// unconditionally while doing it. The one test covering this asserted the points
// fell inside lon 66..99, lat 5..38: India's bounding box. A district's point
// landing in the Arabian Sea, or squarely on top of a neighbouring district,
// passes that. All ten of the naive-centroid failures the builder's docstring
// describes pass it. And nothing invoked the builder's own --check anyway, so
// the guarantee was never enforced on a build.
//
// WHY THIS IS NODE AND NOT THE PYTHON. The Docker builder stage is a bare
// node:20-slim: no python3, no shapely, and the pipeline venv is not in the build
// context. `build_centroids.py --check` cannot run at build time however much we
// would like it to. A prebuild guard has to be runnable where prebuild runs.
//
// Planar ray casting is the right instrument here despite the coordinates being
// spherical. The alternative is d3-geo's geoContains, whose spherical maths
// matters near the poles and across the antimeridian — neither of which India is
// anywhere near. A dependency that buys nothing at this latitude is not worth the
// build surface.
//
//   node scripts/check-centroids.mjs          # verify, exit 1 on any failure
//
// Also imported by tests/centroid-containment.spec.ts, which mutation-tests it.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO = join(ROOT, "public", "geo");

/** (polygon source, centroid output, the property promoteId uses) — mirrors
 *  LAYERS in pipeline/build_centroids.py. */
export const LAYERS = [
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
export function pointInRing(x, y, ring) {
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
export function pointInPolygon(x, y, rings) {
  if (!rings.length || !pointInRing(x, y, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(x, y, rings[h])) return false; // in a hole is not inside
  }
  return true;
}

/** Inside any part of a Polygon or MultiPolygon geometry. */
export function pointInGeometry(x, y, geom) {
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
export function checkLayer(srcPath, centroidPath, idKey) {
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

export function checkAll(geoDir = GEO) {
  const results = [];
  for (const [src, out, idKey] of LAYERS) {
    results.push({
      layer: out,
      ...checkLayer(join(geoDir, src), join(geoDir, out), idKey),
    });
  }
  return results;
}

function main() {
  let problems = 0;
  console.log("check-centroids: every point inside its own polygon");
  for (const r of checkAll()) {
    if (r.absent) {
      console.log(`  ${r.layer}: SKIP (source or output not present)`);
      continue;
    }
    if (r.outside.length === 0 && r.missing.length === 0) {
      // Only claimed once it has actually been established, which is the whole
      // difference from the line this replaces.
      console.log(`  ${r.layer}: ok (${r.checked} points, all inside their polygon)`);
      continue;
    }
    problems += r.outside.length + r.missing.length;
    for (const o of r.outside.slice(0, 8)) {
      console.error(`  ${r.layer}: ${o.name} (${o.code}) at ${o.lon},${o.lat} is OUTSIDE its polygon`);
    }
    if (r.outside.length > 8) console.error(`  ${r.layer}: … and ${r.outside.length - 8} more outside`);
    if (r.missing.length) {
      console.error(`  ${r.layer}: ${r.missing.length} point(s) name a region the source lacks: ${r.missing.slice(0, 8).join(", ")}`);
    }
  }
  if (problems) {
    console.error(`\ncheck-centroids: ${problems} problem(s) — rebuild with pipeline/build_centroids.py`);
    process.exit(1);
  }
  console.log("check-centroids: OK");
}

// Run as a CLI, stay quiet when imported by the spec.
if (process.argv[1] && process.argv[1].endsWith("check-centroids.mjs")) main();
