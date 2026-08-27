import { test, expect } from "@playwright/test";
import { stableBoundingBox, boxesAgree } from "./lib/stable-box";

// #608 — measuring a box while the layout is still moving.
//
// The two specs this was written for were green in isolation and red under full
// suite load, and neither reproduced on demand: two full runs on this box (2
// workers, 3.2m; 6 workers, 1.5m) came back 450/450. A flake you cannot summon is
// not a flake you may hand-wave — so instead of asserting against a failure that
// will not appear, this file reproduces the MECHANISM directly, in a page built to
// hold still for exactly as long as the real one does.
//
// An element that is visible immediately and then travels for ~600ms. That is the
// shape of the real thing: the toolbar is in the layout at once, and its anchor
// moves afterwards when the right rail resizes the map plate.
//
// The naive read is asserted to get the WRONG answer here. That is deliberate. If
// it ever agreed with the settled read, this page would have stopped reproducing
// the mechanism and the case for the helper would have to be made again from
// measurement rather than from this file's say-so.

const MOVING_PAGE = `
<!doctype html>
<style>
  body { margin: 0; }
  #box { position: absolute; top: 40px; left: 0; width: 120px; height: 30px; background: #333; }
</style>
<div id="box"></div>
<script>
  // Travel 0 -> 300px over ~600ms, then stop for good.
  const el = document.getElementById('box');
  const start = performance.now();
  const DURATION = 600, TARGET = 300;
  function step(now) {
    const t = Math.min(1, (now - start) / DURATION);
    el.style.left = (TARGET * t) + 'px';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
</script>
`;

test.describe("stableBoundingBox (#608)", () => {
  test("the naive read samples mid-motion; the settled read does not", async ({ page }) => {
    await page.setContent(MOVING_PAGE);
    const box = page.locator("#box");
    await expect(box).toBeVisible();

    // Exactly what expectHorizontallyOnScreen used to do: visible, then measure.
    const naive = await box.boundingBox();
    expect(naive, "the element should have a box at all").not.toBeNull();

    const settled = await stableBoundingBox(page, box, "#box");
    expect(settled, "the settled read should return a box").not.toBeNull();

    // The settled read is the destination, and it is stable: a second read agrees.
    expect(settled!.x).toBeGreaterThan(299.5);
    const again = await box.boundingBox();
    expect(boxesAgree(settled!, again!), "the box moved again after settling").toBe(true);

    // And the naive read was not the destination. This is the defect, demonstrated.
    expect(
      naive!.x,
      `the naive read returned ${naive!.x}, the settled one ${settled!.x} — if these ever `
      + "match, this page has stopped reproducing the mechanism and the helper's case "
      + "must be re-measured rather than assumed",
    ).toBeLessThan(299.5);
  });

  test("an element that never settles is reported, not guessed at", async ({ page }) => {
    await page.setContent(`
      <style>#j { position: absolute; top: 0; left: 0; width: 50px; height: 20px; background: #333; }</style>
      <div id="j"></div>
      <script>
        // Never stops, and never repeats a position two frames running.
        let i = 0;
        const el = document.getElementById('j');
        (function tick() { el.style.left = ((i += 7) % 400) + 'px'; requestAnimationFrame(tick); })();
      </script>
    `);
    const jitter = page.locator("#j");
    await expect(jitter).toBeVisible();

    // A helper that returned a best guess here would be handing back a position that
    // was never true for longer than a frame, labelled as a measurement.
    await expect(stableBoundingBox(page, jitter, "#j", 1_500))
      .rejects.toThrow(/never settled within 1500ms/);
  });

  test("an element with no box settles as null rather than hanging", async ({ page }) => {
    // MEASURED, not assumed (2026-08-27). The first version of this case removed the
    // element and expected null. It timed out instead: boundingBox() waits for the
    // locator to be ATTACHED, so a removed element is a 30s timeout, never a null.
    // The null return is for an element that is attached and has no box — display:none
    // is the honest way to reach it, and it is the only way this branch can fire in
    // real use, where the caller has already asserted visibility.
    await page.setContent('<div id="h" style="display:none">x</div>');
    expect(await stableBoundingBox(page, page.locator("#h"), "#h", 2_000)).toBeNull();
  });
});
