import { test, expect, Page } from "@playwright/test";

// Chart <-> table view toggle (iter-131 item 826).
//
// The table is fed the SAME computed rows the ranking rail renders (india-map's
// `entries` + `rankOf`), so its rank / name / value and its estimate marks agree
// with the map and the rail by construction — the single-source rule this
// codebase keeps re-applying.
//
// Real fixtures (verified against the live DB, see estimates.spec.ts):
//   aser_govt_school · 36_735 Mancherial — inherited from ADILABAD (2024)

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  // colours applied = feature-state set after metric fetch; give it a beat
  await page.waitForTimeout(500);
}

async function showTable(page: Page) {
  // In map view the VIEW toggle lives in the left-stack controls.
  await page.getByRole("button", { name: "TABLE" }).first().click();
  await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
}

test.describe("chart <-> table view toggle (item 826)", () => {
  test("the toggle reveals a semantic table of the current scope", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    // map first — no table on the page
    await expect(page.getByRole("table")).toHaveCount(0);

    await showTable(page);

    // a real <table> with semantic column headers and a scope caption
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: /rank/i })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /region/i })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /value/i })).toBeVisible();
    await expect(table.locator("caption")).toContainText(/districts/i);

    // it lists the current scope's regions (rank + name + value rows)
    const rows = page.getByTestId("data-table-row");
    expect(await rows.count()).toBeGreaterThan(100);
  });

  test("estimated rows show the estimate kind + source district", async ({ page }) => {
    await page.goto("/?m=aser_govt_school");
    await waitForMapReady(page);
    await showTable(page);

    // Mancherial inherited Adilabad's ASER — no rank of its own, badged, donor named.
    const row = page.getByRole("row", { name: /Mancherial/ }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("est-badge")).toHaveText("est.");
    await expect(row).toContainText(/estimated from Adilabad/i);
    // an inherited copy carries no rank of its own (adr-023): the rank cell is a dash
    await expect(row.locator("td").first()).toHaveText("—");
  });

  test("column headers are keyboard-sortable with aria-sort", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);
    await showTable(page);

    const rankHeader = page.getByRole("columnheader", { name: /rank/i });
    const valueHeader = page.getByRole("columnheader", { name: /value/i });

    // default sort is by rank, ascending; value unsorted
    await expect(rankHeader).toHaveAttribute("aria-sort", "ascending");
    await expect(valueHeader).toHaveAttribute("aria-sort", "none");

    // operate the Value header by keyboard (Enter) — it becomes the sort column
    await valueHeader.getByRole("button").focus();
    await page.keyboard.press("Enter");
    await expect(valueHeader).toHaveAttribute("aria-sort", "descending");
    await expect(rankHeader).toHaveAttribute("aria-sort", "none");

    // Space toggles the direction on the same column
    await page.keyboard.press("Space");
    await expect(valueHeader).toHaveAttribute("aria-sort", "ascending");
  });

  test("toggling back restores the map, and drill state survives the round trip", async ({ page }) => {
    // open drilled into Madhya Pradesh's districts
    await page.goto("/?m=literacy_rate&lvl=district&st=23&stn=Madhya%20Pradesh");
    await waitForMapReady(page);
    await expect(page.getByRole("navigation", { name: "Drill trail" }))
      .toContainText("Madhya Pradesh", { timeout: 15_000 });

    await showTable(page);
    // the table shows the SAME drilled scope, named in its caption
    await expect(page.getByRole("table").locator("caption")).toContainText(/Madhya Pradesh/i);

    // back to the map — canvas returns, table gone, and the drill is preserved
    await page.getByRole("button", { name: "MAP" }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Drill trail" })).toContainText("Madhya Pradesh");
  });
});
