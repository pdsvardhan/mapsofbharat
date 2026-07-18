import { test, expect, Page } from "@playwright/test";

// vs-average + region panel interactions (iter-98 item 667; ACs 271, 525, 526).
//
// AC 271 (vs-avg toggle) had no interaction test — the mode was only ever
// asserted as a URL param. AC 525/526 (region panel average/percentile + both
// drill levels) were never exercised at all (to-do 256). These specs drive the
// real controls.
//
// Also pins adr-023 (item 672): a projected (Budget/Revised Estimate) state is
// RANKED and BADGED at once — the em-dash-on-30-of-31-states regression this
// iteration removes must not come back.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("vs-average toggle (AC 271)", () => {
  test("VS AVG flips the legend to the diverging scale and back", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);

    const vsBtn = page.getByRole("button", { name: "VS AVG" });
    const valBtn = page.getByRole("button", { name: "VALUE", exact: true });
    await expect(vsBtn).toHaveAttribute("aria-pressed", "false");

    await vsBtn.click();
    await expect(vsBtn).toHaveAttribute("aria-pressed", "true");
    // the diverging legend labels + the average it diverges around
    await expect(page.getByText("below avg")).toBeVisible();
    await expect(page.getByText("above avg")).toBeVisible();
    await expect(page.getByText(/avg [\d,.]+/)).toBeVisible();
    await expect(page).toHaveURL(/mode=vs_avg/);

    await valBtn.click();
    await expect(valBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("below avg")).toHaveCount(0);
    await expect(page).not.toHaveURL(/mode=vs_avg/);
  });
});

test.describe("region panel (ACs 525, 526)", () => {
  test("a selected state shows value, rank and percentile position", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Kerala");
    await page.locator("button", { hasText: "Kerala" }).first().click();

    await expect(page.getByText("SELECTED · STATE")).toBeVisible();
    // rank + percentile in one sentence — the AC's "rank or percentile position"
    await expect(page.getByText(/Rank \d+ of \d+ — ahead of \d+% of states\./)).toBeVisible();
  });

  test("the panel works at district drill and follows the selection (AC 526)", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Pune");
    await page.locator("button", { hasText: "Pune" }).first().click();
    await expect(page.getByText("SELECTED · DISTRICT")).toBeVisible();
    await expect(page.getByText(/Rank \d+ of \d+ — ahead of \d+% of districts\./)).toBeVisible();

    // selection moves, panel follows — it must always reflect the current region
    await page.getByLabel("Search the ranking").fill("Nagpur");
    await page.locator("button", { hasText: "Nagpur" }).first().click();
    await expect(page.getByText(/Rank \d+ of \d+ — ahead of \d+% of districts\./)).toBeVisible();
    await expect(page.getByText("Nagpur").first()).toBeVisible();
  });
});

test.describe("projected values rank with their badge (adr-023, item 672)", () => {
  test("a BE/RE state carries a numeric rank AND the est. badge in the rail", async ({ page }) => {
    await page.goto("/?m=fiscal_deficit_pct_gsdp&lvl=state");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Karnataka");
    const row = page.locator("button", { hasText: "Karnataka" }).first();
    await expect(row).toBeVisible();
    // before adr-023 this row read "—" like 29 others; now it ranks, badged
    await expect(row.getByTestId("rail-rank")).toHaveText(/^\d+$/);
    await expect(row.getByTestId("est-badge")).toHaveText("est.");
  });

  test("the region panel says rank AND Budget/Revised Estimate in one breath", async ({ page }) => {
    await page.goto("/?m=fiscal_deficit_pct_gsdp&lvl=state");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Karnataka");
    await page.locator("button", { hasText: "Karnataka" }).first().click();
    await expect(page.getByText(/Rank \d+ of \d+ — ahead of \d+% of states\. · Budget\/Revised Estimate/)).toBeVisible();
  });
});
