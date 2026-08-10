import { test, expect } from "@playwright/test";

// Per-page metadata floor (iter-36 to-do 406). seo.spec.ts covers robots.txt and
// the sitemap; this covers what a crawler and — more importantly for this project
// — a WhatsApp unfurler actually read out of each page's <head>.
//
// The trap this exists to catch: Next merges metadata SHALLOWLY per top-level
// key, so a page that declares its own `openGraph` REPLACES the root layout's,
// including the root `opengraph-image` file convention. The page keeps its title,
// its description and its canonical and silently loses og:image — i.e. a WhatsApp
// share renders a bare link with no preview card, and nothing in the build, the
// typechecker or the other specs says a word. /metric and /methodology were in
// exactly that state before item 406.
//
// KNOWN GAP, deliberately not asserted here: /coverage is still in that state
// (app/coverage/page.tsx declares openGraph with no `images`). The fix is the
// same two lines used in app/metric/page.tsx — import SITE_OG_IMAGE /
// SITE_TWITTER_IMAGE from @/lib/site and add `images: [...]` to openGraph and
// twitter. /coverage was added to INDEXABLE on 2026-08-10 once its og:image landed.

/** Pages whose <head> must be complete enough to produce a rich link preview. */
const INDEXABLE = ["/", "/metric", "/metric/literacy_rate", "/methodology", "/coverage"];

/** WhatsApp refuses to render a preview image much above this; the site card and
 *  the generated per-metric card are both ~31KB, so this is a wide guard rail
 *  against someone dropping in an unoptimised PNG later. */
const WHATSAPP_IMAGE_CEILING_BYTES = 600 * 1024;

function attr(html: string, tagRe: RegExp, attrName: "content" | "href"): string | null {
  const tag = html.match(tagRe)?.[0];
  if (!tag) return null;
  return tag.match(new RegExp(`${attrName}="([^"]*)"`))?.[1] ?? null;
}

test.describe("per-page metadata floor (to-do 406)", () => {
  for (const path of INDEXABLE) {
    test(`${path} has a title, description, canonical and a complete OG image`, async ({
      request,
      baseURL,
    }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const html = await res.text();

      // a real, non-empty title
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      expect(title.trim().length, `${path} <title>`).toBeGreaterThan(10);

      // a real description
      const description = attr(html, /<meta name="description"[^>]*>/, "content");
      expect(description ?? "", `${path} description`).not.toBe("");
      expect((description ?? "").length).toBeGreaterThan(50);

      // a self-referencing canonical for THIS path (never the parent's `/`)
      const canonical = attr(html, /<link rel="canonical"[^>]*>/, "href");
      expect(canonical, `${path} canonical`).toBeTruthy();
      expect(canonical!).toMatch(/^https:\/\//);
      expect(new URL(canonical!).pathname.replace(/\/$/, "")).toBe(path.replace(/\/$/, ""));

      // indexable
      const robots = attr(html, /<meta name="robots"[^>]*>/, "content") ?? "index";
      expect(robots.toLowerCase(), `${path} robots`).not.toContain("noindex");

      // OG card: absolute image URL + the dimensions WhatsApp uses to decide
      // between a large preview and a thumbnail
      expect(attr(html, /<meta property="og:title"[^>]*>/, "content")).toBeTruthy();
      const ogImage = attr(html, /<meta property="og:image"[^>]*>/, "content");
      expect(ogImage, `${path} og:image`).toBeTruthy();
      expect(ogImage!, "og:image must be ABSOLUTE — WhatsApp will not resolve a relative one").toMatch(
        /^https?:\/\//
      );
      expect(attr(html, /<meta property="og:image:width"[^>]*>/, "content")).toBe("1200");
      expect(attr(html, /<meta property="og:image:height"[^>]*>/, "content")).toBe("630");
      expect(attr(html, /<meta name="twitter:card"[^>]*>/, "content")).toBe("summary_large_image");

      // and the image is really there, really an image, and small enough to unfurl.
      // The absolute URL is on the public origin, so re-point it at the instance
      // under test.
      const imgUrl = new URL(ogImage!);
      const imgRes = await request.get(
        new URL(imgUrl.pathname + imgUrl.search, baseURL!).toString()
      );
      expect(imgRes.status(), `${path} og:image fetch`).toBe(200);
      expect(imgRes.headers()["content-type"]).toMatch(/^image\//);
      const bytes = (await imgRes.body()).byteLength;
      expect(bytes).toBeGreaterThan(1000);
      expect(bytes, `${path} og:image is too large to unfurl`).toBeLessThan(
        WHATSAPP_IMAGE_CEILING_BYTES
      );
    });
  }

  test("/embed is noindex and advertises no canonical of its own", async ({ request }) => {
    const res = await request.get("/embed");
    expect(res.status()).toBeLessThan(400);
    const html = await res.text();

    const robots = attr(html, /<meta name="robots"[^>]*>/, "content") ?? "";
    expect(robots.toLowerCase()).toContain("noindex");
    expect(robots.toLowerCase()).toContain("nofollow");

    // must not inherit the root layout's `/` canonical: an iframe view has no
    // canonical, and it must never point search engines back at the atlas as if
    // it were the same page.
    expect(html).not.toMatch(/<link rel="canonical"/);
  });

  test("the sitemap lists the crawlable catalogue, not just the leaf metric pages", async ({
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    // to-do 440: /metric is the browse hub every metric page hangs off. It was
    // dropped when the sitemap was rewritten around a flat static-path list.
    expect(xml).toMatch(/<loc>[^<]*\/metric<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]*\/metric\/[^<]+<\/loc>/);
  });
});
