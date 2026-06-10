import { test, expect, Page } from "@playwright/test";

// E2E specs for the step-locked Ottomate flows (Stage 3 testing).
// Each test walks one flow's locked steps against a live instance.
// Map clicks are driven through window.__mob_map (exposed by india-map.tsx)
// so geographic targets stay deterministic across viewport sizes.

const BHOPAL: [number, number] = [77.4, 23.25]; // Madhya Pradesh
const JAIPUR: [number, number] = [75.8, 26.9]; // Rajasthan

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/districts · Census/i)).toBeVisible({ timeout: 20_000 });
  // colours applied = feature-state set after metric fetch; give the 350ms transition a beat
  await page.waitForTimeout(500);
}

async function clickLngLat(page: Page, lngLat: [number, number]) {
  const pos = await page.evaluate(([lng, lat]) => {
    const map = (window as any).__mob_map;
    const p = map.project([lng, lat]);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.x + p.x, y: rect.y + p.y };
  }, lngLat);
  await page.mouse.click(pos.x, pos.y);
}

async function hoverLngLat(page: Page, lngLat: [number, number]) {
  const pos = await page.evaluate(([lng, lat]) => {
    const map = (window as any).__mob_map;
    const p = map.project([lng, lat]);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.x + p.x, y: rect.y + p.y };
  }, lngLat);
  await page.mouse.move(pos.x, pos.y);
}

test.describe("flow-explore-metric", () => {
  test("select metric -> choropleth + legend -> hover region -> value/rank visible", async ({ page }) => {
    await page.goto("/explore");
    await waitForMapReady(page);

    // Step 1: selects a metric (switch away from default to prove the request fires)
    const select = page.getByLabel("Select metric");
    await expect.poll(async () => select.locator("option").count()).toBeGreaterThan(1);
    const values = await select
      .locator("option")
      .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value));
    const current = await select.inputValue();
    const other = values.find((v) => v && v !== current)!;
    await select.selectOption(other);

    // Step 2: state-level choropleth with legend -> spatial distribution visible
    await expect(page.getByText(/districts · Census/i)).toBeVisible({ timeout: 20_000 });

    // Steps 3+4: hover a region -> tooltip with value and rank/percentile
    await hoverLngLat(page, BHOPAL);
    const tooltip = page.locator("div.pointer-events-none").filter({ hasText: /·/ });
    await expect(tooltip).toBeVisible({ timeout: 10_000 });
    await expect(tooltip).toContainText(/rank \d+\/\d+/);
  });
});

test.describe("flow-drill-state", () => {
  test("click state -> district view -> breadcrumb back -> national view", async ({ page }) => {
    await page.goto("/explore");
    await waitForMapReady(page);

    // Steps 1+2: click a state -> zoom + district choropleth for that state
    await clickLngLat(page, BHOPAL);
    const back = page.getByRole("button", { name: /Back to India/i });
    await expect(back).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/· Madhya Pradesh/i).first()).toBeVisible();

    // Steps 3+4: breadcrumb back -> national view restored
    await back.click();
    await expect(back).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/· all districts/i)).toBeVisible();
  });
});

test.describe("flow-compare", () => {
  test("compare two districts -> side-by-side values -> difference visible", async ({ page }) => {
    await page.goto("/explore");
    await waitForMapReady(page);

    // Step 1: select comparison mode and pick A and B
    const compareBtn = page.getByRole("button", { name: "compare" });
    await compareBtn.click();
    await expect(compareBtn).toHaveAttribute("aria-pressed", "true");
    await clickLngLat(page, BHOPAL);
    await clickLngLat(page, JAIPUR);

    // Step 2: comparison visible (both pinned regions with values)
    const panel = page.locator("div").filter({ hasText: /^Compare ·/ }).last();
    await expect(page.getByText(/^Compare ·/)).toBeVisible({ timeout: 10_000 });

    // Steps 3+4: difference view (A minus B delta)
    await expect(page.getByText(/Δ .+ − .+:/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("flow-export-share", () => {
  test("PNG export produces a download artifact", async ({ page }) => {
    await page.goto("/explore");
    await waitForMapReady(page);

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: /Export current map as PNG/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^mapsofbharat-.+\.png$/);
  });

  test("share link encodes the view and a permalink restores it", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/explore");
    await waitForMapReady(page);

    // copy link reflects current state in URL
    await page.getByRole("button", { name: /Copy shareable link/i }).click();
    await expect(page.getByText("copied!")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain("m=");

    // a permalink with metric + drilled state restores that exact view
    const select = page.getByLabel("Select metric");
    const metric = await select.inputValue();
    await page.goto(`/explore?m=${encodeURIComponent(metric)}&st=23&stn=Madhya%20Pradesh`);
    await waitForMapReady(page);
    await expect(page.getByRole("button", { name: /Back to India/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/· Madhya Pradesh/i).first()).toBeVisible();
    await expect(select).toHaveValue(metric);
  });
});
