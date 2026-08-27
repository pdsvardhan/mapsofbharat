import { test, expect } from "@playwright/test";

// Canonical per-metric pages (iter-131 item 829).
//
// The load-bearing claim is SSR: the ranked table, coverage stats, citation and
// the JSON-LD Dataset must be in the INITIAL HTML (what a crawler sees), not
// injected after hydration. So these assertions read the raw server response via
// the `request` fixture — no browser, no JS — except where interactivity itself is
// under test. literacy_rate is the standing fixture used across the suite (733
// districts, source Census 2011, GODL-India).

const SLUG = "literacy_rate";

test.describe("canonical metric page — SSR (item 829)", () => {
  test("the page is server-rendered with the metric name, ranked rows, citation and coverage", async ({
    request,
  }) => {
    const res = await request.get(`/metric/${SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // H1 carries the metric name
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Literacy rate[\s\S]*<\/h1>/i);

    // ranked table rows are in the SSR markup (DataTable emits data-testid rows)
    const rowCount = (html.match(/data-testid="data-table-row"/g) || []).length;
    expect(rowCount).toBeGreaterThan(100);

    // a real district name appears in a row (proves names were joined server-side)
    expect(html).toMatch(/data-table-row/);
    expect(html.toLowerCase()).toContain("rank");
    expect(html.toLowerCase()).toContain("region");

    // source + license + year citation
    expect(html).toContain("Census of India 2011");
    expect(html).toContain("GODL-India");

    // coverage stats + last-updated line
    expect(html.toLowerCase()).toContain("measured directly");
    expect(html).toMatch(/Last updated \d{4}-\d{2}-\d{2}/);

    // methodology one-liner present (non-empty)
    expect(html.toLowerCase()).toContain("national average");
  });

  test("emits a JSON-LD Dataset with license, temporal + spatial coverage", async ({ request }) => {
    const html = await (await request.get(`/metric/${SLUG}`)).text();
    const m = html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
    );
    expect(m, "JSON-LD script present").toBeTruthy();
    const data = JSON.parse(m![1]);
    expect(data["@type"]).toBe("Dataset");
    expect(String(data.name)).toContain("Literacy rate");
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.license).toBeTruthy();
    expect(data.temporalCoverage).toBe("2011");
    expect(data.spatialCoverage?.name).toBe("India");
    expect(String(data.url)).toContain(`/metric/${SLUG}`);
  });

  test("generateMetadata yields a canonical URL and OG/twitter tags", async ({ request }) => {
    const html = await (await request.get(`/metric/${SLUG}`)).text();
    expect(html).toMatch(
      new RegExp(`<link[^>]+rel="canonical"[^>]+href="[^"]*/metric/${SLUG}"`)
    );
    expect(html).toMatch(/<meta[^>]+property="og:title"[^>]+content="[^"]*Literacy rate/i);
    // og:image comes from the opengraph-image file convention
    expect(html).toMatch(/<meta[^>]+property="og:image"[^>]+content="[^"]*opengraph-image/i);
    expect(html).toMatch(/<meta[^>]+name="twitter:card"[^>]+content="summary_large_image"/i);
  });

  test("the OG image route returns an image", async ({ request }) => {
    const res = await request.get(`/metric/${SLUG}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  });

  test("an unknown slug 404s", async ({ request }) => {
    const res = await request.get("/metric/not_a_metric");
    expect(res.status()).toBe(404);
  });

  test("the interactive map hydrates as an /embed iframe", async ({ page }) => {
    await page.goto(`/metric/${SLUG}`);
    const frame = page.locator('iframe[src*="/embed"]');
    await expect(frame).toHaveCount(1);
    // the framed atlas paints a canvas once it loads
    const embed = page.frameLocator('iframe[src*="/embed"]');
    await expect(embed.locator("canvas").first()).toBeVisible({ timeout: 25_000 });
  });

  // iter-32 item 846: the copyable "To cite this" block renders on a metric page.
  test("renders a copyable citation block in the SSR HTML", async ({ request }) => {
    const html = await (await request.get(`/metric/${SLUG}`)).text();
    expect(html).toContain('data-testid="cite-block"');
    expect(html).toContain('data-testid="cite-copy"');
    // the citation text is composed server-side from the metric's own fields
    expect(html).toContain("MapsOfBharat.");
    expect(html).toContain("Literacy rate");
    expect(html).toContain("/metric/literacy_rate");
  });

  test("the citation copy control is a real <button>", async ({ page }) => {
    await page.goto(`/metric/${SLUG}`);
    const copy = page.locator('[data-testid="cite-copy"]');
    await expect(copy).toBeVisible();
    expect(await copy.evaluate((el) => el.tagName)).toBe("BUTTON");
    await expect(copy).toHaveAttribute("aria-label", /copy citation/i);
  });
});

test.describe("catalogue + sitemap (item 829)", () => {
  test("/metric lists every metric, each linking to its canonical page", async ({ request }) => {
    const { metrics } = await (await request.get("/api/metrics")).json();
    expect(metrics.length).toBeGreaterThan(100);

    const html = await (await request.get("/metric")).text();
    // every metric id has a crawlable link on the catalogue
    for (const m of metrics) {
      expect(html).toContain(`href="/metric/${m.id}"`);
    }
  });

  test("/sitemap.xml includes the metric pages", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`/metric/${SLUG}`);
    expect(xml).toContain("/metric</loc>");
    expect(xml).toMatch(/<loc>[^<]*\/methodology<\/loc>/);
  });

  test("the home page links to the catalogue", async ({ page }) => {
    // `domcontentloaded`, not the default `load` (#608). This asserts that a
    // crawlable link to the catalogue exists in the document. The default waits for
    // the LOAD event, which on the explorer means the map's geometry, its tiles and
    // its fonts — none of which this assertion is about, all of which are slow, and
    // all of which get slower when the rest of the suite is competing for the CPU.
    // So what ran out of time was the navigation, not the link.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const link = page.locator('a[href="/metric"]').first();
    // Attached first, so a failure says WHICH of the two things went wrong: the link
    // is missing from the document, or it is present and not visible.
    await link.waitFor({ state: "attached", timeout: 20_000 });
    await expect(link).toBeVisible({ timeout: 20_000 });
  });
});
