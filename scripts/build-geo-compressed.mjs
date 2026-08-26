#!/usr/bin/env node
// Pre-compress the geometry with brotli (#405-F, TEC-20, iter-45).
//
// WHY BROTLI AND NOT "A CDN". The locked item said "serve geometry from R2". The
// baseline said otherwise, and the baseline won: the origin ALREADY gzips these files
// (825,354 B of districts.geojson arrives as 179,820 B), so the byte win available
// here is brotli over gzip, not origin-vs-edge. Measured across public/geo:
//
//   gzip -9   623.5 KB        brotli q11   398.9 KB        -36.0%
//   districts.geojson  174.9 -> 116.0      states.geojson  95.4 -> 55.3  (-42%)
//
// On the atlas that is ~104 KB off every cold load, about a tenth of the page, with
// no Cloudflare dashboard step and no cross-origin dependency on the heaviest asset
// of an unlaunched site. R2 keeps the half brotli cannot do — edge distribution —
// and is filed for launch, when it can actually be measured. adr-038 records it.
//
// WHY THE FILES STAY IN public/. Measured too: an app route and a public file that
// claim the same URL are not a race, public wins outright. A probe handler at
// /geo/districts.geojson never ran — the static 825,354 B answered. Rather than move
// 2.8 MB of geometry out of public/ and rewire the boundary fingerprint, the centroid
// guard, the family-paths artefact and the build trace with it, the .br siblings live
// beside their originals and app/geodata/[file] serves them. /geo/* keeps working
// exactly as before, which also keeps the raw files linkable.
//
// A .gz IS WRITTEN TOO, and that is not belt-and-braces. Measured: a route handler's
// response is NOT compressed by Next's own `compress: true`, so once the geometry moved
// off the static path a client that accepts gzip but not brotli got the raw 825,354 B —
// a 4.6x REGRESSION hiding inside an optimisation. Both variants are pre-built, so the
// route never compresses at request time and never depends on someone else doing it.
//
//   node scripts/build-geo-compressed.mjs           # write missing/stale .br and .gz
//   node scripts/build-geo-compressed.mjs --check   # verify only, exit 1 if stale
//
// Runs in prebuild, BEFORE next build, so the .br files are traced into standalone.

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO = join(ROOT, "public", "geo");

/** Only the payloads a browser fetches. Everything under public/geo that a page can
 *  request, so adding a layer cannot silently leave it uncompressed. */
const SOURCES = () => readdirSync(GEO).filter((f) => /\.(geojson|json)$/.test(f));

const kb = (n) => (Math.round(n / 102.4) / 10).toFixed(1);

function main() {
  const check = process.argv.includes("--check");
  const files = SOURCES();

  // A run that compresses nothing prints the same summary as a run that compressed
  // everything, so an empty directory is a failure rather than a quiet success —
  // the same rule the other guards in this folder follow.
  if (files.length === 0) {
    console.error(`build-geo-compressed: no .geojson/.json under public/geo — nothing to compress, which is not a pass`);
    process.exit(1);
  }

  let stale = [];
  let wrote = 0;
  let rawTotal = 0;
  let brTotal = 0;
  let gzTotal = 0;

  for (const f of files) {
    const src = join(GEO, f);
    const srcStat = statSync(src);
    rawTotal += srcStat.size;

    // FRESHNESS BY MTIME, and STRICTLY greater. A variant whose mtime merely EQUALS its
    // source's is not provably newer, and treating it as current would keep a stale .br
    // for the life of the deploy — shipping the OLD boundaries under the new file's
    // name, which is the failure mode scripts/check-boundaries.mjs exists to prevent.
    // Equal mtimes therefore recompress: cheap, and it cannot be wrong in the direction
    // that ships wrong geometry.
    const variants = [`${src}.br`, `${src}.gz`];
    const fresh = variants.every((v) => existsSync(v) && statSync(v).mtimeMs > srcStat.mtimeMs);

    if (fresh) {
      brTotal += statSync(variants[0]).size;
      gzTotal += statSync(variants[1]).size;
      continue;
    }

    if (check) {
      stale.push(f);
      continue;
    }

    const raw = readFileSync(src);
    const br = brotliCompressSync(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: srcStat.size,
      },
    });
    const gz = gzipSync(raw, { level: 9 });
    writeFileSync(variants[0], br);
    writeFileSync(variants[1], gz);
    brTotal += br.length;
    gzTotal += gz.length;
    wrote++;
    console.log(`  ${f}: ${kb(srcStat.size)} KB -> ${kb(gz.length)} KB gzip -> ${kb(br.length)} KB brotli`);
  }

  if (check && stale.length) {
    console.error(`build-geo-compressed: ${stale.length} file(s) have no current .br/.gz: ${stale.join(", ")}`);
    console.error(`build-geo-compressed: run \`node scripts/build-geo-compressed.mjs\``);
    process.exit(1);
  }

  console.log(
    `build-geo-compressed: ${check ? "OK (current)" : `${wrote} written, ${files.length - wrote} already current`} — ${files.length} files, ${kb(rawTotal)} KB raw, ${kb(gzTotal)} KB gzip, ${kb(brTotal)} KB brotli`
  );
}

if (process.argv[1] && process.argv[1].endsWith("build-geo-compressed.mjs")) main();
