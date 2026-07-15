import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";

// E2E for the social card export dialog (iter-71, feat-social-export):
// open the explorer with a metric picked, open the CARD dialog, check the
// live preview paints, download both presets/themes and validate the PNG
// dimensions match the 2x social canvases (4:5 → 2160×2700, 1:1 → 2160×2160).

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  // CARD enables only once metric data has landed — the readiness signal we need
  await expect(page.getByRole("button", { name: /export a social media card/i })).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

function pngSize(path: string): { w: number; h: number } {
  const b = fs.readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test.describe("feat-social-export", () => {
  test("card dialog previews, downloads both presets and themes, escapes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?m=tourist_visits_foreign&lvl=state");
    await waitForMapReady(page);

    await page.getByRole("button", { name: /export a social media card/i }).click();
    const dlg = page.getByRole("dialog", { name: /social media card/i });
    await expect(dlg).toBeVisible();

    // headline defaults to the metric name (editable)
    await expect(dlg.getByLabel("Card headline")).toHaveValue(/foreign tourist visits/i);

    // live preview paints non-background pixels (labels, map, legend)
    await page.waitForTimeout(1200); // debounce + font load + render
    const painted = await dlg.locator("canvas").evaluate((el) => {
      const cv = el as HTMLCanvasElement;
      const ctx = cv.getContext("2d");
      if (!ctx || cv.width === 0) return 0;
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 40)
        if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) lit++;
      return lit;
    });
    expect(painted).toBeGreaterThan(500);

    // portrait / dark ink download — 2160×2700
    const dl1p = page.waitForEvent("download");
    await dlg.getByRole("button", { name: /download png/i }).click();
    const dl1 = await dl1p;
    expect(dl1.suggestedFilename()).toBe("mapsofbharat-tourist_visits_foreign-card-portrait-ink.png");
    const p1 = "/tmp/mob-card-portrait-ink.png";
    await dl1.saveAs(p1);
    expect(pngSize(p1)).toEqual({ w: 2160, h: 2700 });

    // square / paper download — 2160×2160
    await dlg.getByRole("button", { name: /1:1/ }).click();
    await dlg.getByRole("button", { name: /^paper$/i }).click();
    await page.waitForTimeout(800);
    const dl2p = page.waitForEvent("download");
    await dlg.getByRole("button", { name: /download png/i }).click();
    const dl2 = await dl2p;
    expect(dl2.suggestedFilename()).toBe("mapsofbharat-tourist_visits_foreign-card-square-paper.png");
    const p2 = "/tmp/mob-card-square-paper.png";
    await dl2.saveAs(p2);
    expect(pngSize(p2)).toEqual({ w: 2160, h: 2160 });

    // Escape closes the dialog
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();
  });

  test("card button disabled without a metric", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /export a social media card/i })).toBeDisabled();
  });
});
