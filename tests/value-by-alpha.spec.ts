import { test, expect } from "@playwright/test";
import {
  regionAreas, weightedMean, classIndex, alphaFor, alphaBounds, alphaByRegion,
  alphaWarrant, ALPHA_MIN, ALPHA_MAX, TVD_THRESHOLD,
} from "@/lib/value-by-alpha";
import { computeBreaks } from "@/lib/breaks";

// #408 item 1077 — value-by-alpha.
//
// A choropleth's visual weight is AREA; a rate is about PEOPLE. Where they disagree,
// the map's impression is not the data's. The fade is applied where the data warrants
// it and nowhere else — owner ruling under #575, "form is a property of the DATA".

test.describe("the pure parts", () => {
  test("areas are recovered from population over density, and bad inputs are dropped", () => {
    const areas = regionAreas(
      { a: 1000, b: 500, c: 300, d: 100, e: 50 },
      { a: 10, b: 0, c: -1, d: Number.NaN, e: 5 },
    );
    expect(areas).toEqual({ a: 100, e: 10 });
    // b, c and d are absent rather than present-with-a-guess: a region with no
    // recoverable area must not be given an invented one and then weighted by it.
    expect(Object.keys(areas)).not.toContain("b");
  });

  test("weightedMean weighs, and refuses when nothing carries weight", () => {
    const v = { a: 10, b: 20 };
    expect(weightedMean(v, { a: 1, b: 1 }, ["a", "b"])).toBeCloseTo(15);
    expect(weightedMean(v, { a: 9, b: 1 }, ["a", "b"])).toBeCloseTo(11);
    expect(weightedMean(v, { a: 0, b: 0 }, ["a", "b"])).toBeNull();
  });

  test("a value on a class edge belongs to the class above it", () => {
    const edges = [10, 20, 30];
    expect(classIndex(9.99, edges)).toBe(0);
    expect(classIndex(10, edges)).toBe(1);
    expect(classIndex(20, edges)).toBe(2);
    expect(classIndex(1e9, edges)).toBe(3);
  });

  test("the ramp is logarithmic, and its floor is a floor", () => {
    const lo = 10_000, hi = 10_000_000;
    expect(alphaFor(lo, lo, hi)).toBeCloseTo(ALPHA_MIN, 5);
    expect(alphaFor(hi, lo, hi)).toBeCloseTo(ALPHA_MAX, 5);
    // Below the bottom of the range still gets the floor, never zero: 758 asks for
    // graceful degradation, and a region faded out of existence cannot be hovered,
    // read or corrected. Few people is a reason to be quieter, not to vanish.
    expect(alphaFor(1, lo, hi)).toBeCloseTo(ALPHA_MIN, 5);
    expect(alphaFor(1e12, lo, hi)).toBeCloseTo(ALPHA_MAX, 5);
    expect(alphaFor(0, lo, hi)).toBe(ALPHA_MIN);

    // LOG and not linear: the geometric midpoint sits at the middle of the ramp,
    // where a linear ramp would have put it near the floor. District populations
    // span three orders of magnitude, so a linear ramp is an erasure, not a fade.
    const mid = Math.sqrt(lo * hi);
    expect(alphaFor(mid, lo, hi)).toBeCloseTo((ALPHA_MIN + ALPHA_MAX) / 2, 2);
    const linearMid = (lo + hi) / 2;
    expect(alphaFor(linearMid, lo, hi)).toBeGreaterThan((ALPHA_MIN + ALPHA_MAX) / 2);
  });

  test("the floor is a REAL floor, not whatever the constant happens to be", () => {
    // This case exists because a mutation survived. `alphaFor(lo, lo, hi)` was
    // asserted to equal ALPHA_MIN — a tautology: set ALPHA_MIN to 0 and both sides
    // move together, the suite stays green, and every thinly-populated district
    // fades to invisible with nothing objecting.
    //
    // The claim being defended is not "the floor equals the constant". It is that a
    // region carrying few people is QUIETER AND STILL THERE — 758 asks for graceful
    // degradation, and a region faded out of existence cannot be hovered, read, or
    // corrected. So the number itself is pinned, and 0.2 is where legible stops.
    expect(ALPHA_MIN, "the fade must never become an erasure").toBeGreaterThanOrEqual(0.2);
    expect(ALPHA_MAX).toBeLessThanOrEqual(1);
    expect(ALPHA_MAX).toBeGreaterThan(ALPHA_MIN);

    // Including the real extreme: Upper Dibang Valley, 8,004 people, the least
    // populous district in the country and the one most at risk of being erased.
    for (const pop of [0, 1, 10, 8_004, 1e12, Number.NaN]) {
      expect(alphaFor(pop, 10_000, 10_000_000), `alpha for ${pop}`)
        .toBeGreaterThanOrEqual(0.2);
    }
  });

  test("bounds are p5/p95, so one outlier cannot set the whole ramp", () => {
    const pop: Record<string, number> = {};
    for (let i = 0; i < 100; i += 1) pop[`r${i}`] = 1000 + i;
    pop.freak = 50_000_000;
    const { lo, hi } = alphaBounds(pop, Object.keys(pop));
    expect(lo).toBeLessThan(1010);
    expect(hi).toBeLessThan(2000); // NOT the 50M outlier
  });

  test("every region gets an alpha inside the band", () => {
    const pop = { a: 100, b: 10_000, c: 5_000_000 };
    const out = alphaByRegion(pop, Object.keys(pop));
    for (const v of Object.values(out)) {
      expect(v).toBeGreaterThanOrEqual(ALPHA_MIN);
      expect(v).toBeLessThanOrEqual(ALPHA_MAX);
    }
    expect(out.c).toBeGreaterThan(out.a);
  });
});

test.describe("the warrant refuses rather than guesses", () => {
  const many = (n: number, f: (i: number) => number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}`, f(i)]));

  test("too few regions is reported, not rounded down to 'no'", () => {
    const w = alphaWarrant({
      values: many(10, (i) => i), pop: many(10, () => 100),
      area: many(10, () => 10), edges: [3, 6],
    });
    expect(w.warranted).toBe(false);
    expect(w.reason).toContain("too few to weigh");
  });

  test("no class breaks means the question was not asked", () => {
    const w = alphaWarrant({
      values: many(50, (i) => i), pop: many(50, () => 100),
      area: many(50, () => 10), edges: [],
    });
    expect(w.warranted).toBe(false);
    expect(w.reason).toContain("no class breaks");
  });

  test("colour sitting where the people are does not warrant a fade", () => {
    // Every region the same size and the same population: surface and people are
    // coloured identically, so TVD is 0 whatever the values do.
    const values = many(60, (i) => i);
    const pop = many(60, () => 100_000);
    const area = many(60, () => 1_000);
    const w = alphaWarrant({ values, pop, area, edges: [20, 40] });
    expect(w.warranted).toBe(false);
    expect(w.tvd).toBeCloseTo(0, 6);
  });

  test("surface in one band and people in another warrants it", () => {
    // Half the regions are vast and nearly empty and carry the high values; half are
    // tiny and crowded and carry the low ones. The eye reads the first half; the
    // country lives in the second.
    const values: Record<string, number> = {};
    const pop: Record<string, number> = {};
    const area: Record<string, number> = {};
    for (let i = 0; i < 60; i += 1) {
      const big = i < 30;
      values[`r${i}`] = big ? 90 : 10;
      area[`r${i}`] = big ? 40_000 : 100;
      pop[`r${i}`] = big ? 10_000 : 5_000_000;
    }
    const w = alphaWarrant({ values, pop, area, edges: [50] });
    expect(w.warranted).toBe(true);
    // Surface is ~99.7% in the high band, population ~99.8% in the low one.
    expect(w.tvd!).toBeGreaterThan(0.9);
    expect(w.areaShare![1]).toBeGreaterThan(0.9);
    expect(w.popShare![0]).toBeGreaterThan(0.9);
    expect(w.reason).toMatch(/does not describe where people live/);
  });

  test("shares are shares — each set sums to one", () => {
    const values = many(60, (i) => i);
    const pop = many(60, (i) => 1000 + i * 37);
    const area = many(60, (i) => 500 + i * 11);
    const w = alphaWarrant({ values, pop, area, edges: [20, 40] });
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(w.areaShare!)).toBeCloseTo(1, 6);
    expect(sum(w.popShare!)).toBeCloseTo(1, 6);
    expect(w.tvd!).toBeGreaterThanOrEqual(0);
    expect(w.tvd!).toBeLessThanOrEqual(1);
  });

  test("the threshold is the only thing standing between the two verdicts", () => {
    // Tuned to land just under the line, then re-read with the line moved. If the
    // constant ever stops being what decides, this goes red.
    const values: Record<string, number> = {};
    const pop: Record<string, number> = {};
    const area: Record<string, number> = {};
    for (let i = 0; i < 60; i += 1) {
      const big = i < 6;
      values[`r${i}`] = big ? 90 : 10;
      area[`r${i}`] = big ? 1_800 : 1_000;
      pop[`r${i}`] = big ? 100 : 100_000;
    }
    const w = alphaWarrant({ values, pop, area, edges: [50] });
    expect(w.tvd!).toBeGreaterThan(0.15);
    expect(w.tvd!).toBeLessThan(0.25);
    expect(w.warranted).toBe(w.tvd! >= TVD_THRESHOLD);
  });
});

test.describe("against the real catalogue", () => {
  test("the criterion discriminates — it is neither always nor never", async ({ request }) => {
    const { metrics } = await (await request.get("/api/metrics")).json();
    const pop = (await (await request.get("/api/metrics/pop_total?level=district")).json()).values;
    const den = (await (await request.get("/api/metrics/pop_density?level=district")).json()).values;
    const area = regionAreas(pop, den);
    expect(Object.keys(area).length, "areas should be recoverable for most districts")
      .toBeGreaterThan(700);

    const intensive = metrics.filter((m: { levels: string[]; unit: string }) =>
      (m.levels || []).includes("district")
      && (m.unit?.includes("%") || m.unit?.includes("/") || /per/i.test(m.unit ?? "")));
    expect(intensive.length, "there should be rates to test").toBeGreaterThan(30);

    let warranted = 0;
    let measured = 0;
    const tvdOf: Record<string, number> = {};
    for (const m of intensive) {
      const res = await request.get(`/api/metrics/${m.id}?level=district`);
      if (!res.ok()) continue;
      const values = (await res.json()).values as Record<string, number>;
      if (!values) continue;
      const xs = Object.values(values).filter((v) => Number.isFinite(v));
      if (xs.length < 100) continue;
      measured += 1;
      // jenks at k=5 is the app's default (india-map.tsx init.brk); a metric's own
      // default_scale can override it, and the criterion moves with whatever is
      // active — the question being asked is whether THIS map, as drawn, misleads.
      const edges = computeBreaks(xs, "jenks", 5, null);
      const w = alphaWarrant({ values, pop, area, edges });
      if (w.tvd !== null) tvdOf[m.id] = w.tvd;
      if (w.warranted) warranted += 1;
    }

    // A criterion that fires for everything is a blanket rule wearing a criterion's
    // clothes; one that fires for nothing is dead code. Measured 2026-08-27 over 70
    // district rates: 9 warranted. The bounds are wide on purpose — they guard the
    // SHAPE, so adding metrics does not break the test, but losing the criterion does.
    expect(measured, "should have measured a real catalogue").toBeGreaterThan(30);
    expect(warranted, "the criterion fires for nothing — it is dead").toBeGreaterThan(0);
    expect(warranted / measured, "the criterion fires for nearly everything")
      .toBeLessThan(0.5);

    // THE NAMED CASE. pop_density is the plainest: 82% of India's surface sits in the
    // lowest density band while only 51% of Indians do, so the map of where India is
    // empty is read as the map of how India lives.
    expect(tvdOf.pop_density, "pop_density must warrant the fade").toBeGreaterThanOrEqual(TVD_THRESHOLD);

    // THE NAMED NON-CASE, and it is the one this criterion was corrected by.
    // buddhist_pct has the catalogue's largest gap between its area-weighted mean
    // (2.55%) and its population-weighted mean (0.69%) — the first version of this
    // remedy was built around it. It is NOT a case. A reader does not take "India is
    // 2.55% Buddhist" from that map; they take "Buddhists are concentrated in Ladakh,
    // Sikkim and Arunachal", which is true and is the point — and fading those
    // districts is precisely what would destroy it. Its TVD is 0.041.
    expect(tvdOf.buddhist_pct, "buddhist_pct must NOT warrant the fade")
      .toBeLessThan(TVD_THRESHOLD);
  });
});
