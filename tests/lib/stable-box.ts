import type { Locator, Page } from "@playwright/test";

// A layout box, read only once the layout has stopped moving (#608).
//
// WHY THIS EXISTS. `expect(loc).toBeVisible()` resolves the moment the element is in
// the layout. It says nothing about whether the layout has FINISHED. Anything that
// reads boundingBox() straight afterwards is sampling a position that may still be
// on its way somewhere, and on this site there is a real journey: the toolbar's
// anchor is derived from the map plate's width, and the plate is resized by the
// right rail after hydration. A read inside that window returns coordinates no
// reader ever sees — which is how a correct toolbar gets reported as off-screen.
//
// WHY IT IS NOT A LONGER TIMEOUT. Waiting longer for VISIBLE still fires at the same
// wrong moment; it is the wrong event, not too short a wait. The window's width is
// what changes with machine load, which is why such a spec is green alone and red in
// a full suite — the failure is timing, but the defect is measuring during motion.
//
// WHY IT LIVES HERE AND NOT IN scripts/lib/*.cjs. The rest of this repo's shared
// test logic is node-side and lives in a .cjs, because a spec that imports a .mjs
// dies under Node >= 20.19.5 (#610). This helper is not node-side logic: it drives a
// Locator. A .ts under tests/lib is transformed by Playwright like any spec and is
// not itself collected as one — testMatch only takes *.spec.ts.
//
// tests/stable-box.spec.ts proves it against an element that is deliberately still
// moving, and shows the naive read getting the wrong answer on the same element.

export type Box = { x: number; y: number; width: number; height: number };

/** Two boxes are the same to within a subpixel. */
export const BOX_EPSILON = 0.5;

export function boxesAgree(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) <= BOX_EPSILON
    && Math.abs(a.y - b.y) <= BOX_EPSILON
    && Math.abs(a.width - b.width) <= BOX_EPSILON
    && Math.abs(a.height - b.height) <= BOX_EPSILON;
}

/**
 * The element's box once two consecutive animation frames agree on it.
 *
 * Throws rather than returning a best guess if it never settles: a box that is still
 * moving is not a measurement, and quietly returning one would put this helper in the
 * same family as the guards that reported success while measuring nothing.
 */
export async function stableBoundingBox(
  page: Page,
  loc: Locator,
  label: string,
  timeout = 10_000,
): Promise<Box | null> {
  const deadline = Date.now() + timeout;
  let last = await loc.boundingBox();
  let samples = 1;

  while (Date.now() < deadline) {
    // Two nested rAFs: the first lands in the current frame, the second guarantees a
    // full frame has been composited between the samples.
    await page.evaluate(
      () => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const next = await loc.boundingBox();
    samples += 1;

    // A null box is a real answer — the element left the layout — and it settles the
    // same way: two consecutive nulls mean it is staying gone.
    if (last === null && next === null) return null;
    if (last && next && boxesAgree(last, next)) return next;
    last = next;
  }

  throw new Error(
    `${label}: the layout never settled within ${timeout}ms (${samples} samples). `
    + `Last box: ${JSON.stringify(last)}. Two consecutive frames never agreed, so any `
    + `position read here would be a snapshot of something still in motion.`,
  );
}
