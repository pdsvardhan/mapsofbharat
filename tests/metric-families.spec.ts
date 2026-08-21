import { test, expect } from "@playwright/test";

import { METRIC_FAMILIES } from "@/lib/metric-families";

// #547 phase A — keep lib/metric-families.ts true.
//
// The families are a claim about the store: these metrics exist, share this unit,
// and hold values together on at least this many districts. R1 made that claim in
// prose and three parts of it were wrong by the time it was read — including two
// families it called part-to-whole that are not, and one whose members sum to 100
// in zero of 733 districts.
//
// So the claim lives in code and is asserted here. A retired metric, a changed unit,
// or coverage falling below the recorded floor fails this spec instead of surfacing
// as an empty panel in a grid nobody re-measured.
//
// This is a test rather than a build-time guard on purpose: .dockerignore excludes
// `data`, so the canonical store is not in the image build context and a prebuild
// check could not read it. The suite runs against a live instance, which can.

type MetricRow = { id: string; unit: string };
type MetricData = { values: Record<string, number> };

test.describe("#547 small-multiples families", () => {
  test("every declared member exists and carries the declared unit", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as { metrics: MetricRow[] };
    const unitOf = new Map(metrics.map((m) => [m.id, m.unit]));

    const problems: string[] = [];
    for (const fam of METRIC_FAMILIES) {
      expect(fam.members.length, `${fam.id} must have >=3 members to be a family`).toBeGreaterThanOrEqual(3);
      expect(new Set(fam.members).size, `${fam.id} lists a member twice`).toBe(fam.members.length);
      for (const id of fam.members) {
        if (!unitOf.has(id)) problems.push(`${fam.id}: '${id}' is not in the catalogue`);
        else if (unitOf.get(id) !== fam.unit)
          problems.push(`${fam.id}: '${id}' is ${unitOf.get(id)}, family declares ${fam.unit}`);
      }
    }
    expect(problems, problems.join("\n")).toHaveLength(0);
  });

  test("each family still holds its members together on the districts it claims", async ({ request }) => {
    const problems: string[] = [];

    for (const fam of METRIC_FAMILIES) {
      const perMetric = await Promise.all(
        fam.members.map(async (id) => {
          const res = await request.get(`/api/metrics/${id}?level=district`);
          if (!res.ok()) return null;
          return Object.keys(((await res.json()) as MetricData).values);
        }),
      );
      if (perMetric.some((v) => v === null)) {
        problems.push(`${fam.id}: a member did not serve district values`);
        continue;
      }

      // Districts on which EVERY member has a value — the set a grid can actually draw.
      const count = new Map<string, number>();
      for (const codes of perMetric) for (const c of codes!) count.set(c, (count.get(c) ?? 0) + 1);
      const shared = [...count.values()].filter((n) => n === fam.members.length).length;

      // A floor, not equality: gaining coverage is fine, losing it is the regression.
      if (shared < fam.sharedDistricts)
        problems.push(
          `${fam.id}: ${shared} shared districts, below the recorded floor of ${fam.sharedDistricts}`,
        );
    }

    expect(problems, problems.join("\n")).toHaveLength(0);
  });

  test("the part-to-whole claim is true where made, and absent where it is not", async ({ request }) => {
    // The one property a reader would be actively misled by. R1 claimed three
    // families decompose a whole; only religion does. Both directions are asserted:
    // a family claiming it must still sum, and one not claiming it must still not.
    const problems: string[] = [];

    for (const fam of METRIC_FAMILIES) {
      if (fam.unit !== "%") continue;

      const perMetric = await Promise.all(
        fam.members.map(async (id) =>
          ((await (await request.get(`/api/metrics/${id}?level=district`)).json()) as MetricData).values),
      );
      const sums = new Map<string, { total: number; n: number }>();
      for (const values of perMetric)
        for (const [code, v] of Object.entries(values)) {
          const cur = sums.get(code) ?? { total: 0, n: 0 };
          sums.set(code, { total: cur.total + v, n: cur.n + 1 });
        }
      const complete = [...sums.values()].filter((s) => s.n === fam.members.length);
      const within = complete.filter((s) => s.total >= 97 && s.total <= 103).length;
      const share = complete.length ? within / complete.length : 0;

      if (fam.partToWhole) {
        if (share <= 0.9)
          problems.push(
            `${fam.id} claims part-to-whole but only ${within}/${complete.length} districts sum to 97-103`,
          );
        if (within < fam.partToWhole.within)
          problems.push(
            `${fam.id}: ${within} districts in band, below the recorded ${fam.partToWhole.within}`,
          );
      } else if (share > 0.9) {
        problems.push(
          `${fam.id} does NOT claim part-to-whole, but ${within}/${complete.length} districts sum to 97-103 — ` +
            `if these really decompose a whole, say so; the grid caption depends on it`,
        );
      }
    }

    expect(problems, problems.join("\n")).toHaveLength(0);
  });

  test("a family blocked by a known data defect is not offered for shipping", async () => {
    const { SHIPPABLE_FAMILIES } = await import("@/lib/metric-families");
    for (const fam of SHIPPABLE_FAMILIES)
      expect(fam.blockedBy, `${fam.id} is shippable but carries a blocker`).toBeUndefined();

    // census-pca is blocked until the main-vs-all workers understatement is resolved.
    // If someone clears that blocker, they should have fixed the data first.
    const pca = METRIC_FAMILIES.find((f) => f.id === "census-pca")!;
    expect(pca.blockedBy, "census-pca must stay blocked while its worker shares understate").toBeTruthy();
  });
});
