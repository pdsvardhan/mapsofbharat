import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// THE SUITE MUST NOT RUN ON A NODE PRODUCTION DOES NOT USE, AND THIS IS THE ONLY PLACE
// THAT CAN ENFORCE IT (#659, #610).
//
// scripts/check-node-version.mjs shipped with callers in scripts/test-isolated.sh and in
// CI, which left the three most obvious ways to start the suite unguarded:
// `npm run test:e2e`, a bare `npx playwright test`, and the `npx playwright test` inside
// scripts/mutation-test.sh. On the host default Node 20.19.2, with no fnm,
//
//   PATH=/usr/bin:/bin:$PWD/node_modules/.bin npx playwright test --list
//
// listed 530 tests and exited 0 — a green run on the exact version that hid #610 here
// for weeks, and pointed by default at BASE_URL below, which is the live container. No
// shell wrapper can close that, because two of those three paths have no shell in them.
// Playwright loads this file whatever the caller typed, so the check goes here.
//
// AT MODULE SCOPE, NOT IN globalSetup. `--list` loads this config but does NOT run
// globalSetup — measured on Playwright 1.60.0 with a globalSetup that writes a marker
// file: no marker. A globalSetup would therefore have missed the one command above, and
// that command is what proved the gap existed.
//
// SPAWNED, NOT IMPORTED, AND WITHOUT `import.meta` — BOTH WOULD BE #610 ITSELF.
// Playwright compiles this file to CommonJS; importing the .mjs guard, or so much as
// mentioning `import.meta.url` to locate it, makes Node evaluate the output as ESM and
// the run dies on "ReferenceError: exports is not defined in ES module scope" before the
// guard can say anything. Reproduced on 20.20.2 while writing this. `__dirname` survives
// the transform, and a child process is immune to it.
if (!process.env.TEST_WORKER_INDEX) {
  // Main process only. Workers are forked from it with the same process.execPath, so a
  // second opinion is impossible — it would only cost a spawn per worker and turn one
  // clear stop into a worker crash.
  try {
    // Silent on success (stdout dropped, stderr inherited). test-isolated.sh already
    // runs the guard and prints its OK line before it stands up a server; one guard
    // announcing itself twice per run is how people learn to skim it.
    execFileSync(process.execPath, [join(__dirname, "scripts", "check-node-version.mjs")], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (err) {
    // The guard has already printed both version numbers and the fnm incantation. Exit
    // with its own code — 1 for a mismatch, 2 for a missing or floating .nvmrc — so that
    // stays the last thing on screen rather than a config-load stack trace.
    const status = (err as { status?: unknown }).status;
    process.exit(typeof status === "number" ? status : 1);
  }
}

// Smoke + flow tests run against an already-running instance (LAN container or
// local dev). Set BASE_URL to target a specific deployment.
// Default matches the container bind moved to 127.0.0.1:8610 on 2026-06-10
// (host port 8601 was freed for tg-ingest).
const BASE_URL = process.env.BASE_URL || "http://localhost:8610";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // VAULT7A flakes under unbounded parallelism: verifiers reproduced failures
  // on untouched specs that all pass at 1-2 workers (iter-91 verifier reports,
  // to-do 253). Cap here so green means green; PW_WORKERS overrides.
  workers: Number(process.env.PW_WORKERS || 2),
  retries: process.env.CI ? 1 : 0,
  // `list` is for humans to read. Set PW_JSON=<path> to also get a
  // machine-readable copy, so scripts take counts from stats.unexpected rather
  // than scraping console text. Three wrong verdicts came from reading a
  // truncated text summary as a result (#557); text has no place in a gate.
  reporter: process.env.PW_JSON
    ? [["list"], ["json", { outputFile: process.env.PW_JSON }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
