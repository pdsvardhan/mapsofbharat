import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";

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
    // the drilled scope is named in the rail; since item 830 the coverage-stat
    // link also carries "... districts in Madhya Pradesh measured", so .first()
    // keeps this a simple "the scope is shown" check without a strict-mode clash.
    await expect(page.getByText(/districts in Madhya Pradesh/i).first()).toBeVisible({ timeout: 10_000 });

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
  test("CARD export produces a download artifact", async ({ page }) => {
    // iter-72 item 568: the social card replaced the viewport-screenshot PNG
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    await page.getByRole("button", { name: /Export a social media card/i }).click();
    const dlg = page.getByRole("dialog", { name: /social media card/i });
    await expect(dlg).toBeVisible();
    await page.waitForTimeout(1000); // preview debounce + fonts
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await dlg.getByRole("button", { name: /download png/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^mapsofbharat-.+-card-.+\.png$/);
    // an empty/black canvas compresses to a few KB — a real choropleth doesn't
    // (iter-53 item 402: PNG downloaded but was blank)
    const file = await download.path();
    expect(fs.statSync(file!).size).toBeGreaterThan(50_000);
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
    // A complete, self-contained iframe: absolute src at /embed, lazy, titled,
    // and carrying THIS view's params so the frame renders the same map (item 828)
    expect(clip).toContain("<iframe");
    expect(clip).toMatch(/src="https?:\/\/[^"]+\/embed\?[^"]*m=literacy_rate/);
    expect(clip).toContain('loading="lazy"');
    expect(clip).toMatch(/title="Maps of Bharat/);

    // a permalink with metric + drilled state restores that exact view
    await page.goto("/?m=literacy_rate&lvl=district&st=23&stn=Madhya%20Pradesh");
    await waitForMapReady(page);
    await expect(page.getByRole("navigation", { name: "Drill trail" })).toContainText("Madhya Pradesh", { timeout: 15_000 });
  });

  test("the embed view carries the brand mark, a source citation and a link back to the shareable view", async ({ page }) => {
    // item 828: an iframe travels with no rail or masthead, so /embed must stand
    // alone — brand mark, attribution and a way home baked into the frame itself.
    await page.goto("/embed?m=literacy_rate&lvl=state");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

    // the brand MARK (logo), not merely the wordmark
    await expect(page.locator('img[src="/brand/mark.png"]')).toBeVisible({ timeout: 20_000 });

    // link back to the metric's canonical page (item 829): /metric/{id}, not the
    // bare homepage and not the embed route itself, opens in a new tab
    const back = page.getByRole("link", { name: /Maps of Bharat/i });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", /\/metric\/literacy_rate/);
    await expect(back).not.toHaveAttribute("href", /\/embed/);
    await expect(back).toHaveAttribute("target", "_blank");

    // source citation renders once metric data lands (source · year)
    await expect(back).toContainText(/·\s*\d{4}/, { timeout: 20_000 });
  });
});
