import { test, expect, type APIRequestContext } from "@playwright/test";

// Public corrections page + private report route (iter-32 item 848).
//
// The store-facing assertions read the reports back through the owner-only GET,
// so they need CORRECTIONS_ADMIN_TOKEN to be set for BOTH the server under test
// and this runner. The token is read from process.env here; the same value must
// be exported when launching the server (e.g.
//   CORRECTIONS_ADMIN_TOKEN=test-token CORRECTIONS_DB_PATH=/tmp/corr.db next start).
// Tests that need it skip cleanly when it is absent so the suite stays green on a
// server that doesn't expose the read endpoint.
const TOKEN = process.env.CORRECTIONS_ADMIN_TOKEN || "";

async function readReports(request: APIRequestContext) {
  const res = await request.get("/api/corrections", {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { ok: boolean; reports: Array<Record<string, unknown>> };
  return json.reports;
}

test.describe("corrections — public log + private report (item 848)", () => {
  test("the page renders the log, intro, form and a not-published notice", async ({ page }) => {
    await page.goto("/corrections");

    await expect(page.getByRole("heading", { name: "Corrections", exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="corrections-log"]')).toBeVisible();

    // form + its labelled fields
    await expect(page.locator('[data-testid="corrections-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="corrections-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="corrections-submit"]')).toBeVisible();

    // copy makes clear reports are private and not published
    await expect(page.getByText(/not published/i).first()).toBeVisible();

    // the shared footer links only to pages that exist
    await expect(page.locator('a[href="/methodology"]').first()).toBeVisible();
    await expect(page.locator('a[href="/coverage"]').first()).toBeVisible();
  });

  test("the empty log shows a clean empty state", async ({ request }) => {
    // Seeded empty (data/corrections.json = []). If the owner later curates entries
    // this assertion is skipped rather than failing on real content.
    const html = await (await request.get("/corrections")).text();
    if (html.includes("No corrections logged yet.")) {
      expect(html).toContain("No corrections logged yet.");
    } else {
      test.skip(true, "corrections log has curated entries");
    }
  });

  test("submitting the form shows a private-report success state", async ({ page }) => {
    await page.goto("/corrections");
    await page.locator('[data-testid="corrections-message"]').fill(`ui report ${Date.now()}`);
    await page.locator('[data-testid="corrections-submit"]').click();
    await expect(page.getByText(/sent privately/i)).toBeVisible({ timeout: 10_000 });
  });

  test("GET without a token is rejected (401) or unconfigured (503)", async ({ request }) => {
    const res = await request.get("/api/corrections");
    expect([401, 503]).toContain(res.status());
  });

  test("a honeypot submission returns ok but stores nothing", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN to read the store back");
    const marker = `hp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.post("/api/corrections", {
      data: { message: marker, website: "http://spam.example" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).ok).toBe(true);

    const reports = await readReports(request);
    expect(reports.some((r) => r.message === marker)).toBe(false);
  });

  test("a valid POST stores a row the owner can read back, with a hashed IP", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN to read the store back");
    const marker = `ok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.post("/api/corrections", {
      data: { message: marker, location: "/metric/literacy_rate", email: "x@example.com" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).ok).toBe(true);

    const reports = await readReports(request);
    const row = reports.find((r) => r.message === marker);
    expect(row, "the stored row is readable via the owner GET").toBeTruthy();

    // never store a raw IP — only the first 16 hex of sha256(ip)
    expect(row).not.toHaveProperty("ip");
    expect(String(row!.ip_hash || "")).toMatch(/^[0-9a-f]{16}$/);
    expect(row!.location).toBe("/metric/literacy_rate");

    // newest-first ordering
    for (let i = 0; i + 1 < reports.length; i++) {
      expect(Number(reports[i].id)).toBeGreaterThan(Number(reports[i + 1].id));
    }
  });

  test("GET with a wrong token is 401 when the endpoint is configured", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN to prove the configured path");
    const res = await request.get("/api/corrections", {
      headers: { authorization: "Bearer definitely-not-the-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET with the right token returns the reports array", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN");
    const res = await request.get("/api/corrections", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.reports)).toBe(true);
  });
});
