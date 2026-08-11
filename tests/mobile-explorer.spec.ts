import { test, expect, type Locator, type Page } from "@playwright/test";

// The Explorer on a phone (to-do 424) — the V1 launch blocker, and the Android
// half of the 5-person user test (#416).
//
// The atlas was built as three fixed columns: a 300px controls stack, the map,
// and a 322px flex-none ranking rail. Measured on the pre-fix build at a 390px
// viewport, that left the MapLibre canvas 34px wide (4px at 360px), put the
// masthead search box at x=320 and ran the METHODOLOGY link out to x=980 — 590px
// past the right edge, clipped away by the root's overflow-hidden rather than
// scrollable to. Nothing below 1280px was covered by any spec, in either view.
//
// Sub-desktop the layout is now ONE full-bleed map with two collapsible docks:
// the controls stack behind a bar at the top of the plate, the ranking rail as a
// bottom sheet. These freeze the properties that make that usable — the map is
// actually a map, every control is on-screen and hittable at WCAG 2.2's target
// size, and both views are reachable and reversible from a phone.

const METRIC = "/?m=literacy_rate";
const PHONE = [360, 390] as const;
const SUB_DESKTOP = [360, 390, 480, 768] as const;

const controlsBar = (page: Page) => page.getByRole("button", { name: /^(Show|Hide) map controls$/ });
const rankingsSheet = (page: Page) => page.getByRole("button", { name: /^(Show|Hide) rankings$/ });

/** Sub-desktop readiness. The usual probe — the legend's "N districts · unit"
 *  line — is behind the controls disclosure here, so it would only ever prove
 *  the disclosure works. The sheet handle carries the same scope sentence and is
 *  visible at rest, and it only renders that sentence once the metric's values
 *  have landed, so it says both things at once: chrome mounted, data in. */
async function waitForMobileMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(rankingsSheet(page)).toContainText(/\d+ (districts|states)/i, { timeout: 20_000 });
  await page.waitForTimeout(400);
}

/** Desktop readiness — the legend is on screen there, as it always was. */
async function waitForDesktopMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
}

/** Open the mobile controls dock if it is present and closed. */
async function openControls(page: Page) {
  const bar = controlsBar(page);
  await expect(bar, "the mobile controls bar should render below lg").toBeVisible();
  if ((await bar.getAttribute("aria-expanded")) === "false") await bar.click();
  await expect(bar).toHaveAttribute("aria-expanded", "true");
}

async function expectOnScreen(page: Page, loc: Locator, label: string) {
  await expect(loc, `${label} should be visible`).toBeVisible();
  const b = (await loc.boundingBox())!;
  expect(b, `${label} should have a box`).not.toBeNull();
  const vw = page.viewportSize()!.width;
  expect(b.x, `${label} left edge off-screen (x=${b.x})`).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width, `${label} right edge past ${vw} (${b.x + b.width})`).toBeLessThanOrEqual(vw + 0.5);
}

/** WCAG 2.2 SC 2.5.8 minimum. This is a touch surface, so the repo's own choice
 *  is 26px (right-rail.tsx:150) — the spec floor is what is asserted, so a
 *  future tightening to exactly 24 is still legal, and 23 is not. */
async function expectTargetSize(loc: Locator, label: string) {
  const b = (await loc.boundingBox())!;
  expect(b, `${label} should have a box`).not.toBeNull();
  expect(b.width, `${label} is ${Math.round(b.width)}px wide`).toBeGreaterThanOrEqual(24);
  expect(b.height, `${label} is ${Math.round(b.height)}px tall`).toBeGreaterThanOrEqual(24);
}

test.describe("the map is a map on a phone (to-do 424)", () => {
  for (const width of SUB_DESKTOP) {
    test(`at ${width}px the map fills the plate instead of a sliver`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(METRIC);
      await waitForMobileMapReady(page);

      const canvas = (await page.locator("canvas").first().boundingBox())!;
      // Pre-fix this measured 34px at 390 and 4px at 360 — under 10% of the
      // screen. The rail is off the flow now, so the plate is the whole width
      // less its 8px gutters and 1px border.
      expect(canvas.width, `map is ${Math.round(canvas.width)}px wide at ${width}px`)
        .toBeGreaterThanOrEqual(width * 0.85);
      // and it is a real map, not a letterbox: most of the height below the
      // masthead belongs to it.
      expect(canvas.height, `map is ${Math.round(canvas.height)}px tall`).toBeGreaterThanOrEqual(500);
    });

    test(`at ${width}px nothing overflows the viewport horizontally`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(METRIC);
      await waitForMobileMapReady(page);

      // The root is overflow-hidden, so a page that overflows CLIPS rather than
      // scrolls — scrollWidth alone can never fail here, which is exactly how the
      // masthead shipped 590px off-screen. It is asserted anyway (a regression
      // that produced a real scrollbar would be caught), but the load-bearing
      // checks are the per-element boxes below.
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      }));
      expect(sw, `scrollWidth ${sw} vs innerWidth ${iw}`).toBeLessThanOrEqual(iw);

      await expectOnScreen(page, page.getByRole("button", { name: /Search places and indicators/i }), "search");
      await expectOnScreen(page, page.getByRole("link", { name: /CORRECTIONS/i }), "corrections link");
      await expectOnScreen(page, page.getByRole("link", { name: /METHODOLOGY/i }), "methodology link");
      await expectOnScreen(page, controlsBar(page), "controls bar");
      await expectOnScreen(page, rankingsSheet(page), "rankings handle");
    });
  }

  for (const width of PHONE) {
    test(`at ${width}px the masthead controls meet the touch target floor`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(METRIC);
      await waitForMobileMapReady(page);

      await expectTargetSize(page.getByRole("link", { name: /CORRECTIONS/i }), "corrections link");
      await expectTargetSize(page.getByRole("link", { name: /METHODOLOGY/i }), "methodology link");
      await expectTargetSize(page.getByRole("button", { name: /Search places and indicators/i }), "search");
      await expectTargetSize(controlsBar(page), "controls bar");
      await expectTargetSize(rankingsSheet(page), "rankings handle");

      // and the search really opens from here — a masthead control that is on
      // screen but covered is the same defect in a different costume.
      await page.getByRole("button", { name: /Search places and indicators/i }).click();
      await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
      await expectOnScreen(page, page.getByRole("dialog", { name: "Search" }), "search dialog");
      await page.getByRole("button", { name: "Close search" }).click();
      await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
    });
  }
});

test.describe("the controls dock (to-do 424)", () => {
  test("collapsed, it still says what is on the map and how to read it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(METRIC);
    await waitForMobileMapReady(page);

    const bar = controlsBar(page);
    await expect(bar).toHaveAttribute("aria-expanded", "false");
    // the indicator on view, without opening anything
    await expect(bar).toContainText(/Literacy rate/i);
    // the controls themselves are OUT of the tab order while collapsed, not just
    // invisible — display:none, so getByRole cannot see them either
    await expect(page.getByRole("group", { name: "Choose map or table view" })).toHaveCount(0);
  });

  for (const width of PHONE) {
    test(`at ${width}px opening it reveals the full stack, on-screen and hittable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(METRIC);
      await waitForMobileMapReady(page);
      await openControls(page);

      for (const name of ["MAP", "TABLE", "STATES", "DISTRICTS", "CHANGE INDICATOR"]) {
        const btn = page.getByRole("button", { name, exact: true }).first();
        await expectOnScreen(page, btn, `${name} at ${width}px`);
        await expectTargetSize(btn, `${name} at ${width}px`);
        // whatever a tap at its centre lands on must be the button itself
        const owned = await btn.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return el === top || el.contains(top);
        });
        expect(owned, `${name} is covered at ${width}px`).toBe(true);
      }

      // the VIEW toggle renders exactly ONCE, here — not a mobile copy alongside
      // the desktop one (item 910)
      await expect(page.getByRole("group", { name: "Choose map or table view" })).toHaveCount(1);
    });
  }

  test("tapping off the panel closes it and gives the map back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(METRIC);
    await waitForMobileMapReady(page);
    await openControls(page);

    // Find a point that genuinely belongs to the scrim rather than assuming one:
    // the cards' height moves with the metric, the viewport and the legend.
    const y = await page.evaluate(() => {
      for (let probe = 700; probe > 200; probe -= 10) {
        const el = document.elementFromPoint(195, probe);
        if (el && el.hasAttribute("data-controls-scrim")) return probe;
      }
      return -1;
    });
    expect(y, "no point on the plate belongs to the scrim").toBeGreaterThan(0);
    await page.mouse.click(195, y);
    await expect(controlsBar(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("canvas").first()).toBeVisible();
  });
});

test.describe("table view below desktop (to-do 424 / item 826)", () => {
  for (const width of SUB_DESKTOP) {
    test(`at ${width}px the table opens, fills the plate and gets back to the map`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto(METRIC);
      await waitForMobileMapReady(page);

      await openControls(page);
      await page.getByRole("button", { name: "TABLE", exact: true }).first().click();
      await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("data-table-row").first()).toBeVisible();

      // The controls bar must survive the swap and stay UNCOVERED: it carries the
      // VIEW row, so it is the only way back to the map from here. The table is
      // laid out to start below it for exactly this reason.
      const bar = controlsBar(page);
      await expectOnScreen(page, bar, `controls bar in table view at ${width}px`);
      const owned = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el === top || el.contains(top);
      });
      expect(owned, `the controls bar is covered by the table at ${width}px`).toBe(true);

      // the table's own scroll is CONTAINED — the page never gains one
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      }));
      expect(sw, `page scrollWidth ${sw} vs ${iw} in table view`).toBeLessThanOrEqual(iw);

      // and back
      await openControls(page);
      await page.getByRole("button", { name: "MAP", exact: true }).first().click();
      await expect(page.locator("canvas").first()).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    });
  }

  test("at 390px the drilled scope survives the round trip", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/?m=literacy_rate&lvl=district&st=23&stn=Madhya%20Pradesh");
    await waitForMobileMapReady(page);

    await openControls(page);
    await expect(page.getByRole("navigation", { name: "Drill trail" }))
      .toContainText("Madhya Pradesh", { timeout: 15_000 });
    await page.getByRole("button", { name: "TABLE", exact: true }).first().click();
    await expect(page.getByRole("table").locator("caption")).toContainText(/Madhya Pradesh/i);

    await openControls(page);
    await page.getByRole("button", { name: "MAP", exact: true }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Drill trail" })).toContainText("Madhya Pradesh");
  });
});

test.describe("the rankings bottom sheet (to-do 424)", () => {
  test("names its scope at rest, then opens onto the real rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(METRIC);
    await waitForMobileMapReady(page);

    const handle = rankingsSheet(page);
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    // the handle is its own signpost — same sentence the rail's own header shows
    await expect(handle).toContainText(/districts nationwide/i);

    // collapsed, the rail is out of the tree entirely
    const rail = page.locator('aside[aria-label="Rankings and profile"]');
    await expect(rail.getByRole("searchbox").or(rail.getByRole("button", { name: /Kerala/ }))).toHaveCount(0);

    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    const row = rail.getByRole("button").filter({ hasText: "Kerala" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expectOnScreen(page, row, "a ranking row");

    // the sheet stays inside the viewport
    const box = (await rail.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    expect(box.y + box.height).toBeLessThanOrEqual(780.5);

    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
  });

  test("the action toolbar stands down while the sheet is up, and returns", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(METRIC);
    await waitForMobileMapReady(page);

    const card = page.getByRole("button", { name: /Export a social media card/i });
    await expect(card).toBeVisible();
    // it clears the collapsed handle rather than hiding under it
    const [cardBox, handleBox] = [(await card.boundingBox())!, (await rankingsSheet(page).boundingBox())!];
    expect(cardBox.y + cardBox.height, "CARD overlaps the sheet handle").toBeLessThanOrEqual(handleBox.y + 0.5);

    await rankingsSheet(page).click();
    await expect(card).toHaveCount(0);
    await rankingsSheet(page).click();
    await expect(card).toBeVisible();
  });
});

test.describe("desktop keeps the docked layout (to-do 424)", () => {
  for (const width of [1024, 1440] as const) {
    test(`at ${width}px there is no mobile chrome and the rail is still docked`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(METRIC);
      await waitForDesktopMapReady(page);

      // The two dock handles are not rendered at all above lg — not merely
      // display:none. The suite reaches into the rail with raw CSS selectors that
      // do not skip hidden nodes (`aside button` filtered by /\d/), so a handle
      // left in the tree here would be picked up as a ranking row.
      await expect(controlsBar(page)).toHaveCount(0);
      await expect(rankingsSheet(page)).toHaveCount(0);
      expect(await page.locator("aside button").first().textContent())
        .not.toMatch(/RANKINGS|COMPARE/);

      // the rail is still the 322px docked column beside the map
      const rail = (await page.locator('aside[aria-label="Rankings and profile"]').boundingBox())!;
      expect(Math.round(rail.width)).toBe(322);
      expect(Math.round(rail.x + rail.width)).toBe(width);
      expect(Math.round(rail.height)).toBeGreaterThan(600);

      // and the controls stack is open, in place, without a disclosure
      await expect(page.getByRole("group", { name: "Choose map or table view" })).toBeVisible();
    });
  }
});
