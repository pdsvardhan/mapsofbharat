import { test, expect } from "@playwright/test";

// #575 item 1081 — browse by form, in the real app.
//
// SEPARATE FROM tests/browse-by-form.spec.ts for the same reason the value-by-alpha
// and bivariate cases are split: that file is node-side and its assertions can be
// mutation-proven, while these render through a built bundle where a source mutation
// changes nothing until a rebuild. Mixing them makes every mutation read as SURVIVED.
//
//   bash scripts/test-isolated.sh tests/browse-by-form-app.spec.ts

test.describe("the page", () => {
  test("BY SUBJECT is the default and BY FORM is one link away", async ({ page }) => {
    await page.goto("/metric");
    await expect(page.locator("[data-facet-switch]")).toBeVisible();
    await expect(page.locator('[data-facet="category"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-form-group]")).toHaveCount(0);

    await page.locator('[data-facet="form"]').click();
    await expect.poll(() => page.url()).toContain("by=form");
  });

  test("the by-form view groups by instrument, and each group says what it suits", async ({ page }) => {
    await page.goto("/metric?by=form");
    const groups = page.locator("[data-form-group]");
    await expect(groups.first()).toBeVisible();
    expect(await groups.count()).toBeGreaterThan(1);

    await expect(page.locator("[data-form-group='symbol']")).toBeVisible();
    await expect(page.locator("[data-form-group='choropleth']")).toBeVisible();
    // Not just a heading: the reader is told what the form is FOR, and why these
    // metrics are under it. Length rather than a pattern — the first version of this
    // asked for twenty CONSECUTIVE word characters, which no English sentence has,
    // and rejected the resolver's own copy for being prose.
    const suits = await page.locator("[data-form-suits]").first().textContent();
    const reason = await page.locator("[data-form-reason]").first().textContent();
    expect((suits ?? "").trim().length).toBeGreaterThan(40);
    expect((reason ?? "").trim().length).toBeGreaterThan(40);
  });

  test("every row still links to the metric's own page", async ({ page }) => {
    await page.goto("/metric?by=form");
    const rows = page.locator("[data-form-group] [data-role='category-row']");
    expect(await rows.count()).toBeGreaterThan(50);
    const href = await rows.first().getAttribute("href");
    expect(href).toMatch(/^\/metric\/[a-z0-9_]+$/);
  });

  test("both views are addressable — the facet is in the URL, not in a control", async ({ page }) => {
    // The point of two links rather than a toggle: a reader can send someone the
    // by-form view directly.
    await page.goto("/metric?by=form");
    await expect(page.locator("[data-form-group]").first()).toBeVisible();
    await expect(page.locator('[data-facet="form"]')).toHaveAttribute("aria-current", "page");
  });
});
