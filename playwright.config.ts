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
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
