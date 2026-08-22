import { test, expect, Page } from "@playwright/test";

import {
  EXTENSIVE_NOT_SYMBOLISED,
  floorShare,
  floorThreshold,
  isCountUnit,
  legendStops,
  symbolEligible,
  symbolRadius,
} from "@/lib/symbols";

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

  test("one click on a circle is ONE selection, not two (report 822)", async ({ page }) => {
    // MapLibre delegated listeners do not stop propagation: each queries its own
    // layers and fires. A circle is drawn on a point INSIDE its own polygon, so every
    // symbol click matches district-symbol AND district-fill. clickFeature then ran
    // twice for one click, reading a selectedRef that React had not settled yet —
    // region_opened double-fired, and over a neighbouring polygon the two runs
    // disagreed and left two regions outlined at once.
    const events: { e: string; d?: Record<string, unknown> }[] = [];
    await page.addInitScript(() => {
      const rec: unknown[] = [];
      (window as unknown as { __mobEvents: unknown[] }).__mobEvents = rec;
      Object.defineProperty(window, "umami", {
        configurable: false,
        get: () => ({ track: (e: string, d?: Record<string, unknown>) => { rec.push({ e, d }); } }),
        set: () => { /* the real tracker must not displace the spy */ },
      });
    });

    await page.goto("/?m=pop_total&lvl=district");
    await waitForMapReady(page);
    expect(await layerVisible(page, "district-symbol"), "this metric must be in symbol mode").toBe(true);

    const result = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      if (!m) return null;
      // A rendered circle, and the screen point at its centre.
      const circles = m.queryRenderedFeatures(undefined, { layers: ["district-symbol"] });
      if (!circles.length) return null;
      const geom = circles[0].geometry as { type: string; coordinates: [number, number] };
      if (geom.type !== "Point") return null;
      const lngLat = { lng: geom.coordinates[0], lat: geom.coordinates[1] };
      const point = m.project(lngLat);

      // ONE browser click, carrying one originalEvent, exactly as a user produces.
      const originalEvent = new MouseEvent("click", { bubbles: true });
      m.fire("click", { point, lngLat, originalEvent });
      return { id: String(circles[0].id) };
    });

    expect(result, "there must be a rendered circle to click").not.toBeNull();
    await page.waitForTimeout(400);

    // 1. exactly one region carries selected:true
    const selectedCount = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map!;
      const feats = m.querySourceFeatures("districts") as Array<{ id?: string | number }>;
      const seen = new Set<string>();
      let n = 0;
      for (const f of feats) {
        if (f.id == null || seen.has(String(f.id))) continue;
        seen.add(String(f.id));
        if (m.getFeatureState({ source: "districts", id: f.id }).selected) n++;
      }
      return n;
    });
    expect(selectedCount, "one click must leave exactly one region selected").toBe(1);

    // 2. region_opened fired once, not once per delegated listener
    const fired = (await page.evaluate(
      () => (window as unknown as { __mobEvents: { e: string }[] }).__mobEvents,
    )).filter((x) => x.e === "region_opened");
    events.push(...fired);
    expect(fired.length, "region_opened must fire once per click, not once per layer listener").toBe(1);
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
    // Scope, stated precisely (#565): this asserts the output is SERVED, complete,
    // and not grossly corrupt. It does not prove containment and never did — the
    // bounding box below is India's, so a point in the Arabian Sea or on top of a
    // neighbouring district passes it. That was the whole finding.
    //
    // Real containment is proven in tests/centroid-containment.spec.ts, which runs
    // point-in-polygon against every shipped point, and enforced at build time by
    // scripts/check-centroids.mjs in prebuild. pipeline/build_centroids.py now
    // genuinely refuses to write a point outside its polygon; until this commit it
    // wrote it and printed "all inside their polygon" anyway.
    //
    // Keeping the box is still worth it: it is a cheap tripwire for coordinates
    // that have gone to 0,0 or been swapped lat/lon, which containment against a
    // missing polygon would report less clearly.
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
      // a real coordinate pair somewhere in India — a tripwire, not a proof
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

test.describe("#566 the floor's reach is measured, not assumed", () => {
  // The suite used to sample only ABOVE the floor — the proportionality test says
  // so in its own comment, "sampled above the floor, where proportionality is
  // exact by construction". True, and it meant nothing was watching the half of
  // the map that is below it. On livestock_poultry that is 372 of 695 districts
  // drawn at one identical radius while differing by more than 100x.

  test("the floor threshold is 1% of the maximum at district bounds", () => {
    // r = max·√(v/vmax) < min  =>  v < vmax·(min/max)²  =>  (1.2/12)² = 0.01
    expect(floorThreshold(1000, "district")).toBeCloseTo(10, 6);
    expect(floorThreshold(48_375_945, "district")).toBeCloseTo(483_759.45, 2);
    // states have a far kinder ratio: (3/40)² = 0.5625%
    expect(floorThreshold(1000, "state")).toBeCloseTo(5.625, 6);
    expect(floorThreshold(0)).toBe(0);
    expect(floorThreshold(Number.NaN)).toBe(0);
  });

  test("floorShare counts what symbolRadius actually draws", () => {
    // one value at the max, one just above 1%, one well below
    const vals = [1000, 20, 5, 1];
    const s = floorShare(vals, "district");
    expect(s.drawn).toBe(4);
    expect(s.threshold).toBeCloseTo(10, 6);
    // 5 and 1 are under the threshold; 20 is over
    expect(s.atFloor).toBe(2);
    expect(s.share).toBeCloseTo(0.5, 6);
  });

  test("zeroes and nulls are excluded, not counted as floored", () => {
    // A zero draws nothing at all, so calling it "at the floor" would overstate
    // the collapse and make the guard below fire on the wrong thing.
    const s = floorShare([1000, 0, null, undefined, Number.NaN, 5], "district");
    expect(s.drawn).toBe(2);
    expect(s.atFloor).toBe(1);
  });

  test("an empty dataset reports nothing rather than dividing by zero", () => {
    const s = floorShare([], "district");
    expect(s).toEqual({ drawn: 0, atFloor: 0, share: 0, threshold: 0 });
    expect(floorShare([0, null], "district").drawn).toBe(0);
  });

  test("every value below the threshold really does draw at the floor", () => {
    const vals = [1_000_000, 9_999, 5_000, 1];
    const { threshold } = floorShare(vals, "district");
    for (const v of vals.filter((v) => v < threshold)) {
      expect(symbolRadius(v, 1_000_000, "district"), `${v}`).toBe(1.2);
    }
  });

  test("the shipped metrics' collapse stays within measured bounds", async ({ request }) => {
    // Bounds, not equality: the store changes and an exact number would be noise.
    // But a metric drifting further into the floor flattens more of the map, and
    // that must not happen silently. Measured 2026-08-22 against the live store.
    const bounds: [string, number, number][] = [
      // metric, min share, max share
      ["livestock_poultry", 0.48, 0.60],
      ["agri_wheat_production", 0.36, 0.48],
      ["livestock_buffalo", 0.21, 0.33],
      ["pop_total", 0.05, 0.15],
    ];
    for (const [id, lo, hi] of bounds) {
      const res = await request.get(`/api/metrics/${id}?level=district`);
      expect(res.ok(), id).toBeTruthy();
      const { values } = (await res.json()) as { values: Record<string, number> };
      const s = floorShare(Object.values(values), "district");
      expect(s.drawn, `${id} returned no values`).toBeGreaterThan(0);
      expect(s.share, `${id}: ${s.atFloor}/${s.drawn} at the floor`).toBeGreaterThanOrEqual(lo);
      expect(s.share, `${id}: ${s.atFloor}/${s.drawn} at the floor`).toBeLessThanOrEqual(hi);
    }
  });

  test("no shipped metric collapses more than 60% of its districts", async ({ request }) => {
    // The backstop. Above this the layer is drawing a map of one dot repeated,
    // and symbols have stopped being the more honest instrument.
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { id: string; unit: string | null }[];
    };
    let checked = 0;
    for (const m of metrics) {
      if (!isCountUnit(m.unit)) continue;
      const { values } = (await (
        await request.get(`/api/metrics/${m.id}?level=district`)
      ).json()) as { values: Record<string, number> };
      const vals = Object.values(values);
      if (!symbolEligible(m.unit, vals)) continue; // signed metrics never ship as symbols
      const s = floorShare(vals, "district");
      if (s.drawn === 0) continue;
      expect(s.share, `${m.id}: ${s.atFloor}/${s.drawn} at the floor`).toBeLessThan(0.6);
      checked++;
    }
    // Phase 1 ships 9 count metrics; if this ever reads 0 the loop stopped
    // measuring and every assertion above became vacuous.
    expect(checked, "no symbol-eligible metrics were checked").toBeGreaterThanOrEqual(8);
  });
});

test.describe("#567 the excluded extensive metrics are a named gap, not a claim of safety", () => {
  // The docstring used to conclude "only 9 of 87 district metrics carry one of
  // these units — so area bias can only ever bite those 9". The inference is
  // invalid: bias follows from a quantity being extensive, not from its unit
  // string being in a Set. These four add up across regions, are drawn as
  // choropleths, and carry the full 291x Kutch-over-Mumbai distortion.

  test("every named metric exists and really is excluded from symbols", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { id: string; unit: string | null }[];
    };
    const byId = new Map(metrics.map((m) => [m.id, m]));

    for (const { id, unit } of EXTENSIVE_NOT_SYMBOLISED) {
      const m = byId.get(id);
      expect(m, `${id} is named as an excluded extensive metric but is not in the store`).toBeTruthy();
      expect(m!.unit, `${id} unit drifted`).toBe(unit);
      // The point of the list: they are extensive, and they still get no circles.
      expect(isCountUnit(m!.unit), `${id} would now be symbolised`).toBe(false);
    }
  });

  test("the already-normalised money metrics are NOT on the list", () => {
    // Both are "₹". One is per-day, one is per-capita — intensive, unbiased, and
    // correctly choropleths. Sharing a unit string with an extensive total is
    // exactly why units alone cannot decide this, so listing them would be wrong.
    const ids = EXTENSIVE_NOT_SYMBOLISED.map((x) => x.id);
    expect(ids).not.toContain("mgnrega_avg_wage_day");
    expect(ids).not.toContain("econ_percapita_nsdp_rbi");
  });

  test("no metric is both symbolised and listed as excluded", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { id: string; unit: string | null }[];
    };
    const excluded = new Set(EXTENSIVE_NOT_SYMBOLISED.map((x) => x.id));
    for (const m of metrics) {
      if (isCountUnit(m.unit)) {
        expect(excluded.has(m.id), `${m.id} is both a count unit and listed as excluded`).toBe(false);
      }
    }
  });

  test("the list is non-empty, so the gap stays visible", () => {
    // If someone empties this rather than symbolising the metrics, the gap goes
    // back to being invisible and the old false claim is effectively restored.
    expect(EXTENSIVE_NOT_SYMBOLISED.length).toBeGreaterThanOrEqual(4);
  });
});

test.describe("#568 the symbol layer has its own listeners wired", () => {
  // Deleting wire("state-symbol", …) and wire("state-symbol", …) left all 17
  // symbol tests green. The click test above cannot catch it: a circle is drawn
  // on a representative point INSIDE its own polygon, so district-fill answers
  // with the same region and the assertion holds either way.
  //
  // The wiring only decides anything where a circle covers a NEIGHBOURING
  // polygon — exactly what the "ORDER IS LOAD-BEARING" comment at
  // india-map.tsx:648 is about. So that is the click that goes here.

  /** A screen point inside a circle that sits over some OTHER state polygon.
   *
   *  STATE level on purpose. District circles cap at 12px and stay inside their own
   *  polygon at default zoom, so no overlap exists to click and the search returns
   *  nothing. States cap at 40px across 36 marks, where a large circle genuinely
   *  covers its neighbours — which is the situation the registration order exists
   *  to resolve.
   *
   *  Steps outward from each centre by that circle own radius. The district-level
   *  version of this swept all 735 marks and blew the 30s timeout on ~35k
   *  queryRenderedFeatures calls; 36 states is a different proposition. */
  async function overlapPoint(page: Page) {
    return page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      if (!m) return null;
      const sized: { id: string; r: number }[] = [];
      const seen = new Set<string>();
      for (const f of m.querySourceFeatures("states-pts") as Array<{ id?: string | number }>) {
        if (f.id == null || seen.has(String(f.id))) continue;
        seen.add(String(f.id));
        const r = m.getFeatureState({ source: "states-pts", id: f.id }).r;
        if (typeof r === "number" && r > 3) sized.push({ id: String(f.id), r });
      }
      sized.sort((a, b) => b.r - a.r);

      const rendered = m.queryRenderedFeatures(undefined, { layers: ["state-symbol"] });
      // Every mark, not just the biggest. The largest circles belong to the
      // largest STATES (Uttar Pradesh, Maharashtra), whose polygons swallow a
      // 34px offset whole — searching only the top 20 by radius found nothing.
      // Overflow happens on the COMPACT high-population states, which rank
      // lower by radius. 36 marks is cheap to scan in full.
      for (const { id, r } of sized) {
        const hit = rendered.find((f) => String(f.id) === id);
        if (!hit) continue;
        const g = hit.geometry as { type: string; coordinates: [number, number] };
        if (g.type !== "Point") continue;
        const p = m.project({ lng: g.coordinates[0], lat: g.coordinates[1] });
        for (const frac of [0.85, 0.7, 0.55]) {
          const d = Math.round(r * frac);
          if (d < 2) continue;
          for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
            // An [x, y] ARRAY, not a {x, y} object. queryRenderedFeatures runs the
            // argument through Point.convert, and the object form does not survive
            // it — the probe silently returns nothing and the search reports no
            // overlap anywhere on the map.
            const pt: [number, number] = [p.x + ox, p.y + oy];
            const syms = m.queryRenderedFeatures(pt, { layers: ["state-symbol"] });
            const fills = m.queryRenderedFeatures(pt, { layers: ["state-fill"] });
            if (
              syms.some((s) => String(s.id) === id) &&
              fills.length > 0 &&
              fills.every((f) => String(f.id) !== id)
            ) {
              return { x: pt[0], y: pt[1], circleId: id, polygonId: String(fills[0].id) };
            }
          }
        }
      }
      return null;
    });
  }

  test("a click on a circle overlapping a neighbour selects the CIRCLE region", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=state");
    await waitForMapReady(page);
    expect(await layerVisible(page, "state-symbol")).toBe(true);

    const spot = await overlapPoint(page);
    // Fail rather than skip if none is found: a guard that quietly measures
    // nothing is how this gap survived in the first place.
    expect(spot, "no circle overlapping a neighbouring polygon was found to click").not.toBeNull();
    expect(spot!.circleId).not.toBe(spot!.polygonId);

    // A REAL browser click, not m.fire(). The synthetic path is what the sibling
    // test above uses and it is fine there, but this assertion turns on the order
    // delegated listeners run in, and that is exactly the thing a hand-fired event
    // could get wrong on its own. Driving the mouse settles whether the guarantee
    // holds for a user.
    const box = await page.locator("canvas").first().boundingBox();
    expect(box, "the map canvas must be on screen to click it").not.toBeNull();
    await page.mouse.click(box!.x + spot!.x, box!.y + spot!.y);
    await page.waitForTimeout(500);

    const selected = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map!;
      const out: string[] = [];
      const seen = new Set<string>();
      for (const f of m.querySourceFeatures("states") as Array<{ id?: string | number }>) {
        if (f.id == null || seen.has(String(f.id))) continue;
        seen.add(String(f.id));
        if (m.getFeatureState({ source: "states", id: f.id }).selected) out.push(String(f.id));
      }
      return out;
    });

    expect(selected, "exactly one region selected").toHaveLength(1);
    // Without the symbol layer wired FIRST, district-fill wins this click and the
    // neighbour under the circle is selected instead.
    expect(selected[0], "the circle region must win, not the polygon beneath it").toBe(spot!.circleId);
  });

  test("hovering a circle over a neighbour lights up the CIRCLE region", async ({ page }) => {
    // The overlap point again, and for the same reason. The first version of this
    // hovered circle CENTRES and passed with both symbol wire() calls deleted —
    // a centre sits inside its own polygon, so state-fill's mousemove sets hover
    // on the same region and the assertion holds either way. Exactly the defect
    // #568 is about, repeated in the test written to close it.
    await page.goto("/?m=pop_total&lvl=state");
    await waitForMapReady(page);

    const spot = await overlapPoint(page);
    expect(spot, "no circle overlapping a neighbouring polygon was found to hover").not.toBeNull();

    const box = await page.locator("canvas").first().boundingBox();
    expect(box, "the map canvas must be on screen").not.toBeNull();
    await page.mouse.move(box!.x + spot!.x, box!.y + spot!.y);
    await page.waitForTimeout(300);

    const state = await page.evaluate((s) => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map!;
      return {
        circle: m.getFeatureState({ source: "states", id: s.circleId }).hover,
        polygon: m.getFeatureState({ source: "states", id: s.polygonId }).hover,
      };
    }, spot!);

    // The discriminating fact: with the symbol layer unwired, only the polygon
    // beneath ever receives hover and this is undefined.
    expect(state.circle, "the hovered circle region must light up").toBe(true);
  });

  test("moving between circles clears the previous highlight", async ({ page }) => {
    // Scope, stated honestly: this covers the hover HANDOVER at india-map.tsx:613,
    // not the symbol wiring. It passes with both symbol wire() calls deleted,
    // because state-fill's own handler does the same handover on the polygons
    // underneath. Kept for the behaviour it does cover; the guard for #568 is the
    // overlap test above.
    await page.goto("/?m=pop_total&lvl=state");
    await waitForMapReady(page);

    const result = await page.evaluate(() => {
      const m = (window as unknown as { __mob_map?: maplibregl.Map }).__mob_map;
      if (!m) return null;
      const circles = m
        .queryRenderedFeatures(undefined, { layers: ["state-symbol"] })
        .filter((f) => f.id != null);
      const uniq: typeof circles = [];
      const seen = new Set<string>();
      for (const c of circles) {
        if (seen.has(String(c.id))) continue;
        seen.add(String(c.id));
        uniq.push(c);
        if (uniq.length === 2) break;
      }
      if (uniq.length < 2) return null;

      const hoverAt = (f: (typeof circles)[number]) => {
        const g = f.geometry as { type: string; coordinates: [number, number] };
        const lngLat = { lng: g.coordinates[0], lat: g.coordinates[1] };
        m.fire("mousemove", {
          point: m.project(lngLat),
          lngLat,
          originalEvent: new MouseEvent("mousemove"),
        });
      };

      hoverAt(uniq[0]);
      const firstDuring = m.getFeatureState({ source: "states", id: uniq[0].id! }).hover;
      hoverAt(uniq[1]);
      const firstAfter = m.getFeatureState({ source: "states", id: uniq[0].id! }).hover;
      const secondDuring = m.getFeatureState({ source: "states", id: uniq[1].id! }).hover;
      return { firstDuring, firstAfter, secondDuring };
    });

    expect(result, "two rendered circles are needed to test the handover").not.toBeNull();
    expect(result!.firstDuring, "hovering a region must set hover on it").toBe(true);
    expect(result!.secondDuring, "the next region must pick hover up").toBe(true);
    expect(result!.firstAfter, "the previous region must be cleared, or highlights pile up").toBe(false);
  });
});
