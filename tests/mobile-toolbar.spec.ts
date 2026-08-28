import { test, expect, type Locator, type Page } from "@playwright/test";
import { stableBoundingBox } from "./lib/stable-box";

// Mobile reachability of the explorer's action toolbar (item #419).
//
// The Compare / Share / CARD toolbar — and the Share menu that carries Copy link,
// Copy embed, WhatsApp share and PNG-card export — is anchored to the bottom-right
// of the MAP PLATE. On a phone the fixed-width right rail squeezes that plate to a
// sliver, so a right-anchored bar landed off the left edge: a feature verifier
// measured the Share trigger's box at x≈-150 at a 390px viewport, making the whole
// toolbar (and thus the mobile-first WhatsApp share) unreachable.
//
// The bar now re-anchors to the VIEWPORT (fixed, bottom-centre) below the lg desktop
// breakpoint (≤1023px). The cutoff is lg, not a narrower value: the fixed-width right
// rail keeps the plate too narrow for a right-anchored bar well past 640px, so earlier
// 480px and 640px thresholds each left an off-screen dead band (caught in the #419
// fix-loop). These specs sweep the whole sub-desktop range and confirm the ≥1024px
// desktop layout still works unchanged.

const METRIC = "/?m=literacy_rate"; // a known real id (shared with the smoke/share suites)

/** Assert a rendered element's box sits fully inside the horizontal viewport. */
async function expectHorizontallyOnScreen(page: Page, loc: Locator, label: string) {
  await expect(loc, `${label} should be visible`).toBeVisible();
  // Settled, not merely visible (#608). toBeVisible() resolves the moment the
  // element is in the layout and says nothing about whether the layout has
  // FINISHED — and this toolbar's anchor is derived from the map plate's width,
  // which the right rail resizes after hydration. Reading inside that window
  // returns a position no reader ever sees, and is how a correct toolbar gets
  // reported as off-screen. The window is wider on a contended machine, which is
  // the whole difference between green alone and red in the suite. A longer
  // timeout does not help: it is the wrong event, not too short a wait.
  // tests/stable-box.spec.ts demonstrates the naive read getting it wrong.
  const box = await stableBoundingBox(page, loc, label);
  expect(box, `${label} should have a layout box`).not.toBeNull();
  const vw = page.viewportSize()!.width;
  // The regression is a negative left edge (x≈-150); the assertion is that the
  // whole box lies within [0, viewport width]. A 0.5px epsilon absorbs subpixel
  // rounding without admitting the off-screen overflow this guards against.
  expect(box!.x, `${label} left edge off-screen (x=${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, `${label} right edge past viewport (${box!.x + box!.width} > ${vw})`)
    .toBeLessThanOrEqual(vw + 0.5);
}

/** The full reachability + operability contract for the toolbar at the current width. */
async function runToolbarChecks(page: Page, label: string) {
  const share = page.getByRole("button", { name: /Share this view/i });
  await expect(share, `Share trigger ${label} should render`).toBeVisible({ timeout: 20_000 });

  // 1) all three toolbar actions sit fully within the viewport width
  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /^Compare$|^Comparing$/ }), `Compare ${label}`);
  await expectHorizontallyOnScreen(page, share, `Share trigger ${label}`);
  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /Export a social media card/i }), `CARD export ${label}`);

  // 2) the Share trigger is genuinely operable — click() runs Playwright's
  // actionability hit-test, so a covered or off-screen trigger fails here.
  await share.click();
  const menu = page.getByRole("menu", { name: /Share options/i });
  await expect(menu, `Share menu ${label} should open`).toBeVisible();

  // 3) every share-menu item — incl. the mobile-first WhatsApp share — is visible
  // and fully within the viewport, so the menu opened inside the screen, not off it.
  const whatsapp = menu.getByRole("menuitem", { name: /Share this view on WhatsApp/i });
  await expectHorizontallyOnScreen(page, menu.getByRole("menuitem", { name: /Copy link/i }), `Copy link ${label}`);
  await expectHorizontallyOnScreen(page, menu.getByRole("menuitem", { name: /Copy embed code/i }), `Copy embed ${label}`);
  await expectHorizontallyOnScreen(page, whatsapp, `WhatsApp item ${label}`);

  // WhatsApp behaviour is preserved: a wa.me deep-share carrying the live view URL,
  // and the item is itself operable (trial hit-test, without following target=_blank).
  const href = await whatsapp.getAttribute("href");
  expect(href, `WhatsApp href ${label}`).toBeTruthy();
  expect(href!).toContain("wa.me/?text=");
  expect(href!).toContain(encodeURIComponent(page.url()));
  await expect(whatsapp).toBeEnabled();
  await whatsapp.click({ trial: true });
}

// Sub-desktop viewports — including the previously-broken bands (480px and 640px).
// Every width below the 1024px desktop cutoff must keep the toolbar + share menu
// fully on-screen and operable.
for (const width of [360, 390, 480, 559, 700, 1000]) {
  test(`at ${width}px every toolbar action and the share menu are on-screen and operable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(METRIC);
    await runToolbarChecks(page, `@${width}px`);
  });
}

// At/above the 1024px desktop cutoff the toolbar keeps its original right-anchored
// (absolute) layout — and must still be on-screen.
for (const width of [1024, 1280]) {
  test(`at ${width}px the toolbar (desktop layout) remains on-screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(METRIC);
    await runToolbarChecks(page, `@${width}px desktop`);
  });
}
