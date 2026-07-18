import { test, expect } from "@playwright/test";

// Finance (RBI banking) + Transport (Vahan EV, MoRTH stock) verticals — iter-24.
// Pins that the metrics exist in the right categories, are per-capita/rate shaped,
// and stay in sane ranges (a broken denominator or a comma-parse slip would blow
// these bounds). State-level; year vintages differ (banking 2025, EV 2025, stock 2015).

type ApiMetric = { id: string; category: string; unit: string; methodology?: string };
type MetricData = { level: string; min: number; max: number; values: Record<string, number> };

test.describe("finance + transport verticals (iter-24)", () => {
  test("finance has the 4 RBI banking metrics; transport has EV + vehicle stock", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as { metrics: ApiMetric[] };
    const fin = new Set(metrics.filter((m) => m.category === "finance").map((m) => m.id));
    const tra = new Set(metrics.filter((m) => m.category === "transport").map((m) => m.id));
    for (const id of ["bank_deposits_per_capita", "bank_credit_per_capita", "bank_offices_per_lakh", "credit_deposit_ratio"])
      expect(fin, `finance missing ${id}`).toContain(id);
    for (const id of ["ev_share_pct", "vehicles_per_1000"])
      expect(tra, `transport missing ${id}`).toContain(id);
    for (const m of metrics.filter((x) => x.category === "finance" || x.category === "transport"))
      expect((m.methodology ?? "").trim().length, `${m.id} methodology`).toBeGreaterThan(0);
  });

  test("banking + EV values are state-level and in sane ranges", async ({ request }) => {
    // These verticals are state-only (like the shipped gst_total); the API serves
    // them under ?level=state (the default district view is empty for them).
    const dep = (await (await request.get("/api/metrics/bank_deposits_per_capita?level=state")).json()) as MetricData;
    expect(dep.level).toBe("state");
    expect(Object.keys(dep.values).length).toBe(36);
    for (const v of Object.values(dep.values)) expect(v).toBeGreaterThan(0);

    const ev = (await (await request.get("/api/metrics/ev_share_pct?level=state")).json()) as MetricData;
    expect(ev.min).toBeGreaterThanOrEqual(0);
    expect(ev.max).toBeLessThanOrEqual(100);          // it's a percentage
    expect(ev.max).toBeGreaterThan(2);                // some state has real EV uptake

    const cdr = (await (await request.get("/api/metrics/credit_deposit_ratio?level=state")).json()) as MetricData;
    expect(cdr.min).toBeGreaterThan(0);
    expect(cdr.max).toBeLessThan(300);                // C-D ratio, some states exceed 100%
  });
});
