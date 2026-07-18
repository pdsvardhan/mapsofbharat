import { test, expect } from "@playwright/test";

// Payments vertical — NPCI UPI district metrics (iter-23 item 690).
//
// The property that matters most for this source is the LOCATION-UNCLASSIFIED
// disclosure: ~44% of national UPI volume and ~39% of value is not attributable
// to any district by NPCI and is excluded from every district/state figure. If
// the methodology stops saying so, the choropleth silently implies a coverage it
// does not have — exactly the gaslight this project exists to prevent. These
// specs pin the disclosure, the per-capita shape, and near-national coverage.

type ApiMetric = {
  id: string; category: string; methodology?: string; source?: string;
};

test.describe("payments — NPCI UPI district vertical (item 690)", () => {
  test("both UPI metrics live in 'payments' and disclose the unclassified share", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as { metrics: ApiMetric[] };
    const upi = metrics.filter((m) => m.category === "payments");
    expect(upi.map((m) => m.id).sort()).toEqual(["upi_txn_per_capita", "upi_value_per_capita"]);
    for (const m of upi) {
      expect(m.source ?? "").toMatch(/NPCI/);
      expect(m.methodology ?? "").toMatch(/unclassified/i);   // the disclosure
      expect(m.methodology ?? "").toMatch(/\d+(\.\d+)?%/);     // a numeric excluded share
    }
  });

  test("district values are per-capita, positive, and cover most of the country", async ({ request }) => {
    const md = (await (await request.get("/api/metrics/upi_value_per_capita")).json()) as {
      level: string; max: number; values: Record<string, number>;
    };
    expect(md.level).toBe("district");
    expect(Object.keys(md.values).length).toBeGreaterThan(700);   // 731 of 733 today
    for (const v of Object.values(md.values)) expect(v).toBeGreaterThan(0);
    expect(md.max).toBeGreaterThan(50_000);                       // corporate hubs top the scale
  });
});
