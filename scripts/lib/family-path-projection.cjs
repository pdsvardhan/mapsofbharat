// Small-multiple path projection — the pure half of #547 phase B (adr-d3geo).
//
// WHY THIS IS A .cjs AND NOT A .mjs (iter-45, #610). tests/family-paths.spec.ts needs
// these functions. Playwright transforms an imported module to CommonJS, and from Node
// 20.19.5 onward Node routes a .mjs through the ESM loader anyway — so that transformed
// CommonJS landed in an ESM scope and every run died with "ReferenceError: exports is not
// defined in ES module scope". Measured: node:20.19.4-slim lists the tests,
// node:20.19.5-slim throws. See scripts/lib/centroid-containment.cjs for the full note.
//
// WHY d3-geo IS INJECTED RATHER THAN IMPORTED HERE. d3-geo is ESM-only, and this file has
// to be loadable by both plain `node` (from the .mjs CLI) and Playwright's CommonJS
// transform. Taking { geoMercator, geoPath } as an argument keeps that question out of
// this file entirely: the caller supplies them with whatever import syntax its own loader
// speaks, and the projection logic below stays a pure function of its inputs.

/** Panel viewport. Small — these are thumbnails, not the atlas map — but big
 *  enough that a district is still a distinguishable shape rather than a speck. */
const PANEL = { width: 220, height: 240 };

/** Sources to project, and the property each one's id comes from. Mirrors the
 *  promoteId the live map uses so a panel and the map speak the same ids. */
const LAYERS = [
  { src: "districts.geojson", key: "rid", out: "district" },
  { src: "states.geojson", key: "st_code", out: "state" },
];

/** Signed area of a lon/lat ring (shoelace). Positive = counter-clockwise. */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/**
 * Rewind rings to the orientation d3-geo expects (#547 phase B).
 *
 * THIS IS NOT COSMETIC. RFC 7946 says a GeoJSON exterior ring is
 * COUNTER-clockwise; d3-geo's spherical geoPath takes the opposite convention,
 * and a ring wound "backwards" does not draw a small polygon — it draws the
 * ENTIRE REST OF THE SPHERE, because on a sphere the complement of a shape is
 * also a shape.
 *
 * Caught by measuring the artefact rather than the log: the first run reported
 * "735 paths" and exited 0, and all 735 of them spanned the full 220x240 panel.
 * Every family panel would have rendered as one solid filled rectangle, with the
 * build perfectly green.
 *
 * Exterior ring is forced clockwise (negative area) and holes counter-clockwise,
 * which is d3's convention rather than GeoJSON's.
 */
function rewind(geometry) {
  const fixRings = (rings) =>
    rings.map((ring, i) => {
      const a = ringArea(ring);
      const wantPositive = i > 0; // holes wind opposite the exterior
      return (a > 0) === wantPositive ? ring : [...ring].reverse();
    });
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: fixRings(geometry.coordinates) };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(fixRings) };
  }
  return geometry;
}

/** Grid the artefact snaps to, in panel px (#547, iter-41 item 976).
 *
 *  0.25px on a 220x240 panel. Measured, and revised DOWN from 0.5 once the emit
 *  guard started asking whether a subpath encloses anything rather than whether
 *  its bounding box has width:
 *
 *    step   district layer   gzip   regions that draw NOTHING
 *    0.1     327 KiB          92 KiB   0
 *    0.25    282 KiB          68 KiB   0
 *    0.5     182 KiB          47 KiB   1  (district 34_634)
 *    1.0      98 KiB          28 KiB   3  (04_55, 26_494, state 04)
 *
 *  0.5 was shipped first and is wrong. District 34_634 measures 0.9x0.4px at full
 *  resolution, and at 0.5 its ring snapped to
 *  "M107,166L107,166.5L106,166.5L106,166L106,166.5L107,166.5L107,166Z" - seven
 *  points, tracing out and back along the same edge, enclosing zero area. It was
 *  present in the artefact, counted as a path, passed every guard that measured a
 *  bounding box, and painted nothing on all 61 panels. Invisible and green, which
 *  is the same failure as the backwards rings and the flattened districts, and it
 *  survived two rounds of review because every check asked about the box rather
 *  than the shape.
 *
 *  The 100 KiB between 0.25 and 0.5 buys a district that can actually be seen.
 *  Both are far below the 394 KiB this started at. */
const SNAP = 0.25;

/**
 * Snap path coordinates to the SNAP grid and drop the vertices that collapse.
 *
 * WHY SNAPPING AND NOT DOUGLAS-PEUCKER. These are 735 adjacent polygons that
 * share borders, and a line simplifier drops vertices based on the ring it is
 * walking. Two districts traverse their shared border in opposite directions, so
 * a simplifier can drop different vertices on each side and open a crack between
 * them. Snapping cannot: it is a pure function of the coordinate itself, so a
 * vertex on a shared border lands in the same place no matter which district is
 * being drawn, and any divergence is bounded by the step.
 *
 * Two reductions follow the snap, both deterministic per coordinate and so both
 * topology-safe: consecutive duplicate points collapse to one, and exactly
 * collinear middles are dropped (collinearity is symmetric, so both sides of a
 * shared border drop the same point).
 *
 * Returns null unchanged so the caller's own check still distinguishes "no
 * drawable geometry" from "empty string".
 */
function round(d, step = SNAP) {
  if (d == null) return d;
  const q = (n) => Math.round((Math.round(Number(n) / step) * step) * 100) / 100;

  const out = [];
  // d3-geo emits one or more subpaths: "M x,y L x,y ... Z". Parsed rather than
  // regex-substituted, because the reductions below are decisions about POINTS
  // and a substitution can only see text. An earlier pass here did try to collapse
  // duplicates with a lookahead and silently removed none of the 13,180 that were
  // actually in the artefact - the file got smaller from shorter numbers alone,
  // which looked like success.
  for (const m of d.matchAll(/M([^MZ]*)(Z?)/g)) {
    const pts = [];
    for (const pm of m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      pts.push([q(pm[1]), q(pm[2])]);
    }

    // Drop vertices that sit EXACTLY on the line between their neighbours. Exact
    // collinearity means removing the point cannot move the outline by even a
    // sub-pixel, so this is free shape-wise - and it is symmetric, so two
    // districts sharing a border make the same decision from either direction.
    const keep = [];
    for (let i = 0; i < pts.length; i++) {
      const a = keep[keep.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      if (a && c) {
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross === 0) continue;
      }
      keep.push(b);
    }

    // A subpath that draws nothing is not emitted. The rule is stated as EXTENT
    // rather than as a point count, because the point count is not sufficient and
    // measuring the artefact is what proved it.
    //
    // Duplicates are handled ENTIRELY here and by the collinear rule above, and
    // an explicit dedupe pass was tried and removed: with this guard in place,
    // regenerating with the dedupe disabled produces byte-identical layers
    // (244,505 chars either way). It could not, because a repeated point is a
    // degenerate collinear case wherever it sits, and the one case the collinear
    // rule cannot reach - a subpath whose points ALL collapse - is exactly what
    // this extent check rejects. Three points snapping to
    // (78,99), (78.5,99.5), (78,99) are all distinct, so none is deduped; the
    // middle one is exactly collinear with its neighbours, so it goes; and what
    // is left is two identical points that get written out as "M78,99L78,99Z" -
    // zero extent, invisible, and still counted as a path. Three district
    // subpaths did precisely that.
    // ONE rule, not two. A separate `keep.length < 2` check sat here and mutation
    // testing could not make it matter: zero or one point measures as zero extent
    // and is rejected below anyway. Two overlapping guards mean one of them is
    // never the reason anything happens, and that is the branch that rots.
    // DOES THIS SUBPATH ENCLOSE ANYTHING? Asked of the ring itself. This is the
    // THIRD version of this guard and the first that asks the right question.
    // `w <= 0 && h <= 0` let vertical lines through (three shipped). `||` still
    // let a 2-point diagonal through. Both of those measure the BOUNDING BOX, and
    // a box says nothing about whether a fill can appear: district 34_634 had a
    // 0.5x0.5 box and traced out and back along one edge, enclosing zero area and
    // painting nothing on 61 panels while every box test waved it through.
    //
    // Shoelace over the kept points. Zero area means no fill can appear, whatever
    // shape produced it — line, diagonal, doubled-back ring or single point — so
    // this is ONE rule where there were two. A separate bounding-box check sat
    // here as well and mutation testing could not make it matter: removing it
    // leaves the layers byte-identical, because anything it rejected has zero
    // area too.
    let area2 = 0;
    for (let i = 0, j = keep.length - 1; i < keep.length; j = i++) {
      area2 += keep[j][0] * keep[i][1] - keep[i][0] * keep[j][1];
    }
    if (area2 === 0) continue;
    out.push("M" + keep.map((p) => `${p[0]},${p[1]}`).join("L") + m[2]);
  }
  return out.join("");
}

/**
 * Regions in a layer that the snap has destroyed (#547, iter-41).
 *
 * Extracted from build() so it can be TESTED. Inside build() it was unreachable
 * by any single mutation: at the shipped 0.5px tolerance nothing is flattened, so
 * breaking the guard changed no output and every mutation of it read as a
 * survivor. A guard that only matters at a tolerance nobody runs is a guard
 * nobody has checked.
 *
 * Returns human-readable ids so the build's refusal names what it refused over.
 */
function flattenedIn(paths) {
  const flattened = [];
  for (const [id, d] of Object.entries(paths)) {
    const { w, h, points } = extentOf(d);
    if (points < 3 || w <= 0 || h <= 0) flattened.push(`${id} (${w}x${h}, ${points}pts)`);
  }
  return flattened;
}

/** Width and height a path actually spans, in panel px. The guard reads this
 *  rather than a vertex count, because a count cannot tell a real district from
 *  one flattened to a line. */
function extentOf(d) {
  const n = (d.match(/-?[\d.]+/g) || []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    if (n[i] < x0) x0 = n[i];
    if (n[i] > x1) x1 = n[i];
    if (n[i + 1] < y0) y0 = n[i + 1];
    if (n[i + 1] > y1) y1 = n[i + 1];
  }
  return { w: x1 - x0, h: y1 - y0, points: n.length / 2 };
}

/**
 * Build `projectCollection` over an injected d3-geo.
 *
 * The returned function projects one FeatureCollection to SVG path strings.
 *
 * fitSize on the WHOLE collection, not per feature: every panel must share one
 * projection or the panels stop being comparable, which is the entire point of a
 * small multiple. A per-feature fit would zoom each district to fill the box and
 * produce a grid of unrelated blobs.
 */
function makeProjectCollection({ geoMercator, geoPath }) {
  return function projectCollection(fc, key, panel = PANEL) {
    // Rewound BEFORE fitSize as well as before pathing: fitSize measures the
    // projected bounds, and a backwards ring measures as the whole world, so the
    // fit itself would be wrong even if the paths were later corrected.
    const wound = {
      ...fc,
      features: fc.features.map((f) => ({ ...f, geometry: rewind(f.geometry) })),
    };
    const projection = geoMercator().fitSize([panel.width, panel.height], wound);
    // Snapped to the SNAP grid. The panel is 220x240 CSS px, so half a pixel is well
    // below anything a screen resolves — and full float precision is not
    // free here: eight panels of 735 districts is the payload of the page. Measured
    // on the real boundaries, rounding cuts the artefact by more than half with no
    // visible change to a thumbnail.
    const path = geoPath(projection.precision(0.2));
    const paths = {};
    const skipped = [];
    for (const f of wound.features) {
      const id = f.properties?.[key];
      if (id == null) {
        skipped.push("(no id)");
        continue;
      }
      const d = round(path(f));
      // A null path means the geometry produced nothing drawable. Recorded rather
      // than written as an empty string, which would render an invisible region
      // that looks exactly like a region with no data.
      if (!d) {
        skipped.push(String(id));
        continue;
      }
      paths[String(id)] = d;
    }
    return { paths, skipped, panel };
  };
}

module.exports = {
  PANEL,
  LAYERS,
  SNAP,
  rewind,
  round,
  extentOf,
  flattenedIn,
  makeProjectCollection,
};
