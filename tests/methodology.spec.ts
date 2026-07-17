import { test, expect } from "@playwright/test";

// Methodology trust surface (item 665, AC 523).
//
// AC 523 was attached to iter-91 item 644 by a classifier mis-target and never
// tested: 644's specs pin ACs 270/271 (estimate/rank behaviour), while 523 —
// "each metric exposes methodology text, served by the metrics API and shown in
// the trust surface" — had no coverage at all. These specs are that coverage.
//
// The strict "every metric" form is deliberate: the DB carries methodology for
// all 111 metrics today, and a new ingest adapter that forgets it should fail
// CI here, not ship a metric whose trust surface reads "note pending".

test.describe("methodology — the trust surface (AC 523)", () => {
  test("the metrics API serves non-empty methodology for every metric", async ({ request }) => {
    const r = await request.get("/api/metrics");
    expect(r.ok()).toBeTruthy();
    const { metrics } = await r.json();

    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect
        .soft(typeof m.methodology === "string" && m.methodology.trim().length > 0,
          `${m.id} has no methodology text`)
        .toBe(true);
    }
  });

  test("the methodology page renders the notes, none pending", async ({ page, request }) => {
    // A real metric name from the API anchors the page assertion to live data.
    const { metrics } = await (await request.get("/api/metrics")).json();
    const sample = metrics.find((m: { name?: string }) => m.name);
    expect(sample).toBeTruthy();

    await page.goto("/methodology");
    await expect(page.getByText(sample.name, { exact: false }).first()).toBeVisible();
    // The page's fallback for a missing note must not appear while the DB is
    // fully populated — if it does, a metric lost its methodology on ingest.
    await expect(page.getByText("Methodology note pending.")).toHaveCount(0);
  });

  test("the explorer's source line links to the methodology page", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/methodology"]').first();
    await expect(link).toBeVisible({ timeout: 20_000 });
  });
});
