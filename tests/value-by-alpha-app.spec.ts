import { test, expect, type Page } from "@playwright/test";

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

/** The opacity a region is drawn at when nothing is fading it — lib/value-by-alpha's
 *  ALPHA_UNFADED. Spelled out rather than imported: this file drives the BUILT bundle,
 *  and importing the source here would let a source edit change the expectation and
 *  the subject in one move. */
const UNFADED = 0.9;

/**
 * Change the indicator IN PAGE, through the chooser.
 *
 * A URL navigation remounts the map, which is exactly what the stale-state case below
 * must not do: a fresh MapLibre instance has no feature-state to carry over, so the
 * defect cannot exist there and the test would pass whatever the code did. This is the
 * same helper shape tests/symbol-maps.spec.ts uses for the same reason.
 *
 * The chooser is topic-first and its topics switch on HOVER — and hover only counts
 * once the pointer has moved inside the dialog (chooser.tsx's `hoverArmed`, added so a
 * modal opening under the cursor cannot retune itself). Hence the hover on the dialog
 * before the hover on the topic.
 */
async function pickIndicator(page: Page, topic: RegExp, name: RegExp) {
  await page.getByRole("button", { name: /CHANGE INDICATOR|BROWSE INDICATORS/i }).click();
  const chooser = page.getByRole("dialog", { name: /Choose an indicator/i });
  await expect(chooser).toBeVisible();
  await chooser.hover();
  await chooser.getByRole("button").filter({ hasText: topic }).first().hover();
  await chooser.getByRole("button").filter({ hasText: name }).first().click();
  await expect(chooser).toBeHidden();
}

/** Every region the paint has marked no-data, and the alpha each one carries. */
const hatchSweep = (page: Page, source: "districts" | "states") =>
  page.evaluate((src) => {
    const m = (window as unknown as {
      __mob_map?: {
        getFeatureState: (t: unknown) => unknown;
        querySourceFeatures: (s: string) => { id?: string | number }[];
      };
    }).__mob_map;
    if (!m) return null;
    const ids = new Set<string>();
    for (const f of m.querySourceFeatures(src)) if (f.id != null) ids.add(String(f.id));
    const marked: string[] = [];
    const carryingAlpha: string[] = [];
    for (const id of ids) {
      const s = m.getFeatureState({ source: src, id }) as { nodata?: boolean; alpha?: number };
      if (s?.nodata !== true) continue;
      marked.push(id);
      if (s.alpha !== undefined) carryingAlpha.push(`${id}=${s.alpha}`);
    }
    return { swept: ids.size, marked: marked.sort(), carryingAlpha: carryingAlpha.sort() };
  }, source);

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

  test("no data is HATCHED, and the hatch is on the map rather than only in the code", async ({ page }) => {
    // The round-2 defect: at the 0.28 floor a class-5 fill composites to rgb(77,71,37)
    // against a no-data rgb(39,37,28) — 1.64:1, the same warm olive — and this very
    // map carries both, four class-5 districts under a=0.35 alongside the two genuine
    // no-data ones. Tone could not hold the line, so no-data carries a texture.
    await page.goto("/?m=pop_density");
    await expect(page.locator("[data-alpha-note]")).toBeVisible({ timeout: 25_000 });

    const seen = await page.evaluate(() => {
      const m = (window as unknown as {
        __mob_map?: {
          getFeatureState: (t: unknown) => unknown;
          querySourceFeatures: (s: string) => { id?: string | number }[];
          hasImage: (id: string) => boolean;
          getLayer: (id: string) => unknown;
          getLayoutProperty: (id: string, k: string) => unknown;
        };
      }).__mob_map;
      if (!m) return null;
      // MapLibre drops falsy values out of feature state (`dim: false` and `r: 0` are
      // absent here too), and the paint expression reads an absent key as false — so
      // "marked" is `nodata === true` and everything else is unmarked.
      const marked = (id: string) =>
        (m.getFeatureState({ source: "districts", id }) as { nodata?: boolean })?.nodata === true;
      const ids = new Set<string>();
      for (const f of m.querySourceFeatures("districts")) if (f.id != null) ids.add(String(f.id));
      return {
        image: m.hasImage("nodata-hatch"),
        layer: !!m.getLayer("district-nodata"),
        visible: m.getLayoutProperty("district-nodata", "visibility") ?? "visible",
        seenIds: ids.size,
        allMarked: [...ids].filter(marked).sort(),
        // The two districts pop_density has no figure for, and two it does.
        missing: ["01_991", "01_992"].map(marked),
        present: ["27_519", "12_257"].map(marked),
      };
    });

    expect(seen, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(seen!.image, "the hatch tile was never uploaded").toBe(true);
    expect(seen!.layer, "there is no layer to draw it").toBe(true);
    expect(seen!.visible, "the hatch layer is hidden under the district map").toBe("visible");
    // A layer switched on for nobody communicates as little as no layer.
    expect(seen!.missing, "the two districts with no figure must be marked").toEqual([true, true]);
    // ...and switched on for everybody would mark the whole country as unknown. This
    // is the whole sweep, not a sample: pop_density carries 733 of the 735 polygons,
    // so EXACTLY the two absentees may be hatched.
    expect(seen!.seenIds, "the source did not yield its districts — nothing was swept")
      .toBeGreaterThan(700);
    expect(seen!.present, "districts that DO have a figure must not be").toEqual([false, false]);
    expect(seen!.allMarked, "the hatch must mark the absentees and nobody else")
      .toEqual(["01_991", "01_992"]);
  });

  test("the legend keys the fade itself — colour across, opacity down", async ({ page }) => {
    await page.goto("/?m=pop_density");
    const key = page.locator("[data-alpha-key]");
    await expect(key, "a faded map must key its own opacities").toBeVisible({ timeout: 25_000 });

    // Three rows of five classes: the whole ramp at three points of the fade, which is
    // what lets a reader decode a floored district's rendered colour. Before this the
    // legend showed full-strength swatches only, so that colour appeared nowhere.
    await expect(page.locator("[data-alpha-key-row]")).toHaveCount(3);
    await expect(page.locator("[data-alpha-key-cell]")).toHaveCount(15);

    // The rows must actually differ, or the key is three copies of the ramp claiming
    // to be a fade. Compare the top class at full strength against the same class at
    // the floor.
    const [full, floored] = await Promise.all([
      page.locator('[data-alpha-key-cell="4-0"]').evaluate((el) => getComputedStyle(el).backgroundColor),
      page.locator('[data-alpha-key-cell="4-2"]').evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(full).not.toBe(floored);
    // And the no-data mark is keyed too, since the hatch is now on every map.
    await expect(page.locator("[data-nodata-key]")).toBeVisible();
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

  test("a fade cannot survive onto a region the NEXT metric has no figure for", async ({ page }) => {
    // setFeatureState MERGES. recolor() wipes the whole source first, but MapLibre's
    // SourceFeatureState turns that queued whole-source delete into a per-feature one
    // on the first write that follows AND EXEMPTS THE FEATURE BEING WRITTEN — so the
    // first region painted after every wipe keeps any key the new write does not
    // mention. The no-data branch used to omit `alpha`, so that one region carried the
    // previous metric's fade into a no-data fill: measured on the pre-fix build,
    // 35_639 North and Middle Andaman came back {nodata: true, alpha: 0.3299} after
    // this exact sequence, compositing to rgb(23,23,23) where the no-data tone is
    // rgb(39,37,28).
    //
    // Swept over every district rather than checked on 35_639 alone. Which region the
    // exemption lands on is an accident of geojson order and of MapLibre's internals;
    // the INVARIANT is that no hatched region anywhere carries a fade, and that is
    // what has to survive both.
    await page.goto("/?m=pop_density&lvl=district");
    await expect(page.locator("[data-alpha-note]"), "the setup needs a map that fades")
      .toBeVisible({ timeout: 25_000 });

    const read = (id: string) =>
      page.evaluate((rid) => {
        const m = (window as unknown as { __mob_map?: { getFeatureState: (t: unknown) => unknown } }).__mob_map;
        return m ? (m.getFeatureState({ source: "districts", id: rid }) as { nodata?: boolean; alpha?: number }) : null;
      }, id);

    const before = await read("35_639");
    expect(before, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(before!.nodata ?? false, "pop_density does have a figure for 35_639").toBe(false);
    // A real fade, not the unfaded default: without this the transition below would
    // prove nothing, because there would be no stale value to leak.
    expect(before!.alpha, "no alpha written for 35_639").not.toBeUndefined();
    expect(before!.alpha!, "35_639 must be genuinely faded before the switch")
      .toBeLessThan(UNFADED);

    // Forest cover is a rate (so it stays a choropleth) and has no figure for 35_639.
    await pickIndicator(page, /Environment/i, /Forest cover(?! change)/i);
    await expect
      .poll(async () => (await read("35_639"))?.nodata === true, {
        message: "the next metric never marked 35_639 no-data — the transition did not happen",
        timeout: 20_000,
      })
      .toBe(true);

    const sweep = await hatchSweep(page, "districts");
    expect(sweep, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(sweep!.swept, "the source did not yield its districts — nothing was swept")
      .toBeGreaterThan(700);
    expect(sweep!.marked.length, "forest cover must be missing figures for this to test anything")
      .toBeGreaterThan(1);
    // The whole point: a hatched region is drawn at the no-data tone's own opacity,
    // never at whatever the last metric faded it to.
    const wrong = sweep!.carryingAlpha.filter((s) => !s.endsWith(`=${UNFADED}`));
    expect(wrong, "a hatched region is still carrying the previous metric's fade").toEqual([]);
  });

  test("the hatch key stands down on a map that hatches nobody", async ({ page }) => {
    // The inverse of item 1080's defect, at lower stakes: a key for a mark the map is
    // not making. crime_ipc_rate at state level covers all 36 regions, so nothing is
    // hatched — and the legend still carried "Hatched — no figure for this region",
    // pointing at a texture that appears nowhere on screen.
    await page.goto("/?m=crime_ipc_rate&lvl=state");
    // The legend is up: the absence below is the key standing down, not the card
    // failing to render.
    await expect(page.locator("[data-legend-method-line]")).toBeVisible({ timeout: 25_000 });

    const sweep = await hatchSweep(page, "states");
    expect(sweep, "the map did not expose its handle — nothing was measured").not.toBeNull();
    expect(sweep!.swept, "the source did not yield its states — nothing was swept")
      .toBeGreaterThan(30);
    expect(sweep!.marked, "the premise: this map marks nobody no-data").toEqual([]);
    await expect(page.locator("[data-nodata-key]"), "a key for a mark this map never draws")
      .toHaveCount(0);
  });

  test("...and comes back the moment the map does hatch someone", async ({ page }) => {
    // The other half, so the gate cannot be satisfied by deleting the key outright.
    // pop_density hatches exactly two districts, and they are the reason the key exists.
    await page.goto("/?m=pop_density&lvl=district");
    await expect(page.locator("[data-alpha-note]")).toBeVisible({ timeout: 25_000 });
    const sweep = await hatchSweep(page, "districts");
    expect(sweep!.marked, "the premise: this map hatches exactly its two absentees")
      .toEqual(["01_991", "01_992"]);
    await expect(page.locator("[data-nodata-key]")).toBeVisible();
  });
});
