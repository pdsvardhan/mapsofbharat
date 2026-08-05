import { test, expect } from "@playwright/test";

// Smoke tests for the Terms of Use + Privacy legal pages (iter-33 item 849).
// They assert the pages render with their key sections and that the shared footer
// now carries the Terms + Privacy links.

test.describe("legal pages (item 849)", () => {
  test("terms renders its key sections and the footer links", async ({ page }) => {
    await page.goto("/terms");

    await expect(page.getByRole("heading", { name: "Terms of Use", exact: true })).toBeVisible();

    // "as is" / no-warranty + the "does not claim" fence + Survey-of-India boundaries
    await expect(page.getByText(/as is/i).first()).toBeVisible();
    await expect(page.getByText(/does\s+not/i).first()).toBeVisible();
    await expect(page.getByText(/Survey of India/i).first()).toBeVisible();
    // reuse / attribution + the pending CC-BY licence
    await expect(page.getByText(/CC-BY/i).first()).toBeVisible();

    // shared footer links (Terms + Privacy live in the footer only)
    await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
    await expect(page.locator('a[href="/methodology"]').first()).toBeVisible();
    await expect(page.locator('a[href="/"]').first()).toBeVisible(); // back-to-the-map
  });

  test("privacy renders its key sections and the footer links", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();

    // cookieless self-hosted analytics + no-raw-IP guarantee + DPDP rights
    await expect(page.getByText(/Umami/i).first()).toBeVisible();
    await expect(page.getByText(/cookieless/i).first()).toBeVisible();
    await expect(page.getByText(/never stored in raw form|never the raw IP|raw IP address is never/i).first()).toBeVisible();
    await expect(page.getByText(/DPDP/i).first()).toBeVisible();

    await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
    await expect(page.locator('a[href="/corrections"]').first()).toBeVisible();
  });

  test("the footer exposes Terms and Privacy from an existing content page", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
    await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
  });
});
