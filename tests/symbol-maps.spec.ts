import { test, expect, Page } from "@playwright/test";

import { isCountUnit, legendStops, symbolEligible, symbolRadius } from "@/lib/symbols";

// Proportional symbol maps (#408 / #532; research 758 + 531).
//
// A choropleth colours a whole region, and the eye reads AREA. Kutch is 291x the
// area of Mumbai City, so on a count map Kutch outweighs Mumbai by that ratio
// whatever colour either one is. Symbols decouple the mark from the polygon.
//
// The sizing assertions below matter more than the rendering ones. Radius-
// proportional sizing — the classic bug — would draw a 4x value with 16x the ink
// and make this layer LESS honest than the choropleth it replaces, while looking
// entirely plausible on screen. A rendering test cannot catch that; arithmetic can.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

/** Read a layer's visibility straight from the running MapLibre instance. */
async function layerVisible(page: Page, id: string) {
  return page.evaluate((layer) => {
    const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
    if (!m || !m.getLayer(layer)) return false;
    return m.getLayoutProperty(layer, "visibility") !== "none";
  }, id);
}

test.describe("symbol sizing — area, not radius (the assertion that matters)", () => {
  test("a 4x value gives exactly a 2x radius", () => {
    // Perceived quantity tracks the disc's AREA, and area grows with r². So the
    // radius must follow sqrt(value). If someone ever "simplifies" this to a linear
    // ramp, this is the line that goes red.
    const vmax = 1_000_000;
    const r1 = symbolRadius(250_000, vmax, "district");
    const r4 = symbolRadius(1_000_000, vmax, "district");
    expect(r4 / r1).toBeCloseTo(2, 5);

    const r9 = symbolRadius(90_000, vmax, "district");
    const r1x = symbolRadius(10_000, vmax, "district");
    expect(r9 / r1x).toBeCloseTo(3, 5);
  });

  test("radius is proportional to sqrt(value) right across the domain", () => {
    const vmax = 5000;
    const k = symbolRadius(vmax, vmax, "district") / Math.sqrt(vmax);
    // Sampled above the floor, where proportionality is exact by construction.
    for (const v of [400, 900, 1600, 2500, 3600, 4900]) {
      expect(symbolRadius(v, vmax, "district") / Math.sqrt(v)).toBeCloseTo(k, 5);
    }
  });

  test("the maximum value gets the maximum radius, and nothing exceeds it", () => {
    const vmax = 733;
    expect(symbolRadius(vmax, vmax, "district")).toBeCloseTo(12, 5);
    expect(symbolRadius(vmax, vmax, "state")).toBeCloseTo(40, 5);
    // A value above the stated domain is clamped rather than allowed to run away.
    expect(symbolRadius(vmax * 10, vmax, "district")).toBeCloseTo(12, 5);
  });

  test("a small nonzero value is floored so it can never vanish, but a real zero draws nothing", () => {
    expect(symbolRadius(1, 1_000_000_000, "district")).toBe(1.2);
    // Zero is a fact ("none here"), not a small quantity — it earns no mark.
    expect(symbolRadius(0, 100, "district")).toBe(0);
    expect(symbolRadius(null, 100, "district")).toBe(0);
    expect(symbolRadius(undefined, 100, "district")).toBe(0);
  });

  test("legend stops are chosen on radius, so the three circles are visibly different", () => {
    const vmax = 10_000;
    const stops = legendStops(vmax);
    expect(stops).toHaveLength(3);
    const radii = stops.map((v) => symbolRadius(v, vmax, "district"));
    // half and a quarter of the largest radius
    expect(radii[1] / radii[0]).toBeCloseTo(0.5, 5);
    expect(radii[2] / radii[0]).toBeCloseTo(0.25, 5);
  });
});

test.describe("routing — only counts get circles (research/531)", () => {
  test("count units are eligible", () => {
    for (const u of ["people", "head", "birds", "tonnes", "hectares", "km²"]) {
      expect(isCountUnit(u), `${u} is a count`).toBe(true);
    }
  });

  test("a rate that merely LOOKS skewed is refused — the case a HOTSPOT check gets wrong", () => {
    // research/531's specific warning: `pop_density` and `crime_cyber_rate` are both
    // heavy-tailed and both were flagged HOTSPOT, but they are already normalised.
    // Area bias does not apply, and drawing them as circles would invent a problem
    // in place of the one normalisation already solved.
    expect(isCountUnit("people/km²")).toBe(false);
    expect(isCountUnit("per 100k")).toBe(false);
    expect(isCountUnit("per lakh")).toBe(false);
    expect(isCountUnit("per 1000")).toBe(false);
    expect(isCountUnit("%")).toBe(false);
    expect(isCountUnit("per 100 people")).toBe(false);
    expect(isCountUnit("txn/person/mo")).toBe(false);
    expect(isCountUnit("₹/person")).toBe(false);
    expect(isCountUnit(null)).toBe(false);
  });

  test("signed data is refused — a circle cannot say 'which direction'", () => {
    // forest_change_km2 is a count unit but signed (cover gained OR lost). A sqrt-area
    // circle would render a big loss and a big gain identically. Detected from the
    // values, so a future signed count is excluded automatically rather than shipping
    // wrong until someone notices.
    expect(symbolEligible("km²", [12, 40, 3])).toBe(true);
    expect(symbolEligible("km²", [12, -40, 3])).toBe(false);
    expect(symbolEligible("%", [12, 40, 3])).toBe(false);
    // all-null is not "eligible with nothing to draw"
    expect(symbolEligible("people", [null, undefined])).toBe(false);
  });
});

test.describe("the layer renders for a count and not for a rate", () => {
  test("a count metric defaults to symbols, and the polygons go neutral underneath", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=district");
    await waitForMapReady(page);

    expect(await layerVisible(page, "district-symbol"), "symbols on for a count").toBe(true);
    await expect(page.locator("[data-symbol-legend]")).toBeVisible();
    await expect(page.locator("[data-symbol-legend-row]")).toHaveCount(3);

    // The basemap must still be drawn — research/758's boundary-compliance verdict
    // depends on the polygons being present and unmodified.
    const fill = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      return m?.getPaintProperty("district-fill", "fill-color");
    });
    expect(fill, "polygons are painted neutral, not by value").toBe("#26231c");
  });

  test("a rate metric stays a choropleth and is never offered symbols", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);

    expect(await layerVisible(page, "district-symbol")).toBe(false);
    await expect(page.locator("[data-symbol-toggle]")).toHaveCount(0);
    await expect(page.locator("[data-symbol-legend]")).toHaveCount(0);
    // the colour ramp legend is still the one on show
    await expect(page.locator("[data-legend-method-line]")).toBeVisible();
  });

  test("pop_density — a count-shaped rate — is refused in the running app", async ({ page }) => {
    await page.goto("/?m=pop_density&lvl=district");
    await waitForMapReady(page);
    expect(await layerVisible(page, "district-symbol")).toBe(false);
    await expect(page.locator("[data-symbol-toggle]")).toHaveCount(0);
  });
});

test.describe("interaction parity — a mode that drops half the interactions is a demo", () => {
  test("every feature-state write reaches the symbol source too", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=district");
    await waitForMapReady(page);

    // The mechanism the whole mode rests on: sources are separate, so a hover or a
    // selection written to the polygons must be mirrored onto the points or the
    // circle never responds.
    const mirrored = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      if (!m) return null;
      const src = m.getSource("districts-pts");
      if (!src) return null;
      const feats = (m.querySourceFeatures("districts-pts") as Array<{ id?: string | number }>);
      const id = feats.find((f) => f.id != null)?.id;
      if (id == null) return null;
      m.setFeatureState({ source: "districts", id }, { selected: true });
      const poly = m.getFeatureState({ source: "districts", id });
      const pts = m.getFeatureState({ source: "districts-pts", id });
      m.removeFeatureState({ source: "districts", id });
      const polyAfter = m.getFeatureState({ source: "districts", id });
      const ptsAfter = m.getFeatureState({ source: "districts-pts", id });
      return { poly, pts, polyAfter, ptsAfter };
    });

    expect(mirrored, "the point source has features to mirror onto").not.toBeNull();
    expect(mirrored!.poly.selected).toBe(true);
    expect(mirrored!.pts.selected, "selection reached the symbol source").toBe(true);
    // and clearing must clear BOTH — otherwise the previous metric's circles persist
    expect(mirrored!.polyAfter.selected).toBeUndefined();
    expect(mirrored!.ptsAfter.selected, "clearing reached the symbol source").toBeUndefined();
  });

  test("selection from the rail works in symbol mode and shows the region panel", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=state");
    await waitForMapReady(page);
    expect(await layerVisible(page, "state-symbol")).toBe(true);

    await page.getByLabel("Search the ranking").fill("Kerala");
    await page.locator("button", { hasText: "Kerala" }).first().click();
    await expect(page.getByText("SELECTED · STATE")).toBeVisible();
    await expect(page.getByText(/Rank \d+ of \d+/)).toBeVisible();
    // still in symbol mode after selecting
    expect(await layerVisible(page, "state-symbol")).toBe(true);
  });

  test("circles are actually sized — the largest value carries the largest radius", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=state");
    await waitForMapReady(page);

    const radii = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      if (!m) return [];
      const out: number[] = [];
      for (const f of m.querySourceFeatures("states-pts") as Array<{ id?: string | number }>) {
        if (f.id == null) continue;
        const st = m.getFeatureState({ source: "states-pts", id: f.id });
        if (typeof st.r === "number") out.push(st.r);
      }
      return out;
    });

    expect(radii.length, "radii were pushed to the symbol source").toBeGreaterThan(10);
    const max = Math.max(...radii);
    expect(max).toBeCloseTo(40, 3); // the state maximum
    expect(Math.min(...radii.filter((r) => r > 0))).toBeGreaterThanOrEqual(3);
  });
});

test.describe("the mode is a real, shareable choice", () => {
  test("SHADE / SIZE flips the map and only a deliberate flip travels in the URL", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=district");
    await waitForMapReady(page);

    // A default does NOT get pinned — the recipient derives it from the metric.
    await expect(page).not.toHaveURL(/sym=/);

    const shade = page.locator('[data-symbol-mode="shade"]');
    const size = page.locator('[data-symbol-mode="size"]');
    await expect(size).toHaveAttribute("aria-pressed", "true");

    await shade.click();
    await expect(shade).toHaveAttribute("aria-pressed", "true");
    expect(await layerVisible(page, "district-symbol")).toBe(false);
    await expect(page).toHaveURL(/sym=0/);
    // the ramp legend comes back with its mode row
    await expect(page.locator("[data-legend-method-line]")).toBeVisible();

    await size.click();
    await expect(size).toHaveAttribute("aria-pressed", "true");
    expect(await layerVisible(page, "district-symbol")).toBe(true);
    await expect(page).toHaveURL(/sym=1/);
  });

  test("a shared sym=0 link opens as a choropleth", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=district&sym=0");
    await waitForMapReady(page);
    expect(await layerVisible(page, "district-symbol")).toBe(false);
    await expect(page.locator('[data-symbol-mode="shade"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("centroids are inside their own polygons (built offline)", () => {
  test("every region has a representative point", async ({ request }) => {
    // The containment proof lives in pipeline/build_centroids.py, which refuses to
    // write a point outside its polygon. This asserts the OUTPUT is present and
    // complete, so a missing rebuild shows up as a red test rather than as circles
    // silently absent from the map.
    for (const [file, expected] of [
      ["/geo/centroids-districts.geojson", 735],
      ["/geo/centroids-states.geojson", 36],
      ["/geo/centroids-districts-2011.geojson", 632],
      ["/geo/centroids-states-2011.geojson", 35],
    ] as [string, number][]) {
      const res = await request.get(file);
      expect(res.status(), file).toBe(200);
      const fc = await res.json();
      expect(fc.features.length, file).toBe(expected);
      // every point is a real coordinate pair inside India's bounding box
      for (const f of fc.features) {
        const [lon, lat] = f.geometry.coordinates;
        expect(lon).toBeGreaterThan(66);
        expect(lon).toBeLessThan(99);
        expect(lat).toBeGreaterThan(5);
        expect(lat).toBeLessThan(38);
      }
    }
  });
});
