import { test, expect } from "@playwright/test";

import {
  VISUALIZATIONS,
  canRender,
  capabilitiesFor,
  isExtensivePending,
  offerableViz,
  preferredViz,
  type VizId,
} from "@/lib/metric-capabilities";
import { EXTENSIVE_NOT_SYMBOLISED, symbolEligible } from "@/lib/symbols";

// #575 — one resolver for "what may this metric be drawn as".
//
// The judgement used to live in four places at once (isCountUnit's Set,
// symbolEligible's sign check, the negative-value exclusion, and
// EXTENSIVE_NOT_SYMBOLISED) with no single answer. #567 was the bill for that:
// a claim in one of them that the other three contradicted. Browse-by-form will
// print these calls in public, so they get one resolver and this file.

type MetricRow = { id: string; unit: string | null };

async function allMetrics(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/metrics");
  expect(res.ok(), "/api/metrics").toBeTruthy();
  const { metrics } = (await res.json()) as { metrics: MetricRow[] };
  expect(metrics.length, "no metrics returned").toBeGreaterThan(0);
  return metrics;
}

async function valuesFor(
  request: import("@playwright/test").APIRequestContext,
  id: string
) {
  const res = await request.get(`/api/metrics/${id}?level=district`);
  if (!res.ok()) return null;
  const { values } = (await res.json()) as { values: Record<string, number> };
  return Object.values(values ?? {});
}

test.describe("#575 the resolver is total and ordered", () => {
  test("every form has a name and a plain description", () => {
    for (const id of ["choropleth", "symbol"] as VizId[]) {
      expect(VISUALIZATIONS[id], id).toBeTruthy();
      expect(VISUALIZATIONS[id].name.length, `${id} name`).toBeGreaterThan(0);
      // These strings are shown to readers, so they must not be identifiers.
      expect(VISUALIZATIONS[id].suits.length, `${id} suits`).toBeGreaterThan(20);
    }
  });

  test("a total prefers circles and still allows shading, with the caveat stated", () => {
    const caps = capabilitiesFor("pop_total", "people", [1, 50, 900]);
    expect(caps.map((c) => c.viz)).toEqual(["symbol", "choropleth"]);
    expect(caps[0].standing).toBe("preferred");
    expect(caps[1].standing).toBe("available");
    // The caveat has to actually name the distortion, or it is decoration.
    expect(caps[1].reason).toMatch(/291|area|large district/i);
  });

  test("a rate prefers shading and refuses circles outright", () => {
    const caps = capabilitiesFor("literacy_rate", "%", [10, 50, 90]);
    expect(caps[0]).toMatchObject({ viz: "choropleth", standing: "preferred" });
    const sym = caps.find((c) => c.viz === "symbol")!;
    expect(sym.standing).toBe("unsuitable");
  });

  test("a signed total refuses circles for the right reason", () => {
    // forest_change_km2: a count unit, but a gain and a loss of equal size draw
    // the identical circle. Decided from the values, not the metric name.
    const caps = capabilitiesFor("forest_change_km2", "km²", [12, -40, 3]);
    expect(caps[0]).toMatchObject({ viz: "choropleth", standing: "preferred" });
    const sym = caps.find((c) => c.viz === "symbol")!;
    expect(sym.standing).toBe("unsuitable");
    expect(sym.reason, "must explain direction, not just say no").toMatch(
      /gain|loss|direction|which way/i
    );
  });

  test("results are always ranked best-first", () => {
    const order = { preferred: 0, available: 1, unsuitable: 2 } as const;
    for (const [id, unit, vals] of [
      ["pop_total", "people", [1, 2, 3]],
      ["literacy_rate", "%", [1, 2, 3]],
      ["forest_change_km2", "km²", [1, -2, 3]],
      ["households", "households", [1, 2, 3]],
    ] as [string, string, number[]][]) {
      const caps = capabilitiesFor(id, unit, vals);
      const ranks = caps.map((c) => order[c.standing]);
      expect([...ranks].sort((a, b) => a - b), `${id} ordering`).toEqual(ranks);
    }
  });

  test("an empty or all-null metric still resolves rather than throwing", () => {
    expect(() => capabilitiesFor("x", "people", [])).not.toThrow();
    expect(preferredViz("x", "people", [])).toBe("choropleth");
    expect(preferredViz("x", null, [1, 2])).toBe("choropleth");
  });
});

test.describe("#575 the toggle can never offer a dishonest form", () => {
  test("offerableViz excludes everything marked unsuitable", () => {
    for (const [id, unit, vals] of [
      ["pop_total", "people", [1, 2, 3]],
      ["literacy_rate", "%", [1, 2, 3]],
      ["forest_change_km2", "km²", [1, -2, 3]],
    ] as [string, string, number[]][]) {
      const offered = offerableViz(id, unit, vals);
      const unsuitable = capabilitiesFor(id, unit, vals)
        .filter((c) => c.standing === "unsuitable")
        .map((c) => c.viz);
      for (const bad of unsuitable) {
        expect(offered, `${id} offered an unsuitable form`).not.toContain(bad);
      }
      expect(offered.length, `${id} must offer at least one form`).toBeGreaterThan(0);
      expect(offered[0], `${id} opens on its preferred form`).toBe(
        preferredViz(id, unit, vals)
      );
    }
  });

  test("canRender refuses a forced form on a metric it does not suit", () => {
    // The guard a shared ?viz=symbol link is checked against.
    expect(canRender("literacy_rate", "%", [1, 2, 3], "symbol")).toBe(false);
    expect(canRender("literacy_rate", "%", [1, 2, 3], "choropleth")).toBe(true);
    expect(canRender("pop_total", "people", [1, 2, 3], "symbol")).toBe(true);
    // shading a total stays reachable — available, not unsuitable
    expect(canRender("pop_total", "people", [1, 2, 3], "choropleth")).toBe(true);
  });
});

test.describe("#575 the known divergence is declared, not hidden", () => {
  test("the extensive-but-unrendered metrics say so in their reason", () => {
    for (const { id, unit } of EXTENSIVE_NOT_SYMBOLISED) {
      expect(isExtensivePending(id), `${id} should be flagged pending`).toBe(true);
      const sym = capabilitiesFor(id, unit, [1, 2, 3]).find((c) => c.viz === "symbol")!;
      expect(sym.standing).toBe("unsuitable");
      // The distinction that matters: "we don't draw this yet" is a different
      // statement from "circles would misrepresent this", and a browse page
      // must not print the second when the first is true.
      expect(sym.reason, `${id} reason`).toMatch(/not yet|would suit/i);
      expect(sym.reason, `${id} must not claim it is a rate`).not.toMatch(/per person/i);
    }
  });

  test("a genuine rate gets the other reason entirely", () => {
    const sym = capabilitiesFor("literacy_rate", "%", [1, 2, 3]).find(
      (c) => c.viz === "symbol"
    )!;
    expect(sym.reason).toMatch(/invent|distortion|already/i);
    expect(sym.reason).not.toMatch(/not yet/i);
  });
});

test.describe("#575 the matrix agrees with what the map actually draws", () => {
  // The anti-drift test, and the reason this file is worth having. A resolver
  // that disagrees with the renderer is worse than no resolver: browse pages
  // would advertise forms the map refuses to open. Checked against every metric
  // in the live store, not a sample.
  test("preferredViz matches symbolEligible for every district metric", async ({ request }) => {
    const metrics = await allMetrics(request);
    let checked = 0;
    const mismatches: string[] = [];

    for (const m of metrics) {
      const vals = await valuesFor(request, m.id);
      if (!vals || vals.length === 0) continue;
      checked++;
      const rendererWouldSymbolise = symbolEligible(m.unit, vals);
      const matrixPrefers = preferredViz(m.id, m.unit, vals);
      const agree = rendererWouldSymbolise
        ? matrixPrefers === "symbol"
        : matrixPrefers === "choropleth";
      if (!agree) mismatches.push(`${m.id}: renderer=${rendererWouldSymbolise}, matrix=${matrixPrefers}`);
    }

    expect(checked, "no metrics were actually compared").toBeGreaterThanOrEqual(80);
    expect(mismatches, "matrix and renderer disagree").toEqual([]);
  });

  test("every metric the renderer symbolises is offered symbols by the matrix", async ({ request }) => {
    const metrics = await allMetrics(request);
    let symbolised = 0;
    for (const m of metrics) {
      const vals = await valuesFor(request, m.id);
      if (!vals || vals.length === 0) continue;
      if (!symbolEligible(m.unit, vals)) continue;
      symbolised++;
      expect(offerableViz(m.id, m.unit, vals), m.id).toContain("symbol");
      expect(canRender(m.id, m.unit, vals, "symbol"), m.id).toBe(true);
    }
    // Phase 1 ships 9. If this reads 0 the loop stopped measuring.
    expect(symbolised, "no symbolised metrics were found").toBeGreaterThanOrEqual(8);
  });
});
