import { test, expect, Page } from "@playwright/test";

// Data motion on the region panel — the count-up and the nine-bin rank histogram
// (design round `metric-row-cluster` R3, to-do 472 / item 752).
//
// This exists because the motion it checks was DECLARED AND DEAD. The bins carried
// `.rankbar`, whose only transition was on `width` — and the bins are `flex-1` with
// an inline `height`, so their width never changed and nothing ever animated. The
// class promised a grow the element could not perform, and no test looked, because
// every existing spec asserts CONTENT (rank text, values) and none asserts that a
// declared behaviour is wired to the property it claims to move.
//
// So these assertions are about the WIRING, not the appearance: which property the
// transition targets, and whether a height change is observably interpolated.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function selectKerala(page: Page) {
  await page.getByLabel("Search the ranking").fill("Kerala");
  await page.locator("button", { hasText: "Kerala" }).first().click();
  await expect(page.getByText("SELECTED · STATE")).toBeVisible();
}

test.describe("region-panel data motion (R3, item 752)", () => {
  test("the histogram bins transition HEIGHT — the dimension that actually varies", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await selectKerala(page);

    const bin = page.locator('[data-role="bar"]').first();
    await expect(bin).toBeAttached();

    const css = await bin.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        cls: el.className,
        prop: s.transitionProperty,
        dur: s.transitionDuration,
        inlineHeight: (el as HTMLElement).style.height,
        inlineWidth: (el as HTMLElement).style.width,
      };
    });

    // The bug, pinned: height is the data dimension (set inline); width is not set
    // at all (flex-1 owns it). A transition naming only `width` animates nothing.
    expect(css.inlineHeight).toMatch(/%$/);
    expect(css.inlineWidth).toBe("");
    expect(css.cls).toContain("rankbin");
    expect(css.prop).toContain("height");
    expect(css.dur).toContain("0.56s");
  });

  test("a height change is interpolated, not snapped", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await selectKerala(page);

    // Two traps this test fell into on its first draft, both of which made it pass
    // against the very defect it exists to catch:
    //
    // 1. getBoundingClientRect() INCLUDES transforms, and the bins carry a 420ms
    //    scaleY grow-in on mount. Sampling inside that window films the animation,
    //    not the transition, so a snapped height still reads as many distinct
    //    values. Use computed height, which is the layout value, transform-free.
    // 2. Sampling immediately after selection lands inside that same window.
    //    Wait the grow out first.
    //
    // Mutation-checked: reverting .rankbin to `transition: width` must fail THIS
    // test, not only the wiring one above.
    await page.waitForTimeout(700); // outlast the 420ms grow-in

    const samples = await page.evaluate(async () => {
      const el = document.querySelector('[data-role="bar"]') as HTMLElement;
      const h = () => parseFloat(getComputedStyle(el).height);
      const start = h();
      el.style.height = el.style.height === "100%" ? "20%" : "100%";
      const out: number[] = [start];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 55));
        out.push(h());
      }
      return out;
    });

    const distinct = new Set(samples.map((h) => Math.round(h * 4) / 4));
    expect(
      distinct.size,
      `expected interpolation but saw ${distinct.size} distinct height(s): ${samples.join(", ")}`,
    ).toBeGreaterThan(2);
  });

  test("the bins grow in on mount", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await selectKerala(page);

    const anim = await page
      .locator('[data-role="bar"]')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("atlGrowY");
  });

  test("prefers-reduced-motion removes both the transition and the grow-in", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await selectKerala(page);

    const css = await page.locator('[data-role="bar"]').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { dur: s.transitionDuration, anim: s.animationName };
    });
    expect(css.dur).toBe("0s");
    expect(css.anim).toBe("none");
  });
});
