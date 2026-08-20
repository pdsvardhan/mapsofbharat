import { test, expect } from "@playwright/test";

// /api/health is the contract two separate things depend on: the container
// HEALTHCHECK in docker-compose.yml (which reads only `r.ok`) and the external
// uptime monitor 405-B specifies. Before 2026-08-20 it returned a hardcoded
// "ok" and could not fail, which made both of them decorative.

test.describe("health endpoint — liveness AND readiness (#545)", () => {
  test("a healthy instance answers 200, status ok, and proves it read the catalogue", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.status).toBe("ok");
    expect(j.service).toBe("mapsofbharat");
    // The assertion that makes this endpoint worth monitoring: it did real work.
    expect(j.checks.db, "it opened the canonical store").toBe(true);
    expect(j.checks.metrics, "and counted a non-empty catalogue").toBeGreaterThan(0);
  });

  test("it reports which build is serving, so a monitor can assert the expected commit", async ({ request }) => {
    const j = await (await request.get("/api/health")).json();
    expect(typeof j.commit).toBe("string");
    expect(typeof j.tree).toBe("string");
  });

  test("the answer is never cached — an outage must not be held by a CDN", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(String(res.headers()["cache-control"] || "")).toMatch(/no-store/);
  });
});
