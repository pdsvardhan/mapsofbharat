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
 *  It modelled three shapes — `from "x"`, `import("x")`, `require("x")` — and the
 *  verifier got a bare `import "../scripts/check-centroids.mjs";` and a backtick
 *  `import(\`…\`)` past it, both of which still die on Node >= 20.19.5. A guard that
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

/**
 * Blank out comment LINES before matching, keeping the line count intact so an
 * offence still reports the line it is on.
 *
 * WHY LINES AND NOT CHARACTERS. Adding the side-effect form to LOADERS immediately
 * flagged the sentence in tests/spec-import-guard.spec.ts that NAMES the side-effect
 * form — the guard tripping over its own documentation. The obvious fix, stripping
 * from `//` to end of line, can eat a real import that follows a string containing
 * `//` on the same line; that is a false NEGATIVE, and a guard may fail loudly but
 * never quietly. Skipping whole comment lines cannot hide anything, because an import
 * statement is never on a line that begins with `//` or ` * `.
 *
 * The residue is a false POSITIVE: an import written inside a block comment whose
 * lines carry no ` * ` prefix is still reported. That direction is safe — it stops the
 * build and a human rewords a comment — and tests/spec-import-guard.spec.ts pins it so
 * the choice is visible rather than accidental.
 */
function withoutCommentLines(src) {
  return src
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : line;
    })
    .join("\n");
}

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
  const src = withoutCommentLines(readFileSync(file, "utf-8"));
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
