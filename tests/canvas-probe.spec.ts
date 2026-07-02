import { test, expect, Page } from "@playwright/test";

// Canvas-pixel probe: does the map still paint after drill -> back?
// Counts non-background pixels in the composited page screenshot's map area.

async function mapPaintRatio(page: Page): Promise<number> {
  const shot = await page.screenshot({ clip: { x: 300, y: 100, width: 800, height: 560 } });
  const png = shot;
  // crude: count bytes that differ from the ink background in the raw PNG is
  // unreliable — instead render into a canvas via the browser itself.
  return await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await new Promise((res) => (img.onload = res));
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, total = 0;
    for (let i = 0; i < d.length; i += 16) {
      total++;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r + g + b > 90) lit++; // anything meaningfully brighter than ink bg
    }
    return lit / total;
  }, png.toString("base64"));
}

test("map keeps painting through drill -> breadcrumb back", async ({ page }) => {
  await page.goto("/?m=literacy_rate&lvl=state");
  await expect(page.getByText(/\d+ states ·/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  const before = await mapPaintRatio(page);

  // select Kerala from the rail, drill in
  await page.locator("aside").getByRole("button").filter({ hasText: "Kerala" }).first().click();
  await page.getByRole("button", { name: /View \d+ districts/i }).click();
  await page.waitForTimeout(1800);
  const drilled = await mapPaintRatio(page);

  // breadcrumb back to India
  await page.getByRole("navigation", { name: "Drill trail" }).getByRole("button", { name: "India" }).click();
  await page.waitForTimeout(1800);
  const after = await mapPaintRatio(page);

  console.log(JSON.stringify({ before, drilled, after }));
  expect(before).toBeGreaterThan(0.02); // states choropleth painted
  expect(after).toBeGreaterThan(before * 0.5); // still painted after back
});
