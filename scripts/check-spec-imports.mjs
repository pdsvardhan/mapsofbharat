#!/usr/bin/env node
// No spec may import a .mjs (#610, iter-45).
//
// WHAT THIS PREVENTS. Playwright compiles every module a spec imports to CommonJS.
// From Node 20.19.5 onward, Node routes a .mjs through the ESM loader whatever that
// compiler produced, so the transformed CommonJS is evaluated in an ESM scope and the
// run dies before a single test executes:
//
//   ReferenceError: exports is not defined in ES module scope
//     at ../scripts/check-centroids.mjs:30
//
// Measured on this repo, same Playwright 1.60.0 throughout: node:20.19.4-slim lists the
// tests, node:20.19.5-slim throws. CI and the production image run 20.20.2; the VAULT7A
// host runs 20.19.2. That gap is why `e2e` was red on main for weeks while the same
// specs passed by hand on the box, and why the ci.yml comment above the Node pin blamed
// Node 22 for something Node 22 did not do.
//
// So the rule is mechanical rather than remembered: shared logic lives in a .cjs the
// spec and the CLI both import, and this refuses the build if a spec reaches for a .mjs
// again. It runs in the `quality` job, which needs nothing but the repo.
//
//   node scripts/check-spec-imports.mjs
//
// WHY IT COUNTS WHAT IT SCANNED. A checker that walks an empty list prints the same
// "OK" as one that walked the real tree — that is the failure this codebase keeps
// finding in its own guards (0x01 control bytes, `grep -q` under pipefail). If the walk
// finds no spec files, something has moved and the guard is no longer guarding, so that
// is a failure and not a pass.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = join(ROOT, "tests");

/** Import forms that actually load a module. A .mjs path mentioned in prose or in an
 *  assertion message is NOT a load — the header comments of the specs this fix touched
 *  name the old .mjs on purpose, and tests/family-paths.spec.ts tells the reader to
 *  "run scripts/build-family-paths.mjs" in an expect() message.
 *
 *  THE SIDE-EFFECT AND TEMPLATE FORMS ARE HERE BECAUSE THE FIRST VERSION MISSED THEM.
 *  It modelled three shapes — a `from` clause, a call-form dynamic import and a
 *  require — and the verifier walked a bare side-effect import and a backtick dynamic
 *  import straight past it, both of which still die on Node >= 20.19.5. A guard that
 *  covers the forms you happened to think of is the same kind of guard as the one that
 *  reported "all inside their polygon" without checking: it passes because it did not
 *  look, and the pass is indistinguishable from a real one.
 *  Covered by tests/spec-import-guard.spec.ts, one case per form. */
const LOADERS = [
  /\bfrom\s+["']([^"']+\.mjs)["']/g,
  /\bimport\s+["']([^"']+\.mjs)["']/g,
  /\bimport\s*\(\s*["'`]([^"'`]+\.mjs)["'`]\s*\)/g,
  /\brequire\s*\(\s*["'`]([^"'`]+\.mjs)["'`]\s*\)/g,
];

// NO COMMENT STRIPPING, DELIBERATELY — AND THIS IS THE SECOND ANSWER TO THAT QUESTION.
//
// Adding the side-effect form to LOADERS made the guard flag one sentence of prose in
// tests/spec-import-guard.spec.ts that spelled the form out literally. The first fix was
// to blank comment LINES before matching. It was wrong: blanking any line starting with
// `*` or `/*` hides a real load, and the verifier proved five of them execute —
// `/* keep */ import "…mjs";`, a continuation line beginning `*`, `import` with the
// namespace clause on the next line, and two more. A guard may fail loudly; it may not
// fail quietly, and that fix bought immunity to prose at the price of a blind spot.
//
// The prose was the thing to change, not the matcher. The fixture already knew how —
// it builds its own specifier at runtime rather than writing one — so the sentence was
// de-literalised and the mechanism deleted. Anything that LOOKS like a load is now
// reported, comment or not, and the way to write about an import in a spec is to not
// write one.

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      found.push(...walk(p));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      found.push(p);
    }
  }
  return found;
}

const files = walk(SPEC_DIR);
const offences = [];
for (const file of files) {
  const src = readFileSync(file, "utf-8");
  for (const re of LOADERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split("\n").length;
      offences.push(`${relative(ROOT, file)}:${line} imports ${m[1]}`);
    }
  }
}

if (files.length === 0) {
  console.error(`check-spec-imports: scanned NO files under ${relative(ROOT, SPEC_DIR)} — the guard is not guarding anything`);
  process.exit(1);
}

if (offences.length) {
  console.error(`check-spec-imports: ${offences.length} spec import(s) of a .mjs — these break under Node >= 20.19.5:`);
  for (const o of offences) console.error(`  ${o}`);
  console.error(`\ncheck-spec-imports: move the shared logic into a .cjs both the spec and the CLI import (see scripts/lib/), rather than importing the .mjs`);
  process.exit(1);
}

console.log(`check-spec-imports: OK — ${files.length} files under ${relative(ROOT, SPEC_DIR)}, none imports a .mjs`);
