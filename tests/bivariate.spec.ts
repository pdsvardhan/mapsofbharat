import { test, expect } from "@playwright/test";
import {
  BIVARIATE_K, BIVARIATE_PALETTE, axisClass, bivariateColor, sharedRegions,
  bivariateEligible,
} from "@/lib/bivariate";
import { TRANSITION_FLOOR } from "@/lib/coverage-floor";
import { computeBreaks } from "@/lib/breaks";

// #408 item 1080 — two metrics on one map.

const many = (n: number, f: (i: number) => number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}`, f(i)]));

test.describe("the matrix", () => {
  test("is 3x3 and every cell is a distinct colour", () => {
    expect(BIVARIATE_PALETTE).toHaveLength(BIVARIATE_K);
    for (const row of BIVARIATE_PALETTE) expect(row).toHaveLength(BIVARIATE_K);
    const flat = BIVARIATE_PALETTE.flat();
    // Nine fills that a reader is asked to tell apart. Two identical cells would
    // make two different pairs of values indistinguishable while still LOOKING like
    // a legend that separates them.
    expect(new Set(flat).size).toBe(9);
  });

  test("the corners are the four extremes, and the origin is the palest", () => {
    const [lowlow, , highlow] = BIVARIATE_PALETTE[0];
    const [lowhigh, , highhigh] = BIVARIATE_PALETTE[2];
    expect(lowlow).toBe("#e8e8e8");
    expect(new Set([lowlow, highlow, lowhigh, highhigh]).size).toBe(4);
  });

  test("a value on an edge belongs to the class above, and nothing escapes the matrix", () => {
    const edges = [10, 20];
    expect(axisClass(9.99, edges)).toBe(0);
    expect(axisClass(10, edges)).toBe(1);
    expect(axisClass(20, edges)).toBe(2);
    // Above the top edge is still the top class — an index past the matrix would
    // read undefined out of the palette and paint nothing.
    expect(axisClass(1e9, edges)).toBe(2);
    expect(axisClass(-1e9, edges)).toBe(0);
  });

  test("more edges than the matrix has classes cannot push past it", () => {
    // A caller passing five-class breaks by mistake must not index row 5.
    expect(axisClass(1e9, [1, 2, 3, 4])).toBe(BIVARIATE_K - 1);
    expect(bivariateColor(1e9, [1, 2, 3, 4], 1e9, [1, 2, 3, 4])).toBe("#3b4994");
  });

  test("the fill is looked up [y][x] — the axes are not interchangeable", () => {
    const ex = [10, 20];
    const ey = [10, 20];
    // high on x, low on y is a different colour from low on x, high on y. If these
    // ever matched, the map would be showing one metric twice.
    expect(bivariateColor(25, ex, 5, ey)).toBe("#5ac8c8");
    expect(bivariateColor(5, ex, 25, ey)).toBe("#be64ac");
  });
});

test.describe("eligibility refuses with a reason", () => {
  const rate = "%";
  const wide = (n: number) => many(n, (i) => i % 50);

  test("a metric cannot pair with itself", () => {
    const v = wide(700);
    const e = bivariateEligible({
      level: "district", xId: "a", xUnit: rate, xValues: v, yId: "a", yUnit: rate, yValues: v,
    });
    expect(e.ok).toBe(false);
    expect(e.reason).toContain("cannot be paired with itself");
  });

  test("the 2011 vintage is a different geography", () => {
    const v = wide(700);
    const e = bivariateEligible({
      level: "district2011", xId: "a", xUnit: rate, xValues: v, yId: "b", yUnit: rate, yValues: v,
    });
    expect(e.ok).toBe(false);
    expect(e.reason).toContain("different geography");
  });

  test("a TOTAL on either axis is refused — the area bias has nowhere to go", () => {
    const rates = wide(700);
    const counts = many(700, (i) => 1000 + i * 97);
    const asX = bivariateEligible({
      level: "district", xId: "pop_total", xUnit: "people", xValues: counts,
      yId: "b", yUnit: rate, yValues: rates,
    });
    const asY = bivariateEligible({
      level: "district", xId: "b", xUnit: rate, xValues: rates,
      yId: "pop_total", yUnit: "people", yValues: counts,
    });
    expect(asX.ok).toBe(false);
    expect(asY.ok).toBe(false);
    expect(asX.reason).toContain("first metric is a total");
    expect(asY.reason).toContain("second metric is a total");
  });

  test("too little shared ground is refused, with both numbers", () => {
    const a = wide(700);
    const b = many(400, (i) => i % 50);
    const e = bivariateEligible({
      level: "district", xId: "a", xUnit: rate, xValues: a, yId: "b", yUnit: rate, yValues: b,
    });
    expect(e.ok).toBe(false);
    expect(e.shared).toBe(400);
    expect(e.floor).toBe(TRANSITION_FLOOR.district);
    expect(e.reason).toContain("only 400 regions");
    expect(e.reason).toContain(String(TRANSITION_FLOOR.district));
  });

  test("two well-covered rates hold", () => {
    const a = wide(730);
    const b = wide(730);
    const e = bivariateEligible({
      level: "district", xId: "a", xUnit: rate, xValues: a, yId: "b", yUnit: rate, yValues: b,
    });
    expect(e.ok).toBe(true);
    expect(e.shared).toBe(730);
  });

  test("shared counts only regions with a real number on BOTH sides", () => {
    const a = { p: 1, q: 2, r: Number.NaN };
    const b = { p: 1, r: 3 };
    expect(sharedRegions(a, b)).toEqual(["p"]);
  });
});

test.describe("against the real catalogue", () => {
  test("the rule admits real pairs, and not simply all of them", async ({ request }) => {
    const { metrics } = await (await request.get("/api/metrics")).json();
    const district = metrics.filter((m: { levels: string[] }) => (m.levels || []).includes("district"));
    expect(district.length).toBeGreaterThan(50);

    // A sample rather than all 89^2: enough to prove the rule discriminates without
    // making this test the slowest in the suite.
    const sample = district.slice(0, 14);
    const loaded: { id: string; unit: string; values: Record<string, number> }[] = [];
    for (const m of sample) {
      const res = await request.get(`/api/metrics/${m.id}?level=district`);
      if (!res.ok()) continue;
      const { values } = await res.json();
      if (values) loaded.push({ id: m.id, unit: m.unit ?? "", values });
    }
    expect(loaded.length).toBeGreaterThan(8);

    let ok = 0;
    let refused = 0;
    const reasons = new Set<string>();
    for (const x of loaded) {
      for (const y of loaded) {
        if (x.id === y.id) continue;
        const e = bivariateEligible({
          level: "district",
          xId: x.id, xUnit: x.unit, xValues: x.values,
          yId: y.id, yUnit: y.unit, yValues: y.values,
        });
        if (e.ok) ok += 1;
        else { refused += 1; reasons.add(e.reason.slice(0, 40)); }
      }
    }

    // Both halves matter. No eligible pair means the feature has nothing to draw;
    // no refusal means the coverage floor and the totals rule are not doing anything,
    // and a bivariate map of a total would be the area bias walking back in.
    expect(ok, "no pair is eligible — bivariate has nothing to draw").toBeGreaterThan(0);
    expect(refused, "nothing is refused — the rule is not a rule").toBeGreaterThan(0);
    expect(reasons.size, "every refusal gave the same reason — check the branches")
      .toBeGreaterThan(1);
  });

  test("a real eligible pair produces nine usable fills", async ({ request }) => {
    const lit = (await (await request.get("/api/metrics/literacy_rate?level=district")).json()).values;
    const sex = (await (await request.get("/api/metrics/sex_ratio?level=district")).json()).values;
    test.skip(!lit || !sex, "one of the two sample metrics is absent from this store");

    const e = bivariateEligible({
      level: "district", xId: "literacy_rate", xUnit: "%", xValues: lit,
      yId: "sex_ratio", yUnit: "F / 1000 M", yValues: sex,
    });
    expect(e.ok, e.reason).toBe(true);

    const shared = sharedRegions(lit, sex);
    const ex = computeBreaks(shared.map((c) => lit[c]), "quantile", BIVARIATE_K, null);
    const ey = computeBreaks(shared.map((c) => sex[c]), "quantile", BIVARIATE_K, null);
    const used = new Set(shared.map((c) => bivariateColor(lit[c], ex, sex[c], ey)));

    // Quantile breaks put a third of the districts in each class on each axis, so a
    // real pair should reach most of the matrix. Fewer than six cells in use would
    // mean the two metrics move together so tightly that a bivariate map is just an
    // expensive way to draw one of them.
    expect(used.size, `only ${used.size} of 9 cells drawn`).toBeGreaterThanOrEqual(6);
    for (const c of used) expect(BIVARIATE_PALETTE.flat()).toContain(c);
  });
});
