import { test, expect, Page } from "@playwright/test";

// R2 "ruled-sheet" — the weight decisions for the metric-row cluster
// (design ledger rows 94-98, authored 2026-08-13, built at 547dbef).
//
// This spec exists because R2 shipped UNPINNED. It was decided, built, deployed and
// eyeballed, and not one of its five values was asserted anywhere — so a regression
// of the swatch radius, the bar gap or the panel rules would have passed 201 green
// tests. The suite proved nothing broke; it could not prove the design was there.
//
// That is the same shape as the defect R3 fixed: a value declared in one place and
// silently contradicted in another. Decided design is a claim about the built page,
// so it gets a test like any other claim.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("R2 ruled-sheet, as built (ledger rows 94-98)", () => {
  test("panel.border-treatment = 3px rules above and below, and NO side edges", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.getByLabel("Search the ranking").fill("Bastar");
    await page.locator("button", { hasText: "Bastar" }).first().click();

    const panel = page.locator('[data-oid="region-indicator-panel"]');
    await expect(panel).toBeVisible();

    const s = await panel.evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        top: c.borderTopWidth,
        bottom: c.borderBottomWidth,
        left: c.borderLeftWidth,
        right: c.borderRightWidth,
        radius: c.borderTopLeftRadius,
        bgImage: c.backgroundImage,
        shadow: c.boxShadow,
      };
    });

    expect(s.top).toBe("3px");
    expect(s.bottom).toBe("3px");
    // An open-sided BAND. The 2px accent rule down the left edge is the thing the
    // ruled-sheet direction removed; if it comes back, this fails.
    expect(s.left).toBe("0px");
    expect(s.right).toBe("0px");
    // panel.corner-radius = 0
    expect(s.radius).toBe("0px");
    // A gradient is a drawn surface, and the accent wash was removed with the rule.
    expect(s.bgImage).toBe("none");
    // panel.surface-depth = flat-no-lift
    expect(s.shadow).toBe("none");
  });

  test("bar.bar-shape = abutting columns — the bins touch", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.getByLabel("Search the ranking").fill("Bastar");
    await page.locator("button", { hasText: "Bastar" }).first().click();

    const bins = page.locator('[data-role="bar"]');
    await expect(bins.first()).toBeAttached();
    expect(await bins.count()).toBe(9);

    const gap = await bins.first().evaluate((el) => getComputedStyle(el.parentElement!).columnGap);
    // "normal" resolves to 0 for flex; either is abutting, "2px" (the old gap-0.5) is not.
    expect(["0px", "normal"]).toContain(gap);

    // Measured, not just declared: consecutive bins share an edge.
    const boxes = await bins.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(Math.abs(boxes[i].left - boxes[i - 1].right)).toBeLessThan(0.75);
    }
  });

  test("swatch.swatch-shape = square-tile — the chooser swatch has no radius", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /BROWSE INDICATORS/i }).click();
    const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
    await expect(dialog).toBeVisible();

    const swatch = dialog.locator('[data-role="swatch"]').first();
    await expect(swatch).toBeVisible();
    const radius = await swatch.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    // was rounded-lg (8px)
    expect(radius).toBe("0px");
  });
});
