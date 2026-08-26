#!/usr/bin/env node
// Precompute SVG path data for the small-multiple grid (#547 phase B, adr-d3geo).
//
// WHY THIS EXISTS AS A BUILD STEP. A family grid is eight or nine panels of the
// same India differing only in fill, so the geometry is projected ONCE and the
// paths reused. d3-geo does that projection — and adr-d3geo admits d3-geo only
// as a devDependency, which is only honest if nothing at runtime imports it.
//
// The route cannot be statically generated: .dockerignore excludes `data`, so the
// store is absent at build and the page must render per request (the same reason
// app/metric/[slug]/page.tsx:49 is force-dynamic). Anything that route imports is
// therefore a RUNTIME dependency. So the projection moves here instead, where it
// reads only public/geo — which IS in the build context — and emits a static
// artifact the route can read without importing d3-geo at all.
//
// Values are the other half and need no projection: the route reads them from the
// DB per request and applies fills to paths it did not compute.
//
//   node scripts/build-family-paths.mjs          # write
//   node scripts/build-family-paths.mjs --check  # verify only, exit 1 if stale
//
// Runs in prebuild alongside the other check-*.mjs guards.
//
// The projection and snapping logic lives in scripts/lib/family-path-projection.cjs,
// where tests/family-paths.spec.ts mutation-tests it. The split is not tidiness: a
// spec that imports a .mjs breaks under Node >= 20.19.5 (#610, iter-45), and that
// file's header records the measurement. d3-geo is imported HERE, natively, and
// handed to the factory — the library stays ESM-only and the pure half stays
// loader-agnostic.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geoMercator, geoPath } from "d3-geo";

import {
  PANEL,
  LAYERS,
  SNAP,
  flattenedIn,
  makeProjectCollection,
} from "./lib/family-path-projection.cjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO = join(ROOT, "public", "geo");
const OUT = join(GEO, "district-paths.json");

const projectCollection = makeProjectCollection({ geoMercator, geoPath });

function build() {
  const out = { generated: new Date().toISOString(), panel: PANEL, layers: {} };
  let problems = 0;

  for (const { src, key, out: name } of LAYERS) {
    const p = join(GEO, src);
    if (!existsSync(p)) {
      console.error(`  ${src}: MISSING`);
      problems++;
      continue;
    }
    const fc = JSON.parse(readFileSync(p, "utf-8"));
    const { paths, skipped } = projectCollection(fc, key);
    const n = Object.keys(paths).length;

    // THE SNAP GUARD (iter-41 item 976). Snapping trades precision for bytes, and
    // the thing it can silently destroy is a district small enough to fall inside
    // one grid cell. Counting outputs would not notice: the path is still there,
    // still a string, still counted — it just spans nothing. So this measures the
    // EXTENT of every shipped path and refuses a build where any district has
    // been flattened to a line or a point.
    const flattened = flattenedIn(paths);
    if (flattened.length) {
      console.error(
        `  ${src}: ${flattened.length} district(s) FLATTENED by the ${SNAP}px snap: ${flattened.slice(0, 6).join(", ")}`
      );
      console.error(`  ${src}: lower SNAP in scripts/lib/family-path-projection.cjs — a district that spans nothing is a district missing from every panel`);
      problems += flattened.length;
    }

    if (skipped.length) {
      console.error(`  ${src}: ${skipped.length} feature(s) produced no path: ${skipped.slice(0, 6).join(", ")}`);
      problems += skipped.length;
    }
    if (n === 0) {
      console.error(`  ${src}: projected NOTHING`);
      problems++;
      continue;
    }
    out.layers[name] = paths;
    console.log(`  ${src}: ${n} paths`);
  }
  return { out, problems };
}

function main() {
  const check = process.argv.includes("--check");
  console.log(`build-family-paths: ${check ? "checking" : "writing"} projected paths`);
  const { out, problems } = build();

  if (problems) {
    console.error(`\nbuild-family-paths: ${problems} problem(s)`);
    process.exit(1);
  }

  if (check) {
    if (!existsSync(OUT)) {
      console.error(`\nbuild-family-paths: ${OUT} MISSING — run without --check`);
      process.exit(1);
    }
    const cur = JSON.parse(readFileSync(OUT, "utf-8"));
    // CONTENT, not cardinality. Counting paths per layer cannot see a path that is
    // still present and has been FLATTENED on disk: the count matches, --check
    // prints OK, and the build ships a region that draws nothing. Proved by
    // flattening one district in the artefact by hand and watching the old check
    // pass it with exit 0.
    for (const name of Object.keys(out.layers)) {
      const fresh = out.layers[name];
      const disk = cur.layers?.[name] ?? {};
      const a = Object.keys(fresh).length;
      const b = Object.keys(disk).length;
      if (a !== b) {
        console.error(`\nbuild-family-paths: ${name} STALE — ${b} on disk vs ${a} from source`);
        process.exit(1);
      }
      const differing = Object.keys(fresh).filter((id) => fresh[id] !== disk[id]);
      if (differing.length) {
        console.error(
          `
build-family-paths: ${name} STALE — ${differing.length} path(s) differ from source: ${differing.slice(0, 6).join(", ")}`
        );
        process.exit(1);
      }
    }
    console.log("build-family-paths: OK (current)");
    return;
  }

  writeFileSync(OUT, JSON.stringify(out));
  console.log(`build-family-paths: wrote ${OUT}`);
}

if (process.argv[1] && process.argv[1].endsWith("build-family-paths.mjs")) main();
