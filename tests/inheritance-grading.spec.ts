import { test, expect, Page } from "@playwright/test";

// Inheritance grading (item 812, adr-026).
//
// A post-2011 district inherits a survey value from its 2011 sibling. adr-026
// grades each inheritance and flags the SHAKY ones — divergence >= 1 national IQR
// (over urban_pct / female_literacy_rate / log density) AND reach >= 1M people.
// The audit (research/218-inheritance-audit.md) fixed the calibration to 12 shaky
// pairs; these specs pin the three anchors it was calibrated against.
//
// Fixtures are real rows on nfhs5_full_immunization (inherited by both NTR and Shi
// Yomi), verified against the live DB:
//   37_749 NTR         <- Krishna       59% urban vs 28% : SHAKY (2.22M people)
//   12_785 Shi Yomi    <- West Siang    diverges more, but 13.3k people : NOT shaky
//   19_335 Purba Bardhaman <- Paschim   6.56M people, but similar donor : NOT shaky
//   36_735 Mancherial  <- Adilabad/Nirmal   802k people : NOT shaky (below 1M floor)

const NTR = "37_749";
const SHI_YOMI = "12_785";
const PURBA = "19_335";
const MANCHERIAL = "36_735";
const METRIC = "nfhs5_full_immunization";

type RegionMetric = {
  id: string;
  estimated: number;
  estimate_kind: string | null;
  estimated_from: string | null;
  shaky?: number;
  rank: number | null;
};

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function regionMetric(request: any, code: string, id: string): Promise<RegionMetric> {
  const d = await (await request.get(`/api/region/${code}`)).json();
  return d.metrics.find((m: RegionMetric) => m.id === id);
}

test.describe("the gate flags the expected shaky set (adr-026)", () => {
  test("/api/metrics carries a shaky flag: NTR in, Shi Yomi out", async ({ request }) => {
    const d = await (await request.get(`/api/metrics/${METRIC}`)).json();
    expect(d.shaky, "the metrics API exposes a shaky map").toBeTruthy();

    // NTR inherits Krishna's immunization and is a weak match — flagged.
    expect(d.estimated[NTR]).toBe(1);
    expect(d.estimate_kind[NTR]).toBe("inherited");
    expect(d.shaky[NTR]).toBe(1);

    // Shi Yomi inherits too and diverges even harder, but 13k people never trips
    // the 1M reach floor — not flagged.
    expect(d.estimated[SHI_YOMI]).toBe(1);
    expect(d.shaky[SHI_YOMI]).toBeUndefined();

    // Only inherited values are ever shaky.
    for (const code of Object.keys(d.shaky)) {
      expect(d.estimate_kind[code], `${code} shaky but not inherited`).toBe("inherited");
    }
  });

  test("/api/region grades each inheritance: NTR shaky, the others not", async ({ request }) => {
    const ntr = await regionMetric(request, NTR, METRIC);
    expect(ntr.estimated).toBe(1);
    expect(ntr.estimated_from).toBe("Krishna");
    expect(ntr.shaky).toBe(1);

    const shi = await regionMetric(request, SHI_YOMI, METRIC);
    expect(shi.estimated).toBe(1);
    expect(shi.estimated_from).toBe("West Siang");
    expect(shi.shaky).toBe(0);

    // Mancherial (802k) is below the reach floor — a copy, but not called shaky.
    const man = await regionMetric(request, MANCHERIAL, "aser_govt_school");
    expect(man.estimated).toBe(1);
    expect(man.shaky).toBe(0);

    // Purba Bardhaman is 6.56M people but its donor is similar (divergence < 1) —
    // the reach term alone must not flag it.
    const purbaAll = await (await request.get(`/api/region/${PURBA}`)).json();
    const purbaInherited = purbaAll.metrics.filter((m: RegionMetric) => m.estimated === 1);
    expect(purbaInherited.length).toBeGreaterThan(0);
    for (const m of purbaInherited) expect(m.shaky, `${PURBA} ${m.id} should not be shaky`).toBe(0);
  });

  test("grading is disclosure-only: it moves no rank and no statistic (adr-022/023)", async ({ request }) => {
    const d = await (await request.get(`/api/metrics/${METRIC}`)).json();
    // Stats still rest on real rows only — shaky flags never enter them.
    expect(d.stats_count).toBe(d.count - d.estimated_count);
    // A shaky inheritance is still rank-less, exactly like any inherited copy.
    const ntr = await regionMetric(request, NTR, METRIC);
    expect(ntr.rank).toBeNull();
  });
});

test.describe("the shaky badge and caution surface in the UI (adr-026)", () => {
  test("a shaky inheritance shows the stronger badge and a caution note", async ({ page }) => {
    await page.goto(`/?m=${METRIC}`);
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("NTR");
    const row = page.locator("button", { hasText: "NTR" }).first();
    await expect(row).toBeVisible();
    // Same badge slot as a normal estimate, but marked shaky and amber.
    await expect(row.getByTestId("est-badge")).toHaveAttribute("data-shaky", "1");

    // Region panel: the not-ranked sentence carries the weak-match caution.
    await row.click();
    await expect(page.getByText(/weak match/i).first()).toBeVisible();

    // ALL INDICATORS names the donor AND says it is a weak match, without hovering.
    await page.getByRole("button", { name: /ALL INDICATORS/i }).click();
    await expect(page.getByText(/estimated from Krishna \(weak match\)/i).first()).toBeVisible();
  });

  test("a well-matched inheritance keeps the plain badge (no false alarm)", async ({ page }) => {
    await page.goto(`/?m=${METRIC}`);
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Shi Yomi");
    const row = page.locator("button", { hasText: "Shi Yomi" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("est-badge")).toHaveAttribute("data-shaky", "0");
    await expect(row.getByTestId("est-badge")).toHaveText("est.");
  });
});
