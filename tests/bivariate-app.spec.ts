import { test, expect } from "@playwright/test";
import { BIVARIATE_PALETTE } from "@/lib/bivariate";

// #408 item 1080 — the bivariate map, driven in the real app.
//
// SEPARATE FROM tests/bivariate.spec.ts, for the same reason value-by-alpha's cases
// are split: that file is node-side and its assertions can be mutation-proven, while
// these go through a built bundle where a source mutation changes nothing until a
// rebuild. Mixing them would make every mutation here read as SURVIVED.

const PAIR = "/?m=literacy_rate&bi=sex_ratio";

test.describe("a pair that holds", () => {
  test("draws the matrix legend, with both metrics on their axes", async ({ page }) => {
    await page.goto(PAIR);
    const legend = page.locator("[data-bivariate-legend]");
    await expect(legend).toBeVisible({ timeout: 25_000 });

    // Nine cells, because nine is what the matrix is. A legend that lost a row would
    // still look like a legend.
    await expect(page.locator("[data-bivariate-cell]")).toHaveCount(9);

    // The axes are labelled with the metrics, not with "x" and "y". A reader cannot
    // decode a nine-colour key without being told which way is which.
    await expect(page.locator("[data-bivariate-y]")).toContainText(/sex ratio/i);
    await expect(page.locator("[data-bivariate-x]")).toContainText(/literacy/i);
  });

  test("the MAP is actually bivariate — fills come from the matrix", async ({ page }) => {
    await page.goto(PAIR);
    await expect(page.locator("[data-bivariate-legend]")).toBeVisible({ timeout: 25_000 });

    // Not "the legend rendered" — the paint. Read the colours the map wrote into
    // feature state and require them to be matrix cells, and to be several of them.
    // A legend over a univariate map is exactly the claim-without-a-change this repo
    // hunts for.
    const colors = await page.evaluate(() => {
      const m = (window as unknown as {
        __mob_map?: { getFeatureState: (t: unknown) => unknown };
      }).__mob_map;
      if (!m) return null;
      const out: string[] = [];
      // A spread of districts across states, so the sample is not one cluster.
      for (const id of ["27_519", "12_257", "24_468", "19_342", "36_536", "07_9000", "38_3"]) {
        const st = m.getFeatureState({ source: "districts", id }) as { color?: string };
        if (st?.color) out.push(st.color.toLowerCase());
      }
      return out;
    });

    expect(colors, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(colors!.length, "no district carried a colour").toBeGreaterThan(3);

    const palette = BIVARIATE_PALETTE.flat().map((c) => c.toLowerCase());
    const fromMatrix = colors!.filter((c) => palette.includes(c));
    expect(fromMatrix.length, `fills were ${colors!.join(", ")} — none from the matrix`)
      .toBeGreaterThan(3);
    expect(new Set(fromMatrix).size, "every sampled district got the SAME cell — the second axis is doing nothing")
      .toBeGreaterThan(1);
  });

  test("the pair travels in the link, and UNPAIR takes it back out", async ({ page }) => {
    await page.goto(PAIR);
    await expect(page.locator("[data-bivariate-legend]")).toBeVisible({ timeout: 25_000 });
    expect(page.url()).toContain("bi=sex_ratio");

    await page.locator("[data-bivariate-clear]").click();
    await expect(page.locator("[data-bivariate-legend]")).toHaveCount(0);
    await expect.poll(() => page.url(), { timeout: 10_000 }).not.toContain("bi=");
    // And the univariate ramp is back rather than the map being left blank.
    await expect(page.locator("[data-legend-row], [data-legend-label]").first()).toBeVisible();
  });

  test("there is a way in from the UI — a capability with no door is a dead one", async ({ page }) => {
    await page.goto("/?m=literacy_rate");
    await expect(page.locator("[data-pair-toggle]")).toBeVisible({ timeout: 25_000 });
  });
});

test.describe("a pair that does not hold says why", () => {
  test("a TOTAL is refused, and the reason names the area problem", async ({ page }) => {
    // pop_total is drawn as circles here precisely because shading a count lets a
    // large district shout. A bivariate map has only colour, so it cannot take one.
    await page.goto("/?m=literacy_rate&bi=pop_total");
    const refused = page.locator("[data-bivariate-refused]");
    await expect(refused).toBeVisible({ timeout: 25_000 });
    await expect(refused).toContainText(/total/i);
    await expect(page.locator("[data-bivariate-legend]")).toHaveCount(0);
    // The map stays readable rather than going blank: a refusal is not a breakage.
    await expect(page.locator("[data-legend-row], [data-legend-label]").first()).toBeVisible();
  });

  test("the 2011 vintage is refused — it is a different geography", async ({ page }) => {
    await page.goto("/?m=literacy_rate&bi=sex_ratio&vin=2011");
    const refused = page.locator("[data-bivariate-refused]");
    await expect(refused).toBeVisible({ timeout: 25_000 });
    await expect(refused).toContainText(/geography/i);
  });
});

test.describe("the pair stands down where it would mislead", () => {
  test("symbol mode is never paired — the count already has circles", async ({ page }) => {
    await page.goto("/?m=pop_total&bi=literacy_rate");
    await expect(page.locator("[data-symbol-legend]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-bivariate-legend]")).toHaveCount(0);
    await expect(page.locator("[data-pair-toggle]")).toHaveCount(0);
  });

  test("value-by-alpha stands down while a pair is drawn", async ({ page }) => {
    // pop_density warrants the fade on its own. Paired, the fill is already carrying
    // two metrics; a third encoding in the same channel is not a map anyone reads.
    await page.goto("/?m=pop_density");
    await expect(page.locator("[data-alpha-note]")).toBeVisible({ timeout: 25_000 });

    await page.goto("/?m=pop_density&bi=literacy_rate");
    await expect(page.locator("[data-bivariate-legend]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-alpha-note]")).toHaveCount(0);
  });
});
