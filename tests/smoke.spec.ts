import { test, expect } from "@playwright/test";

test("landing page renders and links to explore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /India, mapped/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore the map/i })).toBeVisible();
});

test("explore loads the map, metric selector, and legend", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

  const select = page.getByLabel("Select metric");
  await expect(select).toBeVisible();
  await expect.poll(async () => select.locator("option").count()).toBeGreaterThan(0);

  // legend text appears once metric data has loaded and coloured the map
  await expect(page.getByText(/districts · Census/i)).toBeVisible({ timeout: 20_000 });

  // export/share/locate controls are present
  await expect(page.getByRole("button", { name: /Export current map as PNG/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy shareable link/i })).toBeVisible();
});

test("switching the metric keeps the legend populated", async ({ page }) => {
  await page.goto("/explore");
  const select = page.getByLabel("Select metric");
  await expect.poll(async () => select.locator("option").count()).toBeGreaterThan(1);
  const values = await select.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => o.value)
  );
  const other = values.find((v) => v) ?? values[0];
  await select.selectOption(other);
  await expect(page.getByText(/districts · Census/i)).toBeVisible({ timeout: 20_000 });
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
