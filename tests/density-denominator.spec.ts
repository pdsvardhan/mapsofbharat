import { test, expect } from "@playwright/test";

// #548 / #549 — the population-density denominator, and the area it now comes from.
//
// Until 2026 district density divided population by the SUM OF THE SUB-DISTRICT AREA
// COLUMN in Census A-01. That column is enumerated village and town area: it omits
// unsurveyed and uninhabited land. Across most of India that is a rounding error, and
// for twelve districts it was a disaster — Leh summed to 394 sq km against an official
// 45,110, so a district of 3 people per sq km was published as 339 on a live map, in a
// geography where a wrong number is not merely a wrong number.
//
// The fix uses the official A-01 district area wherever a current district is exactly
// one 2011 district. These tests pin the outcome at the API, not in the adapter, because
// the adapter's own asserts cannot catch a store that was rebuilt by something else.

type MetricData = { level: string; min: number; max: number; values: Record<string, number> };

async function values(request: import("@playwright/test").APIRequestContext, id: string, level: string) {
  const res = await request.get(`/api/metrics/${id}?level=${level}`);
  expect(res.ok(), `${id}?level=${level} did not respond OK`).toBeTruthy();
  return (await res.json()) as MetricData;
}

test.describe("#548 density denominator", () => {
  test("the twelve districts the enumerated-area sum broke now read their official area", async ({ request }) => {
    const dens = await values(request, "pop_density", "district");
    const area = await values(request, "area_km2", "district");

    // rid -> [density, area]. Every one of these was wrong before the fix; the
    // second column is the official A-01 district area that replaced the sum.
    const pinned: Record<string, [number, number, string]> = {
      "38_3": [3, 45110, "Leh — was 339 against a 394 sq km sum"],
      "38_4": [10, 14036, "Kargil — was 750 against 188"],
      "01_16": [46, 8912, "Doda — was 300"],
      "01_14": [302, 3574, "Anantnag — was 1397"],
      "01_8": [238, 4243, "Baramulla — was 971"],
      "01_1": [366, 2379, "Kupwara — was 1312"],
      "24_468": [46, 45674, "Kutch — was 94; the Rann is real land no village area counts"],
      "01_12": [516, 1086, "Pulwama — was 881"],
      "01_5": [285, 1674, "Punch — was 415"],
    };

    for (const [rid, [d, a, why]] of Object.entries(pinned)) {
      expect(dens.values[rid], `density ${rid} (${why})`).toBe(d);
      expect(area.values[rid], `area ${rid} (${why})`).toBe(a);
    }
  });

  test("density reconciles with area and population for every district", async ({ request }) => {
    // The invariant that makes the pins above hard to drift past: whatever the
    // denominator is, density * area must return the population it came from. A
    // denominator changed in one place and not the other fails here for hundreds
    // of districts at once, not just the twelve anyone thought to hardcode.
    const dens = await values(request, "pop_density", "district");
    const area = await values(request, "area_km2", "district");
    const pop = await values(request, "pop_total", "district");

    const codes = Object.keys(dens.values);
    expect(codes.length).toBeGreaterThan(700);

    const broken: string[] = [];
    for (const rid of codes) {
      const a = area.values[rid];
      const p = pop.values[rid];
      const d = dens.values[rid];
      if (a === undefined || p === undefined) continue;
      // Density is stored rounded to a whole number, so the tolerance has to cover
      // half a unit of rounding on top of a small relative allowance.
      const implied = d * a;
      const slack = Math.max(0.5 * a, 0.02 * p);
      if (Math.abs(implied - p) > slack) {
        broken.push(`${rid}: density ${d} x area ${a} = ${Math.round(implied)}, population ${p}`);
      }
    }
    expect(broken, `districts where density x area does not reconcile:\n${broken.slice(0, 12).join("\n")}`).toHaveLength(0);
  });

  test("Ladakh and J&K carry administered area, not the enumerated sum", async ({ request }) => {
    // Ladakh was the state-level face of the same bug: it summed the same broken
    // column and published an area of 582 sq km, which also fed the Atlas area cohort.
    const area = await values(request, "area_km2", "state");
    const dens = await values(request, "pop_density", "state");
    const dArea = await values(request, "area_km2", "district");

    expect(area.values["38"], "Ladakh state area — was 582").toBe(59146);
    expect(area.values["38"], "Ladakh is exactly its two districts").toBe(
      dArea.values["38_3"] + dArea.values["38_4"],
    );
    expect(dens.values["38"], "Ladakh density").toBeLessThan(20);
    expect(area.values["01"], "J&K state area — was 23,361").toBeGreaterThan(35000);

    // Administered area only: A-01 has no rows across the LoC/LAC, so the national
    // total sits below the claimed 3,287,263 sq km the boundaries enclose. It should
    // be short by roughly the J&K/Ladakh gap and no more.
    const national = Object.values(area.values).reduce((s, v) => s + v, 0);
    expect(national).toBeGreaterThan(3_100_000);
    expect(national).toBeLessThan(3_287_263);
  });
});

test.describe("#549 district area and households", () => {
  test("both metrics cover every district and state", async ({ request }) => {
    for (const id of ["area_km2", "households"]) {
      const d = await values(request, id, "district");
      const s = await values(request, id, "state");
      expect(Object.keys(d.values).length, `${id} district coverage`).toBe(733);
      expect(Object.keys(s.values).length, `${id} state coverage`).toBe(36);
      for (const [rid, v] of Object.entries(d.values))
        expect(v, `${id} ${rid} must be positive`).toBeGreaterThan(0);
    }
  });

  test("households totals to the figure Census A-01 prints for India", async ({ request }) => {
    const s = await values(request, "households", "state");
    const total = Object.values(s.values).reduce((a, b) => a + b, 0);
    // A-01's INDIA row, Total residence.
    expect(total).toBe(249_501_663);
  });

  test("both metrics are published with a methodology that discloses the area basis", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { id: string; methodology?: string }[];
    };
    for (const id of ["area_km2", "households", "pop_density"]) {
      const m = metrics.find((x) => x.id === id);
      expect(m, `${id} missing from the catalogue`).toBeTruthy();
      expect((m!.methodology ?? "").trim().length, `${id} methodology`).toBeGreaterThan(0);
    }
    // The administered-vs-drawn discrepancy is the thing a reader most needs told,
    // because the map shows Leh far larger than the area used to divide by.
    const area = metrics.find((x) => x.id === "area_km2")!;
    expect(area.methodology).toContain("ADMINISTERED");
    expect(area.methodology).toContain("45,110");
  });
});
