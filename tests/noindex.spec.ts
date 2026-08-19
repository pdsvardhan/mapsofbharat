import { test, expect } from "@playwright/test";

// Pre-launch indexing posture (to-do 525).
//
// The site is deployed and reachable long before it is launched, and the only
// address that exists today is the internal one. If a crawler indexes
// mapsofbharat.vault7a.xyz first, that URL becomes what search engines know and
// the real domain later competes with it. Until SITE_LAUNCHED=true, nothing is
// indexable — and the default is unlaunched so forgetting the flag fails safe.

test.describe("pre-launch: nothing is indexable (to-do 525)", () => {
  test("robots.txt disallows everything and advertises no sitemap", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body).toContain("Disallow: /");
    // A sitemap line is an invitation; a Host line names a domain that does not
    // resolve yet. Neither should be present before launch.
    expect(body.toLowerCase()).not.toContain("sitemap:");
    expect(body.toLowerCase()).not.toContain("host:");
    // and it must NOT still be handing out a blanket Allow
    expect(body).not.toMatch(/^Allow: \/$/m);
  });

  test("every page carries X-Robots-Tag: noindex", async ({ request }) => {
    for (const path of ["/", "/metric", "/metric/literacy_rate", "/methodology", "/coverage"]) {
      const r = await request.get(path);
      expect(r.status(), `${path} should still load`).toBeLessThan(400);
      expect(r.headers()["x-robots-tag"], `${path} missing noindex`).toContain("noindex");
    }
  });

  test("the site still WORKS — noindex must not mean unreachable", async ({ page }) => {
    // The whole point is that you and your friends can use it normally.
    await page.goto("/metric/literacy_rate");
    await expect(page.locator('[data-oid="metric-rank-table"]')).toBeVisible({ timeout: 20_000 });
  });
});
