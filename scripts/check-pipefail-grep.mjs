// Refuse `cmd | grep -q` in any script that sets pipefail (#609).
//
// The mechanism, and why a local fix was never enough, is in
// scripts/lib/pipefail-grep.cjs. This is the walk.
//
// WHY IT COUNTS WHAT IT SCANNED. A checker that walks an empty list prints exactly
// the same "OK" as one that walked the real tree. That is the failure this codebase
// keeps finding in its own guards — 0x01 control bytes in the backup verifiers, a
// measurement that degraded to a SKIP inside an `if` — and it is indistinguishable
// from a real pass unless the count is part of the verdict. So a walk that finds no
// scripts is a FAILURE here, not a pass.
//
//   node scripts/check-pipefail-grep.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { findEarlyExitPipelines } from "./lib/pipefail-grep.cjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// .next-runs holds hardlink copies of the whole repo staged for a test run (#607);
// scanning them would report every finding twice and would flag files that are the
// same inode as one already scanned.
const SKIP = new Set([
  "node_modules", ".git", ".next", ".next-runs", "out", "coverage",
  ".venv", "__pycache__", "test-results", "pipeline",
]);

/** @returns {string[]} absolute paths of every .sh under the tree */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (entry.endsWith(".sh")) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT);

if (files.length === 0) {
  console.error("check-pipefail-grep: found no .sh files to scan.");
  console.error("  Something has moved. A guard that scanned nothing has not passed;");
  console.error("  it has failed to run, and those two must never print the same thing.");
  process.exit(2);
}

let offences = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  for (const hit of findEarlyExitPipelines(readFileSync(file, "utf8"))) {
    offences += 1;
    console.error(`${rel}:${hit.line}: ${hit.text}`);
  }
}

if (offences > 0) {
  console.error("");
  console.error(`check-pipefail-grep: ${offences} early-exit pipeline(s) under pipefail.`);
  console.error("  `grep -q` exits as soon as it has an answer; the writer upstream takes");
  console.error("  SIGPIPE, and pipefail reports the WRITER's 141. So the pipeline fails");
  console.error("  exactly when the match came quickly — an answer that inverts under load.");
  console.error("");
  console.error("  Remove the pipe rather than the -q:");
  console.error("    [ -n \"$(cmd)\" ]                 # anything at all on stdout");
  console.error("    grep -qx -- \"$n\" <<<\"$list\"      # a here-string is not a pipe");
  console.error("    [ \"$(cmd | grep -c PATTERN)\" -gt 0 ]   # grep -c reads to EOF");
  process.exit(1);
}

console.log(`check-pipefail-grep: OK — ${files.length} shell script(s) scanned, no early-exit pipelines under pipefail`);
