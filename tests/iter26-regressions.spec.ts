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

// ── item-760 adaptive stroke invariant (to-do 349) ────────────────────────────
// item 760 made every region's boundary seam ADAPTIVE: instead of one fixed warm-
// white hairline everywhere, each seam is derived from the fill it borders via
// strokeForFill() in lib/breaks.ts — a dark seam cut into a pale fill, a soft light
// seam over a saturated one — so the boundary stays legible at both ends of every
// ramp. The seam lives entirely in MapLibre feature-state ("stroke"), never the DOM,
// so nothing in typecheck, lint, or a screenshot would notice a future recolor round
// quietly regressing it to a constant. These read the live map through the instance
// the component parks on window.__mob_map (india-map.tsx) and pin the three pieces of
// the invariant directly:
//   1. every region carries a seam at all;
//   2. the seam is DERIVED per region from its own fill — both treatments occur, the
//      map splits cleanly by fill luminance, and the two seams are luminance-separated;
//   3. the state-outline context layer is hidden at state level (there state-line
//      already draws that geometry, and two stacked strokes were half the reason the
//      boundaries read as heavy white — item 760 / to-do 348).

/** Rec. 709 relative luminance of "rgb(r,g,b)" / "rgb(r, g, b)" / "#rrggbb", 0..1.
 *  A verification helper only: it mirrors the standard luminance formula the map
 *  reasons about, NOT strokeForFill's 0.55 threshold, so these tests stay black-box
 *  — they read the seams the app actually painted and check their shape rather than
 *  re-implementing the rule under test. */
function lum(c: string): number {
  let r: number, g: number, b: number;
  const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
  else {
    const h = c.replace("#", "");
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

type Seam = { id: string; color: string | null; stroke: string | null };

/** Every region of the active source, with the fill + seam the last recolor parked
 *  in its MapLibre feature-state. Enumerates the SAME promoteId set recolor()
 *  iterates (allCodes()), read straight from the source geojson, then waits until a
 *  seam has been stamped on every one of them so we never read a half-painted map. */
async function readSeams(page: Page, level: "state" | "district"): Promise<{ total: number; seams: Seam[] }> {
  return await page.evaluate(async (lvl) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const map = (window as unknown as { __mob_map?: any }).__mob_map;
    const source = lvl === "state" ? "states" : "districts";
    const url = lvl === "state" ? "/geo/states.geojson" : "/geo/districts.geojson";
    const promoteId = lvl === "state" ? "st_code" : "rid";
    const deadline = Date.now() + 20_000;
    while ((!map || !map.getSource || !map.getSource(source)) && Date.now() < deadline) await sleep(150);
    const fc = await fetch(url).then((r) => r.json());
    const ids: string[] = [...new Set((fc.features as any[]).map((f) => String(f.properties[promoteId])))];
    let seams: Seam[] = [];
    while (Date.now() < deadline) {
      seams = ids.map((id) => {
        const s = map.getFeatureState({ source, id }) || {};
        return { id, color: s.color ?? null, stroke: s.stroke ?? null };
      });
      if (seams.every((s) => s.stroke)) break; // recolor has run for every region
      await sleep(150);
    }
    return { total: ids.length, seams };
  }, level);
}

test.describe("item-760 adaptive stroke invariant (to-do 349)", () => {
  test("every painted region carries a boundary seam", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    const { total, seams } = await readSeams(page, "district");
    expect(total).toBeGreaterThan(600); // the district source really loaded
    const bare = seams.filter((s) => !s.stroke).map((s) => s.id);
    expect(bare, `regions with no seam: ${bare.slice(0, 12).join(", ")}`).toEqual([]);
  });

  test("the seam is derived per region from its fill, and the two seams are luminance-separated", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    const { seams } = await readSeams(page, "district");
    const painted = seams.filter((s) => s.color && s.stroke) as { id: string; color: string; stroke: string }[];
    expect(painted.length).toBeGreaterThan(600);

    // group regions by the seam they were given, carrying each region's fill luminance
    const byStroke = new Map<string, number[]>();
    for (const s of painted) {
      const arr = byStroke.get(s.stroke) ?? [];
      arr.push(lum(s.color));
      byStroke.set(s.stroke, arr);
    }

    // (a) BOTH seam treatments actually occur. A constant stroke — the exact
    //     regression this item exists to catch — collapses this to a single value.
    const strokes = [...byStroke.keys()];
    expect(strokes.length, `distinct seams painted: ${strokes.join(" | ")}`).toBeGreaterThanOrEqual(2);

    // (b) the two seams are separated in LUMINANCE: a genuinely dark seam and a
    //     genuinely light one, not two near-identical near-white hairlines.
    const seamLums = strokes.map((c) => ({ c, l: lum(c) })).sort((a, b) => a.l - b.l);
    const dark = seamLums[0];                    // rgba(13,15,20,.75)    ≈ 0.06
    const light = seamLums[seamLums.length - 1]; // rgba(233,227,213,.41) ≈ 0.89
    expect(dark.l, `darkest seam is not dark: ${dark.c}`).toBeLessThan(0.2);
    expect(light.l, `lightest seam is not light: ${light.c}`).toBeGreaterThan(0.6);
    expect(light.l - dark.l).toBeGreaterThan(0.3);

    // (c) DERIVED FROM THE FILL IT BORDERS: the seam is a clean threshold on the
    //     region's OWN fill luminance — the dark seam falls only on pale fills, the
    //     light seam only on saturated ones, with no overlap. This split is what
    //     makes the seam per-region; a constant or fill-independent stroke cannot
    //     produce it.
    const darkFills = byStroke.get(dark.c)!;   // fills wearing the dark seam → must be pale
    const lightFills = byStroke.get(light.c)!; // fills wearing the light seam → must be saturated
    expect(Math.min(...darkFills), "a dark seam landed on a saturated fill")
      .toBeGreaterThan(Math.max(...lightFills));
  });

  test("the state-outline context layer is hidden at state level and drawn over the district map", async ({ page }) => {
    const visibility = () =>
      page.evaluate(() => {
        const map = (window as unknown as { __mob_map?: any }).__mob_map;
        if (!map?.getLayer?.("state-outline")) return "MISSING";
        return map.getLayoutProperty("state-outline", "visibility") ?? "visible";
      });

    // at state level state-line already draws the same geometry, so the outline is
    // suppressed to avoid the double stroke (item 760 / to-do 348)
    await page.goto("/?m=literacy_rate&lvl=state");
    await waitForMapReady(page);
    await expect.poll(visibility, { timeout: 10_000 }).toBe("none");

    // over the DISTRICT map it IS the national context boundary, so it is shown
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await expect.poll(visibility, { timeout: 10_000 }).toBe("visible");
  });
});

// ── state-outline adaptive is the DEFAULT (to-do 348) ─────────────────────────
// to-do 348 flipped the default: the state-outline overlay drawn OVER district
// fills now adapts its colour to the backdrop out of the box (a dark context line
// over a pale map, where the old warm-white washed out into the pale fills), and
// ?outline=fixed opts back. The flip is asserted on the resolved MODE the component
// parks on window.__mob_outline (parallel to window.__mob_map): a colour assertion
// would be metric-dependent — adaptive only diverges from warm-white on a pale map
// (mean fill luminance > 0.55), and quantile breaks put most metrics mid-ramp. The
// colour rule itself (outlineForBackdrop) is pre-existing and exercised by the
// item-760 seam tests above. A future accidental revert of the default fails here.
test.describe("state-outline adaptive is the DEFAULT (to-do 348)", () => {
  const outlineMode = (page: Page) =>
    page.evaluate(() => (window as unknown as { __mob_outline?: string }).__mob_outline ?? "UNSET");
  const outlineColor = (page: Page) =>
    page.evaluate(() => {
      const map = (window as unknown as { __mob_map?: any }).__mob_map;
      if (!map?.getLayer?.("state-outline")) return "MISSING";
      const c = map.getPaintProperty("state-outline", "line-color");
      return typeof c === "string" ? c : JSON.stringify(c);
    });

  test("with no ?outline param the overlay defaults to adaptive (the flip)", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district");
    await waitForMapReady(page);
    await expect.poll(() => outlineMode(page), { timeout: 10_000 }).toBe("adaptive");
  });

  test("?outline=fixed opts back to fixed, and the layer wears the warm-white", async ({ page }) => {
    await page.goto("/?m=literacy_rate&lvl=district&outline=fixed");
    await waitForMapReady(page);
    await expect.poll(() => outlineMode(page), { timeout: 10_000 }).toBe("fixed");
    // not a stale adaptive colour left behind — the layer really shows the warm-white
    await expect
      .poll(async () => lum(await outlineColor(page)), { timeout: 10_000 })
      .toBeGreaterThan(0.6); // rgba(233,227,213,0.26)
  });
});
