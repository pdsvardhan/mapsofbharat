import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

// WCAG 2.1 AA gate (iter-44, TEC-21 / risk 57).
//
// Risk 57 was deferred on 2026-06-10 with only cheap code-level fixes shipped —
// aria-labels on the map controls, aria-pressed on the toggles, colour-vision-safe
// ramps — and a real audit had never run. When one finally did, on 2026-08-26, it
// found 78 failing nodes across four serious rules, none of them on the atlas.
//
// WCAG 2.1 AA TAGS ONLY. axe also ships "best-practice" rules, which are opinions
// rather than the standard; mixing them in would inflate a compliance number with
// findings nobody agreed to be held to. If you want them, run them in a separate,
// non-blocking report — do not fold them in here.
//
// WHAT THIS CANNOT DO, stated so nobody reads a green as "the site is accessible":
// automated rules catch roughly a third of WCAG. Everything this file adds BELOW
// the axe sweep — focus visibility, the dialog keyboard contract, reflow — exists
// because axe reported the atlas perfectly clean while the metric chooser was
// letting focus walk straight out of an open dialog.

const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

/** Every route a reader can reach, with what proves it actually rendered.
 *
 *  `ready` is not decoration. A scan of a page that never mounted passes
 *  trivially, and this project has shipped exactly that kind of green before, so
 *  every route names a selector that only exists once the real content is there
 *  and the scan refuses to run until it appears. */
type Route = {
  path: string;
  ready: string;
  name: string;
  /** Floors the page must clear before it is worth auditing. */
  minText: number;
  minLinks: number;
};

/** Every route a reader can reach, with what proves it actually rendered.
 *
 *  `ready: "main"` USED TO BE THE MARKER FOR EIGHT OF THESE, AND IT PROVED
 *  NOTHING: <main> is the page component's own wrapper, so it is present whatever
 *  the component renders, and the guard only required one character of text. The
 *  iter-44 code verifier replaced /coverage's entire body with "Loading…" and all
 *  three of its tests reported clean — the 18 dt/dd nodes item 1052 was about had
 *  vanished and the suite said the page was fine.
 *
 *  So each route now names a selector only its real content produces, plus floors
 *  taken from what the page actually renders today and set well below it. A page
 *  that half-renders fails here instead of passing an audit of nothing. */
const ROUTES: Route[] = [
  { path: "/", ready: "canvas", name: "atlas", minText: 100, minLinks: 0 },
  { path: "/metric", ready: "a[href^='/metric/']", name: "metric index", minText: 3000, minLinks: 100 },
  { path: "/metric/literacy_rate", ready: '[data-oid="metric-rank-table"]', name: "metric detail", minText: 5000, minLinks: 5 },
  { path: "/family", ready: "a[href^='/family/']", name: "family index", minText: 800, minLinks: 8 },
  { path: "/family/religion", ready: "figure", name: "family detail", minText: 500, minLinks: 5 },
  { path: "/coverage", ready: "dl dt", name: "coverage", minText: 3000, minLinks: 100 },
  { path: "/methodology", ready: "a[href^='http']", name: "methodology", minText: 20000, minLinks: 40 },
  { path: "/corrections", ready: "form", name: "corrections", minText: 500, minLinks: 3 },
  { path: "/terms", ready: "main h2", name: "terms", minText: 1500, minLinks: 3 },
  { path: "/privacy", ready: "main h2", name: "privacy", minText: 1500, minLinks: 3 },
  { path: "/embed?metric=literacy_rate", ready: "canvas", name: "embed", minText: 0, minLinks: 0 },
  { path: "/does-not-exist", ready: "main nav a", name: "404", minText: 200, minLinks: 4 },
];

async function settle(page: Page, ready: string) {
  await page.waitForSelector(ready, { timeout: 30_000 });
  // The map paints after mount; give it a beat so axe sees the real control set.
  await page.waitForTimeout(1500);
}

function report(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations
    .map((v) => {
      const where = v.nodes
        .slice(0, 4)
        .map((n) => `      ${n.target.join(" ")}`)
        .join("\n");
      return `  [${v.impact}] ${v.id} — ${v.nodes.length} node(s)\n    ${v.help}\n${where}`;
    })
    .join("\n\n");
}

for (const vp of [
  { label: "desktop", size: DESKTOP },
  { label: "mobile", size: MOBILE },
]) {
  test.describe(`WCAG 2.1 AA — ${vp.label}`, () => {
    test.use({ viewport: vp.size });

    for (const route of ROUTES) {
      test(`${route.name} (${route.path}) has no WCAG 2.1 AA violations`, async ({ page }) => {
        await page.goto(route.path);
        await settle(page, route.ready);

        // Vacuity guard: prove there is a PAGE to audit before auditing it, with
        // floors that a half-rendered page cannot clear. `> 0` did not qualify —
        // eight characters of "Loading…" satisfied it.
        const rendered = await page.evaluate(() => ({
          text: document.body.innerText.trim().length,
          links: document.querySelectorAll("a[href]").length,
        }));
        expect(
          rendered.text,
          `${route.path} rendered ${rendered.text} chars, below its floor of ${route.minText} — a clean axe result here would be auditing nothing`
        ).toBeGreaterThanOrEqual(route.minText);
        expect(
          rendered.links,
          `${route.path} rendered ${rendered.links} links, below its floor of ${route.minLinks}`
        ).toBeGreaterThanOrEqual(route.minLinks);

        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(
          violations.length,
          violations.length ? `\n${report(violations)}\n` : ""
        ).toBe(0);
      });
    }
  });
}

test.describe("what axe cannot see", () => {
  test.use({ viewport: DESKTOP });

  test("prose links are VISIBLY underlined, not merely styled", async ({ page }) => {
    // axe's link-in-text-block has a blind spot, found by mutating this fix.
    //
    // Setting `text-decoration-line: none` while leaving `text-underline-offset`
    // and `text-decoration-thickness` in place keeps axe happy — the link's
    // decoration properties still differ from its parent's, which its heuristic
    // accepts as "distinguished by something other than colour". Measured: with
    // the line removed but the other two kept, axe reported ZERO violations on
    // /methodology while nothing was underlined on screen. Removing the whole
    // rule brought all 16 back.
    //
    // So axe cannot be the only guard here. This asserts what a reader actually
    // sees: the line itself. Without it, a future tidy-up that drops
    // `text-decoration-line` ships a green suite and an invisible affordance.
    await page.goto("/methodology");
    await page.waitForSelector("main", { timeout: 30_000 });

    const links = await page.evaluate(() => {
      const out: { text: string; deco: string }[] = [];
      for (const a of Array.from(document.querySelectorAll<HTMLElement>("main a[href]"))) {
        // WHETHER A LINK IS "IN A TEXT BLOCK" IS DECIDED FROM THE DOM, NEVER FROM
        // THE OPT-OUT CLASS. The first version skipped any link carrying
        // `no-underline`, which made the opt-out self-policing: adding that class
        // to a genuinely in-text link removed the underline and this test skipped
        // it. Proven by the iter-44 code verifier — one class on
        // app/methodology/page.tsx's Source link stripped the underline from 58
        // links, the exact nodes item 1051 was raised for, and the suite reported
        // 35/35 green. axe could not catch it either, because `no-underline` sets
        // only `text-decoration-line`, leaving offset and thickness in place —
        // its documented blind spot. Both guards had their hole in the same
        // place.
        //
        // The rule now: prose is text in the parent that is NOT itself inside a
        // link. A paragraph reading "See the [coverage table] for …" leaves plenty
        // once its links are removed, so its link is judged. A composed card, or a
        // nav of four cards, is nothing BUT link text, so it is not — no class
        // consulted, and an opt-out on a prose link now fails here.
        const parent = a.parentElement;
        if (!parent) continue;
        const parentText = (parent.textContent || "").trim().length;
        const linkTextInParent = Array.from(parent.querySelectorAll("a[href]")).reduce(
          (n, el) => n + (el.textContent || "").trim().length,
          0
        );
        if (parentText - linkTextInParent < 12) continue;
        out.push({
          text: (a.textContent || "").trim().slice(0, 40),
          deco: getComputedStyle(a).textDecorationLine,
        });
      }
      return out;
    });

    // Fixture power: /methodology carries many in-text source links. If this ever
    // drops to nothing the page changed shape and the test proves nothing.
    expect(links.length, "found no in-text links to check — fixture lost its power").toBeGreaterThan(5);

    const bare = links.filter((l) => !l.deco.includes("underline"));
    expect(
      bare,
      `in-text links with no underline:\n  ${bare.map((b) => `"${b.text}" -> ${b.deco}`).join("\n  ")}`
    ).toEqual([]);
  });

  test("every interactive control on the atlas shows a visible focus indicator", async ({ page }) => {
    await page.goto("/");
    await settle(page, "canvas");

    const bare = await page.evaluate(() => {
      // DISABLED CONTROLS ARE EXCLUDED, and that is not a convenience.
      // The first version of this test reported the CARD export button as having
      // no focus indicator. It has one — it was `disabled` at the time (it stays
      // disabled until a metric is picked), a disabled control is not focusable
      // by definition, `:focus-visible` can never match it, and calling .focus()
      // on it does nothing. The test was measuring a control that cannot receive
      // focus and calling the absence of a focus ring a defect. Every enabled
      // control on the atlas passes.
      const els = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href],button,select,input,[tabindex]:not([tabindex='-1'])"
        ),
      ].filter(
        (e) =>
          e.offsetParent !== null &&
          !(e as HTMLButtonElement).disabled &&
          e.getAttribute("aria-disabled") !== "true"
      );

      const out: string[] = [];
      for (const e of els) {
        const b = getComputedStyle(e);
        const before = `${b.outlineStyle}|${b.outlineWidth}|${b.boxShadow}|${b.borderColor}`;
        e.focus();
        const a = getComputedStyle(e);
        const after = `${a.outlineStyle}|${a.outlineWidth}|${a.boxShadow}|${a.borderColor}`;
        if (before === after) {
          out.push(
            `${e.tagName}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${(
              e.textContent || ""
            )
              .trim()
              .slice(0, 30)}`
          );
        }
      }
      return { total: els.length, bare: out };
    });

    // Would pass on an empty page otherwise — the atlas has ~20 controls.
    expect(bare.total, "found no interactive controls; the atlas did not mount").toBeGreaterThan(10);
    expect(bare.bare, `controls with no focus indicator:\n  ${bare.bare.join("\n  ")}`).toEqual([]);
  });

  test("an open dialog keeps the keyboard inside it and gives focus back", async ({ page }) => {
    await page.goto("/");
    await settle(page, "canvas");

    const opener = page.getByRole("button", { name: /browse indicators/i }).first();
    await opener.waitFor({ timeout: 15_000 });
    await opener.focus();
    await opener.click();

    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ timeout: 10_000 });

    // 1. It announces itself as modal, so assistive tech hides the rest.
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // 2. Focus moves INTO it — otherwise the reader is left outside what they opened.
    await expect
      .poll(() => dialog.evaluate((d) => d.contains(document.activeElement)), { timeout: 5_000 })
      .toBe(true);

    // 3. Tab wraps at the EDGES, which is the only place a trap is observable.
    //
    //    The first version of this pressed Tab thirty times and asserted focus
    //    stayed inside. Mutation proved it worthless: the chooser holds far more
    //    than thirty tab stops, so focus never reached an edge and the assertion
    //    passed identically with the trap disabled. Walking to the boundary and
    //    stepping off it is the case that discriminates.
    const stops = await dialog.evaluate((d) =>
      [...d.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
      )].filter((e) => e.offsetParent !== null || e.getBoundingClientRect().width > 0).length
    );
    expect(stops, "dialog exposes no tab stops; nothing to trap").toBeGreaterThan(1);

    // Forward off the last element must land back on the first.
    await dialog.evaluate((d) => {
      const els = [...d.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
      )].filter((e) => e.offsetParent !== null || e.getBoundingClientRect().width > 0);
      els[els.length - 1].focus();
    });
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      "Tab off the LAST control left the dialog — the focus trap is not wrapping"
    ).toBe(true);

    // And backward off the first must land back on the last.
    await dialog.evaluate((d) => {
      const els = [...d.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
      )].filter((e) => e.offsetParent !== null || e.getBoundingClientRect().width > 0);
      els[0].focus();
    });
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      "Shift+Tab off the FIRST control left the dialog — the focus trap is not wrapping"
    ).toBe(true);

    // 4. Escape closes it and focus returns to what opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect
      .poll(() => opener.evaluate((el) => el === document.activeElement), { timeout: 5_000 })
      .toBe(true);
  });
});

test.describe("focus cannot be left outside an open dialog", () => {
  test.use({ viewport: DESKTOP });

  // The keydown handler only sees Tab. Focus can leave a dialog by other routes —
  // a click on the page behind, a stray programmatic focus, or a re-render moving
  // the element the Tab handler had snapshotted as last. The focusin backstop
  // exists for those, and until this test it had NOTHING asserting it: the code
  // verifier removed the listener and the whole suite stayed green.
  test("focus landing outside an open dialog is pulled back in", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForTimeout(1500);

    // PHASE 1, dialog CLOSED — prove the element is stealable at all. Without
    // this the test could pass on a page where nothing outside can take focus,
    // which is the vacuous version of this check.
    // PHASE 1, dialog CLOSED — find an element that can REALLY take focus and
    // mark it, rather than naming a selector up front. A hard-coded target made
    // this pass alone and fail in the full suite: under load the atlas chrome had
    // not finished mounting, the selector matched nothing, and phase 1 failed for
    // a reason that had nothing to do with what is being tested.
    await page.waitForFunction(() => document.querySelectorAll("button").length > 5, {
      timeout: 30_000,
    });

    const stealable = await page.evaluate(() => {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("button,a[href],input,select,[tabindex]")
      )) {
        if (el.closest('[role="dialog"]')) continue;
        el.focus();
        if (document.activeElement === el) {
          el.setAttribute("data-a11y-steal", "1");
          return { ok: true, on: el.tagName + " " + (el.getAttribute("aria-label") || "").slice(0, 28) };
        }
      }
      return { ok: false, on: document.activeElement?.tagName ?? "none" };
    });
    expect(
      stealable.ok,
      `nothing outside a dialog could take focus (${stealable.on}) — phase 2 would prove nothing`
    ).toBe(true);

    // PHASE 2, dialog OPEN — the same element grabs focus, and it must not stick.
    //
    // Note what is NOT asserted: that focus is ever observed RESTING outside. It
    // cannot be. focusin fires synchronously with the steal, so a working backstop
    // pulls focus back before the next statement runs — an earlier version
    // asserted the steal "succeeded" and so failed whenever the backstop was doing
    // its job, and passed when it was removed. The observable claim is the
    // OUTCOME: after something outside grabs focus, focus ends up inside the
    // dialog. Remove the listener and it does not.
    const opener = page.getByRole("button", { name: /browse indicators/i }).first();
    await opener.click();
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ timeout: 10_000 });

    const stillThere = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-a11y-steal]");
      if (!el) return false;
      el.focus();
      return true;
    });
    expect(stillThere, "the marked element vanished when the dialog opened").toBe(true);

    await expect
      .poll(() => dialog.evaluate((d) => d.contains(document.activeElement)), { timeout: 4_000 })
      .toBe(true);
  });
});

test.describe("Escape closes an overlay without taking anything else with it", () => {
  test.use({ viewport: DESKTOP });

  // The dialog-contract test above drives the chooser only. That is how a real
  // defect stayed invisible: the social export dialog closed on Escape and
  // returned focus correctly, while the SAME keypress fell through to the map's
  // window handler and discarded the reader's drill-down. Closing correctly is
  // not the whole contract — Escape must also leave everything else alone.
  test("Escape on the export dialog keeps the map where the reader put it", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Pick an indicator so the export dialog is enabled, then drill into a state.
    await page.getByRole("button", { name: /browse indicators/i }).first().click();
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /literacy rate/i }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(2500);

    const crumbsBefore = await page.evaluate(() => document.body.innerText.slice(0, 400));

    const card = page.getByRole("button", { name: /export a social media card/i }).first();
    await card.waitFor({ timeout: 15_000 });
    if (await card.isDisabled()) test.skip(true, "export stayed disabled; no metric data to card");
    await card.click();

    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 8_000 });
    await page.waitForTimeout(1200);

    const crumbsAfter = await page.evaluate(() => document.body.innerText.slice(0, 400));
    expect(
      crumbsAfter,
      "Escape closed the export dialog AND changed the map behind it — the keypress leaked to the map's own Escape handler"
    ).toBe(crumbsBefore);
  });
});

test.describe("WCAG 1.4.10 reflow — no sideways scrolling at 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  for (const route of ROUTES.filter((r) => r.path !== "/embed?metric=literacy_rate")) {
    test(`${route.name} reflows at 320px`, async ({ page }) => {
      await page.goto(route.path);
      await settle(page, route.ready);

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        let worst = "";
        let right = 0;
        for (const e of Array.from(document.querySelectorAll("*"))) {
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.right > right) {
            right = r.right;
            worst = `${e.tagName}.${String((e as HTMLElement).className || "").slice(0, 60)}`;
          }
        }
        return { scrollW: de.scrollWidth, clientW: de.clientWidth, worst, right: Math.round(right) };
      });

      // 1px of tolerance for sub-pixel rounding, not for a real overflow.
      expect(
        m.scrollW,
        `document scrolls sideways at 320px: scrollWidth ${m.scrollW} vs clientWidth ${m.clientW}.\n` +
          `The widest ELEMENT is ${m.worst} reaching ${m.right}px — but do not start there. ` +
          `An element can render wide inside its own overflow-auto box without the document ` +
          `scrolling at all (the rank table does exactly that), and the real cause is often ` +
          `TEXT with no box of its own: an unbreakable token such as a URL overflows while its ` +
          `paragraph stays narrow, which is how this was missed the first time. Bisect by hiding ` +
          `sections until scrollWidth drops.`
      ).toBeLessThanOrEqual(m.clientW + 1);
    });
  }
});
