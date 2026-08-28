import { test, expect, Page } from "@playwright/test";

// ── drilling into a state must draw THAT STATE'S DISTRICTS (iter-46 item 1091) ──
//
// THE DEFECT THIS FILE EXISTS FOR. applyFocus built its MapLibre drill filter with
// String(Number(code)) — "09" becomes "9" — while districts.geojson stores st_code
// zero-padded, "01".."38". For the nine states coded 01..09 the filter therefore
// matched no polygon at all and the map went blank. Measured on the deployed
// 57581ac, before the fix, by asking the live filter what it admits:
//
//     state                  districts in source   admitted by filter   rendered
//     Jammu & Kashmir (01)          22                     0               0
//     Delhi (07)                     1                     0               0
//     Uttar Pradesh (09)            75                     0               0
//     Madhya Pradesh (23)           52                    52              70
//     Maharashtra (27)              35                    35              39
//
// That is Jammu & Kashmir, Himachal, Punjab, Chandigarh, Uttarakhand, Haryana,
// Delhi, Rajasthan and Uttar Pradesh — nine states, including the most populous one
// in the country.
//
// WHY A 530-TEST SUITE DID NOT ALREADY HAVE THIS, which is the shape of the file
// below rather than a footnote to it:
//
//   1. EVERY existing drill spec picks a high-numbered state — Madhya Pradesh (23)
//      in flows and mobile-explorer, Kerala (32) in canvas-probe, Goa (30) and
//      Chandigarh (04, refused for its single district) in bivariate. The broken
//      half of the code space was never entered. So the first test here sweeps
//      EVERY state code the geometry carries, not a sample.
//
//   2. Those specs assert on the RAIL and the BREADCRUMB, and both stayed correct
//      while the map drew nothing: scopeCodes() and the entries builder each
//      carried a padded/unpadded tolerance, so the drill trail said "Uttar Pradesh"
//      and the rail said "75 districts in Uttar Pradesh" over an empty plate. So
//      every assertion here is about POLYGONS — what the source admits and what the
//      map renders — and never about chrome.
//
// The tolerances are gone (one canonical padded form, produced in applyFocus) and
// the filter is numeric, so neither spelling can miss the other. The third test
// below is what replaces the tolerance: an unpadded code in a shared link must
// still drill.

const NATIONAL = "/?m=literacy_rate&lvl=district";

/** Representative codes: three of the nine that were broken, two that were not. */
const CASES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "07", name: "Delhi" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "27", name: "Maharashtra" },
];

/** Every layer applyFocus filters. The hatch and the seam ride with the fill by
 *  design (a hatch left unfiltered paints the rest of the country), so a drill that
 *  is right for one of these and wrong for another is still a broken drill. */
const DRILLED_LAYERS = ["district-fill", "district-nodata", "district-line", "state-outline"];

/** Just as much of the MapLibre map as this file measures, spelled out rather than
 *  reached for with `any` — the same shape tests/symbol-maps.spec.ts declares for its
 *  own probes. These calls ARE the assertions here; a loosely typed one that quietly
 *  returns undefined would make the whole file agree with anything. Types are erased
 *  before the callbacks are serialised into the page, so naming them costs nothing. */
type Feat = { id?: string | number; properties?: Record<string, unknown> | null };
type MapProbe = {
  getFilter: (layer: string) => unknown;
  querySourceFeatures: (source: string, opts?: { filter?: unknown }) => Feat[];
  queryRenderedFeatures: (geom?: unknown, opts?: { layers?: string[] }) => Feat[];
  getFeatureState: (target: { source: string; id: string }) => Record<string, unknown> | undefined;
  project: (lngLat: [number, number]) => { x: number; y: number };
  getCanvas: () => HTMLCanvasElement;
};
/** The two test hooks india-map.tsx publishes: the live map, and the drill-filter
 *  BUILDER the sweep below puts every state code through. */
type MapWindow = { __mob_map: MapProbe; __mob_state_filter: (code: string) => unknown };

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  // colours applied = feature-state set after the metric fetch; give the 400ms
  // transition a beat, the same wait the other map specs use.
  await page.waitForTimeout(500);
}

/** rids the drill filter on `layer` admits, and the rids the SOURCE holds for that
 *  state — both read from the same loaded tiles, so tile simplification cannot make
 *  one look short against the other. */
async function drillCounts(page: Page, code: string, layer = "district-fill") {
  return page.evaluate(({ c, lyr }: { c: string; lyr: string }) => {
    const w = window as unknown as MapWindow;
    const m = w.__mob_map;
    const flt = m.getFilter(lyr);
    const prefix = c + "_";
    const truth = new Set<string>();
    for (const f of m.querySourceFeatures("districts")) {
      const rid = String(f.properties?.rid);
      if (rid.startsWith(prefix)) truth.add(rid);
    }
    const admitted = new Set<string>();
    for (const f of m.querySourceFeatures("districts", { filter: flt })) {
      admitted.add(String(f.properties?.rid));
    }
    return {
      filter: JSON.stringify(flt),
      expected: JSON.stringify(w.__mob_state_filter(c)),
      inSource: truth.size,
      admitted: admitted.size,
      strays: [...admitted].filter((r) => !r.startsWith(prefix)).slice(0, 5),
    };
  }, { c: code, lyr: layer });
}

/** District polygons the map is actually PAINTING right now, and whose they are. */
async function renderedDistricts(page: Page) {
  return page.evaluate(() => {
    const m = (window as unknown as MapWindow).__mob_map;
    const rids = new Set<string>();
    for (const f of m.queryRenderedFeatures(undefined, { layers: ["district-fill"] })) {
      rids.add(String(f.properties?.rid));
    }
    return [...rids];
  });
}

test.describe("drill by state code (iter-46 item 1091)", () => {
  test("every state code the geometry carries admits exactly its own districts", async ({ page }) => {
    // ONE page load for all of them. The map is at the national district view, where
    // the tiled source holds all 735 polygons and all 36 state codes (measured), so
    // this is the whole code space rather than a sample of it — and it costs one
    // navigation, which is why it can be the whole code space.
    //
    // The filter comes from window.__mob_state_filter, the builder applyFocus itself
    // uses. Rebuilding the expression here would only test a copy of it; the next
    // test proves a REAL drill installs exactly what this builder returns, which is
    // the join between the two.
    await page.goto(NATIONAL);
    await waitForMapReady(page);

    const result = await page.evaluate(() => {
      const w = window as unknown as MapWindow;
      const m = w.__mob_map;
      const byState = new Map<string, Set<string>>();
      for (const f of m.querySourceFeatures("districts")) {
        const rid = String(f.properties?.rid);
        const st = rid.split("_")[0];
        if (!byState.has(st)) byState.set(st, new Set());
        byState.get(st)!.add(rid);
      }
      const rows: { code: string; inSource: number; admitted: number; strays: number }[] = [];
      for (const code of [...byState.keys()].sort()) {
        const admitted = new Set<string>();
        for (const f of m.querySourceFeatures("districts", { filter: w.__mob_state_filter(code) })) {
          admitted.add(String(f.properties?.rid));
        }
        rows.push({
          code,
          inSource: byState.get(code)!.size,
          admitted: admitted.size,
          strays: [...admitted].filter((r) => !r.startsWith(code + "_")).length,
        });
      }
      return { rows, totalInSource: [...byState.values()].reduce((a, s) => a + s.size, 0) };
    });

    // Non-vacuity first. A sweep that walked an empty list would report the same
    // clean pass as one that walked the real geometry — the failure this repo keeps
    // finding in its own guards — so the premise is asserted, not assumed.
    expect(result.rows.length, "the tiled source offered no state codes to sweep").toBeGreaterThanOrEqual(36);
    expect(result.totalInSource, "the tiled source is short of the 735 districts").toBeGreaterThanOrEqual(735);
    // And specifically the nine that were broken, by name, so a future geometry that
    // quietly stops padding cannot make this test pass by having nothing to check.
    const swept = result.rows.map((r) => r.code);
    for (const c of ["01", "02", "03", "04", "05", "06", "07", "08", "09"])
      expect(swept, `state ${c} was not in the sweep at all`).toContain(c);

    const wrong = result.rows.filter((r) => r.admitted !== r.inSource || r.strays > 0);
    expect(
      wrong,
      "these state codes drill to the wrong set of districts:\n"
      + wrong.map((r) => `  ${r.code}: source has ${r.inSource}, the filter admits ${r.admitted}`
        + (r.strays ? `, ${r.strays} of them from other states` : "")).join("\n"),
    ).toEqual([]);
  });

  for (const { code, name } of CASES) {
    test(`a real drill into ${name} (${code}) installs that filter and paints polygons`, async ({ page }) => {
      await page.goto(`/?m=literacy_rate&lvl=district&st=${code}&stn=${encodeURIComponent(name)}`);
      await waitForMapReady(page);

      // Polygons on screen, waited for rather than sampled mid-fly: applyFocus
      // fitBounds over 750ms and queryRenderedFeatures answers about the frame it is
      // asked in. This is the assertion the pre-fix build fails at 0.
      await expect
        .poll(async () => (await renderedDistricts(page)).length, {
          timeout: 15_000,
          message: `${name} (${code}) drilled to an EMPTY MAP — no district-fill polygon is being painted`,
        })
        .toBeGreaterThan(0);

      const rendered = await renderedDistricts(page);
      expect(
        rendered.filter((r) => !r.startsWith(code + "_")),
        `${name} (${code}) is painting districts that belong to other states`,
      ).toEqual([]);

      const counts = await drillCounts(page, code);
      // The join: the drill really is built by the function the sweep above exercises.
      expect(counts.filter, `the live drill filter is not what stateFilter(${code}) returns`)
        .toBe(counts.expected);
      expect(counts.inSource, `no ${name} districts in the tiled source — this case proves nothing`)
        .toBeGreaterThan(0);
      expect(counts.admitted, `${name} (${code}): the filter admits ${counts.admitted} of ${counts.inSource} districts`)
        .toBe(counts.inSource);
      expect(counts.strays).toEqual([]);

      // Every layer applyFocus filters carries the SAME filter. The hatch is the one
      // that matters most: recolor marks every out-of-scope district no-data, so an
      // unfiltered district-nodata would hatch the whole country under a drill.
      const filters = await page.evaluate((layers) => {
        const m = (window as unknown as MapWindow).__mob_map;
        return layers.map((l) => JSON.stringify(m.getFilter(l)));
      }, DRILLED_LAYERS);
      for (let i = 0; i < DRILLED_LAYERS.length; i++)
        expect(filters[i], `${DRILLED_LAYERS[i]} does not carry the drill filter`).toBe(counts.expected);
    });
  }

  test("a shared link that spells the state code UNPADDED still drills", async ({ page }) => {
    // This is what replaces the tolerance that used to sit in scopeCodes(), the
    // entries builder and the hatch counter. Those three accepted both spellings
    // because applyFocus produced the wrong one; now applyFocus canonicalises what it
    // is handed, so the tolerance moved to the ONE boundary a stray spelling can
    // enter through — a link typed by hand, or one written by a build that predates
    // the padded `st` param.
    await page.goto("/?m=literacy_rate&lvl=district&st=9&stn=Uttar%20Pradesh");
    await waitForMapReady(page);

    await expect
      .poll(async () => (await renderedDistricts(page)).length, {
        timeout: 15_000,
        message: "?st=9 drilled to an empty map — applyFocus is not canonicalising the code it is handed",
      })
      .toBeGreaterThan(0);

    const counts = await drillCounts(page, "09");
    expect(counts.filter, "an unpadded ?st= produced a different filter from the padded one").toBe(counts.expected);
    expect(counts.admitted).toBe(counts.inSource);
    expect(counts.inSource).toBeGreaterThan(0);
    // ...and the rail agrees with the map, which before the fix it did while the map
    // was blank. Both, or neither.
    await expect(page.getByText(/districts in Uttar Pradesh/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("clicking a low-numbered state and drilling in paints its districts", async ({ page }) => {
    // The reader's own journey, not a restored permalink: click the state, read the
    // profile, press the drill button. Same applyFocus underneath, reached the other
    // way, so a fix that only canonicalised the URL path would still be red here.
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);

    const lucknow: [number, number] = [80.95, 26.85]; // Uttar Pradesh, code 09
    const pos = await page.evaluate(([lng, lat]) => {
      const m = (window as unknown as MapWindow).__mob_map;
      const p = m.project([lng, lat]);
      const rect = m.getCanvas().getBoundingClientRect();
      return { x: rect.x + p.x, y: rect.y + p.y };
    }, lucknow);
    await page.mouse.click(pos.x, pos.y);

    await expect(page.getByText(/SELECTED · STATE/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /View \d+ districts/i }).click();
    await expect(page.getByRole("navigation", { name: "Drill trail" }))
      .toContainText("Uttar Pradesh", { timeout: 10_000 });

    await expect
      .poll(async () => (await renderedDistricts(page)).length, {
        timeout: 15_000,
        message: "the drill button on Uttar Pradesh's profile led to an empty map",
      })
      .toBeGreaterThan(0);
    const rendered = await renderedDistricts(page);
    expect(rendered.filter((r) => !r.startsWith("09_"))).toEqual([]);
  });

  test("picking a low-numbered state out of search selects the real feature", async ({ page }) => {
    // The quieter face of the same defect. onSearchRegion handed clickFeature
    // String(Number(r.code)), and that value becomes a MapLibre FEATURE ID — the
    // `states` source is promoteId'd on the padded st_code, so "9" selected nothing,
    // and valuesRef is keyed padded too, so the profile that opened alongside said
    // "No data for this region" about a state with a literacy rate.
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);

    await page.getByRole("button", { name: /Search places and indicators/i }).first().click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").fill("Uttar Pradesh");
    await dialog.getByRole("button", { name: /Uttar Pradesh/ }).first().click();

    await expect(page.getByText(/SELECTED · STATE/i)).toBeVisible({ timeout: 10_000 });

    const state = await page.evaluate(() => {
      const m = (window as unknown as MapWindow).__mob_map;
      return m.getFeatureState({ source: "states", id: "09" }) as Record<string, unknown>;
    });
    expect(state.selected, "state 09 was never selected — the search handed the map an id no feature carries").toBe(true);

    // ...and the panel that opened is reading the number, not shrugging at it.
    await expect(page.locator('[data-role="metric"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/No data for this region on the current indicator/i)).toHaveCount(0);
  });
});

// ── the other render modes, at a low code (iter-46 item 1091, per-mode check) ──
// The drill filter is installed by one function, so in principle every mode inherits
// the same fix — but "in principle" is what let the original slip, and each of these
// reaches the polygons by a different route: symbols carry the value on a SEPARATE
// point source that applyFocus does not filter at all, and the paired map paints from
// a second metric's values over the same scope.
test.describe("drill at a low state code, per render mode (item 1091)", () => {
  test("symbol mode drills: circles for the state, and its polygons underneath", async ({ page }) => {
    await page.goto("/?m=pop_total&lvl=district&st=09&stn=Uttar%20Pradesh&sym=1");
    await waitForMapReady(page);

    await expect
      .poll(async () => (await renderedDistricts(page)).length, {
        timeout: 15_000,
        message: "symbol mode drilled into Uttar Pradesh with no polygons under the circles",
      })
      .toBeGreaterThan(0);

    // The circles are on districts-pts, which carries NO drill filter — every
    // centroid in the country stays in the layer and recolor sizes the out-of-scope
    // ones to r=0 instead. So the question is not which features the layer holds
    // (all 735, radius or no radius: a zero-radius circle is still returned by
    // queryRenderedFeatures, measured) but which of them carry INK. Radius is read
    // off the feature-state the paint actually wrote.
    const circles = await page.evaluate(() => {
      const m = (window as unknown as MapWindow).__mob_map;
      const radius = new Map<string, number>();
      for (const f of m.queryRenderedFeatures(undefined, { layers: ["district-symbol"] })) {
        const id = String(f.id ?? f.properties?.rid);
        const st = m.getFeatureState({ source: "districts-pts", id }) as { r?: number } | undefined;
        radius.set(id, Number(st?.r ?? 0));
      }
      return {
        inLayer: radius.size,
        inked: [...radius.entries()].filter(([, r]) => r > 0).map(([id]) => id),
      };
    });
    expect(circles.inLayer, "the symbol layer answered with nothing at all").toBeGreaterThan(0);
    expect(circles.inked.length, "no proportional symbols drawn for Uttar Pradesh").toBeGreaterThan(0);
    expect(
      circles.inked.filter((r) => !r.startsWith("09_")),
      "circles with real ink outside the drilled state",
    ).toEqual([]);
  });

  test("a paired map drills: the matrix paints Uttar Pradesh's districts", async ({ page }) => {
    await page.goto("/?m=literacy_rate&bi=sex_ratio&lvl=district&st=09&stn=Uttar%20Pradesh");
    await waitForMapReady(page);

    await expect
      .poll(async () => (await renderedDistricts(page)).length, {
        timeout: 15_000,
        message: "the paired map drilled into Uttar Pradesh and painted nothing",
      })
      .toBeGreaterThan(0);
    const counts = await drillCounts(page, "09");
    expect(counts.admitted).toBe(counts.inSource);
    expect(counts.inSource).toBeGreaterThan(0);
  });

  test("the as-reported 2011 view scopes a low-code drill to that state's 2011 districts", async ({ page, request }) => {
    // The vintage has no drill filter of its own — d2011-fill is never filtered, and
    // toggling the vintage exits any focus — so the padding question reaches it only
    // through the rid PREFIX the rail and the paint cut their scope with. 2011 rids
    // are padded exactly like the current ones, so one canonical prefix has to be
    // right here too; the count is read from the API rather than hardcoded, so a data
    // rebuild moves the expectation with the data.
    const api = (await (await request.get("/api/metrics/literacy_rate?level=district2011")).json()) as {
      values: Record<string, number>;
    };
    const up2011 = Object.keys(api.values).filter((c) => c.startsWith("09_")).length;
    expect(up2011, "no 2011 districts for state 09 in the store — this case proves nothing").toBeGreaterThan(0);

    await page.goto("/?m=literacy_rate&lvl=district&vin=2011&st=09&stn=Uttar%20Pradesh");
    await waitForMapReady(page);
    await expect(page.getByText(new RegExp(`${up2011} districts in Uttar Pradesh`, "i")).first())
      .toBeVisible({ timeout: 20_000 });
  });
});
