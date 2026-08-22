import { test, expect, type APIRequestContext } from "@playwright/test";

import { noStoreDetail } from "@/lib/family-data";
import { FAMILY_BY_ID, SHIPPABLE_FAMILIES } from "@/lib/metric-families";

// The small-multiple grid (#547 phase B, iter-40 items 968-975).
//
// Everything load-bearing here is SSR: the panels, their captions and the whole
// citation apparatus must be in the INITIAL HTML, because the route ADDS 0 B of
// JavaScript of its own and there is no second chance to fill anything in. (The
// page still loads the app's shared bundle, as every route does - "0 B" is this
// route's own contribution, not the page total.) So these
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
  estimated: Record<string, 1>;
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

test.describe("#547 survivors the code verifier found (iter-41)", () => {
  // Three mutations passed the suite as first written. Each is a failure a reader
  // would see instantly and no assertion could: the tests measured the markup
  // around the panels rather than the colour actually on them.

  test("a shared axis paints from the family's edges, not each panel's own", async ({
    request,
  }) => {
    // SURVIVOR F3. Replacing `const scale = family.shared` with null left 13/13
    // green while livelihood's panel 0 went from 5 distinct colours to 267 — a
    // continuous ramp under a legend still showing 5 pooled swatches. A legend
    // contradicting its own picture is exactly what a shared axis exists to prevent.
    for (const f of await families(request)) {
      const d = await detail(request, f.id);
      if (!d.shared) continue;
      const html = await (await request.get(`/family/${f.id}`)).text();
      const classes = d.shared.breaks.length + 1;

      const byCode = new Map<string, Set<string>>();
      for (const p of panels(html)) {
        const fills = [...p.body.matchAll(/<use href="#fp-([^"]+)" fill="(rgb\([^"]*\))"/g)];
        const distinct = new Set(fills.map((m) => m[2]));
        // Classed, not continuous: a shared axis can only produce k colours.
        expect(distinct.size, `${f.id}/${p.name} distinct fills`).toBeLessThanOrEqual(classes);
        for (const m of fills) {
          if (!byCode.has(m[1])) byCode.set(m[1], new Set());
          byCode.get(m[1])!.add(m[2]);
        }
      }
      // And the axis is genuinely SHARED: pick the member values back out and
      // confirm two panels give the same colour to the same number.
      const first = d.members[0];
      const second = d.members[1];
      if (!first || !second) continue;
      const fillFor = (name: string, code: string) => {
        const p = panels(html).find((x) => x.name.startsWith(name));
        const m = p?.body.match(new RegExp(`<use href="#fp-${code}" fill="(rgb\([^"]*\))"`));
        return m?.[1];
      };
      let compared = 0;
      for (const code of d.sharedCodes.slice(0, 400)) {
        const a = first.values[code];
        const b = second.values[code];
        if (a == null || b == null || Math.abs(a - b) > 1e-9) continue;
        const fa = fillFor(first.name, code);
        const fb = fillFor(second.name, code);
        if (!fa || !fb) continue;
        expect(fb, `${f.id}: equal values ${a} painted differently across panels`).toBe(fa);
        compared++;
        if (compared >= 3) break;
      }
    }
  });

  test("the sprite carries no fill of its own", async ({ request }) => {
    // SURVIVOR F4. Adding fill="rgb(255,0,0)" to the <defs> paths left 13/13 green,
    // and a referenced path's fill BEATS the <use>'s — so every district on every
    // panel would render one flat colour. The old assertion counted fill=
    // attributes in the markup, which that mutation does not touch.
    for (const id of ["religion", "livelihood"]) {
      const html = markup(await (await request.get(`/family/${id}`)).text());
      const sprite = [...html.matchAll(/<path id="fp-[^"]*"[^>]*>/g)].map((m) => m[0]);
      expect(sprite.length, `${id} sprite paths`).toBeGreaterThan(700);
      const coloured = sprite.filter((t) => /\sfill=/.test(t));
      expect(coloured.slice(0, 3), "sprite paths must not set fill").toEqual([]);
    }
  });

  test("estimated rows stay out of the statistics (adr-022)", async ({ request }) => {
    // SURVIVOR F5. Dropping the countsInStats guard left the suite green while
    // changing fills on 3 of 4 crime panels. The adr-022 rule the whole
    // classification rests on was asserted nowhere.
    const d = await detail(request, "crime");
    let checked = 0;
    for (const m of d.members) {
      const estimatedCodes = Object.keys(m.estimated);
      if (!estimatedCodes.length) continue;
      const all = Object.values(m.values);
      const stats = Object.entries(m.values)
        .filter(([code]) => !m.estimated[code])
        .map(([, v]) => v);
      expect(m.statsCount, `${m.id} statsCount`).toBe(stats.length);
      expect(m.statsCount, `${m.id} must exclude ${estimatedCodes.length} estimated rows`).toBeLessThan(all.length);
      expect(m.min, `${m.id} min is over the stats set`).toBe(Math.min(...stats));
      expect(m.max, `${m.id} max is over the stats set`).toBe(Math.max(...stats));
      checked++;
    }
    // If crime ever loses its estimated rows this test would silently assert
    // nothing, so make that visible rather than green.
    expect(checked, "no member with estimated rows — this test proved nothing").toBeGreaterThan(0);
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

test.describe("#547 the store-absent page keeps its own promise (iter-41)", () => {
  // THE CASE THAT SHIPPED GREEN. The feature verifier drove an instance with
  // DB_PATH at a missing file and found /family/[id] saying "the family and its 3
  // indicators are listed below" above an empty <ul> — and, worse, accusing itself
  // of drift ("3 declared indicators are missing from the store") when nothing had
  // drifted; the volume simply was not mounted. Nothing in tests/ asserted any of
  // it, so it passed everything.
  //
  // Asserted here on the pure shape rather than by standing up a second server: the
  // defect lived entirely in what the data layer reports when db() returns null.

  test("with no store, nothing is reported missing", () => {
    for (const family of SHIPPABLE_FAMILIES) {
      const d = noStoreDetail(family);
      expect(d.storeAvailable).toBe(false);
      // An absent volume is not a retired metric. Conflating them is what produced
      // a false drift warning on a perfectly healthy family.
      expect(d.missingMembers, `${family.id} must not claim members are missing`).toEqual([]);
      expect(d.measuredSharedDistricts).toBe(0);
      expect(d.members, "no store means no values, names or vintages").toEqual([]);
    }
  });

  test("with no store, the declaration is still listable", () => {
    // This is what lets the page keep its promise. memberIds comes from code, not
    // from a query, so it survives the volume being gone.
    const family = FAMILY_BY_ID.get("mgnrega");
    expect(family).toBeTruthy();
    const d = noStoreDetail(family!);
    expect(d.memberIds).toEqual(family!.members);
    expect(d.memberIds.length).toBeGreaterThan(0);
    expect(d.declaredMembers).toBe(family!.members.length);
  });

  test("the live page lists one indicator per resolved member", async ({ request }) => {
    // The healthy-path half of the same rule: the heading never stands above an
    // empty list. Counted on <li> inside the indicator list, with the flight
    // payload stripped so the count is not doubled.
    for (const f of await families(request)) {
      const html = markup(await (await request.get(`/family/${f.id}`)).text());
      const section = html.split("The indicators")[1] ?? "";
      const list = section.split("</ul>")[0] ?? "";
      expect((list.match(/<li/g) ?? []).length, `${f.id} indicator rows`).toBe(
        f.resolvedMembers
      );
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
