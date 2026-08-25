#!/usr/bin/env node
/**
 * Boundary-compliance gate (to-do #405, V2 hardening). Blocks a bad-boundary commit.
 *
 * Three layers, dependency-free (node built-ins only, so it runs early in CI):
 *   1. checksum      — sha256 of each boundary geojson (any byte change is noticed).
 *   2. fingerprint   — feature count, bbox, vertex count, a coordinate checksum, and an
 *                      id-set hash, compared to the committed golden. A structural change
 *                      (added/removed/edited geometry) fails even if the file was reformatted.
 *   3. SoI asserts   — Survey-of-India invariants enforced ALWAYS, even under --write, so an
 *                      intentional edit still cannot silently crop claimed territory
 *                      (Jammu & Kashmir, Ladakh, Aksai Chin, Arunachal Pradesh).
 *
 * Usage:
 *   node scripts/check-boundaries.mjs           verify (exit 1 on drift or SoI violation)
 *   node scripts/check-boundaries.mjs --write    regenerate the golden after an INTENTIONAL,
 *                                                reviewed boundary change (SoI asserts still run)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const FILES = { states: "public/geo/states.geojson", districts: "public/geo/districts.geojson" };
const GOLDEN = "scripts/boundary-fingerprint.json";
const ID_PROP = { states: "st_code", districts: "rid" };

// Survey-of-India runtime invariants — enforced on every run, including --write, so a
// regenerated golden can never accept boundaries that crop claimed territory. Loose extents.
const SOI = {
  states: {
    feature_count: 36,
    require_codes: ["01", "12", "38"], // J&K, Arunachal Pradesh, Ladakh
    max_lat_at_least: 36.5, // north: Ladakh / Aksai Chin (true extent ~37.08)
    max_lon_at_least: 97.0, // east: Arunachal Pradesh (true extent ~97.39)
    min_lat_at_most: 8.5,   // south: mainland tip / islands
    min_lon_at_most: 69.5,  // west: Gujarat / Rajasthan
  },
  districts: { feature_count: 735 },
};

const sha = (s) => createHash("sha256").update(s).digest("hex");

function eachCoord(geom, cb) {
  const walk = (a) => {
    if (typeof a[0] === "number") { cb(a[0], a[1]); return; }
    for (const x of a) walk(x);
  };
  if (geom && geom.coordinates) walk(geom.coordinates);
}

function fingerprint(path, idProp) {
  const raw = readFileSync(path, "utf8");
  const gj = JSON.parse(raw);
  const feats = gj.features;
  let verts = 0, csum = 0;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const ids = [];
  const propRows = [];
  for (const f of feats) {
    ids.push(String(f.properties?.[idProp] ?? ""));
    // Deterministic regardless of key order in the source file.
    //
    // THIS FILE USES TWO LITERAL CONTROL BYTES AS SEPARATORS, AND BOTH ARE
    // DELIBERATE: 0x01 (SOH) joins key=value pairs within a row, just below, and
    // 0x02 (STX) joins the rows themselves further down. They nest, which is the
    // whole point — a row separator that could appear inside a row would let two
    // different property sets fingerprint identically.
    // It joins property key=value pairs into one fingerprint row, and it is
    // chosen precisely because no district name, state name or code can contain
    // it — a printable separator like "|" or "," could collide with real data
    // and make two different property sets fingerprint identically, which in
    // this file means a changed boundary passing the gate.
    //
    // Neither can occur in a district name, a state name or a code, which is
    // exactly why they were chosen over "|" or ",".
    //
    // Flagged here because iter-43 found the 0x01 used by ACCIDENT in
    // scripts/backup-offbox.sh and scripts/restore-drill.sh, where a sed
    // replacement should have read backslash-1 — and a blanket "strip the
    // control bytes" sweep would silently change this fingerprint and break the
    // Survey-of-India boundary gate. BOTH of these stay. (The first version of
    // this label named only the 0x01 — so a sweep following it would still have
    // corrupted the 0x02 eleven lines down. Caught by the iter-43 code verifier.)
    const props = f.properties ?? {};
    propRows.push(
      Object.keys(props).sort().map((k) => k + "=" + String(props[k])).join("")
    );
    eachCoord(f.geometry, (lon, lat) => {
      verts++;
      csum += Math.round(lon * 1e4) + Math.round(lat * 1e4);
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    });
  }
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  const propBlob = propRows.slice().sort().join("");
  return {
    sha256: sha(raw),
    feature_count: feats.length,
    bbox: [r4(minLon), r4(minLat), r4(maxLon), r4(maxLat)],
    vertex_count: verts,
    coord_checksum: csum,
    ids_sha256: sha(ids.slice().sort().join(",")),
    // Every NON-geometry property, hashed. Without this a property rename or blanking
    // passes as a "reformat": the geometry is untouched, so feature_count, bbox,
    // vertex_count and coord_checksum all match, and ids_sha256 only covers the ONE
    // property used as the id. Proven 2026-08-20 by renaming "st_nm" to "st_nm " —
    // which blanks every state name on the map — and watching the gate print PASS with
    // the reassuring note that the file had merely been reformatted. Boundary
    // compliance is about what the map SAYS as much as where its lines fall.
    props_sha256: sha(propBlob),
    _codes: [...new Set(ids)],
  };
}

const fails = [];
const fail = (m) => fails.push(m);

// SoI runtime asserts (always) — the anti-crop guard
function assertSoI(key, fp) {
  const s = SOI[key];
  if (fp.feature_count !== s.feature_count)
    fail(`${key}: feature_count ${fp.feature_count} != required ${s.feature_count}`);
  for (const c of s.require_codes ?? [])
    if (!fp._codes.includes(c)) fail(`${key}: missing required Survey-of-India code ${c}`);
  const [mnLon, mnLat, mxLon, mxLat] = fp.bbox;
  if (s.max_lat_at_least != null && mxLat < s.max_lat_at_least)
    fail(`${key}: northern extent cropped (maxLat ${mxLat} < ${s.max_lat_at_least}) — Ladakh/Aksai Chin`);
  if (s.max_lon_at_least != null && mxLon < s.max_lon_at_least)
    fail(`${key}: eastern extent cropped (maxLon ${mxLon} < ${s.max_lon_at_least}) — Arunachal Pradesh`);
  if (s.min_lat_at_most != null && mnLat > s.min_lat_at_most)
    fail(`${key}: southern extent cropped (minLat ${mnLat} > ${s.min_lat_at_most})`);
  if (s.min_lon_at_most != null && mnLon > s.min_lon_at_most)
    fail(`${key}: western extent cropped (minLon ${mnLon} > ${s.min_lon_at_most})`);
}

const current = {};
for (const [key, path] of Object.entries(FILES)) {
  const fp = fingerprint(path, ID_PROP[key]);
  assertSoI(key, fp);
  delete fp._codes; // internal
  current[key] = fp;
}

const write = process.argv.includes("--write");
if (write) {
  if (fails.length) {
    console.error("REFUSING --write: Survey-of-India invariants violated:");
    for (const m of fails) console.error("  - " + m);
    process.exit(1);
  }
  writeFileSync(GOLDEN, JSON.stringify(current, null, 2) + "\n");
  console.log("wrote golden boundary fingerprint -> " + GOLDEN);
  process.exit(0);
}

// verify against golden
let golden;
try { golden = JSON.parse(readFileSync(GOLDEN, "utf8")); }
catch { fail(`golden fingerprint missing (${GOLDEN}); run --write to create it`); }

if (golden) {
  for (const key of Object.keys(FILES)) {
    const g = golden[key], c = current[key];
    if (!g) { fail(`${key}: no golden entry`); continue; }
    for (const field of ["feature_count", "vertex_count", "coord_checksum", "ids_sha256", "props_sha256", "sha256"]) {
      if (JSON.stringify(g[field]) !== JSON.stringify(c[field])) {
        // sha256-only drift with structure intact = a reformat: warn, don't fail
        if (field === "sha256") { console.warn(`NOTE ${key}: sha256 changed but geometry is structurally identical (reformat).`); continue; }
        fail(`${key}: ${field} drift  golden=${g[field]}  current=${c[field]}`);
      }
    }
    if (JSON.stringify(g.bbox) !== JSON.stringify(c.bbox))
      fail(`${key}: bbox drift  golden=${JSON.stringify(g.bbox)}  current=${JSON.stringify(c.bbox)}`);
  }
}

if (fails.length) {
  console.error("BOUNDARY GATE: FAIL");
  for (const m of fails) console.error("  - " + m);
  console.error("\nIf this boundary change is intentional and reviewed, run:  node scripts/check-boundaries.mjs --write");
  console.error("(the Survey-of-India extent asserts run even then, so a cropped map still cannot pass.)");
  process.exit(1);
}
console.log("BOUNDARY GATE: PASS — states + districts match golden; Survey-of-India extents intact.");
