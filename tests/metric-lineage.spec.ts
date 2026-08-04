import { test, expect } from "@playwright/test";

// Data-lineage section + free raw download + Pro placeholder (iter-131 item 831).
//
// The lineage chain and both download affordances are load-bearing SSR (AC 1), so
// most assertions read the raw server HTML via the `request` fixture. literacy_rate
// is the standing fixture (Census 2011, GODL-India) and has a HOSTED raw file
// (the PCA workbook); forest_cover_pct is a metric whose raw is a large PDF, so it
// LINKS the official source instead of hosting a copy.

const HOSTED = "literacy_rate"; // raw = PCA .xlsx, served with a citation header
const HOSTED_CSV = "crime_ipc_rate"; // raw = CSV, citation PREPENDED into the body
const LINKED = "forest_cover_pct"; // raw = ISFR 2023 vol-2 PDF, official link only

test.describe("data lineage — SSR chain (item 831 AC 1)", () => {
  test("the metric page renders the raw→processing→inputs→final chain server-side", async ({
    request,
  }) => {
    const html = await (await request.get(`/metric/${HOSTED}`)).text();

    // The section is in the SSR markup
    expect(html).toContain('data-testid="lineage"');

    // Step labels — the four links of the chain
    expect(html).toContain("Raw source");
    expect(html).toContain("Processing");
    expect(html).toContain("External inputs");
    expect(html).toContain("Final data");

    // Step 1 carries a link to the official raw source
    expect(html).toContain('data-testid="lineage-raw-link"');
    expect(html).toContain("censusindia.gov.in");
  });
});

test.describe("raw download — free with a citation header (item 831 AC 2)", () => {
  test("a hosted raw file downloads with citation HTTP headers", async ({ request }) => {
    const res = await request.get(`/metric/${HOSTED}/raw`);
    expect(res.status()).toBe(200);

    const h = res.headers();
    expect(h["x-raw-source"]).toBe("hosted");
    expect(h["content-disposition"]).toContain("attachment");
    // the PCA raw is an .xlsx (binary) — citation rides in the HTTP headers
    expect(h["content-type"]).toContain("spreadsheetml");
    expect(h["x-citation-source"]).toContain("Census of India 2011");
    expect(h["x-citation-license"]).toContain("GODL");
    expect(h["x-citation-retrieved"]).toBeTruthy();
    expect(h["x-citation-canonical"]).toContain(`/metric/${HOSTED}`);

    // the body is the actual raw file, not empty
    const body = await res.body();
    expect(body.length).toBeGreaterThan(1000);
  });

  test("a hosted CSV raw file has the citation PREPENDED as comment lines", async ({ request }) => {
    const res = await request.get(`/metric/${HOSTED_CSV}/raw`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");

    const text = await res.text();
    // comment header at the very top of the file
    expect(text.startsWith("# Maps of Bharat")).toBeTruthy();
    expect(text).toContain("# Source:");
    expect(text).toContain("# Licence:");
    expect(text).toContain("# Retrieved:");
    expect(text).toContain(`/metric/${HOSTED_CSV}`);
    // and the real CSV still follows the header
    expect(text.length).toBeGreaterThan(500);
  });
});

test.describe("official-source fallback — linked, not a broken file (item 831 AC 2)", () => {
  test("a large-PDF metric shows the official-source link, not a hosted download", async ({
    request,
  }) => {
    const html = await (await request.get(`/metric/${LINKED}`)).text();
    // official link is present; the hosted-download action is NOT
    expect(html).toContain('data-testid="raw-official-link"');
    expect(html).not.toContain('data-testid="raw-download"');
    expect(html).toContain("fsi.nic.in");
  });

  test("its /raw endpoint redirects to the official source instead of 500-ing", async ({
    request,
  }) => {
    const res = await request.get(`/metric/${LINKED}/raw`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["x-raw-source"]).toBe("official-link");
    expect(res.headers()["location"]).toContain("fsi.nic.in");
  });
});

test.describe("processed dataset — view-only, Pro placeholder (item 831 AC 3)", () => {
  test("the processed-download control is a disabled Pro placeholder, not a free download", async ({
    page,
  }) => {
    await page.goto(`/metric/${HOSTED}`);
    const btn = page.locator('[data-testid="processed-download-pro"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText(/Pro \(coming soon\)/i);
    // it is a <button> with no href — it cannot download anything
    expect(await btn.evaluate((el) => el.tagName)).toBe("BUTTON");
    expect(await btn.getAttribute("href")).toBeNull();
  });

  test("the processed placeholder is in the SSR HTML too", async ({ request }) => {
    const html = await (await request.get(`/metric/${HOSTED}`)).text();
    expect(html).toContain('data-testid="processed-download-pro"');
    expect(html).toContain("Pro (coming soon)");
    // no accounts/login are introduced by this seam
    expect(html.toLowerCase()).not.toContain("sign in to download");
  });
});
