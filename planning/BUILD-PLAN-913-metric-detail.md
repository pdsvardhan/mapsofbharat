# Build plan — #913, the metric detail page

_Written 2026-08-20 after looking at the live page (`/metric/literacy_rate` at `d9f92ae`),
not from the to-do text._

## Approach — changed on owner instruction, 2026-08-20

**No design round.** Match components and treatments already used elsewhere on the site.
The atlas now has settled answers to most of the questions this page asks; the job is to
apply them, not to re-decide them.

**Scope ruling stands (owner, 2026-08-11): VISUAL TREATMENT ONLY.** These pages are the
organic-search surface and the SEO floor shipped at `bf4c374`. Heading structure, content
order, internal linking and metadata do **not** change.

## What the page is

`/metric/<id>`, server-rendered, one per metric (132 in the sitemap). Sections in order:
title + methodology paragraph → three headline stats → interactive map (the real atlas
framed same-origin) → ranked table → data lineage + downloads → citation → share/embed →
footer. It already reuses `MetricTable`, `MetricLineage`, `MetricShare`, `CiteBlock`,
`MetricListItem`, `SiteFooter`.

## The actual problem, from looking at it

**Everything is a bordered box, so nothing has priority.** The three stat cards, the map,
the table, the four lineage steps, both download cards, the citation block and the embed
field are all the same rectangle with the same edge. Eight sibling containers of equal
weight down one page. The eye gets no ranking, and the page reads as a form rather than
as a page about a number.

That is also **out of step with the atlas as it now stands.** R2 settled that a panel on
this site is *a band ruled off the sheet, not an object drawn on it* — 3px rules above and
below, no side edges, square corners, no fill. The atlas region panel does that; this page
does the opposite in eight places.

Second, smaller: the map sits in a tall box with a lot of dead space above and below
India, so the most visual element on the page occupies less of its container than the
table below it does.

## The work

### 913-A · Apply the ruled-band treatment to the section containers
Replace the uniform bordered boxes with the treatment already locked for the region panel
(ledger rows 95/96/97 — `flat-no-lift`, `corner-radius 0`, `rules-3px-above-and-below`,
no side edges). Applies to: the three headline stats, the four lineage steps, the citation
block, the share/embed block.

Not a new design — the site's own answer, applied consistently. The tokens exist
(`--border`, `--border-soft`, `--border-faint`) and now paint correctly since adr-034.

### 913-B · Give the three headline stats a hierarchy
National average, Range and Coverage are currently three identical cards. They are not
equally important: the **national average is the headline**, range is context, coverage is
a caveat. Same band treatment, but the average gets the display size the atlas region
panel gives its figure, and the other two sit as supporting text. No layout reflow — three
across stays three across.

### 913-C · Reclaim the map's dead space
Tighten the frame to India's bounds so the map fills its container the way it does in the
atlas. Pure framing; the embed is the same `/embed` view, so nothing about the map itself
changes.

### 913-D · Consistency sweep against the atlas
Check every remaining surface on the page resolves to the same tokens as its atlas
equivalent — now mechanically checkable since borders paint what they declare. Specifically
the table (should already match after iter-40), the download buttons versus the atlas's
primary CTA, and the disabled "Pro — coming soon" button, which currently reads as broken
rather than as deliberately unavailable.

## Explicitly NOT in scope

- **Moving the methodology paragraph.** Seven dense lines of caveat sit above the first
  number, and on a search-landing page the number should arguably come first. That is a
  **content-order** change, which the scope ruling excludes. Raised as its own question
  rather than smuggled in here.
- Headings, internal links, metadata, structured data, the sitemap.
- The `/embed` view itself.

## Testing

- Reuse the pattern from `tests/design-r2.spec.ts`: assert **resolved** styles, not class
  names — border widths, no side edges, radius 0 on the treated containers.
- Assert the metric page's treated container resolves to the **same** values as the atlas
  region panel, so "consistent with the atlas" is measured rather than claimed. That
  agreement test is the whole point of the approach.
- **SEO regression guard:** `tests/seo-metadata.spec.ts` already asserts title,
  description, canonical and OG image per page. It must stay green untouched — that is
  the mechanical proof the scope ruling was honoured.
- Screenshot before/after and look at it. The complaint is perceptual.

## Sequencing

913-A and 913-B together (one visual pass, one review), then 913-C, then 913-D as a sweep.
Small enough to be one branch.
