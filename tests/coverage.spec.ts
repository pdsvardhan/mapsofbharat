import { test, expect, Page } from "@playwright/test";

// E2E for the coverage view + /coverage page + export-card control parity
// (iter-131 item 830). Coverage mode shades the map by DATA PROVENANCE with a
// categorical legend, per-class counts and class toggles; the trust surface
// carries a per-metric coverage stat; /coverage ranks every metric by its
// measured share; and the social-card popup exposes a colour-scheme selector
// whose change re-renders the preview, with a coverage note when inherited
// values are present.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  // CARD enables only once metric data has landed — the readiness signal we need
  await expect(page.getByRole("button", { name: /export a social media card/i })).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(400);
}

test.describe("iter-131 item 830 — coverage view", () => {
  test("coverage mode shades by provenance: categorical legend, class counts, toggles", async ({ page }) => {
    await page.goto("/?m=aser_govt_school&lvl=district"); // 74 inherited districts
    await waitForMapReady(page);

    // value mode first — the value method line is present, no coverage legend yet
    await expect(page.locator("[data-legend-method-line]")).toBeVisible();
    await expect(page.locator("[data-coverage-legend]")).toHaveCount(0);

    // switch to COVERAGE
    await page.locator('[data-legend-mode="coverage"]').click();
    const legend = page.locator("[data-coverage-legend]");
    await expect(legend).toBeVisible();
    // value method line is replaced by the categorical key
    await expect(page.locator("[data-legend-method-line]")).toHaveCount(0);

    // measured + inherited classes both present, each with a numeric count
    const measured = legend.locator('[data-coverage-class="measured"]');
    const inherited = legend.locator('[data-coverage-class="inherited"]');
    await expect(measured).toBeVisible();
    await expect(inherited).toBeVisible();
    const measuredCount = Number((await measured.locator("[data-coverage-count]").innerText()).replace(/[^\d]/g, ""));
    const inheritedCount = Number((await inherited.locator("[data-coverage-count]").innerText()).replace(/[^\d]/g, ""));
    expect(measuredCount).toBeGreaterThan(0);
    expect(inheritedCount).toBeGreaterThan(0);

    // the inherited swatch uses the provenance palette (amber #e69f00), not a value ramp
    const swatchBg = await inherited.locator("span").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(swatchBg.replace(/\s/g, "")).toBe("rgb(230,159,0)");

    // class toggle: hiding inherited flips aria-pressed and dims it
    await expect(inherited).toHaveAttribute("aria-pressed", "true");
    await inherited.click();
    await expect(inherited).toHaveAttribute("aria-pressed", "false");
    await inherited.click();
    await expect(inherited).toHaveAttribute("aria-pressed", "true");
  });

  test("the trust surface shows the per-metric coverage stat", async ({ page }) => {
    await page.goto("/?m=aser_govt_school&lvl=district");
    await waitForMapReady(page);
    const stat = page.locator("[data-coverage-stat]");
    await expect(stat).toBeVisible();
    await expect(stat).toHaveText(/\d[\d,]* of \d[\d,]* districts measured/);
    // it deep-links to the coverage league table
    await expect(stat).toHaveAttribute("href", "/coverage");
  });

  test("/coverage ranks metrics by measured share and links each to /metric/{id}", async ({ page }) => {
    await page.goto("/coverage");
    await expect(page.getByRole("heading", { name: "Coverage", level: 1 })).toBeVisible();

    const rows = page.locator("[data-coverage-row]");
    const n = await rows.count();
    expect(n).toBeGreaterThan(5);

    // ranked by measured share — non-decreasing down the list (most-estimated first)
    const shares = await rows.evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).dataset.measuredShare)));
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1] - 1e-9);

    // every row links to a canonical /metric/{id} page
    const firstHref = await rows.first().locator("a").getAttribute("href");
    expect(firstHref).toMatch(/^\/metric\/.+/);

    // each row carries a measured/estimated count breakdown
    await expect(rows.first().locator("[data-coverage-counts]")).toContainText(/measured/);

    // the first (most-estimated) row actually resolves to its metric page
    await rows.first().locator("a").click();
    await expect(page).toHaveURL(/\/metric\/.+/);
  });

  test("methodology page links to /coverage", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator('a[href="/coverage"]').first()).toBeVisible();
  });
});

test.describe("iter-131 item 830 — export card control parity", () => {
  test("card popup exposes a colour-scheme selector + reverse control that re-renders the preview", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?m=tourist_visits_foreign&lvl=state");
    await waitForMapReady(page);
    await page.getByRole("button", { name: /export a social media card/i }).click();
    const dlg = page.getByRole("dialog", { name: /social media card/i });
    await expect(dlg).toBeVisible();

    // colour-scheme selector + a change control (reverse) are present
    const swatches = dlg.locator("[data-card-palette]");
    expect(await swatches.count()).toBe(6);
    await expect(dlg.locator("[data-card-reverse]")).toBeVisible();

    // sample the preview, change the colour scheme, sample again — it must repaint
    await page.waitForTimeout(1200); // debounce + fonts + first render
    const sample = () =>
      dlg.locator("canvas").evaluate((el) => {
        const cv = el as HTMLCanvasElement;
        const ctx = cv.getContext("2d");
        if (!ctx || cv.width === 0) return 0;
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 400) s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7;
        return s;
      });
    const before = await sample();

    // pick the first swatch that isn't already active
    const idx = await swatches.evaluateAll((els) =>
      els.findIndex((e) => e.getAttribute("aria-pressed") !== "true"));
    await swatches.nth(idx).click();
    await page.waitForTimeout(1000); // debounced re-render
    const after = await sample();
    expect(after).not.toBe(before);
  });

  test("coverage-mode card shows the provenance legend and the inherited coverage note", async ({ page }) => {
    test.setTimeout(120_000);
    // intercept every fillText so the in-canvas disclosure is assertable
    await page.addInitScript(() => {
      const w = window as unknown as { __fills: string[] };
      w.__fills = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...args) {
        w.__fills.push(String(args[0]));
        return orig.apply(this, args as Parameters<typeof orig>);
      };
    });
    await page.goto("/?m=aser_govt_school&lvl=district"); // 74 inherited districts
    await waitForMapReady(page);

    // put the MAP in coverage mode so the card mirrors it
    await page.locator('[data-legend-mode="coverage"]').click();
    await expect(page.locator("[data-coverage-legend]")).toBeVisible();

    await page.getByRole("button", { name: /export a social media card/i }).click();
    await expect(page.getByRole("dialog", { name: /social media card/i })).toBeVisible();
    await page.waitForTimeout(1600); // preview render draws the card once

    const fills = await page.evaluate(() => (window as unknown as { __fills: string[] }).__fills);
    // the card is in coverage mode — the footer names the provenance shading (drawn
    // on every layout, so this is the deterministic coverage-mode signal)
    expect(
      fills.some((t) => /coloured by data provenance/i.test(t)),
      "coverage-mode card must disclose provenance shading",
    ).toBeTruthy();
    // provenance legend drawn on the card (measured/inherited framing)
    expect(fills.some((t) => /Inherited/.test(t)), "coverage legend must name the Inherited class").toBeTruthy();
    // the travelling estimate footnote is present and accurate
    expect(
      fills.some((t) => /\d+ of \d+ districts estimated from a parent region/.test(t)),
      "inherited coverage note must be drawn on the card",
    ).toBeTruthy();
  });
});
