import { test, expect, type Page } from "@playwright/test";

// iter-26 regression guards. Every case here pins a defect that actually shipped
// or was caught by the item's verifier — none of them are hypothetical:
//   750  the chooser's topic column stopped at ~9 of 20 topics
//   751  three live categories fell back to the demographics person icon
//   756  a scale pick on one metric followed the user to every other metric
//   764  Escape dismissed a popover AND silently cleared the map selection
// Three separate verifiers flagged the absence of these tests as the one gap in
// an otherwise clean item, on the grounds that nothing in typecheck or lint would
// notice any of it coming back.

const DEMOGRAPHICS_ICON_START = "M12 8a3 3 0 100-6";
const FALLBACK_ACCENT = "rgb(209, 80, 47)"; // #d1502f

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
}

async function openChooser(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /BROWSE INDICATORS/i }).click();
  const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("indicator chooser taxonomy (items 750, 751)", () => {
  test("every live category is present, reachable by scrolling, and clickable", async ({ page, request }) => {
    const payload = (await (await request.get("/api/metrics")).json()) as { metrics: { category: string }[] };
    const live: string[] = [...new Set(payload.metrics.map((m) => m.category))];
    expect(live.length).toBeGreaterThan(0);

    const dialog = await openChooser(page);
    const topics = dialog.locator("button").filter({ hasText: /^\w+\s*\d+ indicator/ });
    const names = (await topics.allInnerTexts()).map((t) => t.split("\n")[0].trim().toLowerCase());
    // no category may be missing from the browse path — the 750 bug hid 11 of 20
    for (const c of live) expect(names).toContain(c.toLowerCase());

    // the column must genuinely scroll, not merely paint the overflow
    const scroller = dialog.locator("div.atl-scroll").first();
    const box = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(box.sh).toBeGreaterThan(box.ch);

    // and the LAST topic must be reachable and actionable, not just present in the DOM
    const last = topics.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    const lastName = (await last.innerText()).split("\n")[0].trim();
    await last.click();
    await expect(dialog.getByText(lastName, { exact: false }).first()).toBeVisible();
  });

  test("no category falls back to the demographics icon or the default accent", async ({ page }) => {
    const dialog = await openChooser(page);
    const topics = dialog.locator("button").filter({ hasText: /^\w+\s*\d+ indicator/ });
    const n = await topics.count();
    const offenders: string[] = [];
    for (let i = 0; i < n; i++) {
      const topic = topics.nth(i);
      await topic.scrollIntoViewIfNeeded();
      await topic.click();
      const name = (await topic.innerText()).split("\n")[0].trim().toLowerCase();
      if (name === "demographics") continue; // the only category entitled to that glyph
      const icon = dialog.locator("svg path").first();
      const d = (await icon.getAttribute("d")) ?? "";
      const stroke = await icon.evaluate((el) => getComputedStyle(el).stroke);
      if (d.startsWith(DEMOGRAPHICS_ICON_START)) offenders.push(`${name}: fallback icon`);
      if (stroke === FALLBACK_ACCENT) offenders.push(`${name}: fallback accent`);
    }
    expect(offenders).toEqual([]);
  });
});

test.describe("scale method is scoped per metric (item 756)", () => {
  test("a method reached by switching metrics matches a cold open of that metric", async ({ page }) => {
    // The guard used to judge the incoming metric's default against the OUTGOING
    // metric's rows, so the same metric classed differently depending on how you
    // arrived at it. Cold open is the reference.
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(1200); // let the guard settle if it fires
    const cold = new URL(page.url()).searchParams.get("brk");

    await page.goto("/?m=sex_ratio&lvl=district");
    await waitForMapReady(page);
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(1200);
    const switched = new URL(page.url()).searchParams.get("brk");

    expect(switched).toBe(cold);
  });

  test("an automatic method is never stamped into the share link", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(1200);
    // nothing was picked, so nothing may be pinned
    expect(new URL(page.url()).searchParams.get("brk")).toBeNull();
  });

  test("a URL-pinned method survives leaving the metric and coming back", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district&brk=continuous");
    await waitForMapReady(page);
    await page.goto("/?m=sex_ratio&lvl=district");
    await waitForMapReady(page);
    await page.goto("/?m=literacy_rate&lvl=district&brk=continuous");
    await waitForMapReady(page);
    await page.waitForTimeout(1200);
    expect(new URL(page.url()).searchParams.get("brk")).toBe("continuous");
  });
});

test.describe("popover dismissal (item 764)", () => {
  // The selection probe MUST be something that is absent when nothing is selected.
  // A first draft used getByText(/percentile|rank/i).first(), which silently resolved
  // to the always-present rail heading "Ranked by <metric>" — so the assertion passed
  // with the selection destroyed, and the guard could not fail. A test that cannot
  // fail is worse than no test: the next reader counts it as coverage.
  const selectionProbe = (page: Page) => page.getByRole("button", { name: "Clear selection" });

  async function selectARegion(page: Page) {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await page.locator("aside button").filter({ hasText: /\d/ }).first().click();
    await expect(selectionProbe(page)).toBeVisible({ timeout: 10_000 });
  }

  test("Escape closes the scale popover without discarding the map selection", async ({ page }) => {
    await selectARegion(page);
    await page.locator("[data-scale-toggle]").click();
    const popover = page.getByRole("dialog", { name: /Scale options/i });
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    // Escape dismisses the topmost layer ONLY — the selection must survive
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape on the cohort dropdown preserves the map selection", async ({ page }) => {
    await selectARegion(page);
    const toggle = page.getByRole("button", { name: /All states|Top 10/i }).first();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape on the share menu preserves the map selection", async ({ page }) => {
    await selectARegion(page);
    await page.getByRole("button", { name: /Share this view/i }).click();
    const menu = page.getByRole("menu", { name: /Share options/i });
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape with no popover open still clears the selection", async ({ page }) => {
    // The counterpart to the three above: stopPropagation must not starve the
    // map's own Escape handler when there is no layer above it (item 405).
    await selectARegion(page);
    await page.keyboard.press("Escape");
    await expect(selectionProbe(page)).toBeHidden();
  });

  test("the scale trigger is not a dead toggle", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    const trigger = page.locator("[data-scale-toggle]");
    const popover = page.getByRole("dialog", { name: /Scale options/i });

    await trigger.click();
    await expect(popover).toBeVisible();
    await trigger.click(); // outside the panel: the dismiss must not fight the toggle
    await expect(popover).toBeHidden();
    await trigger.click();
    await expect(popover).toBeVisible();
  });

  test("clicking outside closes the cohort dropdown", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    const toggle = page.getByRole("button", { name: /All states|Top 10/i }).first();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.mouse.click(12, 12);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
