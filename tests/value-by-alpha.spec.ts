import { test, expect } from "@playwright/test";
import {
  regionAreas, weightedMean, classIndex, alphaFor, alphaBounds, alphaByRegion,
  alphaWarrant, ALPHA_MIN, ALPHA_MAX, ALPHA_UNFADED, TVD_THRESHOLD,
  MAP_GROUND, NO_DATA_FILL, NO_DATA_HATCH, NO_DATA_HATCH_TILE, NO_DATA_HATCH_PERIOD,
  alphaComposite, contrastRatio, relativeLuminance, deltaE, noDataHatchTile,
} from "@/lib/value-by-alpha";
import { computeBreaks, PALETTES, PaletteId } from "@/lib/breaks";

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

  test("the floor is a REAL floor — measured against the ground it is drawn on", () => {
    // This case exists because a mutation survived. `alphaFor(lo, lo, hi)` was
    // asserted to equal ALPHA_MIN — a tautology: set ALPHA_MIN to 0 and both sides
    // move together, the suite stays green, and every thinly-populated district
    // fades to invisible with nothing objecting.
    //
    // The first repair pinned `ALPHA_MIN >= 0.2` and called 0.2 "where legible stops".
    // That number was asserted and never measured — a second tautology wearing a
    // measurement's clothes, and the round-2 verifier said so. This is the measurement
    // it stood in for.
    //
    // The claim is that a region carrying few people is QUIETER AND STILL THERE. So:
    // at the floor, is the fill still a COLOUR, or has it become the background? The
    // fill layer sits directly on the `bg` layer, so the composite against MAP_GROUND
    // is exactly what a reader sees, and ALPHA_MIN = 0 makes every one of them the
    // background exactly.
    //
    // Measured in ΔE and not in contrast, deliberately. Contrast is luminance only,
    // and the dark end of a dark ramp is near-black on a near-black map by
    // construction: viridis class 1 measures 1.03:1 against the ground at the floor,
    // and class 1 against the no-data tone was already 1.016:1 BEFORE any of this —
    // those classes are separated by hue. A luminance test here would be demanding
    // different palettes rather than measuring the fade.
    //
    // Measured 2026-08-27 over all six ramps x five classes at ALPHA_MIN: the faintest
    // is ΔE 5.97 — navyYellow class 1, a dark navy on a near-black ground — against a
    // just-noticeable difference of about 2.3. The pin is 5: under every measured
    // class, and far above the 0.0 that an ALPHA_MIN of 0 produces for all thirty,
    // since every fill would then BE the background.
    const classes = (p: PaletteId) => [0, 0.25, 0.5, 0.75, 1].map((t) => PALETTES[p].fn(t));
    let worst = { d: Infinity, where: "" };
    for (const p of Object.keys(PALETTES) as PaletteId[]) {
      for (const [i, c] of classes(p).entries()) {
        const d = deltaE(alphaComposite(c, ALPHA_MIN), MAP_GROUND);
        if (d < worst.d) worst = { d, where: `${p} class ${i + 1}` };
      }
    }
    expect(worst.d, `faintest floored fill: ${worst.where} at ΔE ${worst.d.toFixed(2)}`)
      .toBeGreaterThanOrEqual(5);

    expect(ALPHA_MAX).toBeLessThanOrEqual(1);
    expect(ALPHA_MAX).toBeGreaterThan(ALPHA_MIN);

    // And nothing the ramp can return goes below the floor it advertises. Including
    // the real extreme: Upper Dibang Valley, 8,004 people, the least populous district
    // in the country and the one most at risk of being erased.
    for (const pop of [0, 1, 10, 8_004, 1e12, Number.NaN]) {
      expect(alphaFor(pop, 10_000, 10_000_000), `alpha for ${pop}`)
        .toBeGreaterThanOrEqual(ALPHA_MIN);
    }
  });

  test("an unusable population gets NO fade — a fade is a claim", () => {
    // Fading says "few people live here". For a count we could not read at all, the
    // safe answer is the one that claims nothing, which is what the degenerate lo/hi
    // paths already return. This used to return the FLOOR: the map asserted emptiness
    // on the strength of a broken number.
    expect(alphaFor(Number.POSITIVE_INFINITY, 10_000, 10_000_000)).toBe(ALPHA_MAX);
    expect(alphaFor(Number.NaN, 10_000, 10_000_000)).toBe(ALPHA_MAX);
    // Zero is a different fact — nobody there IS what the floor says — and stays.
    expect(alphaFor(0, 10_000, 10_000_000)).toBe(ALPHA_MIN);
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

  test("an unusable WEIGHT is dropped, and never becomes a NaN the reader reads", () => {
    // The bug this pins: the values were filtered with Number.isFinite and the weights
    // only with `> 0`, which Infinity passes. Every share then went NaN, tvd went NaN,
    // and `if (tvd < TVD_THRESHOLD)` is FALSE for NaN — so the refusal was skipped and
    // the legend printed "NaN% of this map's colour is in a band that does not
    // describe where people live" over a fully faded map.
    const values = many(60, (i) => i);
    const pop = many(60, () => 100_000);
    const area = many(60, () => 1_000);
    pop.r7 = Number.POSITIVE_INFINITY;
    area.r11 = Number.POSITIVE_INFINITY;

    const w = alphaWarrant({ values, pop, area, edges: [20, 40] });
    expect(w.n, "the two unusable rows must be dropped, not defaulted").toBe(58);
    expect(w.tvd, "one bad weight must not take the whole answer down").not.toBeNull();
    expect(Number.isFinite(w.tvd as number)).toBe(true);
    expect(w.reason).not.toMatch(/NaN/);
    expect(w.areaShare!.every((s) => Number.isFinite(s))).toBe(true);
    expect(w.popShare!.every((s) => Number.isFinite(s))).toBe(true);
  });

  test("a question that cannot be answered is REFUSED, not answered with NaN", () => {
    // The same input with almost every weight unusable: the honest answer is the
    // too-few refusal, and under no circumstances a warranted fade. This is the
    // assertion that stays red if BOTH the finite-weight filter and the NaN guard go.
    const values = many(60, (i) => i);
    const pop = many(60, () => Number.POSITIVE_INFINITY);
    const area = many(60, () => 1_000);
    const w = alphaWarrant({ values, pop, area, edges: [20, 40] });
    expect(w.warranted, "an unanswerable question must never come back warranted").toBe(false);
    expect(w.reason).not.toMatch(/NaN/);
    expect(w.reason).toContain("too few to weigh");
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

test.describe("a faded fill is never mistakable for no data", () => {
  // THE DEFECT, MEASURED. A choropleth that fades loses contrast — that is what a fade
  // is — and this atlas accepted the cost between CLASSES: adjacent-class contrast on
  // the default ramp falls from 1.68/1.78/1.77/1.81 at a=0.95 to 1.11/1.15/1.19/1.27
  // at the 0.28 floor, and the legend's new colour x alpha key is how a reader decodes
  // that. What it may not do is blur the line between a number and NO number: faded
  // class-5 #f0d64f composites to rgb(77,71,37) against a no-data rgb(39,37,28), a
  // contrast of 1.64 where unfaded it is 8.64. Two of the districts on the default
  // pop_density map are genuinely no-data (01_991, 01_992) and four class-5 districts
  // sit below a=0.35 on it, so this was live, not theoretical.
  //
  // The remedy is a MARK a fade cannot imitate. Every case below measures the mark.

  /** What the map really paints for a region with no number: the tone at the unfaded
   *  opacity, over the background — rgb(39,37,28), the verifier's own reading. */
  const noDataGround = alphaComposite(NO_DATA_FILL, ALPHA_UNFADED);
  const allClasses = (Object.keys(PALETTES) as PaletteId[]).flatMap((p) =>
    [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ p, i: i + 1, c: PALETTES[p].fn(t) })));
  /** Every opacity the ramp can produce, at a resolution finer than a reader's eye. */
  const alphas = Array.from(
    { length: Math.round((ALPHA_MAX - ALPHA_MIN) * 100) + 1 },
    (_, i) => ALPHA_MIN + i / 100,
  );

  test("the no-data tone ALONE cannot carry it — which is why there is a hatch", () => {
    // This is the failing measurement, kept as a test so the fix cannot be quietly
    // reverted to "just darken the no-data tone a bit". If this ever goes green, the
    // tones have been separated by luminance after all and the hatch's justification
    // needs re-reading, not deleting.
    // Worst measured: spectral class 1 at 1.01:1 — indistinguishable.
    let worst = { ratio: Infinity, where: "" };
    for (const { p, i, c } of allClasses) {
      const r = contrastRatio(alphaComposite(c, ALPHA_MIN), noDataGround);
      if (r < worst.ratio) worst = { ratio: r, where: `${p} class ${i}` };
    }
    expect(worst.ratio, `${worst.where} sits ${worst.ratio.toFixed(2)}:1 from no-data`)
      .toBeLessThan(3);
  });

  test("no fill, at any opacity, can be close to BOTH halves of the hatch", () => {
    // The claim the mark rests on. A hatched patch is two colours at once — the stripe
    // and the ground it is drawn on — and a flat fill has one. The closer a fill gets
    // to the stripe, the further it is from the ground, and vice versa; the worst case
    // is the geometric mean between them. So for every ramp, every class and every
    // opacity the fade can produce, at least one half of the hatch stands clear of the
    // fill by WCAG's 3:1 floor for non-text. Measured worst case 2026-08-27: 3.47:1,
    // navyYellow class 5 at a=0.53 — near enough the predicted mean of the two halves
    // that the guarantee is doing the work rather than luck.
    let worst = { ratio: Infinity, where: "" };
    for (const { p, i, c } of allClasses) {
      for (const a of alphas) {
        const fill = alphaComposite(c, a);
        const best = Math.max(
          contrastRatio(fill, noDataGround),
          contrastRatio(fill, NO_DATA_HATCH),
        );
        if (best < worst.ratio) worst = { ratio: best, where: `${p} class ${i} at a=${a.toFixed(2)}` };
      }
    }
    expect(worst.ratio, `closest any fill gets to the whole hatch: ${worst.where} at ${worst.ratio.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(3);
  });

  test("the stripe stands off its own ground — adr-019 measured 1.09:1 and dropped it", () => {
    // The other half of "unmistakable": a hatch nobody can see is not a mark. The
    // estimate hatch adr-019 removed scored 1.09:1 against the dark end of the ramp
    // and never cleared 3:1 on any band. This one is drawn on ONE known tone, so the
    // number is exact rather than a range.
    // Measured 12.00:1; pinned at 4.5 so the stripe may be toned down for looks but
    // never below AA-for-text against the patch it marks.
    const r = contrastRatio(NO_DATA_HATCH, noDataGround);
    expect(r, `hatch stripe against the no-data ground: ${r.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(4.5);
    // And the stripe is the lighter of the two, so the mark reads as texture ADDED to
    // a dark patch rather than as a second dark tone lost in it.
    expect(relativeLuminance(NO_DATA_HATCH)).toBeGreaterThan(relativeLuminance(noDataGround));
  });

  test("the tile is exact, seamless, and never downsampled", () => {
    const { width, height, data } = noDataHatchTile();
    expect(width).toBe(NO_DATA_HATCH_TILE);
    expect(height).toBe(NO_DATA_HATCH_TILE);
    expect(data.length).toBe(width * height * 4);
    // Seamless: a tile that is not a whole number of periods across seams at every
    // edge, which reads as a grid rather than a hatch.
    expect(NO_DATA_HATCH_TILE % NO_DATA_HATCH_PERIOD, "the tile must be whole periods")
      .toBe(0);

    // Every pixel is either the stripe at FULL strength or fully transparent. An
    // antialiased line has no exact colour, and the separation measured above is a
    // claim about an exact one — this is what makes that claim true of the pixels the
    // GPU actually receives, not just of a constant in a file.
    const stripe: number[] = [];
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      expect(a === 0 || a === 255, `pixel ${i / 4} is half-transparent`).toBe(true);
      if (a === 255) {
        opaque += 1;
        if (!stripe.length) stripe.push(data[i], data[i + 1], data[i + 2]);
        expect([data[i], data[i + 1], data[i + 2]]).toEqual(stripe);
      }
    }
    expect(`rgb(${stripe.join(",")})`).toBe(
      `rgb(${[1, 3, 5].map((k) => parseInt(NO_DATA_HATCH.slice(k, k + 2), 16)).join(",")})`);
    // One stripe pixel in every PERIOD, so the mark is present on a district a few
    // pixels across and still leaves three quarters of it showing its own tone.
    expect(opaque / (width * height)).toBeCloseTo(1 / NO_DATA_HATCH_PERIOD, 6);
  });

  test("the composite is the colour the map paints, not an approximation of it", () => {
    // The whole file reasons about composites, so the compositor itself is pinned
    // against the two ends and the one number the verifier read off the screen.
    expect(alphaComposite("#f0d64f", 1)).toBe("#f0d64f");
    expect(alphaComposite("#f0d64f", 0)).toBe(MAP_GROUND);
    expect(alphaComposite("#f0d64f", ALPHA_MIN)).toBe("#4d4725"); // rgb(77,71,37)
    expect(alphaComposite(NO_DATA_FILL, ALPHA_UNFADED)).toBe("#27251c"); // rgb(39,37,28)
    // Both notations the ramps emit parse the same.
    expect(alphaComposite("rgb(240,214,79)", ALPHA_MIN)).toBe(alphaComposite("#f0d64f", ALPHA_MIN));
    // The named collapse, as a number: unfaded these two are far apart, faded they are
    // one warm olive.
    expect(contrastRatio("#f0d64f", noDataGround)).toBeGreaterThan(8);
    expect(contrastRatio(alphaComposite("#f0d64f", ALPHA_MIN), noDataGround)).toBeLessThan(2);
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
