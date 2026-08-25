import { test, expect } from "@playwright/test";

// iter-43 — the two site-wide findings from iter-40/41 (#579, #580).
//
// EVERY ASSERTION HERE READS RAW HTML, never the hydrated DOM. That is not a
// style preference: both defects are cases where the served bytes and the
// hydrated page said different things, so a `page.goto` + `expect(locator)` test
// would have passed against the broken build. `request.get()` returns what a
// crawler gets.

const LAUNCHED = process.env.SITE_LAUNCHED === "true";

/** Body text with <script> removed — the RSC flight payload lives in <script>,
 *  and the whole point of #579 is that copy hiding there is not copy on the page. */
function visibleText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test.describe("#579 — a 404 body a reader can see without JavaScript", () => {
  // A route MISS. This is the half app/not-found.tsx fixes, and it was measured
  // at ZERO visible characters before that file existed.
  for (const path of ["/does-not-exist", "/metric/literacy_rate/nope"]) {
    test(`route miss ${path} serves the 404 copy in the markup`, async ({ request }) => {
      const r = await request.get(path);
      expect(r.status(), `${path} must be a real 404`).toBe(404);

      const html = await r.text();
      const text = visibleText(html);

      expect(text, `${path} rendered no body outside <script>`).toContain("Page not found");
      expect(text).toContain("Nothing lives at this address");
      // Recovery links must be real anchors, not client-side handlers.
      expect(html).toMatch(/<a[^>]+href="\/metric"/);
      expect(html).toMatch(/<a[^>]+href="\/family"/);
      // A titled page with an empty body was the defect. The page ships ~680
      // characters; 200 is comfortably above the broken version's zero and well
      // below the real content, so copy edits do not make this flaky.
      expect(text.length).toBeGreaterThan(200);
    });
  }

  // The notFound() half. THE STATUS IS THE PART THAT MATTERS — a 404 is not
  // indexed whatever its body says — and the status is correct. See adr-037 for
  // why the body is not, and why the fix was refused.
  for (const path of ["/metric/no-such-metric", "/family/no-such-family"]) {
    test(`notFound() route ${path} still returns a real 404 status`, async ({ request }) => {
      const r = await request.get(path);
      expect(r.status()).toBe(404);
      // The copy IS present — just inside the flight payload rather than the
      // markup. If this ever stops being true the page has broken entirely.
      expect(await r.text()).toContain("Page not found");
    });
  }

  test("CHARACTERIZATION: notFound() copy is still only in the flight payload (adr-037)", async ({
    request,
  }) => {
    // This test asserts the LIMITATION, not the fix, and it is meant to FAIL the
    // day a Next upgrade server-renders the not-found boundary. When it does:
    // delete this test, fold these routes into the block above, and retire
    // adr-037. Measured on Next 15.5.19 — 41 characters, the site title only.
    const html = await (await request.get("/metric/no-such-metric")).text();
    const text = visibleText(html);
    expect(html, "the copy should still exist somewhere in the response").toContain(
      "Page not found"
    );
    expect(
      text,
      "Next now server-renders the not-found boundary — adr-037 is obsolete, see the comment above"
    ).not.toContain("Page not found");
  });
});

test.describe("#580 — every indexing signal agrees", () => {
  const PATHS = ["/", "/metric", "/metric/literacy_rate", "/coverage", "/family"];

  test("meta robots and the X-Robots-Tag header never contradict", async ({ request }) => {
    for (const path of PATHS) {
      const r = await request.get(path);
      expect(r.status(), `${path} should load`).toBeLessThan(400);

      const header = r.headers()["x-robots-tag"] ?? "";
      const html = await r.text();
      // ALL of them, not the first. `.exec()` returns only the first match, so a
      // page emitting `noindex` AND `index, follow` would have been read as
      // agreeing with whichever came first — a guard that cannot see the
      // contradiction it exists to catch. Found by the iter-43 code verifier on
      // /_not-found, which really does emit both in a launched build.
      const metas = [...html.matchAll(/<meta name="robots" content="([^"]*)"/gi)].map((m) =>
        m[1].toLowerCase()
      );

      // Both must exist to be compared — an absent meta is how this silently
      // passed before.
      expect(metas.length, `${path} emitted no meta robots at all`).toBeGreaterThan(0);
      expect(
        metas.length,
        `${path} emitted ${metas.length} robots metas (${metas.join(" | ")}); a page that says two different things says nothing`
      ).toBe(1);

      const headerSaysNo = header.includes("noindex");
      const metaSaysNo = metas[0].includes("noindex");
      const meta = metas[0];
      expect(
        metaSaysNo,
        `${path}: header says "${header}" but meta says "${meta}" — the two halves of the switch disagree`
      ).toBe(headerSaysNo);
    }
  });

  test("the signals follow the launch flag, not a hard-coded value", async ({ request }) => {
    const html = await (await request.get("/metric/literacy_rate")).text();
    const meta = /<meta name="robots" content="([^"]*)"/i.exec(html)?.[1] ?? "";
    if (LAUNCHED) {
      expect(meta).toContain("index");
      expect(meta).not.toContain("noindex");
    } else {
      // Pre-launch this is the assertion that fails against the old static
      // `robots:{index:true}` — the defect, stated directly.
      expect(meta).toContain("noindex");
    }
  });

  test("/embed stays noindex regardless of the launch flag", async ({ request }) => {
    // Next merges metadata shallowly per top-level key, so /embed's own robots
    // must survive the root layout's. This is the assertion that catches a
    // refactor that moves robots into a shared object.
    const r = await request.get("/embed");
    expect(r.headers()["x-robots-tag"] ?? "").toContain("noindex");
    const meta = /<meta name="robots" content="([^"]*)"/i.exec(await r.text())?.[1] ?? "";
    expect(meta, "/embed lost its own robots directive to the root layout").toContain("noindex");
  });
});
