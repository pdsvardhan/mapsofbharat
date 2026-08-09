import { test, expect, Page } from "@playwright/test";

// Iteration 35 — control affordances raised by report 154 (visual-QA, 4 Aug).
//
// Every assertion here is on a MEASURED property, because that is the line
// adr-030 draws: a corrective fix on an existing component states its number,
// and anything without one is a restyle that belongs behind the component-pick
// gate. So these tests check contrast-bearing colours, hit-target sizes and
// equal widths — not "looks better".
//
// Panel ground is #12130f. Token contrast against it, computed once:
//   --muted  #a49d8c  6.91:1   --faint #8a8477  5.02:1
//   --dim    #6a6455  3.17:1   --accent #d1502f 4.35:1   (both under AA's 4.5)

const MUTED = "rgb(164, 157, 140)"; // --muted  #a49d8c
const DIM = "rgb(106, 100, 85)"; //    --dim    #6a6455

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("legend reverse control (item 908, report 154 #1)", () => {
  test("the legend carries a reverse control in value mode", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    // The control the owner went looking for and did not find: on the legend,
    // not two clicks deep inside the gear popover.
    const rev = page.locator("[data-legend-reverse]");
    await expect(rev).toBeVisible();
    await expect(rev).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking it flips the ramp, persists to ?rev=1 and toggles back", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    const swatch = page.locator("[data-legend-row]").first().locator("span").first();
    const before = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.locator("[data-legend-reverse]").click();

    await expect(page.locator("[data-legend-reverse]")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => new URL(page.url()).searchParams.get("rev")).toBe("1");

    const after = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(after, "the first legend swatch takes the other end of the ramp").not.toBe(before);

    // and back — one control, two directions, not a one-way switch
    await page.locator("[data-legend-reverse]").click();
    await expect(page.locator("[data-legend-reverse]")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => new URL(page.url()).searchParams.get("rev")).toBeNull();
    await expect.poll(() => swatch.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
  });

  test("it drives the same state as the gear popover's DIRECTION row", async ({ page }) => {
    // The point of the item: a second TRIGGER for one setting, never a second
    // setting. Flip it on the legend, and the popover must already agree.
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    await page.locator("[data-legend-reverse]").click();
    await page.locator("[data-scale-toggle]").click();

    const popoverToggle = page
      .getByRole("dialog", { name: "Scale options" })
      .getByRole("button", { name: /REVERSE/ });
    await expect(popoverToggle).toContainText("ON");
  });

  test("it is absent in vs-avg mode, whose ramp ignores reverse", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    await page.locator('[data-legend-mode="vs_avg"]').click();
    // Offering a control that provably does nothing is the lie this guards.
    await expect(page.locator("[data-legend-reverse]")).toHaveCount(0);
  });
});

test.describe("control affordances (items 911 / 915 / 917, report 154 #3 / #7 / #9)", () => {
  test("'Browse all metrics' is a real target at an AA-passing colour", async ({ page }) => {
    // No metric on "/" — the map sits in its START HERE empty state and never
    // renders a region count, so this waits on the indicator card instead.
    await page.goto("/");
    await expect(page.getByRole("button", { name: /BROWSE INDICATORS|CHANGE INDICATOR/ })).toBeVisible({
      timeout: 20_000,
    });

    const link = page.getByRole("link", { name: /Browse all metrics/ });
    await expect(link).toBeVisible();

    // was 17px tall — a caption-sized target under a full-width button
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(28);

    // was --faint (5.02:1); --muted is 6.91:1
    await expect(link).toHaveCSS("color", MUTED);
  });

  test("'ALL INDICATORS' is a labelled disclosure, not a line of text", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    await page.locator("canvas").first().click({ position: { x: 400, y: 300 } });

    const all = page.getByRole("button", { name: /ALL INDICATORS/ });
    await expect(all).toBeVisible();

    // the disclosure state was invisible to assistive tech before
    await expect(all).toHaveAttribute("aria-expanded", "false");
    await all.click();
    await expect(all).toHaveAttribute("aria-expanded", "true");

    // and it reads as a control: bordered, with a real hit area
    const box = await all.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24);
    await expect(all).not.toHaveCSS("border-top-width", "0px");
  });

  test("the clear-selection cross clears AA and is big enough to hit", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    await page.locator("canvas").first().click({ position: { x: 400, y: 300 } });

    const clear = page.getByRole("button", { name: "Clear selection" });
    await expect(clear).toBeVisible();

    // --dim is 3.17:1 — under the 4.5:1 AA floor for text
    await expect(clear).not.toHaveCSS("color", DIM);
    await expect(clear).toHaveCSS("color", MUTED);

    const box = await clear.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeGreaterThanOrEqual(24);

    // still does its job
    await clear.click();
    await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0);
  });
});

test.describe("segmented control widths (item 916, report 154 #8)", () => {
  test("the VIEW and LEVEL groups share an edge", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    const view = page.getByRole("group", { name: "Choose map or table view" });
    await expect(view).toBeVisible();

    // The LEVEL group is the segmented pair directly below VIEW in the same card.
    const level = page.getByRole("button", { name: "STATES", exact: true }).locator("..");

    const [vBox, lBox] = [await view.boundingBox(), await level.boundingBox()];
    // Sub-pixel layout rounding is fine; two different content widths are not.
    expect(Math.abs(vBox!.width - lBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(vBox!.x + vBox!.width - (lBox!.x + lBox!.width))).toBeLessThanOrEqual(1);
  });

  test("the longest pair grows rather than clipping", async ({ page }) => {
    // BOUNDARIES only renders for a metric with 2011-vintage rows. Its labels are
    // longer than the shared minimum, which is why that minimum is a min-width
    // and not a fixed width.
    await page.goto("/?m=literacy_rate");
    await waitForMapReady(page);

    const today = page.getByRole("button", { name: "TODAY", exact: true });
    if ((await today.count()) === 0) test.skip(true, "metric has no 2011 vintage");

    const asReported = page.getByRole("button", { name: /2011 AS REPORTED/ });
    const box = await asReported.boundingBox();
    const text = await asReported.evaluate((el) => el.scrollWidth);
    expect(box!.width + 1).toBeGreaterThanOrEqual(text);
  });
});
