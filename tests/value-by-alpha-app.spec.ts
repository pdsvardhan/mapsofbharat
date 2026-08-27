import { test, expect } from "@playwright/test";

// #408 item 1077 — value-by-alpha, driven in the real app.
//
// SEPARATE FROM tests/value-by-alpha.spec.ts ON PURPOSE. That file is node-side: it
// imports lib/ directly, so a source edit takes effect on the very next run and the
// mutation harness can prove its assertions load-bearing. These cases go through a
// BUILT bundle, where a source mutation changes nothing at all until a rebuild —
// mixing the two would make every mutation here read as SURVIVED, which is a false
// all-clear and the precise failure scripts/mutation-test.sh was written to refuse.
//
// Run them against a scratch instance of the CURRENT build, never the production
// container:
//   bash scripts/test-isolated.sh tests/value-by-alpha-app.spec.ts

test.describe("in the running app", () => {
  // A module that decides correctly and is never consulted is the stub this project
  // scans for. These drive the real map.

  test("a warranted metric fades, and says so", async ({ page }) => {
    await page.goto("/?m=pop_density");
    const note = page.locator("[data-alpha-note]");
    await expect(note, "pop_density warrants the fade, so the map must disclose it")
      .toBeVisible({ timeout: 25_000 });
    await expect(note).toContainText(/does not describe where people live/);
    await expect(page.locator("[data-alpha-method]")).toHaveText("FADED BY POPULATION");
  });

  test("the fill layer really is fading — opacity varies by region", async ({ page }) => {
    await page.goto("/?m=pop_density");
    await expect(page.locator("[data-alpha-note]")).toBeVisible({ timeout: 25_000 });

    // Not "the note is on" — the actual paint. Read the feature-state the map wrote
    // for a crowded district and an empty one and require them to differ. A note
    // over an unchanged map is exactly the claim-without-a-change this repo hunts.
    const alphas = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: { getFeatureState: (t: unknown) => unknown } }).__mob_map;
      if (!m) return null;
      const read = (id: string) => {
        const s = m.getFeatureState({ source: "districts", id }) as { alpha?: number };
        return s?.alpha ?? null;
      };
      // The two ends of the district population range, so the assertion is not
      // resting on a close call: Mumbai at 12.44M against Upper Dibang Valley at
      // 8,004 — three orders of magnitude apart.
      return { crowded: read("27_519"), empty: read("12_257") };
    });
    // NOT a conditional test.skip. It was one, and a skip that fires when the map
    // stops writing `alpha` would retire this assertion at the exact moment it
    // started mattering — the degrade-to-a-SKIP shape #602 exists to remove. It has
    // been measured working, so absence is now a regression and says so.
    expect(alphas, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(alphas!.crowded, "no alpha written for Mumbai").not.toBeNull();
    expect(alphas!.empty, "no alpha written for Upper Dibang Valley").not.toBeNull();
    expect(alphas!.crowded!).toBeGreaterThan(alphas!.empty!);
  });

  test("a metric spread evenly across people is NOT faded", async ({ page }) => {
    // nfhs5_women_anaemia sits near the bottom of the measured distribution: its
    // colour is where the people are, so fading would be a claim the data does not
    // make. The absence of the note here is the criterion doing its job.
    await page.goto("/?m=nfhs5_women_anaemia");
    await expect(page.locator("[data-legend-row], [data-legend-label]").first())
      .toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-alpha-note]")).toHaveCount(0);
  });

  test("symbol mode is never faded — a count already has circles", async ({ page }) => {
    await page.goto("/?m=pop_total");
    await expect(page.locator("[data-symbol-legend]")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-alpha-note]")).toHaveCount(0);
  });
});
