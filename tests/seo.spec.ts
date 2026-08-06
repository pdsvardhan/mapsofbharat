import { test, expect } from "@playwright/test";

// SEO floor — robots.txt + sitemap.xml (iter-b item 881). Runs against a running
// instance with the canonical DB mounted read-only (DB_PATH), so the sitemap
// enumerates real /metric/{id} pages rather than degrading to the static set.

const CANON = "https://mapsofbharat.in";
const STATIC_PATHS = ["/", "/explore", "/methodology", "/coverage", "/corrections", "/terms", "/privacy"];

test.describe("SEO floor — robots + sitemap (item 881)", () => {
  test("/robots.txt allows indexing, disallows /api + /embed, links the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();

    expect(body).toMatch(/User-Agent:\s*\*/i);
    expect(body).toMatch(/Allow:\s*\//i);
    expect(body).toMatch(/Disallow:\s*\/api\b/i);
    expect(body).toMatch(/Disallow:\s*\/embed\b/i);
    // sitemap reference on the canonical public domain
    expect(body).toMatch(/Sitemap:\s*https:\/\/mapsofbharat\.in\/sitemap\.xml/i);
  });

  test("/sitemap.xml is valid XML with the static routes and at least one metric page", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"] || "").toContain("xml");

    const xml = await res.text();
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");

    // every static public page, absolute on the canonical domain
    for (const path of STATIC_PATHS) {
      const url = path === "/" ? `${CANON}/` : `${CANON}${path}`;
      expect(xml).toContain(`<loc>${url}</loc>`);
    }

    // the metric set is enumerated read-only from the DB — at least one /metric/{id}
    expect(xml).toMatch(/<loc>https:\/\/mapsofbharat\.in\/metric\/[^<]+<\/loc>/);

    // /embed is deliberately NOT advertised in the sitemap (it is noindex, item 882)
    expect(xml).not.toContain(`${CANON}/embed`);
  });
});
