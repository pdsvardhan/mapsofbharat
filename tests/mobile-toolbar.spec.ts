import { test, expect, type Locator, type Page } from "@playwright/test";

// Mobile reachability of the explorer's action toolbar (item #419).
//
// The Compare / Share / CARD toolbar — and the Share menu that carries Copy link,
// Copy embed, WhatsApp share and PNG-card export — is anchored to the bottom-right
// of the MAP PLATE. On a phone the fixed-width right rail squeezes that plate to a
// sliver, so a right-anchored bar landed off the left edge: a feature verifier
// measured the Share trigger's box at x≈-150 at a 390px viewport, making the whole
// toolbar (and thus the mobile-first WhatsApp share) unreachable. Below 480px the
// bar now re-anchors to the viewport and docks bottom-centre. These specs pin that
// down at 390px and confirm the desktop layout still works.

const METRIC = "/?m=literacy_rate"; // a known real id (shared with the smoke/share suites)

/** Assert a rendered element's box sits fully inside the horizontal viewport. */
async function expectHorizontallyOnScreen(page: Page, loc: Locator, label: string) {
  await expect(loc, `${label} should be visible`).toBeVisible();
  const box = await loc.boundingBox();
  expect(box, `${label} should have a layout box`).not.toBeNull();
  const vw = page.viewportSize()!.width;
  // The regression is a negative left edge (x≈-150); the assertion is that the
  // whole box lies within [0, viewport width]. A 0.5px epsilon absorbs subpixel
  // rounding without admitting the ~150px off-screen overflow this guards against.
  expect(box!.x, `${label} left edge off-screen (x=${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, `${label} right edge past viewport (${box!.x + box!.width} > ${vw})`)
    .toBeLessThanOrEqual(vw + 0.5);
}

test("at 390px every toolbar action and the share menu are on-screen and operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(METRIC);

  // toolbar chrome renders with the app shell; wait on the Share trigger itself
  const share = page.getByRole("button", { name: /Share this view/i });
  await expect(share).toBeVisible({ timeout: 20_000 });

  // 1) all three toolbar actions sit fully within the viewport width
  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /^Compare$|^Comparing$/ }), "Compare");
  await expectHorizontallyOnScreen(page, share, "Share trigger");
  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /Export a social media card/i }), "CARD export");

  // 2) the Share trigger is genuinely operable — click() runs Playwright's
  // actionability hit-test, so a covered or off-screen trigger fails here, not just
  // a mis-measured box. Opening the menu proves the bar reaches above the rail.
  await share.click();
  const menu = page.getByRole("menu", { name: /Share options/i });
  await expect(menu).toBeVisible();

  // 3) every share-menu item — incl. the mobile-first WhatsApp share — is visible
  // and fully within the viewport, so the menu opened inside the screen, not off it.
  const copyLink = menu.getByRole("menuitem", { name: /Copy link/i });
  const copyEmbed = menu.getByRole("menuitem", { name: /Copy embed code/i });
  const whatsapp = menu.getByRole("menuitem", { name: /Share this view on WhatsApp/i });
  await expectHorizontallyOnScreen(page, copyLink, "Copy link item");
  await expectHorizontallyOnScreen(page, copyEmbed, "Copy embed item");
  await expectHorizontallyOnScreen(page, whatsapp, "WhatsApp item");

  // WhatsApp behaviour is preserved: a wa.me deep-share carrying the live view URL
  const href = await whatsapp.getAttribute("href");
  expect(href, "WhatsApp href").toBeTruthy();
  expect(href!).toContain("wa.me/?text=");
  expect(href!).toContain(encodeURIComponent(page.url()));

  // the WhatsApp item is itself operable (actionability hit-test), without actually
  // following the target=_blank link (trial run only)
  await expect(whatsapp).toBeEnabled();
  await whatsapp.click({ trial: true });
});

test("at desktop width the toolbar and share menu remain on-screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(METRIC);

  const share = page.getByRole("button", { name: /Share this view/i });
  await expect(share).toBeVisible({ timeout: 20_000 });

  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /^Compare$|^Comparing$/ }), "Compare (desktop)");
  await expectHorizontallyOnScreen(page, share, "Share trigger (desktop)");
  await expectHorizontallyOnScreen(page, page.getByRole("button", { name: /Export a social media card/i }), "CARD export (desktop)");

  await share.click();
  const menu = page.getByRole("menu", { name: /Share options/i });
  await expect(menu).toBeVisible();
  await expectHorizontallyOnScreen(page, menu.getByRole("menuitem", { name: /Share this view on WhatsApp/i }), "WhatsApp item (desktop)");
});
