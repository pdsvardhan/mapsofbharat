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
//   node scripts/check-centroids.mjs          # verify, exit 1 on any failure
//
// The containment logic itself lives in scripts/lib/centroid-containment.cjs, and
// tests/centroid-containment.spec.ts mutation-tests it THERE. The split is not
// tidiness: a spec that imports a .mjs breaks under Node >= 20.19.5 (#610, iter-45),
// and the header of that file records the measurement.

import { checkAll } from "./lib/centroid-containment.cjs";

function main() {
  let problems = 0;
  // A skip is not a pass, and the difference has to be counted to be visible (#602).
  // Measured before this line existed: with an empty public/geo, all four layers
  // printed SKIP and the script still printed "check-centroids: OK" and exited 0 —
  // a build being told its centroids are contained on the strength of zero points.
  let layersChecked = 0;
  let pointsChecked = 0;
  const skipped = [];
  console.log("check-centroids: every point inside its own polygon");
  for (const r of checkAll()) {
    if (r.absent) {
      console.log(`  ${r.layer}: SKIP (source or output not present)`);
      skipped.push(r.layer);
      continue;
    }
    layersChecked += 1;
    pointsChecked += r.checked;
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
  if (layersChecked === 0 || pointsChecked === 0) {
    console.error(`\ncheck-centroids: checked 0 points. Every layer was skipped: ${skipped.join(", ") || "(none found at all)"}.`);
    console.error("  Nothing was measured, so there is nothing to report as OK. A build that");
    console.error("  cannot find its geometry must not be told its centroids are contained —");
    console.error("  the guarantee this guard exists to make is precisely the one it did not make.");
    process.exit(2);
  }
  console.log(`check-centroids: OK — ${pointsChecked} points across ${layersChecked} layer(s), all inside their polygon`);
}

// Run as a CLI, stay quiet when imported.
if (process.argv[1] && process.argv[1].endsWith("check-centroids.mjs")) main();
