import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { groupByForm, valueExtremes } from "@/lib/browse-by-form";
import type { MetricListItem } from "@/lib/metric-page-data";

// #575 item 1081 — browse by form, in the real app.
//
// SEPARATE FROM tests/browse-by-form.spec.ts for the same reason the value-by-alpha
// and bivariate cases are split: that file is node-side and its assertions can be
// mutation-proven, while these render through a built bundle where a source mutation
// changes nothing until a rebuild. Mixing them makes every mutation read as SURVIVED.
//
//   bash scripts/test-isolated.sh tests/browse-by-form-app.spec.ts

// THE SPEC OPENS THE STORE, THE PROCESS DOES NOT — same rule as the node-side file,
// and the same reason: tests/family-grid.spec.ts asserts db() is NULL and loses the
// mutations it exists to kill on a runner where DB_PATH resolves. Spelled out again
// here rather than imported from the sibling spec, because importing a spec file
// registers its tests a second time.
const ATLAS = join(process.cwd(), "data", "mapsofbharat.db");

function openAtlas() {
  if (!existsSync(ATLAS)) return null;
  const d = new Database(ATLAS, { readonly: true, fileMustExist: true });
  d.pragma("query_only = true");
  return d;
}

/** What the resolver says the page SHOULD be printing, assembled the way the page
 *  assembles it: catalogue over HTTP from the instance under test, extremes from a
 *  handle this file opened. The expectation is computed rather than written down, so
 *  a 126th metric arriving with a reason nobody has seen is covered on arrival. */
async function resolvedGroups(
  request: { get: (u: string) => Promise<{ json: () => Promise<{ metrics: MetricListItem[] }> }> },
) {
  const handle = openAtlas();
  if (!handle) return null;
  const { metrics } = await (await request.get("/api/metrics")).json();
  return groupByForm({ metrics, extremes: valueExtremes(handle) }).groups;
}

test.describe("the page", () => {
  test("BY SUBJECT is the default and BY FORM is one link away", async ({ page }) => {
    await page.goto("/metric");
    await expect(page.locator("[data-facet-switch]")).toBeVisible();
    await expect(page.locator('[data-facet="category"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-form-group]")).toHaveCount(0);

    await page.locator('[data-facet="form"]').click();
    await expect.poll(() => page.url()).toContain("by=form");
  });

  test("the by-form view groups by instrument, and each group says what it suits", async ({ page }) => {
    await page.goto("/metric?by=form");
    const groups = page.locator("[data-form-group]");
    await expect(groups.first()).toBeVisible();
    expect(await groups.count()).toBeGreaterThan(1);

    await expect(page.locator("[data-form-group='symbol']")).toBeVisible();
    await expect(page.locator("[data-form-group='choropleth']")).toBeVisible();
    // Not just a heading: the reader is told what the form is FOR, and why these
    // metrics are under it. Length rather than a pattern — the first version of this
    // asked for twenty CONSECUTIVE word characters, which no English sentence has,
    // and rejected the resolver's own copy for being prose.
    const suits = await page.locator("[data-form-suits]").first().textContent();
    const reason = await page.locator("[data-form-reason]").first().textContent();
    expect((suits ?? "").trim().length).toBeGreaterThan(40);
    expect((reason ?? "").trim().length).toBeGreaterThan(40);
  });

  test("a group prints every reason its members carry, once each", async ({ page, request }) => {
    // The page shipped printing the FIRST member's sentence over the whole group, on
    // the argument that a form has one reason. It has not: `capabilitiesFor` reaches
    // choropleth down two preferred paths, and forest_change_km2 — a km² change, so
    // signed — was listed under "already measured per person or per unit of area".
    // One metric in 125, and precisely the claim this view exists to make honestly.
    const groups = await resolvedGroups(request);
    expect(groups, "the atlas is not on disk — nothing was measured").not.toBeNull();

    await page.goto("/metric?by=form");
    for (const g of groups!) {
      const printed = (
        await page.locator(`[data-form-group="${g.viz}"] [data-form-reason]`).allTextContents()
      ).map((s) => s.trim()).sort();
      const carried = [...new Set(g.metrics.map((m) => m.reason))].sort();
      // Sorted lists rather than sets, so this fails on a sentence that is MISSING
      // and on one printed twice — the two ways the rejected renderings got it wrong.
      expect(printed, `${g.viz} does not print the reasons its members carry`).toEqual(carried);
    }
  });

  test("and each row sits under the sentence that was computed for IT", async ({ page, request }) => {
    // Printing the right SET of sentences is not the same claim as printing them over
    // the right rows: a grouping that clustered by anything else would satisfy the
    // test above and still tell a reader the wrong thing about a metric.
    const groups = await resolvedGroups(request);
    expect(groups, "the atlas is not on disk — nothing was measured").not.toBeNull();
    const reasonOf = new Map(groups!.flatMap((g) => g.metrics.map((m) => [m.metric.id, m.reason] as const)));

    await page.goto("/metric?by=form");
    const clusters = page.locator("[data-form-reason-group]");
    const count = await clusters.count();
    expect(count, "the page prints no reason clusters at all").toBeGreaterThanOrEqual(groups!.length);

    let checked = 0;
    for (let i = 0; i < count; i++) {
      const cluster = clusters.nth(i);
      const printed = ((await cluster.locator("[data-form-reason]").textContent()) ?? "").trim();
      const hrefs = await cluster
        .locator("[data-role='category-row']")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      expect(hrefs.length, "a reason printed over no rows").toBeGreaterThan(0);
      for (const href of hrefs) {
        const id = href.replace("/metric/", "");
        expect(printed, `${id} is listed under a sentence that is not its own`).toBe(reasonOf.get(id));
        checked += 1;
      }
    }
    // Count what was walked. A loop over an empty locator list passes every assertion
    // inside it and reports the same green as one that checked all 125.
    expect(checked, "the walk did not cover the whole catalogue").toBe(reasonOf.size);
  });

  test("every row still links to the metric's own page", async ({ page }) => {
    await page.goto("/metric?by=form");
    const rows = page.locator("[data-form-group] [data-role='category-row']");
    expect(await rows.count()).toBeGreaterThan(50);
    const href = await rows.first().getAttribute("href");
    expect(href).toMatch(/^\/metric\/[a-z0-9_]+$/);
  });

  test("both views are addressable — the facet is in the URL, not in a control", async ({ page }) => {
    // The point of two links rather than a toggle: a reader can send someone the
    // by-form view directly.
    await page.goto("/metric?by=form");
    await expect(page.locator("[data-form-group]").first()).toBeVisible();
    await expect(page.locator('[data-facet="form"]')).toHaveAttribute("aria-current", "page");
  });
});
