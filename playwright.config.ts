import { defineConfig, devices } from "@playwright/test";

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
