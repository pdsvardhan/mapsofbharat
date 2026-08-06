import { test, expect } from "@playwright/test";

// WhatsApp share affordance (iter-b item 883): the Atlas Share menu exposes a
// WhatsApp option whose href is a wa.me/?text= deep-share carrying the SAME
// permalink Copy link uses (the live view URL). Neutral caption, opens in a new
// tab safely (rel=noopener).

test("the Share menu offers a WhatsApp deep-share of the current view", async ({ page }) => {
  // load a real indicator so the deep link carries a metric param and the caption
  // is populated (the smoke suite uses this same known id)
  await page.goto("/?m=literacy_rate");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

  // open the Share menu
  await page.getByRole("button", { name: /Share this view/i }).click();
  const menu = page.getByRole("menu", { name: /Share options/i });
  await expect(menu).toBeVisible();

  // the WhatsApp control renders as an accessible menuitem link
  const wa = menu.getByRole("menuitem", { name: /Share this view on WhatsApp/i });
  await expect(wa).toBeVisible();

  const href = await wa.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href!).toContain("wa.me/?text=");

  // the encoded deep link (the current view URL) rides in the share text — reuse of
  // the same URL Copy link builds, not a second invented format
  const encodedLink = encodeURIComponent(page.url());
  expect(href!).toContain(encodedLink);

  // opens in a new tab, safely
  expect(await wa.getAttribute("target")).toBe("_blank");
  expect((await wa.getAttribute("rel")) || "").toContain("noopener");
});
