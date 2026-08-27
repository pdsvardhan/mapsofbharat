// One Node version, everywhere, and a loud stop when it is not (#659).
//
// WHAT THIS COST. The VAULT7A host ran 20.19.2 while CI and production ran 20.20.2.
// Bug #610 passed by hand on the box and failed in CI for WEEKS, and the cause was a
// Node PATCH: from 20.19.5 a .mjs imported by a Playwright-transformed spec loads as
// ESM regardless, and throws "exports is not defined in ES module scope". The host
// was older than that patch, so the defect COULD NOT appear there. Every local green
// run was evidence of nothing, and nobody could see that from the run.
//
// A patch-level gap did that. So this compares the full version, not the major.
//
// WHY A CHECK AND NOT JUST A PIN. A pin is a wish: a shell that did not pick up the
// version manager, a cron that starts from a bare environment, a container built on a
// floating tag — each quietly runs something else, and quietly is the whole problem.
// A pin plus a check turns the divergence into a stop with the two numbers in it.
//
// WHY EVERYTHING IS PINNED NOW. `node:20-slim` and `node-version: 20` both FLOAT.
// They agreed on the day they were written and drifted apart afterwards, which is how
// the gap opened without anyone deciding to open it. The Dockerfile names
// node:20.20.2-slim, CI reads .nvmrc, and .nvmrc is this file's authority — so moving
// Node is now a one-line change somebody makes on purpose.
//
//   node scripts/check-node-version.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NVMRC = join(ROOT, ".nvmrc");

let want;
try {
  want = readFileSync(NVMRC, "utf8").trim().replace(/^v/, "");
} catch {
  console.error("check-node-version: .nvmrc is missing.");
  console.error("  It is the single place this repo names its Node version. Without it");
  console.error("  there is nothing to check against, and an unchecked version is what");
  console.error("  cost weeks on #610 — so this is a failure, not a skip.");
  process.exit(2);
}

if (!/^\d+\.\d+\.\d+$/.test(want)) {
  console.error(`check-node-version: .nvmrc says "${want}", which is not a full version.`);
  console.error("  A major or a range floats, and a floating version is exactly what");
  console.error("  opened the gap between this box and production. Name all three parts.");
  process.exit(2);
}

const have = process.versions.node;

if (have !== want) {
  console.error(`check-node-version: running Node ${have}, but this repo pins ${want}.`);
  console.error("");
  console.error("  This is not pedantry about a patch number. #610 was a PATCH: 20.19.4");
  console.error("  lists the tests and 20.19.5 throws, and because the host sat below that");
  console.error("  line, every local run was green while CI was red for weeks.");
  console.error("");
  console.error("  On VAULT7A:");
  console.error(`    export PATH="$HOME/.local/bin:$PATH"; eval "$(fnm env)"; fnm use`);
  console.error(`    (fnm install ${want} first, if it is not there yet)`);
  console.error("");
  console.error("  If the move is deliberate, change .nvmrc and the Dockerfile together —");
  console.error("  they are pinned to each other on purpose.");
  process.exit(1);
}

console.log(`check-node-version: OK — Node ${have}, matching .nvmrc`);
