import { test, expect, type APIRequestContext } from "@playwright/test";

import {
  cellCentre,
  gridDims,
  linear,
  rankOrder,
  sharedCodes,
} from "@/lib/metric-shift-layout";

// The metric-to-metric transition (#547 phase C, iter-42 items 977-982).
//
// Assertions are on what the view DRAWS and what the rule ADMITS, never on
// element counts alone — the standing lesson of phase B. The SSR half reads raw
// responses; the client half drives a real browser because the animation and
// the reduced-motion fork only exist there.

const FLOOR = { district: 690, state: 30 } as const;

async function poolAt(request: APIRequestContext, level: "district" | "state") {
  // The pool recomputed through the app's OWN API — a different door from the
  // lib/db SQL the page uses, which is what makes this a cross-check and not a
  // tautology. /api/metrics lists the catalogue; /api/metrics/[id]?level
  // reports the per-level row count the floor is defined over.
  const list = (await (await request.get("/api/metrics")).json()) as {
    metrics: { id: string; levels: string[] }[];
  };
  const candidates = list.metrics.filter((m) => m.levels.includes(level));
  const counts = await Promise.all(
    candidates.map(async (m) => {
      const d = (await (
        await request.get(`/api/metrics/${m.id}?level=${level}`)
      ).json()) as { count: number };
      return { id: m.id, count: d.count };
    })
  );
  return counts.filter((c) => c.count >= FLOOR[level]).map((c) => c.id);
}

test.describe("#547C the pair rule admits what it claims (item 977)", () => {
  test("the district picker offers exactly the pool minus the base metric", async ({
    request,
  }) => {
    const pool = await poolAt(request, "district");
    // EXACT, not a floor: 74 metrics at >=690 districts, measured 2026-08-23
    // against the 125-metric store (R1 measured 72 against 124). A catalogue
    // addition is SUPPOSED to break this line - the number is then re-measured
    // and moved, which is the acknowledgment the rule wants.
    expect(pool.length, "district pool - re-measure if the catalogue moved").toBe(74);
    const html = await (await request.get("/metric/literacy_rate")).text();
    const options = [...html.matchAll(/<option value="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(new Set(options).size, "picker options").toBe(pool.length - 1);
    expect(options, "base metric must not offer itself").not.toContain("literacy_rate");
  });

  test("the state picker enforces the state floor the same way", async ({ request }) => {
    // gsdp_growth is state-only (34 of 36 states), so its page renders at state
    // level and its picker exercises the STATE floor: agri_wheat_production (18
    // states) and the two APY siblings must be absent. There is no page fixture
    // for a below-floor state metric directly — every one of them also carries
    // district rows, so its page renders at district level instead.
    const pool = await poolAt(request, "state");
    expect(pool.length, "state pool - re-measure if the catalogue moved").toBe(80);
    const html = await (await request.get("/metric/gsdp_growth")).text();
    const options = [...html.matchAll(/<option value="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(new Set(options).size).toBe(pool.length - 1);
    for (const thin of ["agri_wheat_production", "agri_rice_production", "agri_cropped_area"]) {
      expect(options, `${thin} is under the state floor`).not.toContain(thin);
    }
  });

  test("a metric under its level's floor gets no section at all", async ({ request }) => {
    // nfhs5_csection_private covers 562 districts; the MGNREGA family sits at
    // 678-683. Both miss the 690 floor, so neither page carries the section —
    // the MGNREGA absence is the rule's named, deliberate consequence, not a
    // bug, and this is where that decision is enforced in public.
    for (const id of ["nfhs5_csection_private", "mgnrega_pct_hh_100_days"]) {
      const html = await (await request.get(`/metric/${id}`)).text();
      expect(html, `${id} must not offer transitions`).not.toContain('data-band="shift"');
    }
    const ok = await (await request.get("/metric/literacy_rate")).text();
    expect(ok).toContain('data-band="shift"');
  });
});

test.describe("#547C layout math (item 978, node-side)", () => {
  test("the grid fits n dots and the maths round-trips", () => {
    const d = gridDims(733);
    expect(d.cols * d.rows).toBeGreaterThanOrEqual(733);
    expect(d.cols * d.rows - d.cols, "no fully empty trailing row").toBeLessThan(733);
    expect(d.cell).toBeCloseTo(700 / d.cols, 6);
    // Last dot lands inside the box.
    const last = cellCentre(732, d);
    expect(last.x).toBeLessThan(700);
    expect(last.y).toBeLessThan(d.height);
    // AND THE GRID IS GRID-SHAPED. The first version of this test verified
    // capacity and arithmetic but never the aspect, so a mutation collapsing the
    // grid to ONE COLUMN - 733 rows, 513,100px tall - passed every assertion.
    // The whole point of the target aspect is a grid a page can hold.
    for (const n of [733, 576, 36]) {
      const g = gridDims(n);
      expect(g.height / g.width, String(n) + " dots: aspect").toBeGreaterThan(0.35);
      expect(g.height / g.width, String(n) + " dots: aspect").toBeLessThan(0.85);
    }
  });

  test("rank order is by value descending with a STABLE tie-break", () => {
    const values = { a: 5, b: 9, c: 5, d: 1 };
    expect(rankOrder(values, ["d", "c", "b", "a"])).toEqual(["b", "a", "c", "d"]);
    // Object constancy depends on ties never swapping between renders: same
    // input, same order, every time, regardless of input order.
    expect(rankOrder(values, ["a", "b", "c", "d"])).toEqual(["b", "a", "c", "d"]);
  });

  test("linear scaling survives a degenerate domain", () => {
    expect(linear(7, 0, 10, 100)).toBe(70);
    expect(linear(5, 5, 5, 100), "min===max must not divide by zero").toBe(50);
  });

  test("sharedCodes is the intersection, sorted", () => {
    expect(sharedCodes({ x: 1, y: 2, z: 3 }, { y: 9, z: 8, w: 7 })).toEqual(["y", "z"]);
  });
});

test.describe("#547C the transition draws and re-sorts (items 978, 980)", () => {
  test("picking a partner draws one dot per shared region and writes the URL", async ({
    page,
    request,
  }) => {
    const a = (await (await request.get("/api/metrics/literacy_rate?level=district")).json()) as {
      values: Record<string, number>;
    };
    // The partner is DELIBERATELY one with gaps (699 of 733). Against a
    // 733-complete partner the shared set equals the base set, and this test
    // cannot tell intersection from union - the exact mutation it exists to
    // kill would survive. Caught while writing the manifest, not by running it.
    const b = (await (
      await request.get("/api/metrics/nfhs5_full_immunization?level=district")
    ).json()) as { values: Record<string, number> };
    const expected = sharedCodes(a.values, b.values).length;
    expect(expected).toBeGreaterThan(600);
    expect(expected, "partner must have gaps or this test proves nothing").toBeLessThan(
      Object.keys(a.values).length
    );

    await page.goto("/metric/literacy_rate");
    await page.locator("[data-shift-picker]").selectOption("nfhs5_full_immunization");
    await expect(page.locator("[data-shift-dot]")).toHaveCount(expected);
    expect(page.url()).toContain("vs=nfhs5_full_immunization");
  });

  test("re-sorting moves dots, stages colour after position, and announces", async ({
    page,
  }) => {
    await page.goto("/metric/literacy_rate?vs=muslim_pct");
    const dots = page.locator("[data-shift-dot]");
    await expect(dots.first()).toBeVisible();

    // A dot whose rank genuinely differs between the two metrics: read initial
    // inline transforms, re-sort, and require that SOME dots moved — asserting
    // one hand-picked code would couple the test to the data's ranks.
    const before = await dots.evaluateAll((els) =>
      els.slice(0, 200).map((e) => (e as SVGElement).style.transform)
    );
    // Staging is declared on the element itself: position moves first, fill
    // follows after the move settles. This is Heer & Robertson's staging rule,
    // and it lives in the transition property.
    const transition = await dots.first().evaluate((e) => (e as SVGElement).style.transition);
    expect(transition).toContain("transform 1000ms");
    // Browsers drop a default timing function when serializing, so "ease" may
    // or may not appear — what matters is the 1000ms DELAY that stages colour
    // after position.
    expect(transition).toMatch(/fill 400ms (?:[a-z-]+ )?1000ms/);

    await page.locator('[data-shift-sort="partner"]').click();
    await expect(page.locator('[data-shift-sort="partner"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const after = await dots.evaluateAll((els) =>
      els.slice(0, 200).map((e) => (e as SVGElement).style.transform)
    );
    const moved = before.filter((t, i) => t !== after[i]).length;
    expect(moved, "re-sorting must move dots").toBeGreaterThan(50);

    // The announcement is what a screen-reader user gets instead of the motion.
    // Scoped to the section: the metric page carries its own aria-live region.
    await expect(page.locator('[data-shift] [aria-live="polite"]')).toContainText(
      "Re-sorted by"
    );
  });

  test("a shared deep link restores the comparison", async ({ page }) => {
    await page.goto("/metric/literacy_rate?vs=sex_ratio");
    await expect(page.locator("[data-shift-picker]")).toHaveValue("sex_ratio");
    await expect(page.locator("[data-shift-dot]").first()).toBeVisible();
  });
});

test.describe("#547C reduced motion is a different rendering, not a slower one", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the scatter replaces the animation entirely", async ({ page }) => {
    await page.goto("/metric/literacy_rate?vs=muslim_pct");
    await expect(page.locator("[data-shift]")).toHaveAttribute("data-shift-mode", "scatter");
    // No re-sort controls: there is nothing to animate, both metrics are shown
    // at once — R1's ruling that the static two-axis rendering IS the fallback.
    await expect(page.locator("[data-shift-sort]")).toHaveCount(0);
    const first = page.locator("[data-shift-dot]").first();
    await expect(first).toBeVisible();
    // Scatter dots are positioned by attributes, not transforms — the marker
    // that this is the two-axis rendering and not the grid with motion off.
    expect(await first.getAttribute("cx")).not.toBeNull();
    expect(await first.getAttribute("cy")).not.toBeNull();
  });
});
