import { test, expect } from "@playwright/test";

// The border-colour cascade (adr-034).
//
// `* { border-color: var(--border) }` used to sit UNLAYERED in globals.css while
// Tailwind v4 emits utilities into `@layer utilities`. Unlayered declarations beat
// layered ones regardless of specificity, so every border-colour utility in the app
// was discarded: 52 declarations across 18 files asked for soft/faint/accent and all
// painted --border. Nothing was misspelled, no utility was missing, and no test saw
// it — the class was present in the DOM and in the stylesheet, and simply lost.
//
// These assertions are the guard, and they are deliberately about RESOLVED colour
// rather than class names, because the class name was never the thing that broke.

test.describe("border-colour utilities beat the base default (adr-034)", () => {
  test("a --border-faint utility resolves to --border-faint, not --border", async ({ page }) => {
    await page.goto("/metric/literacy_rate");
    await page.waitForSelector('[data-role="region-row"]', { timeout: 20_000 });

    const r = await page.evaluate(() => {
      const row = document.querySelector('[data-role="region-row"]') as HTMLElement;
      const s = getComputedStyle(document.documentElement);
      return {
        cls: row.className,
        resolved: getComputedStyle(row).borderBottomColor,
        faint: s.getPropertyValue("--border-faint").trim(),
        border: s.getPropertyValue("--border").trim(),
      };
    });

    expect(r.cls).toContain("border-border-faint");
    expect(r.faint).toBe("#211e14");
    expect(r.border).toBe("#3b3626");
    // the whole bug in one line: this used to be rgb(59, 54, 38)
    expect(r.resolved).toBe("rgb(33, 30, 20)");
  });

  test("a --border-soft utility resolves to --border-soft", async ({ page }) => {
    await page.goto("/metric/literacy_rate");
    await page.waitForSelector(".border-border-soft", { timeout: 20_000 });
    const c = await page
      .locator(".border-border-soft")
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(c).toBe("rgb(42, 38, 25)"); // #2a2619
  });

  test("an element with NO colour utility still gets the base default", async ({ page }) => {
    // The fix must not remove the default — that is what `base` is for.
    await page.goto("/metric/literacy_rate");
    await page.waitForSelector("body", { timeout: 20_000 });
    const c = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.borderWidth = "1px";
      d.style.borderStyle = "solid";
      document.body.appendChild(d);
      const v = getComputedStyle(d).borderTopColor;
      d.remove();
      return v;
    });
    expect(c).toBe("rgb(59, 54, 38)"); // --border
  });
});
