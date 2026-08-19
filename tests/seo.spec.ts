import { test, expect } from "@playwright/test";

// SEO floor — robots.txt + sitemap.xml (iter-b item 881). Runs against a running
// instance with the canonical DB mounted read-only (DB_PATH), so the sitemap
// enumerates real /metric/{id} pages rather than degrading to the static set.

// LAUNCH-AWARE (to-do 525). Until SITE_LAUNCHED=true the site is deployed but
// deliberately NOT indexable, so the post-launch posture asserted below is a FUTURE
// state. Both states are asserted rather than skipped: a skip reads as green, and
// this project has already been bitten by tests that passed by not running.
const LAUNCHED = process.env.SITE_LAUNCHED === "true";

const CANON = "https://mapsofbharat.in";
const STATIC_PATHS = ["/", "/explore", "/methodology", "/coverage", "/corrections", "/terms", "/privacy"];

test.describe("SEO floor — robots + sitemap (item 881)", () => {
  test("/robots.txt matches the launch state", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/User-Agent:\s*\*/i);

    if (!LAUNCHED) {
      // Pre-launch: everything disallowed, nothing advertised. Detail lives in
      // tests/noindex.spec.ts; this branch only guarantees the two postures can
      // never be mistaken for one another.
      expect(body).toMatch(/Disallow:\s*\/\s*$/m);
      expect(body.toLowerCase()).not.toContain("sitemap:");
      return;
    }

    // ANCHORED. Unanchored, /Allow:\s*\//i matches inside "Disallow: /" — so the
    // pre-launch body satisfied this line by accident, and the branch only failed
    // one assertion later. A check that can pass on the opposite state is not a check.
    expect(body).toMatch(/^Allow:\s*\/\s*$/im);
    expect(body).toMatch(/Disallow:\s*\/api/i);
    expect(body).toMatch(/Disallow:\s*\/embed/i);
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
