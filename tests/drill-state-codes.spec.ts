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
//      and the rail said "75 districts in Uttar Pradesh" over an empty plate. So the
//      assertions here are about POLYGONS — what the source admits and what the map
//      renders — and a test that reaches for chrome has to say so IN ITS NAME and
//      earn it, because a name promising a scope guarantee it does not check is the
//      same failure one storey up. Exactly two tests reach for chrome:
//
//        · the malformed-`?st=` pair asserts map AND rail together, because the two
//          disagreeing IS the defect it guards;
//        · the as-reported 2011 case can assert nothing else. d2011-fill carries no
//          drill filter at all, so no polygon on that plate is cut by the prefix
//          under test. It asserts the ABSENCE of that filter as its premise, so the
//          day the 2011 plate is scoped this test goes red and asks to be tightened
//          instead of quietly passing over a guarantee it never made.
//
// The tolerances are gone (one canonical padded form, produced in applyFocus) and
// the filter is numeric, so neither spelling can miss the other. The third test
// below is what replaces the tolerance: an unpadded code in a shared link must
// still drill.
//
// ── ROUND 2 (same item, found by the verifier on the fixed build) ─────────────
// stCode() canonicalised with padStart, which only ADDS characters, so "9" was fixed
// and "009" and " 9" were not. Both are one hand-typed link away, and both produced
// the SAME class of divergence inverted: stateFilter compares numbers, so the map
// painted all 75 Uttar Pradesh districts, while ridPrefix built "009_" / " 9_" and
// the rail read "0 districts in Uttar Pradesh". A code naming no state at all
// (?st=abc, ?st=99) drilled to a blank plate scoped to nowhere. The two tests after
// the unpadded one cover both, and both assert the map and the rail together.

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

/** District polygons the map is actually PAINTING right now, and whose they are.
 *  The layer is a parameter only so the as-reported case can ask the same question of
 *  d2011-fill; every other caller wants the default and says nothing. */
async function renderedDistricts(page: Page, layer = "district-fill") {
  return page.evaluate((lyr) => {
    const m = (window as unknown as MapWindow).__mob_map;
    const rids = new Set<string>();
    for (const f of m.queryRenderedFeatures(undefined, { layers: [lyr] })) {
      rids.add(String(f.properties?.rid));
    }
    return [...rids];
  }, layer);
}

/** Whether a layer carries a filter at all, and what it is.
 *
 *  Two fields rather than one, because "no filter" comes back as `undefined` and
 *  `undefined` does not survive JSON.stringify — a probe that returned only the
 *  serialised filter would report an UNFILTERED layer and a layer filtered to
 *  `undefined` identically, which is the shape of agreeing with anything. */
async function layerFilter(page: Page, layer: string) {
  return page.evaluate((lyr) => {
    const f = (window as unknown as MapWindow).__mob_map.getFilter(lyr);
    return { set: f !== undefined && f !== null, json: String(JSON.stringify(f)) };
  }, layer);
}

/** The state codes a set of rids belongs to — "09_75" -> "09". */
const statesOf = (rids: string[]) => [...new Set(rids.map((r) => r.split("_")[0]))].sort();

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

  // ── round 2: the spellings padStart could not reach ──────────────────────────
  // "09" is not the only canonical-looking code a URL can carry. padStart only ADDS
  // characters, so the first fix normalised "9" and left "009" and " 9" exactly as
  // they arrived — and the two halves of the page then disagreed, inverted. Measured
  // on f5ce467, with the fix for the original defect in place:
  //
  //     ?st=009    75 Uttar Pradesh polygons painted    rail: "0 districts in Uttar Pradesh"
  //     ?st=%209   75 Uttar Pradesh polygons painted    rail: "0 districts in Uttar Pradesh"
  //
  // The map was right because stateFilter compares NUMBERS; the rail was empty
  // because ridPrefix built "009_" and " 9_", which no rid starts with. So this pair
  // asserts BOTH SIDES — which is the only assertion that could have caught either
  // half of item 1091, in either direction.
  const MALFORMED: { param: string; label: string }[] = [
    { param: "009", label: "over-padded" },
    { param: "%209", label: "space-prefixed" },
  ];
  for (const { param, label } of MALFORMED) {
    test(`?st=${param} (${label}) drills the map and the rail to the SAME state`, async ({ page, request }) => {
      // The count comes from the store, not a literal: the rail counts the rows the
      // API returns for this state, so a data rebuild has to move both together or
      // this goes red for the right reason.
      const api = (await (await request.get("/api/metrics/literacy_rate?level=district")).json()) as {
        values: Record<string, number>;
      };
      const all = Object.keys(api.values);
      const up = all.filter((c) => c.startsWith("09_")).length;
      expect(up, "no Uttar Pradesh districts in the store — this case proves nothing").toBeGreaterThan(0);
      // ...and the prefix really CUTS: a rail reading the national total would satisfy
      // an equality against `up` if `up` happened to be everything.
      expect(up, "state 09 is the entire district store — the prefix cuts nothing here")
        .toBeLessThan(all.length);

      await page.goto(`/?m=literacy_rate&lvl=district&st=${param}&stn=Uttar%20Pradesh`);
      await waitForMapReady(page);

      // THE MAP. This half was already right before round 2 — asserted anyway, because
      // a fix that canonicalised the rail by breaking the filter would be a trade, not
      // a fix.
      await expect
        .poll(async () => (await renderedDistricts(page)).length, {
          timeout: 15_000,
          message: `?st=${param} painted no district-fill polygon at all`,
        })
        .toBeGreaterThan(0);
      const rendered = await renderedDistricts(page);
      expect(
        statesOf(rendered),
        `?st=${param} is painting districts outside Uttar Pradesh`,
      ).toEqual(["09"]);

      const counts = await drillCounts(page, "09");
      expect(counts.filter, `?st=${param} produced a different filter from the canonical one`)
        .toBe(counts.expected);
      expect(counts.admitted).toBe(counts.inSource);

      // THE RAIL, with the number. `/districts in Uttar Pradesh/` alone would have
      // passed on the measured "0 districts in Uttar Pradesh" — the exact shape this
      // file's own 2011 case was caught making.
      await expect(page.getByText(new RegExp(`${up} districts in Uttar Pradesh`, "i")).first())
        .toBeVisible({ timeout: 15_000 });

      // ...and the address bar stops spelling it the broken way. The URL writer emits
      // focus.code, so a canonical focus canonicalises the link the reader would copy
      // next — the same self-correction ?cmp= has always had.
      expect(new URL(page.url()).searchParams.get("st"), "the malformed ?st= survived into the shared link")
        .toBe("09");
    });
  }

  // ── round 2: a code that names no state at all ───────────────────────────────
  // "abc" has no canonical form; "99" has one and there is no such state. Both used
  // to fall through applyFocus into a real drill: measured on f5ce467, ?st=abc gave a
  // filter of ["==",["to-number",["get","st_code"],-1],null] — Number("abc") is NaN
  // and MapLibre serialises that as a bare null — 0 polygons painted, and a rail
  // reading "0 districts in Nowhere". A blank plate scoped to a state that does not
  // exist, with no way out but the browser's Back button.
  //
  // The fix makes `st` behave the way `cmp` already did: a code that resolves to no
  // feature is silently dropped and the view is the one the reader would have had
  // without the param. Measured: ?cmp=abc,09 rewrites itself to ?cmp=09.
  const NO_SUCH_STATE: { param: string; why: string }[] = [
    { param: "abc", why: "not a number at all" },
    { param: "99", why: "a well-formed code no state carries" },
  ];
  for (const { param, why } of NO_SUCH_STATE) {
    test(`?st=${param} (${why}) does not drill — the reader gets the national view`, async ({ page, request }) => {
      const api = (await (await request.get("/api/metrics/literacy_rate?level=district")).json()) as {
        values: Record<string, number>;
      };
      const nationwide = Object.keys(api.values).length;
      expect(nationwide, "the district store is empty — this case proves nothing").toBeGreaterThan(0);

      await page.goto(`/?m=literacy_rate&lvl=district&st=${param}&stn=Nowhere`);
      await waitForMapReady(page);

      // No drill filter was ever installed. This is the assertion the pre-fix build
      // fails: it installed one, and the one it installed admitted nothing.
      const flt = await layerFilter(page, "district-fill");
      expect(flt.set, `?st=${param} installed a drill filter anyway: ${flt.json}`).toBe(false);

      // ...so the plate is the national one, not an empty one. Asserted on POLYGONS,
      // because "no filter" and "a filter that happens to admit everything" are the
      // same to the reader only if the polygons say so.
      await expect
        .poll(async () => (await renderedDistricts(page)).length, {
          timeout: 15_000,
          message: `?st=${param} left an EMPTY map instead of falling back to India`,
        })
        .toBeGreaterThan(0);
      expect(
        statesOf(await renderedDistricts(page)).length,
        `?st=${param} is painting one state's districts — something drilled`,
      ).toBeGreaterThan(1);

      // The rail says India, not "0 districts in Nowhere".
      await expect(page.getByText(new RegExp(`${nationwide} districts nationwide`, "i")).first())
        .toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/districts in Nowhere/i)).toHaveCount(0);

      // And the dead params are gone from the address bar, so the link the reader
      // copies next does not carry the same nonsense forward.
      const qs = new URL(page.url()).searchParams;
      expect(qs.get("st"), "a state code naming no state survived into the shared link").toBeNull();
      expect(qs.get("stn"), "the orphaned state NAME survived into the shared link").toBeNull();
    });
  }

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

  test("the as-reported 2011 RAIL cuts a low-code drill with the padded prefix — the 2011 plate is not cut at all", async ({ page, request }) => {
    // THIS TEST IS ABOUT CHROME, AND ITS NAME SAYS SO. It was called "the as-reported
    // 2011 view scopes a low-code drill to that state's 2011 districts" and asserted
    // only the rail — a name promising a scope guarantee over the one assertion in
    // this file that could not have caught the defect the file exists for. Worse, the
    // scope it named does not exist. Measured on f5ce467,
    // /?m=literacy_rate&lvl=district&vin=2011&st=09: d2011-fill paints 248 polygons
    // across 13 states (02..10, 19, 20, 22, 23 — Uttar Pradesh's neighbours, drawn
    // because fitBounds put them in frame) under a rail reading "71 districts in
    // Uttar Pradesh". getFilter("d2011-fill") is undefined. Same on 57581ac, and the
    // same for Madhya Pradesh (23): 169 polygons across 7 states under "50 districts
    // in Madhya Pradesh".
    //
    // That gap is NOT item 1091 and is deliberately not fixed here — it predates the
    // fix, it is unchanged by it, and as far as anyone has traced it is only reachable
    // by a hand-typed URL: wire() covers district-fill/state-fill and their symbol
    // layers, never the 2011 pair, and the vintage-change effect calls exitFocus. It
    // needs its own item.
    //
    // What IS item 1091 here: the 2011 rids are padded exactly like the current ones,
    // and the rail cuts them with ridPrefix(focus.code) — the very function round 2
    // rewrote. So the rail is the only surface on this plate that reads the prefix
    // under test, and asserting it is not a shortcut, it is the whole available
    // subject. The premise is asserted rather than assumed: if the 2011 plate ever
    // does get a drill filter, the first expect below goes red and this test asks to
    // be rewritten around polygons instead of quietly passing on a rail.
    const api = (await (await request.get("/api/metrics/literacy_rate?level=district2011")).json()) as {
      values: Record<string, number>;
    };
    const all2011 = Object.keys(api.values);
    const up2011 = all2011.filter((c) => c.startsWith("09_")).length;
    expect(up2011, "no 2011 districts for state 09 in the store — this case proves nothing").toBeGreaterThan(0);
    // Non-vacuity on the cut itself: an equality against a number that happens to be
    // the national total would pass on a rail that never cut anything.
    expect(up2011, "state 09 is the entire 2011 district store — the prefix cuts nothing here")
      .toBeLessThan(all2011.length);

    await page.goto("/?m=literacy_rate&lvl=district&vin=2011&st=09&stn=Uttar%20Pradesh");
    await waitForMapReady(page);
    // The 2011 sources are added lazily on first toggle, so wait for the plate before
    // asking it anything — a layer that has not been added yet answers "nothing", and
    // "nothing" would satisfy a badly written scope assertion.
    await expect
      .poll(async () => (await renderedDistricts(page, "d2011-fill")).length, {
        timeout: 20_000,
        message: "the as-reported plate never painted — the 2011 sources did not load",
      })
      .toBeGreaterThan(0);

    // PREMISE, measured: the 2011 fill and its hatch carry NO drill filter, which is
    // why the polygons below are unscoped and why the rail is the only thing left to
    // assert. Red the day that changes.
    for (const layer of ["d2011-fill", "d2011-nodata"]) {
      const flt = await layerFilter(page, layer);
      expect(
        flt.set,
        `${layer} now carries a filter (${flt.json}) — the as-reported plate is scoped after all, `
        + "so this test must assert polygons the way every other test in this file does",
      ).toBe(false);
    }
    // ...and the consequence, on polygons rather than on the filter alone: the plate
    // really is painting other states' 2011 districts. Pinned, not endorsed — this is
    // the gap named above, and it goes red the day someone closes it.
    const plate = await renderedDistricts(page, "d2011-fill");
    expect(
      statesOf(plate).length,
      "the as-reported plate is scoped to one state now — the gap this test pins is fixed; "
      + "assert the scope properly and delete this expectation",
    ).toBeGreaterThan(1);
    expect(statesOf(plate), "the drilled state is not even on its own plate").toContain("09");

    // THE ASSERTION THIS TEST IS FOR: the rail's 2011 count, cut with the one
    // canonical padded prefix. Reverting ridPrefix to the unpadded spelling makes this
    // read "0 districts in Uttar Pradesh".
    await expect(page.getByText(new RegExp(`${up2011} districts in Uttar Pradesh`, "i")).first())
      .toBeVisible({ timeout: 20_000 });
  });
});
