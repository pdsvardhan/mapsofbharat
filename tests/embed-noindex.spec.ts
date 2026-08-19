import { test, expect } from "@playwright/test";

// /embed must never be indexed as a standalone page (iter-b item 882). Two layers
// guard it: an X-Robots-Tag: noindex response header set in middleware, and a
// robots:{index:false} metadata directive on app/embed/layout.tsx. This spec
// asserts the header layer — present on /embed, absent on ordinary pages.

test.describe("/embed noindex (item 882)", () => {
  test("/embed responds with X-Robots-Tag: noindex, nofollow", async ({ request }) => {
    const res = await request.get("/embed");
    expect(res.status()).toBeLessThan(400);
    const tag = (res.headers()["x-robots-tag"] || "").toLowerCase();
    expect(tag).toContain("noindex");
    expect(tag).toContain("nofollow");
  });

  test("the embed HTML also carries the robots noindex meta", async ({ page }) => {
    await page.goto("/embed");
    // metadata robots:{index:false, follow:false} → <meta name="robots" ...>
    const content = await page.locator('meta[name="robots"]').first().getAttribute("content");
    expect((content || "").toLowerCase()).toContain("noindex");
  });

  test("the / noindex header follows the launch state; /embed always has it", async ({ request }) => {
    // Pre-launch (to-do 525) EVERY page carries noindex, so "/ has no noindex" is a
    // post-launch statement. What must hold in BOTH states is that /embed is never
    // indexable — that is item 882's actual claim, asserted unconditionally.
    const LAUNCHED = process.env.SITE_LAUNCHED === "true";

    const embed = await request.get("/embed");
    expect((embed.headers()["x-robots-tag"] || "").toLowerCase()).toContain("noindex");

    const root = await request.get("/");
    const tag = (root.headers()["x-robots-tag"] || "").toLowerCase();
    if (LAUNCHED) expect(tag).not.toContain("noindex");
    else expect(tag).toContain("noindex");
  });
});
