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

  test("/ does NOT carry an X-Robots-Tag noindex header", async ({ request }) => {
    const res = await request.get("/");
    const tag = (res.headers()["x-robots-tag"] || "").toLowerCase();
    expect(tag).not.toContain("noindex");
  });
});
