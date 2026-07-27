import { test, expect, type Page } from "@playwright/test";
import { CAT_ORDER, CAT_DESC, CAT_ACCENT, CAT_ICON } from "@/components/atlas/cats";

// iter-26 regression guards. Every case here pins a defect that actually shipped
// or was caught by the item's verifier — none of them are hypothetical:
//   750  the chooser's topic column stopped at ~9 of 20 topics
//   751  three live categories fell back to the demographics person icon
//   756  a scale pick on one metric followed the user to every other metric
//   764  Escape dismissed a popover AND silently cleared the map selection
// Three separate verifiers flagged the absence of these tests as the one gap in
// an otherwise clean item, on the grounds that nothing in typecheck or lint would
// notice any of it coming back.

const DEMOGRAPHICS_ICON_START = "M12 8a3 3 0 100-6";
const FALLBACK_ACCENT = "rgb(209, 80, 47)"; // #d1502f

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ (districts|states) ·/i)).toBeVisible({ timeout: 20_000 });
}

async function openChooser(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /BROWSE INDICATORS/i }).click();
  const dialog = page.getByRole("dialog", { name: /Choose an indicator/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("indicator chooser taxonomy (items 750, 751)", () => {
  test("every live category is present, reachable by scrolling, and clickable", async ({ page, request }) => {
    const payload = (await (await request.get("/api/metrics")).json()) as { metrics: { category: string }[] };
    const live: string[] = [...new Set(payload.metrics.map((m) => m.category))];
    expect(live.length).toBeGreaterThan(0);

    const dialog = await openChooser(page);
    const topics = dialog.locator("button").filter({ hasText: /^\w+\s*\d+ indicator/ });
    const names = (await topics.allInnerTexts()).map((t) => t.split("\n")[0].trim().toLowerCase());
    // no category may be missing from the browse path — the 750 bug hid 11 of 20
    for (const c of live) expect(names).toContain(c.toLowerCase());

    // the column must genuinely scroll, not merely paint the overflow
    const scroller = dialog.locator("div.atl-scroll").first();
    const box = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(box.sh).toBeGreaterThan(box.ch);

    // and the LAST topic must be reachable and actionable, not just present in the DOM
    const last = topics.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    const lastName = (await last.innerText()).split("\n")[0].trim();
    await last.click();
    await expect(dialog.getByText(lastName, { exact: false }).first()).toBeVisible();
  });

  test("no category falls back to the demographics icon or the default accent", async ({ page }) => {
    const dialog = await openChooser(page);
    const topics = dialog.locator("button").filter({ hasText: /^\w+\s*\d+ indicator/ });
    const n = await topics.count();
    const offenders: string[] = [];
    for (let i = 0; i < n; i++) {
      const topic = topics.nth(i);
      await topic.scrollIntoViewIfNeeded();
      await topic.click();
      const name = (await topic.innerText()).split("\n")[0].trim().toLowerCase();
      if (name === "demographics") continue; // the only category entitled to that glyph
      const icon = dialog.locator("svg path").first();
      const d = (await icon.getAttribute("d")) ?? "";
      const stroke = await icon.evaluate((el) => getComputedStyle(el).stroke);
      if (d.startsWith(DEMOGRAPHICS_ICON_START)) offenders.push(`${name}: fallback icon`);
      if (stroke === FALLBACK_ACCENT) offenders.push(`${name}: fallback accent`);
    }
    expect(offenders).toEqual([]);
  });
});

test.describe("scale method is scoped per metric (item 756)", () => {
  // These assert the ACTIVE METHOD, read from the scale popover, not the `brk` query
  // param. A first draft read brk — which is null on both the fixed and the broken
  // code path for every automatic switch, so all three cases passed against the very
  // build whose defects they exist to pin. The defect is a METHOD difference
  // (JENKS vs EQUAL); nothing that never reads the method can detect it.
  //
  // They also switch metrics IN-SESSION via Ctrl-K. page.goto re-seeds the whole
  // component from the URL on mount, which is exactly the path the bugs did NOT live
  // on — the stale-rows guard and the dropped pin both needed a live metric change.

  async function activeMethod(page: Page): Promise<string> {
    await page.locator("[data-scale-toggle]").click();
    const popover = page.getByRole("dialog", { name: /Scale options/i });
    await expect(popover).toBeVisible();
    const label = (await popover.locator('button[aria-pressed="true"]').first().innerText()).trim();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    return label;
  }

  // `label` MUST be anchored: an unanchored /Literacy rate/ also matches
  // "Female literacy rate", and .first() then silently switches to a different
  // metric than the test believes — which makes every later assertion meaningless.
  async function switchMetric(page: Page, query: string, label: RegExp) {
    await page.keyboard.press("Control+k");
    const search = page.getByRole("dialog", { name: "Search" });
    await expect(search).toBeVisible();
    await search.getByRole("textbox", { name: /Search places and indicators/i }).fill(query);
    await search.getByRole("button", { name: label }).first().click();
    await expect(search).toBeHidden();
    await waitForMapReady(page);
    await page.waitForTimeout(900); // let the degeneracy guard settle if it fires
  }

  test("the method a metric renders with does not depend on which metric you came from", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(900);
    const cold = await activeMethod(page);

    // arrive at the same metric from two differently-shaped distributions
    await page.goto("/?m=sex_ratio&lvl=district");
    await waitForMapReady(page);
    await switchMetric(page, "literacy", /^Literacy rate/i);
    expect(await activeMethod(page)).toBe(cold);

    await page.goto("/?m=upi_value_per_capita&lvl=district");
    await waitForMapReady(page);
    await switchMetric(page, "literacy", /^Literacy rate/i);
    expect(await activeMethod(page)).toBe(cold);
  });

  test("an automatic method is never stamped into the share link, including after a switch", async ({ page }) => {
    await page.goto("/?m=sex_ratio&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(900);
    expect(new URL(page.url()).searchParams.get("brk")).toBeNull();

    await switchMetric(page, "literacy", /^Literacy rate/i);
    // nothing was ever picked, so nothing may be pinned
    expect(new URL(page.url()).searchParams.get("brk")).toBeNull();
  });

  test("a URL-pinned method survives an in-session round trip", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district&brk=continuous");
    await waitForMapReady(page);
    await page.waitForTimeout(900);
    expect(await activeMethod(page)).toBe("SMOOTH");

    await switchMetric(page, "sex ratio", /^Sex ratio/i);
    await switchMetric(page, "literacy", /^Literacy rate/i);

    expect(await activeMethod(page)).toBe("SMOOTH");
    expect(new URL(page.url()).searchParams.get("brk")).toBe("continuous");
  });

  test("your own pick outranks the link's pin, and survives a round trip", async ({ page }) => {
    // The mirror of the case below. `init` is frozen at mount, so a pin that wins
    // unconditionally keeps winning all session: pick a method on a pinned link, hop
    // away and back, and the map silently reverts and rewrites the address bar —
    // a method the user did not choose, stamped into the share link, which is this
    // item's own defect family.
    await page.goto("/?m=literacy_rate&lvl=district&brk=continuous");
    await waitForMapReady(page);
    await page.waitForTimeout(900);
    expect(await activeMethod(page)).toBe("SMOOTH");

    await page.locator("[data-scale-toggle]").click();
    const popover = page.getByRole("dialog", { name: /Scale options/i });
    await expect(popover).toBeVisible();
    await popover.getByRole("button", { name: "JENKS" }).click();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    expect(await activeMethod(page)).toBe("JENKS");

    await switchMetric(page, "sex ratio", /^Sex ratio/i);
    await switchMetric(page, "literacy", /^Literacy rate/i);

    expect(await activeMethod(page)).toBe("JENKS");
    expect(new URL(page.url()).searchParams.get("brk")).toBe("jenks");
  });

  test("a restored pick reaches the share link, even when it equals the default", async ({ page, context }) => {
    // readUrl() defaults to "jenks", so restoring a stored pick of jenks is a no-op
    // state write: React bails out, the URL effect never re-runs, and the link the
    // sender copies renders the metric's automatic default to everyone else. A
    // stored pick of quantile did reach the URL, which is why this hid for so long.
    await page.addInitScript(() => {
      localStorage.setItem("mapsofbharat-atlas-v1",
        JSON.stringify({ methodByMetric: { literacy_rate: "jenks" }, reverse: false }));
    });
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await page.waitForTimeout(900);

    expect(await activeMethod(page)).toBe("JENKS");
    expect(new URL(page.url()).searchParams.get("brk")).toBe("jenks");

    // and the copied link must render the same thing for someone else
    const copied = page.url();
    const recipient = await context.newPage();
    await recipient.goto(copied);
    await waitForMapReady(recipient);
    await recipient.waitForTimeout(900);
    await recipient.locator("[data-scale-toggle]").click();
    const pop = recipient.getByRole("dialog", { name: /Scale options/i });
    await expect(pop).toBeVisible();
    expect((await pop.locator('button[aria-pressed="true"]').first().innerText()).trim()).toBe("JENKS");
    await recipient.close();
  });

  test("a URL pin outranks the recipient's own stored pick for that metric", async ({ page }) => {
    // A pin is the sender's instruction about what the link shows. A stored pick
    // silently overriding it — and then overwriting it in the address bar — is the
    // same class of leak as the item's own title.
    await page.addInitScript(() => {
      localStorage.setItem("mapsofbharat-atlas-v1",
        JSON.stringify({ methodByMetric: { literacy_rate: "jenks" }, reverse: false }));
    });
    await page.goto("/?m=literacy_rate&lvl=district&brk=continuous");
    await waitForMapReady(page);
    await page.waitForTimeout(900);

    expect(await activeMethod(page)).toBe("SMOOTH");
    expect(new URL(page.url()).searchParams.get("brk")).toBe("continuous");
  });
});

test.describe("popover dismissal (item 764)", () => {
  // The selection probe MUST be something that is absent when nothing is selected.
  // A first draft used getByText(/percentile|rank/i).first(), which silently resolved
  // to the always-present rail heading "Ranked by <metric>" — so the assertion passed
  // with the selection destroyed, and the guard could not fail. A test that cannot
  // fail is worse than no test: the next reader counts it as coverage.
  const selectionProbe = (page: Page) => page.getByRole("button", { name: "Clear selection" });

  async function selectARegion(page: Page) {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await page.locator("aside button").filter({ hasText: /\d/ }).first().click();
    await expect(selectionProbe(page)).toBeVisible({ timeout: 10_000 });
  }

  test("Escape closes the scale popover without discarding the map selection", async ({ page }) => {
    await selectARegion(page);
    await page.locator("[data-scale-toggle]").click();
    const popover = page.getByRole("dialog", { name: /Scale options/i });
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    // Escape dismisses the topmost layer ONLY — the selection must survive
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape on the cohort dropdown preserves the map selection", async ({ page }) => {
    await selectARegion(page);
    const toggle = page.getByRole("button", { name: /All states|Top 10/i }).first();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape on the share menu preserves the map selection", async ({ page }) => {
    await selectARegion(page);
    await page.getByRole("button", { name: /Share this view/i }).click();
    const menu = page.getByRole("menu", { name: /Share options/i });
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(selectionProbe(page)).toBeVisible();
  });

  test("Escape with no popover open still clears the selection", async ({ page }) => {
    // The counterpart to the three above: stopPropagation must not starve the
    // map's own Escape handler when there is no layer above it (item 405).
    await selectARegion(page);
    await page.keyboard.press("Escape");
    await expect(selectionProbe(page)).toBeHidden();
  });

  test("the scale trigger is not a dead toggle", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    const trigger = page.locator("[data-scale-toggle]");
    const popover = page.getByRole("dialog", { name: /Scale options/i });

    await trigger.click();
    await expect(popover).toBeVisible();
    await trigger.click(); // outside the panel: the dismiss must not fight the toggle
    await expect(popover).toBeHidden();
    await trigger.click();
    await expect(popover).toBeVisible();
  });

  test("clicking outside closes the cohort dropdown", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    const toggle = page.getByRole("button", { name: /All states|Top 10/i }).first();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.mouse.click(12, 12);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

// ── taxonomy maps + attribution (to-dos 339, 340, 336-338) ────────────────────
// The item-751 test above walks the BROWSE path, and orderedCategories() appends
// unknown categories, so a category missing from CAT_ORDER still renders and that
// test still passes. CAT_DESC was asserted by neither case — which is how three
// categories came to credit the wrong source for most of their metrics. These
// assert the four maps directly.

const STOP = new Set([
  "data", "gov", "district", "districtwise", "wise", "table", "tables", "report",
  "annual", "survey", "statistics", "statistical", "ministry", "department", "dept",
  "national", "india", "indian", "state", "states", "union", "via", "from", "year",
  "estimates", "estimate", "resource", "government", "office", "registrar", "general",
  "directorate", "economics", "March", "march", "yearend", "book", "booklet", "school",
  "education", "level", "levels", "with", "and", "the", "for", "per",
]);

const words = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z0-9&+]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

test.describe("category taxonomy maps (to-do 339)", () => {
  test("every live category has an entry in all four maps, and none is stale", async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { category: string }[];
    };
    const live = [...new Set(metrics.map((m) => m.category))].sort();
    expect(live.length).toBeGreaterThan(0);

    for (const c of live) {
      expect(CAT_ORDER, `${c} missing from CAT_ORDER`).toContain(c);
      expect(CAT_DESC[c], `${c} missing from CAT_DESC`).toBeTruthy();
      expect(CAT_ACCENT[c], `${c} missing from CAT_ACCENT`).toBeTruthy();
      expect(CAT_ICON[c], `${c} missing from CAT_ICON`).toBeTruthy();
    }
    // and nothing lingers for a category that no longer exists
    const liveSet = new Set(live);
    for (const c of CAT_ORDER) expect(liveSet, `CAT_ORDER has stale ${c}`).toContain(c);
    for (const c of Object.keys(CAT_DESC)) expect(liveSet, `CAT_DESC has stale ${c}`).toContain(c);
  });
});

test.describe("category descriptions credit the right source (to-do 340)", () => {
  // Data-driven: any source family covering a large share of a category's metrics
  // must be NAMED in that category's description. This one assertion is what would
  // have caught to-dos 336, 337 and 338 together — education crediting UDISE+ for
  // five ASER metrics, labour crediting PLFS for six MGNREGA ones, agriculture
  // crediting APY for five Livestock Census ones.
  const SHARE = 0.4;

  test(`every source family >= ${SHARE * 100}% of a category is named in its description`, async ({ request }) => {
    const { metrics } = (await (await request.get("/api/metrics")).json()) as {
      metrics: { id: string; category: string; source: string }[];
    };
    const byCat = new Map<string, typeof metrics>();
    for (const m of metrics) byCat.set(m.category, [...(byCat.get(m.category) ?? []), m]);

    const failures: string[] = [];
    for (const [cat, ms] of byCat) {
      const desc = CAT_DESC[cat];
      // a description that names no source at all makes no claim to check
      if (!desc || !desc.includes("—")) continue;
      const claimed = words(desc.split("—").slice(1).join(" "));

      const groups = new Map<string, number>();
      for (const m of ms) groups.set(m.source, (groups.get(m.source) ?? 0) + 1);
      for (const [src, n] of groups) {
        if (n / ms.length < SHARE) continue;
        const overlap = [...words(src)].filter((w) => claimed.has(w));
        if (!overlap.length)
          failures.push(
            `${cat}: ${n}/${ms.length} metrics come from "${src.slice(0, 70)}…" ` +
            `but the description names none of it — "${desc}"`,
          );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

// ── as-reported-2011 state view (to-do 346) ───────────────────────────────────
test.describe("2011 vintage at state level paints (to-do 346)", () => {
  // /api/metrics?level=state2011 keys states as zero-padded "01".."35", and the
  // vintage geojson's promoteId is the same padded st_code — but the name index was
  // built with String(Number(st_code)), giving "1".."35". allCodes("states2011")
  // reads those keys, so every state looked up as undefined: the entire 2011 state
  // map painted no-data, and the ranking rail showed bare codes instead of names.
  // Pre-existing on main since the vintage toggle shipped; district-2011 was fine.
  test("every state carries a value, and the rail names them", async ({ page, request }) => {
    const api = (await (await request.get("/api/metrics/literacy_rate?level=state2011")).json()) as {
      values: Record<string, number>;
    };
    const codes = Object.keys(api.values);
    expect(codes.length).toBeGreaterThan(30);
    // the premise: the API really does pad its keys
    expect(codes.some((c) => /^0\d$/.test(c))).toBe(true);

    await page.goto("/?m=literacy_rate&lvl=state&vin=2011");
    await waitForMapReady(page);

    // the legend's class counts are computed over the painted entries, so if the
    // key mismatch is back they sum to zero rather than to the state count
    const counts = await page.locator("[data-legend-count]").allInnerTexts();
    const total = counts.reduce((a, c) => a + (Number(c.replace(/,/g, "")) || 0), 0);
    expect(total).toBeGreaterThan(30);

    // and the rail resolves NAMES, not bare codes — the second symptom of the same
    // bug, since Entry.name falls back to the code when the index misses. Asserted
    // by naming states that exist in the 2011 vintage (no Telangana, no Ladakh,
    // undivided AP). Not by "no 0N text anywhere in the rail": the rank badges are
    // themselves zero-padded, so that matches nine legitimate rows.
    const rail = page.locator("aside");
    for (const name of ["Kerala", "Maharashtra", "Bihar", "Punjab"])
      await expect(rail.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });
});
