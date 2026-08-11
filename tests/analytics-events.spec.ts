import { test, expect, Page } from "@playwright/test";

// The twelve analytics events (iter-37 item 938; plan MSR-02, MSR-12).
//
// This suite exists because the measurement plan's four funnels (MSR-04) match on
// the event NAME, and a funnel step naming an event nothing fires is not an error
// — it is silently empty forever. The failure mode is a dashboard that looks fine
// and measures nothing, which is exactly the thing analytics is supposed to catch.
// So each event is driven through the REAL interaction and asserted by name.
//
// The recorder replaces window.umami before any page script runs, and defends the
// property with a no-op setter: the real tracker assigns window.umami when the
// /stats script loads, and without the guard it would silently replace the spy
// mid-test and every assertion below would pass vacuously.

const TWELVE = [
  "metric_selected", "search_performed", "search_no_results", "drill_in",
  "region_opened", "compare_used", "viz_customised", "card_exported",
  "permalink_copied", "embed_copied", "embed_loaded", "methodology_viewed",
] as const;

type Ev = { e: string; d?: Record<string, unknown> };

async function record(page: Page) {
  await page.addInitScript(() => {
    const rec: Ev[] = [];
    (window as unknown as { __mobEvents: Ev[] }).__mobEvents = rec;
    Object.defineProperty(window, "umami", {
      configurable: false,
      get: () => ({ track: (e: string, d?: Record<string, unknown>) => { rec.push({ e, d }); } }),
      set: () => { /* the real tracker must not displace the spy */ },
    });
  });
}

const fired = (page: Page) => page.evaluate(() => (window as unknown as { __mobEvents: Ev[] }).__mobEvents);
const names = async (page: Page) => (await fired(page)).map((x) => x.e);

async function mapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function search(page: Page, term: string, commit: boolean) {
  await page.keyboard.press("Control+k");
  const box = page.getByRole("textbox", { name: /Search places and indicators/i });
  await expect(box).toBeVisible({ timeout: 10_000 });
  await box.fill(term);
  // the search events are debounced at 450ms and deduped per settled query
  await page.waitForTimeout(700);
  if (commit) await box.press("Enter");
  else await page.keyboard.press("Escape");
}

test.describe("the twelve analytics events (item 938)", () => {
  test("the map's nine events each fire under their specified name", async ({ page }) => {
    await record(page);
    await page.goto("/?m=literacy_rate");
    await mapReady(page);

    // viz_customised — the VIEW toggle is a rendering choice, not a data choice
    await page.getByRole("button", { name: "TABLE" }).first().click();
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "MAP" }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();

    const viz = (await fired(page)).filter((x) => x.e === "viz_customised");
    expect(viz.length).toBeGreaterThanOrEqual(2);
    expect(viz[0].d).toMatchObject({ control: "view" });

    // compare_used — on entering compare mode only, so toggling twice fires once
    const compare = page.getByRole("button", { name: /^Compar/ });
    await compare.click();
    await expect(compare).toHaveAttribute("aria-pressed", "true");
    await compare.click();
    await expect(compare).toHaveAttribute("aria-pressed", "false");
    expect((await fired(page)).filter((x) => x.e === "compare_used")).toHaveLength(1);

    // permalink_copied + embed_copied — two distinct events, not one share event
    // with a parameter, because the plan funnels card_exported and the embed path
    // separately and a shared name cannot be split back apart afterwards.
    // the menu stays open after a copy (only the WhatsApp link closes it), so
    // both items are reachable from one open — re-clicking the trigger would
    // TOGGLE it shut
    await page.getByRole("button", { name: /Share this view/i }).click();
    await page.getByRole("menuitem", { name: /Copy link/i }).click();
    await page.getByRole("menuitem", { name: /Copy embed code/i }).click();
    expect((await fired(page)).filter((x) => x.e === "permalink_copied")).toHaveLength(1);
    expect((await fired(page)).filter((x) => x.e === "embed_copied")).toHaveLength(1);
    await page.keyboard.press("Escape");

    // search_performed fires for every settled query; search_no_results only when
    // it matched nothing, so it is a strict subset and the failure RATE is a ratio
    await search(page, "qqzzxx-not-a-place", false);
    const afterDud = await fired(page);
    expect(afterDud.filter((x) => x.e === "search_performed").length).toBe(1);
    expect(afterDud.filter((x) => x.e === "search_no_results").length).toBe(1);
    expect(afterDud.find((x) => x.e === "search_performed")!.d).toMatchObject({ results: 0 });

    // drill_in — picking a STATE from search while the map is at district level
    await search(page, "Kerala", true);
    await page.waitForTimeout(900);
    const drills = (await fired(page)).filter((x) => x.e === "drill_in");
    expect(drills.length).toBeGreaterThanOrEqual(1);
    expect(drills[0].d).toMatchObject({ level: "district" });

    // a successful search fired performed WITHOUT no_results
    const perf = (await fired(page)).filter((x) => x.e === "search_performed");
    expect(perf.length).toBe(2);
    expect(perf[1].d!.results as number).toBeGreaterThan(0);
    expect((await fired(page)).filter((x) => x.e === "search_no_results")).toHaveLength(1);

    // region_opened — picking a DISTRICT opens its profile
    await search(page, "Wayanad", true);
    await page.waitForTimeout(900);
    const opened = (await fired(page)).filter((x) => x.e === "region_opened");
    expect(opened.length).toBeGreaterThanOrEqual(1);
    expect(opened[0].d).toMatchObject({ level: "district" });

    // metric_selected — through the chooser, the way a reader changes indicator.
    // The card's CTA reads CHANGE INDICATOR once one is showing (BROWSE
    // INDICATORS is the empty state), and this test always arrives with a metric.
    await page.getByRole("button", { name: /CHANGE INDICATOR|BROWSE INDICATORS/i }).click();
    const chooser = page.getByRole("dialog", { name: /Choose an indicator/i });
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button").filter({ hasText: /·|%|per/i }).first().click();
    const picked = (await fired(page)).filter((x) => x.e === "metric_selected");
    expect(picked.length).toBe(1);
    expect(picked[0].d).toHaveProperty("metric");

    // and nothing fired under a name outside the twelve — this is what catches a
    // leftover kebab-case event after the rename
    for (const n of await names(page)) expect(TWELVE).toContain(n);
  });

  test("card_exported fires when a card is actually downloaded", async ({ page }) => {
    await record(page);
    await page.goto("/?m=literacy_rate");
    await mapReady(page);

    await page.getByRole("button", { name: "CARD" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await dialog.getByRole("button", { name: /^DOWNLOAD/i }).click();
    await download;

    const ev = (await fired(page)).filter((x) => x.e === "card_exported");
    expect(ev).toHaveLength(1);
    expect(ev[0].d).toMatchObject({ format: "png" });
    expect(ev[0].d).toHaveProperty("metric");
  });

  test("embed_loaded carries the embedding host, and only the host", async ({ page }) => {
    await record(page);
    await page.goto("/embed?m=literacy_rate");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);

    const ev = (await fired(page)).filter((x) => x.e === "embed_loaded");
    expect(ev).toHaveLength(1);
    expect(ev[0].d).toMatchObject({ metric: "literacy_rate" });

    // opened directly, so there is no embedding page — reported as "direct"
    // rather than omitted, so the dimension is never empty in the dashboard
    expect(ev[0].d!.domain).toBe("direct");

    // MSR-12 asks for the domain; it must never be the full referrer URL, which
    // can carry a path identifying a private page
    expect(String(ev[0].d!.domain)).not.toContain("/");
  });

  test("methodology_viewed fires once on the methodology page", async ({ page }) => {
    await record(page);
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { name: /Methodology/i }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    expect((await fired(page)).filter((x) => x.e === "methodology_viewed")).toHaveLength(1);
    for (const n of await names(page)) expect(TWELVE).toContain(n);
  });
});
