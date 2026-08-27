// Refuse early-exit pipelines — `cmd | grep -q`, `| head -N`, `| grep -m N`,
// `| read` — in any script that runs under pipefail (#609).
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
// WHY IT PRINTS THE LATENT ONES. `x="$(cmd | head -1)"` drops the pipeline's status
// on the floor, so it is not a live bug and the detector says so (the exemption and
// its limits are documented in the library). But an exemption nobody can see is a
// skip, and a silent skip reads exactly like a pass. They are listed every run.
//
//   node scripts/check-pipefail-grep.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { findEarlyExitPipelines, sourcedUnderPipefail } from "./lib/pipefail-grep.cjs";

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

const files = walk(ROOT).map((path) => ({ path, source: readFileSync(path, "utf8") }));

if (files.length === 0) {
  console.error("check-pipefail-grep: found no .sh files to scan.");
  console.error("  Something has moved. A guard that scanned nothing has not passed;");
  console.error("  it has failed to run, and those two must never print the same thing.");
  process.exit(2);
}

// A library sets no shell options of its own; it inherits them from whoever sources
// it. scripts/lib/stage-run-tree.sh runs under pipefail three times over and was
// permanently exempt while this verdict was per file (iter-46 item 1075).
const inherited = sourcedUnderPipefail(files);

const offences = [];
const latent = [];
for (const file of files) {
  const rel = relative(ROOT, file.path);
  for (const hit of findEarlyExitPipelines(file.source, { underPipefail: inherited.has(file.path) })) {
    (hit.latent ? latent : offences).push(`${rel}:${hit.line}: [${hit.kind}] ${hit.text}`);
  }
}

if (offences.length > 0) {
  for (const o of offences) console.error(o);
  console.error("");
  console.error(`check-pipefail-grep: ${offences.length} early-exit pipeline(s) under pipefail.`);
  console.error("  A consumer that stops reading before its input is done — grep -q, grep -m N,");
  console.error("  head -N, read — kills the writer with SIGPIPE, and pipefail reports the");
  console.error("  WRITER's 141. So the pipeline fails exactly when the answer came quickly:");
  console.error("  a result that inverts under load.");
  console.error("");
  console.error("  Remove the pipe, or read to EOF:");
  console.error("    [ -n \"$(cmd)\" ]                 # anything at all on stdout");
  console.error("    grep -qx -- \"$n\" <<<\"$list\"      # a here-string is not a pipe");
  console.error("    cmd | awk 'NR==1'               # awk reads to EOF; head -1 does not");
  console.error("    [ \"$(cmd | grep -c PATTERN)\" -gt 0 ]   # grep -c reads to EOF");
  process.exit(1);
}

console.log(`check-pipefail-grep: OK — ${files.length} shell script(s) scanned, no early-exit pipelines under pipefail`);
if (latent.length > 0) {
  console.log(`  ${latent.length} latent capture(s), exempt because the status is never consulted:`);
  for (const l of latent) console.log(`    ${l}`);
  console.log("  Each is `name=$(… | head -1)` in a script without `set -e`: the value is");
  console.log("  correct and the 141 is discarded unread. Adding -e to any of them makes");
  console.log("  this guard fail on it. Listed rather than hidden — a silent exemption and");
  console.log("  a pass must not print the same thing.");
}
