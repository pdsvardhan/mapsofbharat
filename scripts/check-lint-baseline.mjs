#!/usr/bin/env node
// Hold the line on lint, and ratchet it down (405-D).
//
//   node scripts/check-lint-baseline.mjs            verify against the baseline
//   node scripts/check-lint-baseline.mjs --write     record the current count
//
// WHY NOT JUST `eslint` IN CI. This repo carries a real, long-standing backlog —
// mostly `any` in the MapLibre glue and vendored matplotlib JS under
// pipeline/.venv — so a blocking `eslint` would fail every commit and a
// non-blocking one blocks nothing. The workflow did the second: `npm run lint ||
// echo "lint warnings (non-blocking)"`, which means a commit could add fifty new
// problems and CI stayed green. That is a check that cannot fail, which is the
// failure mode this project keeps re-learning.
//
// A ratchet gives both properties at once: the backlog does not block work, and
// it can only ever shrink. Adding a problem fails. Removing problems fails too —
// deliberately — because a baseline nobody lowers drifts back into meaninglessness
// within a month; the failure tells you to bank the win by committing the smaller
// number.
//
// The baseline is a COUNT, not a snapshot of which lines are dirty. That is the
// honest tradeoff and it is worth stating: swapping one problem for a different
// problem passes. Catching that needs per-rule or per-file baselines, which is a
// much larger mechanism than the gap justifies today.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = resolve(REPO, "scripts/lint-baseline.json");
const write = process.argv.includes("--write");

let raw;
try {
  raw = execFileSync("npx", ["eslint", "--format", "json"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // eslint exits non-zero when it finds errors, which is the normal case here.
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  raw = e.stdout;
  if (!raw) {
    console.error("check-lint-baseline: eslint produced no JSON output");
    console.error(String(e.stderr || e.message).slice(0, 2000));
    process.exit(2);
  }
}

let results;
try {
  results = JSON.parse(raw);
} catch {
  console.error("check-lint-baseline: could not parse eslint JSON output");
  process.exit(2);
}

let errors = 0;
let warnings = 0;
for (const f of results) {
  errors += f.errorCount ?? 0;
  warnings += f.warningCount ?? 0;
}
const total = errors + warnings;

if (write) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total, errors, warnings, recorded: new Date().toISOString().slice(0, 10) }, null, 2) + "\n"
  );
  console.log(`check-lint-baseline: recorded ${total} (${errors} errors, ${warnings} warnings)`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`check-lint-baseline: ${BASELINE} missing. Record it with --write.`);
  process.exit(2);
}

if (total > base.total) {
  console.error(
    `\ncheck-lint-baseline: lint problems went UP — ${base.total} -> ${total} ` +
      `(+${total - base.total})\n`
  );
  // Name the files that carry problems, newest offender first, so the message is
  // actionable without a second command.
  const offenders = results
    .filter((f) => (f.errorCount ?? 0) + (f.warningCount ?? 0) > 0)
    .map((f) => ({ file: f.filePath.replace(REPO + "/", ""), n: (f.errorCount ?? 0) + (f.warningCount ?? 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  for (const o of offenders) console.error(`  ${String(o.n).padStart(4)}  ${o.file}`);
  console.error("\n  Fix them, or if they are genuinely acceptable, say so explicitly:");
  console.error("    node scripts/check-lint-baseline.mjs --write   (and explain it in the commit)\n");
  process.exit(1);
}

if (total < base.total) {
  console.error(
    `\ncheck-lint-baseline: lint problems went DOWN — ${base.total} -> ${total} ` +
      `(-${base.total - total}). Bank it:\n\n    node scripts/check-lint-baseline.mjs --write\n\n` +
      `  Failing on an improvement is deliberate: a baseline nobody lowers stops\n` +
      `  meaning anything, and the ratchet only works if it actually ratchets.\n`
  );
  process.exit(1);
}

console.log(`check-lint-baseline: OK — ${total} problems (${errors} errors, ${warnings} warnings), at the baseline`);
