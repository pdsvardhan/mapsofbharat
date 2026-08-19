import { test, expect } from "@playwright/test";

// R4 "region-row" — the rank-table selected-row affordance
// (design ledger row 101, authored 2026-08-13). Target: data-oid="metric-rank-table".
//
// Three defects, none of which any test could see:
//   1. #17130e was hard-coded, and was the WRONG one of the two values this app used
//      for a selected row (the chooser's metric row used #241a12). One question, two
//      answers, three literals.
//   2. Selection was COLOUR ALONE. That became reachable state the moment to-do 503
//      wired row selection on, so the floor started applying at the same commit.
//   3. No aria-current at all, so a screen reader was told nothing.
//
// The fix inherits the chooser's existing answer rather than inventing a third, so
// these assertions also pin the two components AGREEING — that is the actual claim.

test.describe("R4 region-row selected affordance (ledger row 101)", () => {
  test("the selected row carries a FORM cue and the aria state, not colour alone", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);

    // table view is where DataTable mounts with selection wired (to-do 503)
    await page.getByRole("button", { name: "TABLE", exact: true }).click();
    await page.waitForSelector('[data-role="region-row"]', { timeout: 10_000 });

    const row = page.locator('[data-role="region-row"]').nth(2);
    await row.click();

    // 1. the aria state a screen reader actually gets
    await expect(row).toHaveAttribute("aria-current", "true");
    // 2. a non-colour cue exists
    await expect(row.locator('[data-testid="row-selected-marker"]')).toBeAttached();
    // 3. and the surface step is the TOKEN, not a literal
    const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    const tok = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--selected-row").trim(),
    );
    expect(tok).toBe("#241a12");
    expect(bg).toBe("rgb(36, 26, 18)"); // #241a12 — NOT #17130e (23,19,14)

    // an unselected row has neither cue
    const other = page.locator('[data-role="region-row"]').nth(5);
    await expect(other).not.toHaveAttribute("aria-current", "true");
    await expect(other.locator('[data-testid="row-selected-marker"]')).toHaveCount(0);
  });

  test("the chooser's metric row and the rank table agree on the selected surface", async ({ page }) => {
    // The point of R4: one archetype, one answer. This measures BOTH sides — an
    // earlier draft read the token and the chooser only, so it would have passed
    // with the table still on its old literal, i.e. it claimed "they agree" while
    // never looking at one of them.
    await page.goto("/?m=literacy_rate&lvl=district");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "TABLE", exact: true }).click();
    await page.waitForSelector('[data-role="region-row"]', { timeout: 10_000 });
    await page.locator('[data-role="region-row"]').nth(2).click();
    const tableBg = await page
      .locator('[data-role="region-row"][aria-current="true"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("button", { name: /CHANGE INDICATOR|BROWSE INDICATORS/i }).click();
    const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
    await expect(dialog).toBeVisible();
    const active = dialog.locator('[data-role="category-row"][aria-current="true"]').first();
    await expect(active).toBeVisible();
    const chooserBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(tableBg).toBe(chooserBg);
    expect(tableBg).toBe("rgb(36, 26, 18)");
  });

  test("a selected SECTION stays a different role from a selected ROW", async ({ page }) => {
    // Guard against the opposite error — collapsing two roles into one token, the
    // --gold/--shaky mistake in reverse.
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    const toks = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        row: s.getPropertyValue("--selected-row").trim(),
        section: s.getPropertyValue("--selected-section").trim(),
      };
    });
    expect(toks.row).toBe("#241a12");
    expect(toks.section).toBe("#17130e");
    expect(toks.row).not.toBe(toks.section);
  });
});
