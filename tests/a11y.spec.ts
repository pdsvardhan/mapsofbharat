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
const ROUTES: { path: string; ready: string; name: string }[] = [
  { path: "/", ready: "canvas", name: "atlas" },
  { path: "/metric", ready: "main", name: "metric index" },
  { path: "/metric/literacy_rate", ready: '[data-oid="metric-rank-table"]', name: "metric detail" },
  { path: "/family", ready: "main", name: "family index" },
  { path: "/coverage", ready: "main", name: "coverage" },
  { path: "/methodology", ready: "main", name: "methodology" },
  { path: "/corrections", ready: "main", name: "corrections" },
  { path: "/terms", ready: "main", name: "terms" },
  { path: "/privacy", ready: "main", name: "privacy" },
  { path: "/embed?metric=literacy_rate", ready: "canvas", name: "embed" },
  { path: "/does-not-exist", ready: "main", name: "404" },
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

        // Vacuity guard: prove there is a page to audit before auditing it.
        const rendered = await page.evaluate(() => ({
          text: document.body.innerText.trim().length,
          interactive: document.querySelectorAll("a[href],button,input,select,textarea").length,
        }));
        expect(
          rendered.text + rendered.interactive,
          `${route.path} rendered nothing worth scanning — a clean axe result here would be meaningless`
        ).toBeGreaterThan(0);

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
        // Only links sitting INSIDE running text — the ones the rule governs.
        // Card-shaped links carry `no-underline` deliberately (see globals.css).
        if (a.classList.contains("no-underline")) continue;
        if (a.closest("nav")) continue;
        const parent = a.parentElement;
        if (!parent) continue;
        const parentText = (parent.textContent || "").trim().length;
        const linkText = (a.textContent || "").trim().length;
        // "In a text block" = the parent holds meaningfully more text than the link.
        if (parentText - linkText < 12) continue;
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
        `document scrolls sideways at 320px: scrollWidth ${m.scrollW} vs clientWidth ${m.clientW}. Widest element ${m.worst} reaches ${m.right}px.`
      ).toBeLessThanOrEqual(m.clientW + 1);
    });
  }
});
