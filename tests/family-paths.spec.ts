import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// The script is plain .mjs (it runs in prebuild, before any TS step), so its
// exports arrive untyped and are narrowed here at the boundary.
import {
  LAYERS,
  PANEL,
  SNAP,
  extentOf,
  projectCollection,
  rewind,
  round,
} from "../scripts/build-family-paths.mjs";

type Paths = Record<string, string>;
type Layer = { src: string; key: string; out: string };
const project = (fc: unknown, key: string) =>
  projectCollection(fc, key) as unknown as { paths: Paths; skipped: string[] };

// #547 phase B — the projected-path artefact (adr-d3geo).
//
// d3-geo is a devDependency and must stay one, so the projection happens here at
// build time and the route reads a static artefact instead of importing it. These
// assert the artefact is real, complete and shares ONE projection — the property
// that makes a small multiple a small multiple rather than a grid of unrelated
// blobs.

const GEO = join(process.cwd(), "public", "geo");
const artefact = () => JSON.parse(readFileSync(join(GEO, "district-paths.json"), "utf-8"));

/** Two squares far apart, so a shared fit and a per-feature fit give visibly
 *  different answers. */
const TWO_SQUARES = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { rid: "A" },
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    },
    {
      type: "Feature",
      properties: { rid: "B" },
      geometry: { type: "Polygon", coordinates: [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]] },
    },
  ],
};

test.describe("#547 the projection is shared across panels", () => {
  test("one projection fits the WHOLE collection, not each feature", () => {
    const { paths } = project(TWO_SQUARES, "rid");
    expect(Object.keys(paths).sort()).toEqual(["A", "B"]);

    const xs = (d: string) =>
      [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, i) => i % 2 === 0);
    const a = xs(paths.A);
    const b = xs(paths.B);
    // Fitted together, the two squares land in different parts of the box. Fitted
    // individually each would fill it, and every panel would show the same shape
    // in the same place — which is exactly the failure this guards.
    expect(Math.max(...a)).toBeLessThan(Math.min(...b));
  });

  test("a feature with no id is skipped and reported, not written blank", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        ...TWO_SQUARES.features,
        { type: "Feature", properties: {}, geometry: TWO_SQUARES.features[0].geometry },
      ],
    };
    const { paths, skipped } = project(fc, "rid");
    expect(Object.keys(paths)).toHaveLength(2);
    expect(skipped).toContain("(no id)");
  });

  // iter-41 item 976 replaced 0.1-rounding with a 0.5px grid snap plus two
  // point-level reductions. The old assertion here encoded the old contract
  // ("M1.2,3L3.1,4") and is updated, not deleted.
  test("snapping trims precision without mangling the path", () => {
    expect(round("M1.23456,2.98765L3.1,4.0")).toBe("M1,3L3,4");
    expect(round(null)).toBeNull();
    // command letters survive on a shape that has any
    expect(round("M0.55,0.55L9,0.55L9,9Z")).toMatch(/^M[\d.]+,[\d.]+(?:L[\d.]+,[\d.]+)+Z$/);
  });

  test("a subpath that draws nothing is never emitted", () => {
    // One point is a moveto with no line.
    expect(round("M0.55,0.55Z")).toBe("");
    // Two identical points is the case that actually shipped. Snapping made
    // (78.2,99.1) (78.6,99.4) (78.1,99.0) into (78,99) (78.5,99.5) (78,99); all
    // three are distinct so the dedupe left them alone; the middle one is exactly
    // collinear so it went; and the survivors were written out as a zero-extent
    // "M78,99L78,99Z". Three district subpaths and two state paths did this.
    expect(round("M78.2,99.1L78.6,99.4L78.1,99.0Z")).toBe("");

    // THE INVARIANT, asserted on the shipped artefact rather than on a fixture:
    // no subpath anywhere spans nothing. A count would not catch this — the bad
    // subpaths were present and counted, they simply had no area.
    const layers = artefact().layers as Record<string, Paths>;
    const empty: string[] = [];
    for (const [name, layer] of Object.entries(layers)) {
      for (const [id, d] of Object.entries(layer)) {
        for (const m of d.matchAll(/M([^MZ]*)(Z?)/g)) {
          // ZERO AREA, matching the rule the script states rather than the
          // condition it happened to use. The spec previously mirrored the
          // implementation (`w <= 0 && h <= 0`), so it structurally could not see
          // the three 0-by-0.5 line subpaths that were shipping.
          const { w, h } = extentOf(m[1]) as { w: number; h: number };
          if (w <= 0 || h <= 0) empty.push(`${name}/${id} ${w}x${h}`);
        }
      }
    }
    expect(empty, "subpaths with zero extent").toEqual([]);
  });

  test("no district loses all of its geometry", () => {
    // The other half of the rule above: dropping empty subpaths must never drop a
    // whole district, so every one of the 735 still has something to draw.
    const layer = artefact().layers.district as Paths;
    const gone = Object.entries(layer).filter(([, d]) => !d || !d.includes("M"));
    expect(gone.map(([id]) => id), "districts left with no geometry").toEqual([]);
    expect(Object.keys(layer).length).toBe(735);
  });

  test("every coordinate in the SHIPPED artefact lands on the snap grid", () => {
    // Rewritten (iter-41). The old version ran round() on a fixture and then
    // divided by SNAP — so it passed at ANY tolerance and said nothing about the
    // file that ships. It asserted that a function is consistent with itself.
    //
    // The grid is written as a literal 0.5 on purpose: deriving it from SNAP is
    // what made the old assertion vacuous. If the tolerance is deliberately
    // changed, this number changes with it, and that edit is the point.
    const GRID = 0.5;
    const layers = artefact().layers as Record<string, Paths>;
    const offGrid: string[] = [];
    for (const [name, layer] of Object.entries(layers)) {
      for (const [id, d] of Object.entries(layer)) {
        for (const n of d.match(/-?[\d.]+/g) ?? []) {
          const v = Number(n) / GRID;
          if (Math.abs(v - Math.round(v)) > 1e-9) offGrid.push(`${name}/${id}:${n}`);
        }
      }
    }
    expect(offGrid.slice(0, 5), "coordinates off the 0.5px grid").toEqual([]);
    expect(SNAP, "SNAP moved without this assertion being updated").toBe(GRID);
  });

  test("neighbours that snap onto the same point collapse to one", () => {
    // 5.1 and 5.2 both snap to 5.0 — two points become one, and the path must
    // not carry a lineto that goes nowhere.
    expect(round("M0,0L5.1,5.1L5.2,5.2L10,0Z")).toBe("M0,0L5,5L10,0Z");

    // A duplicate at the END of a subpath, which is the position no rule reaches
    // by looking forward. NOTE (iter-41): there is no longer a separate dedupe
    // pass to pin — removing it left the artefact byte-identical, so it went, and
    // BOTH of these assertions are now killed by disabling the COLLINEAR rule.
    // The old comment here claimed this line pinned a branch that no longer
    // exists.
    expect(round("M0,0L5,5L5,5Z")).toBe("M0,0L5,5Z");
  });

  test("a vertex exactly on the line between its neighbours is dropped", () => {
    // The middle point adds nothing to the outline, so removing it cannot move
    // the shape — which is why this reduction is safe on shared borders.
    expect(round("M0,0L5,0L10,0L10,10Z")).toBe("M0,0L10,0L10,10Z");
  });

  test("a vertex OFF the line is kept", () => {
    // The guard against the reduction above being too eager: bend the middle
    // point and it must survive.
    expect(round("M0,0L5,5L10,0L10,10Z")).toBe("M0,0L5,5L10,0L10,10Z");
  });

  test("no shipped district is flattened by the snap", () => {
    // THE POINT OF THE WHOLE ITEM. Snapping destroys shapes smaller than one
    // grid cell, and a destroyed district still counts as a path — it just spans
    // nothing. 1px was rejected during item 976 precisely because it collapsed
    // district 26_494, which measures 0.5x0.3px at full resolution.
    const layer = artefact().layers.district as Paths;
    const flat: string[] = [];
    for (const [id, d] of Object.entries(layer)) {
      const { w, h, points } = extentOf(d) as { w: number; h: number; points: number };
      if (points < 3 || w <= 0 || h <= 0) flat.push(`${id} ${w}x${h}`);
    }
    expect(flat, "districts flattened to nothing").toEqual([]);
  });
});

test.describe("#547 the shipped artefact is complete", () => {
  test("it exists and covers every layer the script declares", () => {
    expect(existsSync(join(GEO, "district-paths.json")), "run scripts/build-family-paths.mjs").toBe(true);
    const a = artefact();
    for (const { out } of LAYERS as Layer[]) {
      expect(a.layers[out], `${out} layer missing`).toBeTruthy();
      expect(Object.keys(a.layers[out]).length, `${out} is empty`).toBeGreaterThan(0);
    }
    expect(a.panel).toEqual(PANEL);
  });

  test("every source region has a path, none silently dropped", () => {
    const a = artefact();
    for (const { src, key, out } of LAYERS as Layer[]) {
      const fc = JSON.parse(readFileSync(join(GEO, src), "utf-8"));
      const ids = new Set<string>(
        (fc.features as { properties: Record<string, unknown> }[]).map((f) =>
          String(f.properties[key])
        )
      );
      const got = new Set(Object.keys(a.layers[out]));
      const missing = [...ids].filter((id) => !got.has(id));
      expect(missing, `${out}: regions with no path`).toEqual([]);
    }
  });

  test("every path is drawable, not an empty string", () => {
    const a = artefact();
    for (const { out } of LAYERS as Layer[]) {
      for (const [id, d] of Object.entries(a.layers[out] as Paths)) {
        const path = d as string;
        expect(path.length, `${out}/${id} is empty`).toBeGreaterThan(10);
        expect(path.startsWith("M"), `${out}/${id} is not a path`).toBe(true);
      }
    }
  });

  test("coordinates carry at most one decimal", () => {
    // The size measure. A regression here quietly doubles the page.
    // EVERY path, both layers. This sampled the first 40 of 735 and a regression
    // in insertion-order district #226 survived it while #0 killed it — a check
    // that covered 5% of what its name claims.
    const layers = artefact().layers as Record<string, Paths>;
    const overlong: string[] = [];
    for (const [name, layer] of Object.entries(layers)) {
      for (const [id, d] of Object.entries(layer)) {
        for (const m of d.matchAll(/\d+\.(\d{2,})/g)) overlong.push(`${name}/${id}:${m[0]}`);
      }
    }
    expect(overlong.slice(0, 5), "more than one decimal place").toEqual([]);
  });
});

test.describe("#547 rings are wound the way d3-geo expects", () => {
  // The bug this exists for: RFC 7946 winds an exterior ring counter-clockwise,
  // d3-geo's spherical geoPath takes the opposite convention, and a backwards
  // ring does not draw a small polygon — it draws the ENTIRE REST OF THE SPHERE.
  //
  // The first run of this script reported "735 paths", exited 0, and every one of
  // those 735 spanned the full panel. Each family panel would have rendered as a
  // solid filled rectangle with a perfectly green build. Counting outputs proved
  // nothing about them; only measuring their extent did.

  test("no shipped path covers the whole panel", () => {
    const a = artefact();
    for (const { out } of LAYERS as Layer[]) {
      const covering: string[] = [];
      for (const [id, d] of Object.entries(a.layers[out] as Paths)) {
        const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
        const xs = n.filter((_, i) => i % 2 === 0);
        const ys = n.filter((_, i) => i % 2 === 1);
        const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        // A region spanning most of the viewport is the complement, not a region.
        if (area > 0.9 * PANEL.width * PANEL.height) covering.push(id);
      }
      expect(covering.slice(0, 5), `${out}: paths spanning the whole panel`).toEqual([]);
    }
  });

  test("regions are small relative to the panel, as 735 pieces of India must be", () => {
    const a = artefact();
    const areas = Object.values(a.layers.district as Paths).map((d) => {
      const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
      const xs = n.filter((_, i) => i % 2 === 0);
      const ys = n.filter((_, i) => i % 2 === 1);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    });
    areas.sort((x, y) => x - y);
    const median = areas[Math.floor(areas.length / 2)];
    expect(median, "median district should be a small share of the panel").toBeLessThan(
      0.05 * PANEL.width * PANEL.height
    );
    expect(median, "but not degenerate").toBeGreaterThan(0);
  });

  test("rewind flips a backwards ring and leaves a correct one alone", () => {
    const ccw = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const flipped = rewind(ccw) as { coordinates: number[][][] };
    expect(flipped.coordinates[0]).not.toEqual(ccw.coordinates[0]);
    // idempotent: rewinding the corrected ring changes nothing further
    expect((rewind(flipped) as { coordinates: number[][][] }).coordinates[0]).toEqual(
      flipped.coordinates[0]
    );
  });
});
