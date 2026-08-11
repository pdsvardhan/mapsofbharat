import { test, expect, Page } from "@playwright/test";

// Same-origin Umami analytics (iter-131 item 825). Self-contained: BOTH the
// tracker script and the collect endpoint are stubbed via page.route, so the
// suite never depends on the self-hosted Umami server being reachable. The stub
// tracker reads the REAL data-host-url the loader sets and derives its endpoint
// exactly as Umami does (`${host-url}/api/send`), so these assertions still prove
// the loader points the beacon at the same-origin /stats/api/send proxy path —
// never a third-party host.

const WEBSITE_ID = "bafed581-cbda-468f-92da-b7ff78f4fb72";

// Minimal Umami-shaped tracker: derives its collect endpoint the same way the
// real one does, exposes window.umami.track, and fires one pageview on load.
const FAKE_TRACKER = `
(function () {
  var s = document.currentScript;
  var host = s.getAttribute('data-host-url') || '';
  var id = s.getAttribute('data-website-id');
  var endpoint = host + '/api/send';
  function send(payload) {
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'event', payload: Object.assign({ website: id }, payload || {}) })
      });
    } catch (e) {}
  }
  window.umami = {
    track: function (event, data) {
      if (typeof event === 'string') send({ name: event, data: data });
      else send(event || {});
    }
  };
  send({}); // initial pageview
})();
`;

type Beacon = { url: string; body: { payload?: { name?: string; data?: Record<string, unknown> } } | null };

async function stubAnalytics(page: Page): Promise<Beacon[]> {
  const sends: Beacon[] = [];
  await page.route("**/stats/script.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_TRACKER }),
  );
  await page.route("**/stats/api/send", async (route) => {
    const req = route.request();
    let body: Beacon["body"] = null;
    try { body = req.postDataJSON(); } catch { /* ignore non-JSON */ }
    sends.push({ url: req.url(), body });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  return sends;
}

const named = (sends: Beacon[], name: string) => sends.filter((s) => s.body?.payload?.name === name);
const pathOf = (url: string) => new URL(url).pathname;

test.describe("analytics — same-origin Umami", () => {
  test("root layout renders the first-party tracker with the public website id and /stats host", async ({ page }) => {
    await stubAnalytics(page);
    await page.goto("/");
    // The loader injects the tracker client-side once the origin is known.
    const script = page.locator(`script[data-website-id="${WEBSITE_ID}"]`);
    await expect(script).toHaveAttribute("src", "/stats/script.js");
    await expect(script).toHaveAttribute("data-host-url", /\/stats$/);
  });

  test("initial pageview beacon fires to the same-origin /stats/api/send", async ({ page }) => {
    const sends = await stubAnalytics(page);
    await page.goto("/");
    await expect.poll(() => sends.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(pathOf(sends[0].url)).toBe("/stats/api/send");
  });

  test("selecting an indicator fires a metric_selected event to /stats/api/send", async ({ page }) => {
    const sends = await stubAnalytics(page);
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /BROWSE INDICATORS/i }).click();
    const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
    await expect(dialog).toBeVisible();
    // pick the first real metric row in the active topic (rows carry unit/·/year)
    await dialog.getByRole("button").filter({ hasText: /·|%|per/i }).first().click();

    await expect.poll(() => named(sends, "metric_selected").length, { timeout: 15_000 }).toBeGreaterThan(0);
    const ev = named(sends, "metric_selected")[0];
    expect(pathOf(ev.url)).toBe("/stats/api/send");
    expect(ev.body?.payload?.data).toHaveProperty("metric");
  });

  test("a nonsense search fires a DISTINCT search_no_results event to /stats/api/send", async ({ page }) => {
    const sends = await stubAnalytics(page);
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Search places and indicators/i }).click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    const q = "zzzqqxnonsensequery";
    await dialog.getByRole("textbox").fill(q);
    await expect(dialog.getByText(/Nothing matches/i)).toBeVisible({ timeout: 10_000 });

    // search_no_results is debounced (~450ms) and deduped per query
    await expect.poll(() => named(sends, "search_no_results").length, { timeout: 15_000 }).toBeGreaterThan(0);
    const ev = named(sends, "search_no_results")[0];
    expect(pathOf(ev.url)).toBe("/stats/api/send");
    expect(ev.body?.payload?.data?.q).toBe(q);
    // a failed search must NOT be recorded as a metric selection
    expect(named(sends, "metric_selected")).toHaveLength(0);
  });

  test("the /embed view loads the tracker and fires embed_loaded", async ({ page }) => {
    const sends = await stubAnalytics(page);
    await page.goto("/embed?m=literacy_rate");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

    await expect.poll(() => named(sends, "embed_loaded").length, { timeout: 15_000 }).toBeGreaterThan(0);
    const ev = named(sends, "embed_loaded")[0];
    expect(pathOf(ev.url)).toBe("/stats/api/send");
    expect(ev.body?.payload?.data?.metric).toBe("literacy_rate");
  });
});
