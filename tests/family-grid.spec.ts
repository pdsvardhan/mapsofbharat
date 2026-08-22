import { test, expect, type APIRequestContext } from "@playwright/test";

// The small-multiple grid (#547 phase B, iter-40 items 968-975).
//
// Everything load-bearing here is SSR: the panels, their captions and the whole
// citation apparatus must be in the INITIAL HTML, because the route ships 0 B of
// client JavaScript and there is no second chance to fill anything in. So these
// read the raw server response through the `request` fixture.
//
// TWO MEASUREMENT TRAPS, both of which produced a wrong verdict during the build
// and are handled by `markup()` below:
//
//   1. A server-rendered React tree appears TWICE in the response — once as
//      markup, once as RSC flight data inside <script>. A naive count of any
//      phrase comes back doubled. "Parts of one whole" counts 4 across the
//      document and 2 in the markup, and 2 is the correct answer.
//   2. React separates adjacent text nodes with an HTML comment, so the page
//      contains `100<!-- -->%` and a substring search for "100%" fails against a
//      perfectly correct page.
//
// And the standing rule from the phase-B foundation: assert what a panel DRAWS,
// never how many elements it has. The backwards-ring bug reported 735 paths and
// exited 0 while every one of them covered the whole panel.

/** Response markup with the flight payload and comment separators removed. */
function markup(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

type Family = {
  id: string;
  label: string;
  axis: "shared" | "free";
  axisWhy: string;
  partToWhole: { sumsTo: number; within: number; of: number } | false;
  declaredSharedDistricts: number;
  declaredMembers: number;
  resolvedMembers: number;
  missingMembers: string[];
};

type Member = {
  id: string;
  name: string;
  statsCount: number;
  min: number;
  max: number;
  values: Record<string, number>;
};

type Detail = Family & {
  storeAvailable: boolean;
  measuredSharedDistricts: number;
  sharedCodes: string[];
  members: Member[];
  shared: { min: number; max: number; breaks: number[]; method: string } | null;
};

async function families(request: APIRequestContext): Promise<Family[]> {
  const res = await request.get("/api/families");
  expect(res.status()).toBe(200);
  return (await res.json()).families as Family[];
}

async function detail(request: APIRequestContext, id: string): Promise<Detail> {
  const res = await request.get(`/api/families/${id}`);
  expect(res.status(), `/api/families/${id}`).toBe(200);
  return (await res.json()).family as Detail;
}

/** Each panel's inner SVG, keyed by its accessible name. */
function panels(html: string): { name: string; body: string }[] {
  return [
    ...markup(html).matchAll(
      /<svg viewBox="0 0 \d+ \d+"[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/svg>/g
    ),
  ].map((m) => ({ name: m[1], body: m[2] }));
}

test.describe("#547 the families API (item 968)", () => {
  test("lists the shippable families, each with every declared member present", async ({
    request,
  }) => {
    const list = await families(request);
    expect(list.length).toBeGreaterThan(0);
    for (const f of list) {
      // A family declaring members the store does not have is a family drifting
      // from its declaration. It must be visible, not silently one panel short.
      expect(f.missingMembers, `${f.id} has missing members`).toEqual([]);
      expect(f.resolvedMembers, `${f.id} resolved count`).toBe(f.declaredMembers);
    }
  });

  test("the shared district set is the one lib/metric-families.ts declares", async ({
    request,
  }) => {
    // THE CROSS-CHECK THAT MATTERS. The declared numbers were measured on
    // 2026-08-21 against the catalogue; these are recomputed from the store on
    // every request. If an adapter changes coverage, this is where it surfaces —
    // rather than in a grid that quietly draws a different India.
    for (const f of await families(request)) {
      const d = await detail(request, f.id);
      expect(d.measuredSharedDistricts, `${f.id} shared districts`).toBe(
        f.declaredSharedDistricts
      );
      // Every member carries a value on every shared district, by definition.
      for (const m of d.members) {
        expect(Object.keys(m.values).length, `${f.id}/${m.id} values`).toBe(
          d.sharedCodes.length
        );
      }
    }
  });

  test("an unknown family is a 404, not an empty grid", async ({ request }) => {
    const res = await request.get("/api/families/no-such-family");
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toContain("no-such-family");
  });
});

test.describe("#547 the grid renders as maps, not as markup (items 970, 971)", () => {
  test("every panel draws every district, and no two panels are the same", async ({
    request,
  }) => {
    for (const id of ["religion", "livelihood"]) {
      const d = await detail(request, id);
      const html = await (await request.get(`/family/${id}`)).text();
      const ps = panels(html);
      expect(ps.length, `${id} panel count`).toBe(d.resolvedMembers);

      const signatures = new Set<string>();
      for (const p of ps) {
        const fills = [...p.body.matchAll(/fill="(rgb\([^"]*\))"/g)].map((m) => m[1]);
        const uses = (p.body.match(/<use /g) ?? []).length;

        // Districts outside the shared set are still DRAWN, in the no-data tone —
        // omitting them would redraw the outline of the country.
        expect(fills.length, `${id}/${p.name} filled`).toBe(d.sharedCodes.length);
        expect(uses, `${id}/${p.name} total districts`).toBeGreaterThan(fills.length);

        // A panel painted one colour is the failure mode this whole feature can
        // produce silently: it looks like a map and carries no information.
        const distinct = new Set(fills);
        expect(distinct.size, `${id}/${p.name} distinct classes`).toBeGreaterThan(1);
        signatures.add([...fills].join("|"));
      }
      expect(signatures.size, `${id}: panels are identical to each other`).toBe(ps.length);
    }
  });

  test("geometry is defined once and referenced, not repeated per panel", async ({
    request,
  }) => {
    // adr-d3geo's addendum: repeating full paths per panel is 4,587 KiB for eight
    // district panels. The defs+use structure is the only reason the page is
    // shippable, so its absence is a regression even if the page still looks right.
    const html = markup(await (await request.get("/family/religion")).text());
    const defs = (html.match(/<path id="fp-/g) ?? []).length;
    const uses = (html.match(/<use /g) ?? []).length;
    expect(defs, "paths in <defs>").toBeGreaterThan(700);
    expect(uses, "<use> references").toBeGreaterThan(defs);
    // Geometry appears once: no <path> carries a d= outside the sprite.
    const pathsWithGeometry = (html.match(/<path[^>]*\sd="/g) ?? []).length;
    expect(pathsWithGeometry, "paths carrying geometry").toBe(defs);
  });

  test("a shared axis gets one legend; a free axis gets none", async ({ request }) => {
    // A single strip of swatches under panels that each mean something different
    // by the same colour is the misreading a free axis exists to prevent.
    for (const f of await families(request)) {
      const html = markup(await (await request.get(`/family/${f.id}`)).text());
      const swatches = (html.match(/inline-block h-3 w-5/g) ?? []).length;
      if (f.axis === "shared") {
        expect(swatches, `${f.id} (shared axis) legend`).toBeGreaterThan(1);
      } else {
        expect(swatches, `${f.id} (free axis) must not carry one legend`).toBe(0);
      }
      // The reason for the choice is a reader-facing caveat, not a code comment.
      const d = await detail(request, f.id);
      expect(html, `${f.id} axisWhy`).toContain(d.axisWhy.slice(0, 40));
    }
  });
});

test.describe("#547 the grid says what it is (items 972, 973)", () => {
  test("only the families that actually sum say so, with the measured figure", async ({
    request,
  }) => {
    for (const f of await families(request)) {
      const html = markup(await (await request.get(`/family/${f.id}`)).text());
      const claims = html.includes("are parts of one whole");
      const denies = html.includes("not parts of one whole");
      expect(claims, `${f.id} sum claim`).toBe(Boolean(f.partToWhole));
      expect(denies, `${f.id} sum denial`).toBe(!f.partToWhole);

      if (f.partToWhole) {
        // The REAL figure. Religion averages 97.6 and rounding that to 100 would
        // claim a completeness the catalogue does not have.
        const avg = f.partToWhole.sumsTo.toLocaleString("en-IN", {
          maximumFractionDigits: 1,
        });
        expect(html, `${f.id} states its average`).toContain(`${avg}%`);
        expect(html, `${f.id} states its district count`).toContain(
          `${f.partToWhole.within.toLocaleString("en-IN")} of ${f.partToWhole.of.toLocaleString("en-IN")}`
        );
      }
    }
  });

  test("every panel is a figure with a caption and a name that carries its scale", async ({
    request,
  }) => {
    for (const f of await families(request)) {
      const html = markup(await (await request.get(`/family/${f.id}`)).text());
      expect((html.match(/<figure/g) ?? []).length, `${f.id} figures`).toBe(
        f.resolvedMembers
      );
      expect((html.match(/<figcaption/g) ?? []).length, `${f.id} figcaptions`).toBe(
        f.resolvedMembers
      );

      const ps = panels(html);
      expect(ps.length).toBe(f.resolvedMembers);
      for (const p of ps) {
        // Without the scale clause a free-axis grid announces N maps that sound
        // directly comparable and are not.
        const clause =
          f.axis === "shared" ? "shared by every map" : "not comparable by colour";
        expect(p.name, `${f.id} panel name: ${p.name}`).toContain(clause);
        expect(p.name, `${f.id} panel name lacks a range`).toMatch(/Ranges .+ to .+/);
      }
    }
  });
});

test.describe("#547 both entrances exist (item 975)", () => {
  test("the index lists every family and links to it", async ({ request }) => {
    const html = markup(await (await request.get("/family")).text());
    for (const f of await families(request)) {
      expect(html, `index links ${f.id}`).toContain(`href="/family/${f.id}"`);
    }
  });

  test("a member metric links to every family it belongs to, and a non-member links to none", async ({
    request,
  }) => {
    // cultivators_pct is the case a single-family lookup would get wrong: it is a
    // member of census-pca AND livelihood.
    const linksOn = async (metric: string) => {
      const html = markup(await (await request.get(`/metric/${metric}`)).text());
      return [...new Set([...html.matchAll(/href="\/family\/([a-z-]+)"/g)].map((m) => m[1]))].sort();
    };
    expect(await linksOn("cultivators_pct")).toEqual(["census-pca", "livelihood"]);
    expect(await linksOn("hindu_pct")).toEqual(["religion"]);
    expect(await linksOn("sex_ratio")).toEqual([]);
  });

  test("the sitemap carries the index and every family", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/family</loc>");
    for (const f of await families(request)) {
      expect(xml, `sitemap ${f.id}`).toContain(`/family/${f.id}</loc>`);
    }
  });
});

test.describe("#547 the page stays shippable", () => {
  test("a family page renders per request, without shipping the store or a projector", async ({
    request,
  }) => {
    const res = await request.get("/family/religion");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // The route must not have imported d3-geo: adr-d3geo admits it as a
    // devDependency only, and anything this route imports is a runtime dependency.
    expect(html).not.toContain("geoMercator");
    // An unknown family is a 404 page, not an empty grid.
    expect((await request.get("/family/no-such-family")).status()).toBe(404);
  });

  test("no family page exceeds its payload ceiling", async ({ request }) => {
    // Measured after iter-41 item 976 simplified the geometry: the heaviest page
    // is nfhs5-health at ~2,666 KiB raw. The ceiling is deliberately close to the
    // measurement — its job is to fail when the defs+use structure is lost or a
    // family grows a great many panels, both of which multiply this several-fold.
    for (const f of await families(request)) {
      const bytes = (await (await request.get(`/family/${f.id}`)).body()).length;
      expect(bytes / 1024, `${f.id} page KiB`).toBeLessThan(3200);
    }
  });
});
