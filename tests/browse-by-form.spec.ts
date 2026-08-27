import { test, expect } from "@playwright/test";
import { groupByForm, valueExtremes } from "@/lib/browse-by-form";
import { VISUALIZATIONS } from "@/lib/metric-capabilities";
import type { MetricListItem } from "@/lib/metric-page-data";
/** A catalogue row with only the fields the grouping reads. */
function listItem(id: string, unit: string): MetricListItem {
  return {
    id, name: id, category: "test", unit, year: 2011,
    source: "test", source_url: "", license: "", higher_is_better: 1,
    decimals: 0, default_scale: null, methodology: null, last_updated: null,
    levels: ["district"],
  };
}


// #575 item 1081 — browse by form, the last step of the visualisation-first order.
//
// The page makes the capability resolver PUBLIC, which is what lib/metric-capabilities
// was written in anticipation of. So the thing worth testing is that it reports the
// resolver's answer rather than a second opinion of its own, and that nothing lands in
// a group by guesswork.

test.describe("the grouping", () => {
  test("every metric with values lands in exactly one group", () => {
    const { groups, omitted } = groupByForm();
    expect(groups.length, "no groups — the resolver returned nothing").toBeGreaterThan(0);

    const ids = groups.flatMap((g) => g.metrics.map((m) => m.metric.id));
    // Once, not once per form it is merely ALLOWED. A page about what suits the data
    // would otherwise become a page about what the renderer tolerates.
    expect(new Set(ids).size, "a metric appears in more than one group").toBe(ids.length);
    expect(ids.length + omitted).toBeGreaterThan(100);
  });

  test("both shipped forms are represented, and neither swallows the catalogue", () => {
    const { groups } = groupByForm();
    const byViz = Object.fromEntries(groups.map((g) => [g.viz, g.metrics.length]));

    // Totals get circles, rates get shading. If either group were empty the page
    // would be presenting a one-form atlas, and if one held everything the resolver
    // would have stopped discriminating.
    expect(byViz.choropleth ?? 0).toBeGreaterThan(0);
    expect(byViz.symbol ?? 0).toBeGreaterThan(0);
    const total = groups.reduce((n, g) => n + g.metrics.length, 0);
    for (const g of groups) {
      expect(g.metrics.length, `${g.viz} holds the whole catalogue`).toBeLessThan(total);
    }
  });

  test("the names and the wording come from the resolver, not from this page", () => {
    const { groups } = groupByForm();
    for (const g of groups) {
      expect(g.name).toBe(VISUALIZATIONS[g.viz].name);
      expect(g.suits).toBe(VISUALIZATIONS[g.viz].suits);
      // Every metric carries the resolver's reader-facing sentence.
      for (const m of g.metrics) expect(m.reason.length).toBeGreaterThan(20);
    }
  });

  test("a total is filed under circles and a rate under shading", () => {
    const { groups } = groupByForm();
    const where = (id: string) => groups.find((g) => g.metrics.some((m) => m.metric.id === id))?.viz;
    // pop_total adds up across districts; literacy_rate is already per person. If
    // these two ever swapped, the page would be teaching the opposite of the rule.
    expect(where("pop_total")).toBe("symbol");
    expect(where("literacy_rate")).toBe("choropleth");
    // pop_density LOOKS count-shaped and is a rate — the case research/531 called out.
    expect(where("pop_density")).toBe("choropleth");
  });

  test("a metric with no values is omitted, never filed under a guess", () => {
    // INJECTED, because the real store cannot produce this: every metric in it has
    // values, so the branch is unreachable from the catalogue and a mutation that
    // filed the valueless under a guess survived a test written against reality.
    // That survivor is why this case exists.
    const { groups, omitted } = groupByForm({
      metrics: [
        listItem("has_values", "%"),
        listItem("no_values_at_all", "%"),
      ],
      extremes: new Map([["has_values", [0, 100] as [number, number]]]),
    });
    expect(omitted, "the valueless metric was not omitted").toBe(1);
    const listed = groups.flatMap((g) => g.metrics.map((m) => m.metric.id));
    expect(listed).toEqual(["has_values"]);
    expect(listed, "a metric with no values got a form anyway").not.toContain("no_values_at_all");
  });

  test("a SIGNED count is not filed under circles — the extremes are what say so", () => {
    // forest_change_km2 is the archetype: a count unit (km²) whose values go both
    // ways, and a circle sized by area cannot say which direction a change went.
    // Only the minimum reveals it, so this is what proves the extremes are read
    // rather than stubbed — a mutation replacing them with [1, 1] survived without it.
    const positive = groupByForm({
      metrics: [listItem("forest_gain_km2", "km²")],
      extremes: new Map([["forest_gain_km2", [10, 900] as [number, number]]]),
    });
    expect(positive.groups.find((g) => g.viz === "symbol")?.metrics.length).toBe(1);

    const signed = groupByForm({
      metrics: [listItem("forest_change_km2", "km²")],
      extremes: new Map([["forest_change_km2", [-120, 900] as [number, number]]]),
    });
    expect(signed.groups.find((g) => g.viz === "symbol"), "a signed count was offered circles")
      .toBeUndefined();
    expect(signed.groups.find((g) => g.viz === "choropleth")?.metrics.length).toBe(1);
  });

  test("the extremes are REAL — the query is read, not stubbed", () => {
    // This case exists because a mutation replacing every extreme with a constant
    // survived. It could: the grouping only asks "is anything negative", and no
    // metric in today's catalogue is a signed count, so a constant answered exactly
    // as well as the truth. What the query returns is its own claim.
    const ex = valueExtremes();
    expect(ex.size, "no extremes read at all").toBeGreaterThan(100);

    const lit = ex.get("literacy_rate");
    expect(lit, "literacy_rate has no extremes").toBeDefined();
    const [mn, mx] = lit!;
    expect(mx, "min and max are identical — these are not real extremes")
      .toBeGreaterThan(mn);
    // A percentage, so it lives inside 0..100 and actually spans districts.
    expect(mn).toBeGreaterThanOrEqual(0);
    expect(mx).toBeLessThanOrEqual(100);
    expect(mx - mn, "literacy barely varies — the query is not reading the series")
      .toBeGreaterThan(20);

    // And they are not all the same pair, which a constant would make them.
    const pairs = new Set([...ex.values()].map(([a, b]) => `${a}|${b}`));
    expect(pairs.size, "every metric reported the same extremes").toBeGreaterThan(10);
  });

  test("a form with nothing in it is not advertised", () => {
    // Only rates here, so the circles group has no members. Rendering it would put a
    // heading on the page over an empty list — a form the atlas claims to offer and
    // then does not. Unreachable from the real catalogue, where both groups are full.
    const { groups } = groupByForm({
      metrics: [listItem("a_rate", "%"), listItem("another_rate", "per 1000")],
      extremes: new Map([
        ["a_rate", [0, 100] as [number, number]],
        ["another_rate", [0, 900] as [number, number]],
      ]),
    });
    expect(groups.map((g) => g.viz)).toEqual(["choropleth"]);
    for (const g of groups) expect(g.metrics.length).toBeGreaterThan(0);
  });
});
