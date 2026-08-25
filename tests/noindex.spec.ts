import { test, expect } from "@playwright/test";

// Pre-launch indexing posture (to-do 525).
//
// The site is deployed and reachable long before it is launched, and the only
// address that exists today is the internal one. If a crawler indexes
// mapsofbharat.vault7a.xyz first, that URL becomes what search engines know and
// the real domain later competes with it. Until SITE_LAUNCHED=true, nothing is
// indexable — and the default is unlaunched so forgetting the flag fails safe.

// LAUNCH-AWARE as of iter-43. This spec asserted the pre-launch posture
// unconditionally, so it went red the moment anything ran with SITE_LAUNCHED=true
// — which is now a real CI job rather than a hypothetical. The pre-launch
// assertions still run exactly as before; the launched branch asserts the mirror
// image instead of skipping, because a skip reads as green.
const LAUNCHED = process.env.SITE_LAUNCHED === "true";

test.describe("pre-launch: nothing is indexable (to-do 525)", () => {
  test("robots.txt matches the launch state", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    const body = await r.text();
    if (LAUNCHED) {
      // Launched: crawl the site, keep the JSON API and the chrome-less embed
      // view out, and advertise the sitemap.
      expect(body).toMatch(/^Allow: \/$/m);
      expect(body).toContain("Disallow: /embed");
      expect(body.toLowerCase()).toContain("sitemap:");
      return;
    }
    expect(body).toContain("Disallow: /");
    // A sitemap line is an invitation; a Host line names a domain that does not
    // resolve yet. Neither should be present before launch.
    expect(body.toLowerCase()).not.toContain("sitemap:");
    expect(body.toLowerCase()).not.toContain("host:");
    // and it must NOT still be handing out a blanket Allow
    expect(body).not.toMatch(/^Allow: \/$/m);
  });

  test("every page's X-Robots-Tag matches the launch state", async ({ request }) => {
    for (const path of ["/", "/metric", "/metric/literacy_rate", "/methodology", "/coverage"]) {
      const r = await request.get(path);
      expect(r.status(), `${path} should still load`).toBeLessThan(400);
      const hdr = r.headers()["x-robots-tag"] ?? "";
      if (LAUNCHED) {
        // The site-wide header is withdrawn at launch. /embed keeps its own —
        // it is asserted separately in embed-noindex.spec.ts — and no path in
        // this list is /embed.
        expect(hdr, `${path} still carries a noindex header after launch`).not.toContain("noindex");
      } else {
        expect(hdr, `${path} missing noindex`).toContain("noindex");
      }
    }
  });

  test("the site still WORKS — noindex must not mean unreachable", async ({ page }) => {
    // The whole point is that you and your friends can use it normally.
    await page.goto("/metric/literacy_rate");
    await expect(page.locator('[data-oid="metric-rank-table"]')).toBeVisible({ timeout: 20_000 });
  });
});
