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
// scripts is a FAILURE here, not a pass — and so, one level in, is a file the parser
// could not finish reading, which is the same lie told about half a file instead of
// the whole tree (the parse-state check below).
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

import {
  findEarlyExitPipelines,
  sourcedUnderPipefail,
  sourcedUnderErrexit,
  unclosedState,
} from "./lib/pipefail-grep.cjs";

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

// A FILE THIS GUARD COULD NOT FINISH PARSING HAS NOT BEEN SCANNED (iter-46 item 1075,
// third sweep). Three state machines in the library carry across lines — the heredoc
// list, the `case` stack, the quote stack — and every one of them fails SILENTLY and
// in the swallowing direction. A phantom heredoc (`echo "run cat <<EOF here"`) drops
// every line after it looking for a terminator that is never coming; an unterminated
// `case` blanks every `|` to EOF so the splitter sees no pipelines at all. Both then
// print the OK below, which is the same sentence a genuinely clean tree prints.
//
// So the parse state is checked before the verdict, and an open one is exit 2 — "could
// not measure" — never exit 0. Nothing in the tree trips it; this is here for the day
// something does.
const unparsed = [];
for (const file of files) {
  for (const complaint of unclosedState(file.source)) {
    unparsed.push(`${relative(ROOT, file.path)}: ${complaint}`);
  }
}
if (unparsed.length > 0) {
  for (const u of unparsed) console.error(u);
  console.error("");
  console.error(`check-pipefail-grep: ${unparsed.length} file(s) this guard could not finish reading.`);
  console.error("  Every one of those state machines fails by SWALLOWING the rest of the file,");
  console.error("  so what it printed about the lines it did reach says nothing about the lines");
  console.error("  it did not. That is not a pass with a caveat; it is a guard that did not run.");
  process.exit(2);
}

// A library sets no shell options of its own; it inherits them from whoever sources
// it. scripts/lib/stage-run-tree.sh runs under pipefail three times over and was
// permanently exempt while this verdict was per file (iter-46 item 1075).
//
// errexit rides along for the same reason and was left behind by that same fix: it
// is what turns a latent capture into a live one, so a library sourced into a
// `set -e` script must be judged with -e on. Nothing in the tree depends on it
// today; the point is that it will not have to be rediscovered when something does.
const inheritedPipefail = sourcedUnderPipefail(files);
const inheritedErrexit = sourcedUnderErrexit(files);

const offences = [];
const latent = [];
for (const file of files) {
  const rel = relative(ROOT, file.path);
  const hits = findEarlyExitPipelines(file.source, {
    underPipefail: inheritedPipefail.has(file.path),
    underErrexit: inheritedErrexit.has(file.path),
  });
  for (const hit of hits) {
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
