import { test, expect } from "@playwright/test";
import {
  BIVARIATE_K, BIVARIATE_PALETTE, axisClass, bivariateColor, sharedRegions,
  bivariateEligible, axisBreaks, bivariateScope,
} from "@/lib/bivariate";
import { TRANSITION_FLOOR } from "@/lib/coverage-floor";
import { classCounts, computeBreaks } from "@/lib/breaks";

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

test.describe("the bands on each axis", () => {
  test("a well-spread axis stays rank-balanced — a third of the regions per band", () => {
    const xs = Array.from({ length: 600 }, (_, i) => i / 6);
    const { edges, method } = axisBreaks(xs, { isPct: false });
    expect(edges).toHaveLength(BIVARIATE_K - 1);
    expect(method).toBe("quantile");
    for (const [i, n] of classCounts(xs, edges).entries()) {
      expect(n, `band ${i} holds ${n} of 600`).toBeGreaterThan(150);
    }
  });

  test("a TIE MASS gets its own band, at the bottom — not the middle of three", () => {
    // The defect, in miniature. 60% of the regions sit at exactly 0 and the rest run
    // 1..40. Quantile cuts [0, 0.x], and because binning is `v >= edge` BOTH collapsed
    // edges clear at once, so "none" is painted band 1 of 0..2 — the middle — while
    // band 0 renders for nobody. It is item 757's incident (445 districts at zero
    // painted class 4 of 5) one feature over.
    const xs = [...Array(360).fill(0), ...Array.from({ length: 240 }, (_, i) => 1 + i / 6)];

    const q = computeBreaks(xs, "quantile", BIVARIATE_K, null);
    expect(axisClass(0, q), "quantile puts 'none' in the middle band").toBe(1);
    expect(classCounts(xs, q)[0], "and leaves the low band empty").toBe(0);

    const { edges, method } = axisBreaks(xs, { isPct: true });
    expect(method).toBe("zeroFloor");
    expect(axisClass(0, edges), "'none' belongs at the bottom of the axis").toBe(0);
    const counts = classCounts(xs, edges);
    expect(counts[0]).toBe(360);
    for (const [i, n] of counts.entries()) expect(n, `band ${i} is empty`).toBeGreaterThan(0);
  });

  test("an axis cannot see the other one", () => {
    // The independence property, kept by construction rather than by care: axisBreaks
    // is handed ONE array and has no parameter through which the second metric could
    // reach it. Same values in, same bands out, whatever the map is pairing them with.
    const xs = Array.from({ length: 300 }, (_, i) => (i * 7) % 53);
    expect(axisBreaks(xs, { isPct: false }).edges)
      .toEqual(axisBreaks([...xs].reverse(), { isPct: false }).edges);
  });

  test("a flat axis produces no bands, and says so through the scope check", () => {
    const flat = Array(300).fill(4);
    const { edges } = axisBreaks(flat, { isPct: false });
    const v = bivariateScope({ shared: 300, edgesX: edges, edgesY: [1, 2], scopeLabel: "this view" });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("does not vary");
  });
});

test.describe("the scope the matrix is actually drawn over", () => {
  // The legend used to ask "may these two be paired" (nationally) while the paint
  // asked "can three bands be cut HERE". Focus Goa — 2 districts — and the two
  // disagreed: a 3x3 key over a univariate map, refusing nothing.

  test("fewer regions than bands is refused, naming the scope and the count", () => {
    const v = bivariateScope({ shared: 2, edgesX: [], edgesY: [], scopeLabel: "Goa" });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("Goa");
    expect(v.reason).toContain("2 regions in Goa carry");
    expect(v.reason).toContain(String(BIVARIATE_K));
    expect(v.shared).toBe(2);
  });

  test("one region reads as one region", () => {
    // Chandigarh, the other reproduction. A refusal that says "1 regions" is a
    // refusal a reader stops trusting.
    expect(bivariateScope({ shared: 1, edgesX: [], edgesY: [], scopeLabel: "Chandigarh" }).reason)
      .toContain("1 region in Chandigarh carries");
  });

  test("enough regions and real bands on both axes holds", () => {
    const v = bivariateScope({ shared: 40, edgesX: [1, 2], edgesY: [3, 4], scopeLabel: "this view" });
    expect(v.ok).toBe(true);
    expect(v.shared).toBe(40);
  });

  test("the floor is the matrix's own size, not the pairing floor", () => {
    // A district-level pair needs 690 shared regions NATIONALLY (lib/metric-pairs).
    // Inside one state there are not 690 districts to be had, so reusing that floor
    // here would refuse every drill-down. Three is the number a 3x3 needs.
    expect(bivariateScope({ shared: 3, edgesX: [1, 2], edgesY: [3, 4], scopeLabel: "Sikkim" }).ok)
      .toBe(true);
    expect(bivariateScope({ shared: 3, edgesX: [], edgesY: [], scopeLabel: "Sikkim" }).floor)
      .toBe(BIVARIATE_K);
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
    // Through axisBreaks, which is what the map calls. This used to duplicate the
    // paint's hardcoded `computeBreaks(..., "quantile", ...)`, and duplicating a call
    // is how a test keeps passing after the call it was mirroring changed.
    const ex = axisBreaks(shared.map((c) => lit[c]), { isPct: true }).edges;
    const ey = axisBreaks(shared.map((c) => sex[c]), { isPct: false }).edges;
    const used = new Set(shared.map((c) => bivariateColor(lit[c], ex, sex[c], ey)));

    // Quantile breaks put a third of the districts in each class on each axis, so a
    // real pair should reach most of the matrix. Fewer than six cells in use would
    // mean the two metrics move together so tightly that a bivariate map is just an
    // expensive way to draw one of them.
    expect(used.size, `only ${used.size} of 9 cells drawn`).toBeGreaterThanOrEqual(6);
    for (const c of used) expect(BIVARIATE_PALETTE.flat()).toContain(c);
  });

  test("the three collapsed religion shares no longer paint 'none' as the middle band", async ({ request }) => {
    // The measured defect, on the real store. buddhist_pct: quantile at k=3 cuts
    // [0, 0.1] for marginals [0, 445, 288] — the low band empty and 445 districts
    // reporting EXACTLY zero painted the middle of three. sikh_pct [0, 377, 356] and
    // jain_pct [0, 374, 359] are the same shape.
    for (const id of ["buddhist_pct", "sikh_pct", "jain_pct"]) {
      const res = await request.get(`/api/metrics/${id}?level=district`);
      expect(res.ok(), `${id} should be in the store`).toBe(true);
      const { values } = await res.json();
      const xs = (Object.values(values) as number[]).filter((v) => Number.isFinite(v));
      const zeros = xs.filter((v) => v === 0).length;
      expect(zeros / xs.length, `${id} should carry a tie mass at zero`).toBeGreaterThan(0.4);

      // What the hardcoded call did, still measurable.
      const q = computeBreaks(xs, "quantile", BIVARIATE_K, null);
      expect(axisClass(0, q), `${id}: quantile paints 'none' as band ${axisClass(0, q)}`)
        .toBeGreaterThan(0);

      // What the axis does now.
      const { edges, method } = axisBreaks(xs, { isPct: true });
      expect(method, `${id} should ladder off quantile`).toBe("zeroFloor");
      expect(axisClass(0, edges), `${id}: 'none' must be band 0`).toBe(0);
      const counts = classCounts(xs, edges);
      expect(counts[0], `${id}: the floor band should hold exactly the zeros`).toBe(zeros);
      for (const [i, n] of counts.entries()) {
        expect(n, `${id}: band ${i} of the matrix axis is empty — a legend cell that never appears`)
          .toBeGreaterThan(0);
      }
    }
  });
});
