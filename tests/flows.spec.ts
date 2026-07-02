import { test, expect, Page } from "@playwright/test";

// E2E specs for the step-locked Ottomate flows, updated for the Atlas UI
// (iter-51): homepage = explorer; drill = select state → "View N districts";
// compare = A/B slots + THE GAP; share = unified Share menu + PNG.
// Map clicks are driven through window.__mob_map (exposed by india-map.tsx)
// so geographic targets stay deterministic across viewport sizes.

const BHOPAL: [number, number] = [77.4, 23.25]; // Madhya Pradesh
const JAIPUR: [number, number] = [75.8, 26.9]; // Rajasthan

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  // colours applied = feature-state set after metric fetch; give the 400ms transition a beat
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
  test("select metric via chooser -> choropleth + legend -> hover region -> value/rank visible", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    // Step 1: switch the metric through the editorial chooser to prove the request fires
    await page.getByRole("button", { name: /CHANGE INDICATOR/i }).click();
    const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
    await expect(dialog).toBeVisible();
    await dialog.getByText("Sex ratio", { exact: false }).first().click();
    await expect(page.getByText(/SHOWING ·/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });

    // Steps 3+4: hover a region -> tooltip with value and rank
    await hoverLngLat(page, BHOPAL);
    const tooltip = page.locator("div.pointer-events-none").filter({ hasText: /#\d+/ });
    await expect(tooltip.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("flow-drill-state", () => {
  test("select state -> View N districts -> focus view -> breadcrumb back -> national", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);

    // Steps 1+2: click a state -> docked profile -> drill into its districts
    await clickLngLat(page, BHOPAL);
    await expect(page.getByText(/SELECTED · STATE/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /View \d+ districts/i }).click();
    await expect(page.getByRole("navigation", { name: "Drill trail" })).toContainText("Madhya Pradesh", { timeout: 10_000 });
    await expect(page.getByText(/districts in Madhya Pradesh/i)).toBeVisible({ timeout: 10_000 });

    // Steps 3+4: breadcrumb back -> national view restored
    await page.getByRole("navigation", { name: "Drill trail" }).getByRole("button", { name: "India" }).click();
    await expect(page.getByRole("navigation", { name: "Drill trail" })).not.toContainText("Madhya Pradesh", { timeout: 10_000 });
  });
});

test.describe("flow-compare", () => {
  test("compare two districts -> A/B slots -> THE GAP with plain-language read", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    // Step 1: enter compare mode and pick A and B
    const compareBtn = page.getByRole("button", { name: /^Compare$/ });
    await compareBtn.click();
    await expect(page.getByText("SLOT A")).toBeVisible({ timeout: 5_000 });
    await clickLngLat(page, BHOPAL);
    await clickLngLat(page, JAIPUR);

    // Steps 2-4: both slots filled, gap + sentence visible
    await expect(page.getByText("THE GAP")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/leads .+ on/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("flow-export-share", () => {
  test("PNG export produces a download artifact", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: /Export current map as PNG/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^mapsofbharat-.+\.png$/);
  });

  test("Share menu copies a link that restores the view; embed snippet available", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    // Share menu -> copy link reflects current state in URL
    await page.getByRole("button", { name: /Share this view/i }).click();
    await page.getByRole("menuitem", { name: /Copy link/i }).click();
    await expect(page.getByText("COPIED ✓")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain("m=");

    // embed option present and real (menu stays open after copy so the
    // COPIED indicator is visible — no need to re-open)
    await page.getByRole("menuitem", { name: /Copy embed code/i }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("<iframe");
    expect(clip).toContain("/embed");

    // a permalink with metric + drilled state restores that exact view
    await page.goto("/?m=literacy_rate&lvl=district&st=23&stn=Madhya%20Pradesh");
    await waitForMapReady(page);
    await expect(page.getByRole("navigation", { name: "Drill trail" })).toContainText("Madhya Pradesh", { timeout: 15_000 });
  });
});
