import { test, expect, type Page } from "@playwright/test";

// Item 757 — skew-aware classification. Every case here pins a defect measured on
// real data before the fix, not a hypothetical:
//
//   buddhist_pct/district: 60.7% of districts report exactly 0. All four quantile
//   breakpoints collapsed onto that value, and because binning is `v >= edge` the
//   collapsed edges all cleared at once — the 445 zero districts landed in class 4
//   of 5, painted three-quarters up the ramp, while the three lowest colours
//   rendered for nobody. That is the case these tests exist to keep fixed.
//
//   sex_ratio: every district sits below parity (1000), so any method that centres
//   on the data rather than the external reference normalises away the deficit the
//   map exists to show.
//
// The scale popover is the only surface that names the active method, so most of
// these assert through it.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
}

async function openScale(page: Page) {
  await page.getByRole("button", { name: /SCALE/i }).click();
  const pop = page.getByRole("dialog", { name: /Scale options/i });
  await expect(pop).toBeVisible();
  return pop;
}

/** The method whose segmented button is currently pressed. */
async function activeMethod(page: Page): Promise<string> {
  const pop = page.getByRole("dialog", { name: /Scale options/i });
  const pressed = pop.locator('button[aria-pressed="true"]');
  return (await pressed.first().innerText()).trim();
}

/** Legend rows, as [label, count] pairs. Reads the data-* hooks rather than utility
 *  classnames — an earlier version of this helper matched the search box's "CTRL K"
 *  hint because it keyed on `.font-mono.text-[9px]`. */
async function legendRows(page: Page): Promise<[string, number][]> {
  const rows = page.locator("[data-legend-row]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const out: [string, number][] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const label = (await row.locator("[data-legend-label]").innerText()).trim();
    const countEl = row.locator("[data-legend-count]");
    const count = (await countEl.count())
      ? Number((await countEl.innerText()).replace(/,/g, "")) : NaN;
    out.push([label, count]);
  }
  return out;
}

test.describe("zero-inflated metrics get a floor class (item 757)", () => {
  test("buddhist_pct/district selects FLOOR, and the zero districts sit in the LOWEST class", async ({ page, request }) => {
    const api = (await (await request.get("/api/metrics/buddhist_pct?level=district")).json()) as {
      values: Record<string, number>;
    };
    const vals = Object.values(api.values);
    const zeros = vals.filter((v) => v === 0).length;
    // guard the premise: if the data stops being zero-inflated this test is moot
    expect(zeros / vals.length).toBeGreaterThan(0.2);

    await page.goto("/?m=buddhist_pct&lvl=district");
    await waitForMapReady(page);
    await openScale(page);
    expect(await activeMethod(page)).toBe("FLOOR");

    const rows = await legendRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // the floor class is labelled by its single value, never as a range — every
    // region in it reads exactly 0, so "0–0.1" would overstate it
    expect(rows[0][0]).toBe("0");
    // and it is the FIRST row, i.e. the bottom of the ramp. Before the fix the
    // zero districts were painted class 4 of 5.
    expect(rows[0][1]).toBe(zeros);
  });

  test("legend class counts account for every region on the map", async ({ page }) => {
    await page.goto("/?m=buddhist_pct&lvl=district");
    await waitForMapReady(page);
    const rows = await legendRows(page);
    const total = rows.reduce((a, [, c]) => a + (c || 0), 0);
    const label = await page.getByText(/\d+ districts ·/i).first().innerText();
    const shown = Number((label.match(/(\d[\d,]*)/)?.[1] ?? "0").replace(/,/g, ""));
    expect(total).toBe(shown);
  });
});

test.describe("metrics with an external reference pivot on it (item 757)", () => {
  test("sex_ratio/district selects PIVOT and 1,000 is a class edge", async ({ page }) => {
    await page.goto("/?m=sex_ratio&lvl=district");
    await waitForMapReady(page);
    await openScale(page);
    expect(await activeMethod(page)).toBe("PIVOT");

    const rows = await legendRows(page);
    // parity must be an EDGE, never the interior of a band: a class straddling 1000
    // would let the map imply that "roughly parity" describes a deficit district
    const edges = rows.flatMap(([label]) => label.split("–").map((s) => s.trim()));
    expect(edges).toContain("1,000");
  });
});

test.describe("the selector discloses itself and yields to the user (item 757)", () => {
  test("an automatic choice explains itself; a manual pick silences it and sticks", async ({ page }) => {
    await page.goto("/?m=buddhist_pct&lvl=district");
    await waitForMapReady(page);
    const pop = await openScale(page);

    // automatic path: the reason is shown, so a substituted method is never silent
    const reason = pop.locator("[data-auto-reason]");
    await expect(reason).toBeVisible();
    await expect(reason).toContainText(/collapses|regions sit at/i);

    // a deliberate pick wins and is NOT re-overridden by the selector — the
    // anti-gaslight contract the old degeneracy guard also held
    await pop.getByRole("button", { name: "QUANTILE", exact: true }).click();
    expect(await activeMethod(page)).toBe("QUANTILE");
    await expect(pop.locator("[data-auto-reason]")).toHaveCount(0);
    // give the selector effect every chance to fight back, then confirm it did not
    await page.waitForTimeout(1200);
    expect(await activeMethod(page)).toBe("QUANTILE");
    expect(new URL(page.url()).searchParams.get("brk")).toBe("quantile");
  });

  test("FLOOR and PIVOT are only offered where they mean something", async ({ page }) => {
    // literacy_rate is neither zero-inflated nor referenced, so both conditional
    // methods must be absent rather than offered as no-ops
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    const pop = await openScale(page);
    await expect(pop.getByRole("button", { name: "FLOOR", exact: true })).toHaveCount(0);
    await expect(pop.getByRole("button", { name: "PIVOT", exact: true })).toHaveCount(0);
    // the four universal methods stay available everywhere
    for (const m of ["SMOOTH", "QUANTILE", "EQUAL", "JENKS"])
      await expect(pop.getByRole("button", { name: m, exact: true })).toHaveCount(1);
  });
});

test.describe("no metric is left with a collapsed scale (item 757)", () => {
  // The complaint that opened this item was "one colour dominates". Assert the
  // outcome directly on the two metrics that were worst, rather than trusting the
  // rule that produced it.
  for (const m of ["buddhist_pct", "sikh_pct"]) {
    test(`${m}/district no longer paints its zero districts high`, async ({ page }) => {
      await page.goto(`/?m=${m}&lvl=district`);
      await waitForMapReady(page);
      const rows = await legendRows(page);
      const counts = rows.map(([, c]) => c || 0);
      const total = counts.reduce((a, b) => a + b, 0);
      // the dominant class must be the FLOOR (class 0), not a mid-ramp class:
      // a majority sitting in class 4 of 5 is the exact defect being pinned
      const biggest = counts.indexOf(Math.max(...counts));
      expect(biggest).toBe(0);
      expect(total).toBeGreaterThan(600);
    });
  }
});
