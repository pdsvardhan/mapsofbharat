import { test, expect, Page } from "@playwright/test";

// #913 — the metric detail page, brought into line with the atlas.
//
// The complaint was that everything on the page was a bordered box, so nothing
// had priority: three stat cards, four lineage steps, both download cards, the
// citation block and the embed field were eight sibling containers of equal
// weight down one page, and the eye got no ranking.
//
// R2 already settled what a panel is on this site — a BAND RULED OFF THE SHEET,
// not an object drawn on it (ledger 95/96/97). So this is not a new design; it
// is the site's own answer applied where it had not been. The agreement test
// below is the point of the whole approach: "consistent with the atlas" is
// MEASURED against the live atlas panel rather than asserted against a copy of
// its numbers, so the two cannot drift apart without a test going red.

const METRIC = "/metric/literacy_rate";

/** The resolved box treatment, read off the real element. Class names prove
 *  nothing — a utility that loses a cascade race still reads as present in the
 *  markup, which is exactly how 52 border declarations painted the wrong colour
 *  for months (adr-034). */
async function bandStyle(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      top: c.borderTopWidth,
      bottom: c.borderBottomWidth,
      left: c.borderLeftWidth,
      right: c.borderRightWidth,
      radius: c.borderTopLeftRadius,
      topColor: c.borderTopColor,
      bgImage: c.backgroundImage,
      shadow: c.boxShadow,
    };
  });
}

const BANDS = [
  ['[data-band="stat"][data-stat="average"]', "national average"],
  ['[data-band="stat"][data-stat="range"]', "range"],
  ['[data-band="stat"][data-stat="coverage"]', "coverage"],
  ['[data-band="lineage"]', "the four lineage steps"],
  ['[data-band="download-free"]', "the free download card"],
  ['[data-band="download-pro"]', "the pro download card"],
  ['[data-band="cite"]', "the citation block"],
  ['[data-band="share"]', "the share / embed block"],
] as const;

test.describe("913-A — every treated container is a ruled band", () => {
  for (const [sel, label] of BANDS) {
    test(`${label} is a band, not a box`, async ({ page }) => {
      await page.goto(METRIC);
      await expect(page.locator(sel).first()).toBeVisible();
      const s = await bandStyle(page, sel);
      expect(s.top, "3px rule above").toBe("3px");
      expect(s.bottom, "3px rule below").toBe("3px");
      // An OPEN-SIDED band. A side edge turns it back into a drawn object.
      expect(s.left, "no left edge").toBe("0px");
      expect(s.right, "no right edge").toBe("0px");
      expect(s.radius, "square corners").toBe("0px");
      expect(s.shadow, "flat, no lift").toBe("none");
      expect(s.bgImage, "no drawn surface").toBe("none");
    });
  }
});

test.describe("913-A — the page agrees with the atlas, measured not claimed", () => {
  test("a metric-page band resolves to the same treatment as the atlas region panel", async ({ page }) => {
    // Measure the atlas panel first, in the running app.
    await page.goto("/?m=literacy_rate&lvl=district");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Search the ranking").fill("Bastar");
    await page.locator("button", { hasText: "Bastar" }).first().click();
    await expect(page.locator('[data-oid="region-indicator-panel"]')).toBeVisible();
    const atlas = await bandStyle(page, '[data-oid="region-indicator-panel"]');

    // Then the metric page, and require agreement on every property including the
    // RESOLVED colour — two different border tokens would both pass a width check.
    await page.goto(METRIC);
    const metric = await bandStyle(page, '[data-band="stat"][data-stat="average"]');

    expect(metric.top).toBe(atlas.top);
    expect(metric.bottom).toBe(atlas.bottom);
    expect(metric.left).toBe(atlas.left);
    expect(metric.right).toBe(atlas.right);
    expect(metric.radius).toBe(atlas.radius);
    expect(metric.shadow).toBe(atlas.shadow);
    expect(metric.bgImage).toBe(atlas.bgImage);
    expect(metric.topColor, "same border token, not merely the same width").toBe(atlas.topColor);
  });
});

test.describe("913-B — the three headline stats have a hierarchy", () => {
  test("the national average is the headline; range and coverage support it", async ({ page }) => {
    await page.goto(METRIC);
    const size = (sel: string) =>
      page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    const avg = await size('[data-stat="average"] .font-mono');
    const range = await size('[data-stat="range"] .font-mono');
    const cover = await size('[data-stat="coverage"] .font-mono');

    // Not "bigger by a hair" — a hierarchy the eye can actually use.
    expect(avg).toBeGreaterThanOrEqual(range * 1.8);
    expect(avg).toBeGreaterThanOrEqual(cover * 1.8);
    // The two supporting figures stay peers with each other.
    expect(range).toBe(cover);
  });

  test("all three stay on one row — no reflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(METRIC);
    const tops = await page.locator('[data-band="stat"]').evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top))
    );
    expect(tops).toHaveLength(3);
    expect(new Set(tops).size, "three across, one row").toBe(1);
  });
});

test.describe("913-M3 — the methodology paragraph keeps its DOM position", () => {
  test("it still precedes the stats in the document, and only its weight changed", async ({ page }) => {
    await page.goto(METRIC);
    const p = page.locator("[data-methodology]");
    await expect(p).toBeVisible();

    // The owner ruling this guards: content ORDER is out of scope. If someone
    // later moves it below the number, or reorders it with CSS (which would
    // desync the visual and screen-reader orders), this fails.
    const order = await page.evaluate(() => {
      const m = document.querySelector("[data-methodology]");
      const s = document.querySelector('[data-band="stat"]');
      if (!m || !s) return null;
      return m.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING ? "before" : "after";
    });
    expect(order, "methodology still precedes the stats in the DOM").toBe("before");

    // The lead sentence carries; the remainder recedes.
    const lead = page.locator("[data-methodology-lead]");
    const rest = page.locator("[data-methodology-rest]");
    await expect(lead).toBeVisible();
    if (await rest.count()) {
      const [lc, rc] = await Promise.all([
        lead.evaluate((el) => getComputedStyle(el).color),
        rest.evaluate((el) => getComputedStyle(el).color),
      ]);
      expect(lc, "the lead reads at a different weight from the caveats").not.toBe(rc);
    }

    // And the whole text is still present — receding it must not truncate it.
    const text = (await p.innerText()).replace(/\s+/g, " ").trim();
    expect(text.length).toBeGreaterThan(80);
  });
});

test.describe("913-C — the map fills its frame", () => {
  test("the map frame is close to India's own aspect, not a wide letterbox", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(METRIC);
    const box = await page.locator("[data-map-frame]").boundingBox();
    expect(box).not.toBeNull();
    // India's bounding box is 31 degrees each way, which renders near-square at
    // this latitude. fitBounds is limited by the SHORTER dimension, so a frame
    // much wider than tall wastes the difference: at 1152x520 roughly a third of
    // the frame was empty on either side of the country.
    const aspect = box!.width / box!.height;
    expect(aspect).toBeGreaterThan(0.75);
    expect(aspect, "not a wide letterbox").toBeLessThan(1.35);
  });
});

test.describe("913-D — the Pro placeholder reads as unavailable, not broken", () => {
  test("it is dashed and full-opacity rather than a faded solid button", async ({ page }) => {
    await page.goto(METRIC);
    const btn = page.locator("[data-band='download-pro'] button, [data-band='download-pro'] a").filter({
      hasText: /Pro \(coming soon\)/i,
    }).first();
    await expect(btn).toBeVisible();
    const s = await btn.evaluate((el) => {
      const c = getComputedStyle(el);
      return { style: c.borderTopStyle, opacity: c.opacity };
    });
    // opacity on a solid-bordered control is the visual language of "this failed
    // to load"; a dashed edge at full opacity is the language of "nothing here
    // yet, on purpose".
    expect(s.style).toBe("dashed");
    expect(parseFloat(s.opacity)).toBe(1);
  });
});
