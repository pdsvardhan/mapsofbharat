import { test, expect, Page } from "@playwright/test";

// Estimate behaviour (item 644, ACs 270/271).
//
// Before this file, no spec touched estimated / inherit / not ranked / rankOf —
// a grep of all four spec files found nothing. The suite ran 14/14 green straight
// through item 611, which was an estimate bug, and both iter-14 claims could only
// be reconciled "partial" because nothing exercised the behaviour they claimed.
//
// Fixtures are real rows, not invented ones (verified against the live DB):
//   36_735 Mancherial — 5 ASER metrics inherited from ADILABAD (2024)
//                       4 crime metrics inherited from NIRMAL   (2022)
//                       the multi-donor district adr-020 exists for
//   aser_govt_school  — 548 real + 74 inherited districts
//   fiscal_deficit_pct_gsdp — 31 states, 30 projected (RBI BE/RE), 1 actual (Gujarat)

const MANCHERIAL = "36_735";

/** The subset of /api/region's per-metric row these specs assert on. */
type RegionMetric = {
  id: string;
  estimated: number;
  rank: number | null;
  count: number;
  estimate_kind: string | null;
  estimated_from: string | null;
};

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("estimate_kind — the API says which kind of estimate (adr-021)", () => {
  test("inherited district estimates carry kind + the donor that supplied them", async ({ request }) => {
    const r = await request.get("/api/metrics/aser_govt_school");
    expect(r.ok()).toBeTruthy();
    const d = await r.json();

    // Mancherial has no ASER of its own — it inherited Adilabad's.
    expect(d.estimated[MANCHERIAL]).toBe(1);
    expect(d.estimate_kind[MANCHERIAL]).toBe("inherited");
    expect(d.estimated_from[MANCHERIAL]).toBe("Adilabad");

    // Every estimated district says which kind it is — no silent nulls (adr-021).
    for (const code of Object.keys(d.estimated)) {
      expect(d.estimate_kind[code], `${code} has no estimate_kind`).toBeTruthy();
    }
  });

  test("projected state estimates are NOT called inherited and cite no donor", async ({ request }) => {
    const r = await request.get("/api/metrics/fiscal_deficit_pct_gsdp?level=state");
    expect(r.ok()).toBeTruthy();
    const d = await r.json();

    const estCodes = Object.keys(d.estimated);
    expect(estCodes.length).toBe(30);
    for (const code of estCodes) {
      // The bug this pins: all 30 were told "inherited from the parent district".
      expect(d.estimate_kind[code]).toBe("projected");
      expect(d.estimated_from?.[code]).toBeUndefined();
    }
  });
});

test.describe("statistics exclude copies, not projections (adr-022)", () => {
  test("projected states keep the colour scale off a single point", async ({ request }) => {
    const r = await request.get("/api/metrics/fiscal_deficit_pct_gsdp?level=state");
    const d = await r.json();

    // Regression guard. Excluding all 30 projections left min == max == 0.7645 —
    // one real row (Gujarat 2022) scaling 31 states whose values run 0.54–6.92.
    expect(d.max).toBeGreaterThan(d.min);
    expect(d.stats_count).toBeGreaterThan(1);
    expect(d.mean).toBeGreaterThan(d.min);
    expect(d.mean).toBeLessThan(d.max);
  });

  test("inherited copies are excluded from stats, so the mean is not dragged", async ({ request }) => {
    const r = await request.get("/api/metrics/aser_govt_school");
    const d = await r.json();

    // 548 real + 74 inherited; stats must rest on the real ones only.
    expect(d.stats_count).toBe(d.count - d.estimated_count);
    expect(Object.keys(d.estimated).length).toBe(d.estimated_count);
  });
});

test.describe("estimates are not ranked (item 611)", () => {
  test("/api/region leaves an inherited value rankless and names its real donor", async ({ request }) => {
    const r = await request.get(`/api/region/${MANCHERIAL}`);
    expect(r.ok()).toBeTruthy();
    const d = await r.json();

    const aser = d.metrics.find((m: RegionMetric) => m.id === "aser_govt_school");
    expect(aser.estimated).toBe(1);
    expect(aser.rank).toBeNull(); // never `rank ?? 1` — that would call a copy Rank 1
    expect(aser.estimate_kind).toBe("inherited");
    expect(aser.estimated_from).toBe("Adilabad");

    // adr-020: this district takes different metrics from different donors, which a
    // single parent-per-district citation could not state.
    const crime = d.metrics.find((m: RegionMetric) => m.id === "crime_ipc_rate");
    expect(crime.estimated_from).toBe("Nirmal");
    expect(d.estimated_parents).toEqual(expect.arrayContaining(["Adilabad", "Nirmal"]));
  });

  test("rank denominators count only districts the source surveyed", async ({ request }) => {
    const r = await request.get(`/api/region/${MANCHERIAL}`);
    const d = await r.json();
    const m = await (await request.get("/api/metrics/aser_govt_school")).json();

    const aser = d.metrics.find((x: RegionMetric) => x.id === "aser_govt_school");
    // "of N" must be the real districts, not real + copies.
    expect(aser.count).toBe(m.count - m.estimated_count);
  });
});

test.describe("the rail discloses estimates at the point of use (adr-019)", () => {
  test("an estimated row shows an em dash and a badge — never a rank of 00", async ({ page }) => {
    await page.goto("/?m=aser_govt_school");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Mancherial");
    const row = page.locator("button", { hasText: "Mancherial" }).first();
    await expect(row).toBeVisible();

    await expect(row.getByTestId("est-badge")).toHaveText("est.");
    await expect(row.getByTestId("rail-rank")).toHaveText("—");
    // The dead `String(r.rank ?? 0)` would have rendered this as "00" (item 645).
    await expect(row.getByTestId("rail-rank")).not.toHaveText("00");
  });

  test("a real row shows its rank, so the em dash means something", async ({ page }) => {
    await page.goto("/?m=aser_govt_school");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Adilabad");
    const row = page.locator("button", { hasText: "Adilabad" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("rail-rank")).toHaveText(/^\d+$/);
    await expect(row.getByTestId("est-badge")).toHaveCount(0);
  });

  test("the region panel calls an inherited value not ranked, and names the donor", async ({ page }) => {
    await page.goto("/?m=aser_govt_school");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Mancherial");
    await page.locator("button", { hasText: "Mancherial" }).first().click();

    // Asserting only /not ranked/i let item 640's defect through: the headline read
    // "inherited from the parent district" while the ALL INDICATORS list below it
    // said "estimated from Adilabad" — same district, same panel, on screen at once.
    // Pin the wording, or the two surfaces can silently drift apart again.
    await expect(page.getByText(/inherited from Adilabad — not ranked/i)).toBeVisible();
    await expect(page.getByText(/inherited from the parent district/i)).toHaveCount(0);
  });

  test("the donor is readable without hovering (item 642, target_devices=both)", async ({ page }) => {
    await page.goto("/?m=aser_govt_school");
    await waitForMapReady(page);

    await page.getByLabel("Search the ranking").fill("Mancherial");
    await page.locator("button", { hasText: "Mancherial" }).first().click();
    await page.getByRole("button", { name: /ALL INDICATORS/i }).click();

    // A title attr never fires on touch, so the donor must be on the row itself.
    await expect(page.getByText(/estimated from Adilabad/i).first()).toBeVisible();
  });
});
