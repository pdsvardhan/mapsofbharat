import { test, expect } from "@playwright/test";

// Atlas smoke (iter-51): the homepage IS the explorer, neutral until an
// indicator is picked; /explore permalinks redirect to / with params intact.

test("homepage renders the explorer with the neutral START HERE state", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Maps of Bharat").first()).toBeVisible();
  await expect(page.getByText(/Choose an indicator/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /BROWSE INDICATORS/i })).toBeVisible();
});

test("/explore redirects to / and keeps query params", async ({ page }) => {
  await page.goto("/explore?m=literacy_rate");
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("m") === "literacy_rate", { timeout: 15_000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
});

test("picking an indicator via the chooser colours the map and legend", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /BROWSE INDICATORS/i }).click();
  const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
  await expect(dialog).toBeVisible();
  // pick the first metric row in the active topic
  await dialog.getByRole("button").filter({ hasText: /·|%|per/i }).first().click();
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Ranked by|Top districts/i)).toBeVisible({ timeout: 10_000 });
});

test("metrics API returns a list", async ({ request }) => {
  const res = await request.get("/api/metrics");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(Array.isArray(json.metrics)).toBeTruthy();
});

test("region API returns a full district profile", async ({ request }) => {
  const metrics = (await (await request.get("/api/metrics")).json()).metrics;
  test.skip(!metrics?.length, "no metrics available");
  const md = await (await request.get(`/api/metrics/${metrics[0].id}`)).json();
  const code = Object.keys(md.values || {})[0];
  test.skip(!code, "no metric values available");

  const res = await request.get(`/api/region/${encodeURIComponent(code)}`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(Array.isArray(json.metrics)).toBeTruthy();
  expect(json.metrics.length).toBeGreaterThan(0);
  expect(json.metrics[0]).toHaveProperty("rank");
  expect(json.metrics[0]).toHaveProperty("value");
});
