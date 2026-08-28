import type { Metadata } from "next";
import Link from "next/link";

import { getAllMetrics, type MetricListItem } from "@/lib/metric-page-data";
import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";
import { coverageOf, sourceLegend, sourceSigil } from "@/lib/source-sigil";
import { groupByForm, type FormGroup } from "@/lib/browse-by-form";

// Crawlable catalogue of every metric (iter-131 item 829, AC 5). /explore
// redirects to the atlas /, so this server-rendered index is where the linkable
// list of canonical /metric/{id} pages lives — grouped by category, each a real
// crawlable link. This is the browse surface the sitemap and the home page point
// at.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Browse every indicator on Maps of Bharat — India's official statistics mapped by district and state, each on its own cited, permanent page.";

// NOTE on shape: Next merges metadata SHALLOWLY per top-level key, so declaring
// `openGraph` here REPLACES the root layout's openGraph wholesale — siteName,
// locale AND the root opengraph-image are all lost unless restated. Before
// iter-36 item 406 this page emitted no og:image at all, so a WhatsApp share of
// the catalogue rendered a bare link with no card. `twitter` is restated for the
// same reason. This route has no segment-level opengraph-image file of its own,
// so the site card from lib/site is the correct image.
export const metadata: Metadata = {
  title: "All metrics",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/metric` },
  openGraph: {
    type: "website",
    siteName: "Maps of Bharat",
    locale: "en_IN",
    title: "All metrics · Maps of Bharat",
    description: DESCRIPTION,
    url: `${SITE_URL}/metric`,
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "All metrics · Maps of Bharat",
    description: DESCRIPTION,
    site: "@maps_of_bharat",
    creator: "@maps_of_bharat",
    images: [SITE_TWITTER_IMAGE],
  },
};

// Single-line metric row (design round `metric-row-cluster`, Option A
// "single-line", locked 2026-08-10 — ledger rows 80-83). Same anatomy as the atlas
// chooser and the region rail: name, dotted leader, coverage mark, vintage, source
// sigil, unit — all on one baseline, 32px tall. Fixed tracks sized to the widest
// value the live catalogue holds ("pupils/teacher" is a real unit and needs 80px at
// 9.5px mono, where the approved panel budgeted 54); the name track is the only
// elastic one, so slack always goes to the identifier.
//
// The list is ONE column, not the two it used to be. At two-up inside max-w-4xl a
// row is ~420px, and a 45-character name ("Teen mothers (15-19 already
// mothers/pregnant)") does not fit that beside six metadata columns — it would have
// shipped the same truncation the round flagged on the rail. One column gives each
// row the full 848px, where every name in the catalogue renders whole.
// Track widths are measured against the whole catalogue and shared with the chooser
// so the same data-role resolves to the same columns on both wide surfaces: cov 14
// (two 6px cells + 2px gap), vintage 24 (four digits at 10px mono), sigil 40
// ("MGNREGA", 38.8px), unit 86 ("pupils/teacher", 84.0px).
const ROW_COLS = "minmax(0,auto) minmax(12px,1fr) 14px 24px 40px 86px";

/** Two-cell coverage mark: districts, then states. Filled = carried. */
function CoverageMark({ levels, silent }: { levels?: string[]; silent?: boolean }) {
  const c = coverageOf(levels);
  const cell = "block h-[9px] w-[6px] border border-faint";
  return (
    <span className="inline-flex items-center gap-[2px] align-middle">
      <i aria-hidden className={cell} style={{ background: c.district ? "var(--faint)" : "transparent" }} />
      <i aria-hidden className={cell} style={{ background: c.state ? "var(--faint)" : "transparent" }} />
      {!silent && <span className="sr-only">{c.label}</span>}
    </span>
  );
}

/** A form group's rows clustered by the resolver's reason sentence, in the order
 *  each sentence first appears in the catalogue.
 *
 *  A form is not one argument. `capabilitiesFor` reaches `choropleth` down two
 *  different preferred paths — the intensive one and the signed-count one — so the
 *  members of a group can be there for different stated reasons, and printing one
 *  of them over all of them puts a false sentence on the page. See the render site. */
function byReason(metrics: FormGroup["metrics"]): [string, FormGroup["metrics"]][] {
  const out = new Map<string, FormGroup["metrics"]>();
  for (const m of metrics) {
    const bucket = out.get(m.reason);
    if (bucket) bucket.push(m);
    else out.set(m.reason, [m]);
  }
  return [...out.entries()];
}

export default async function MetricCatalogue(
  { searchParams }: { searchParams: Promise<{ by?: string }> },
) {
  const metrics = getAllMetrics();
  // BY FORM is a facet, not a second page (owner ruling 2026-08-27). The catalogue
  // already is the list of everything; what changes is the question it answers —
  // "what is this about" or "what can this honestly be drawn as". One URL, one
  // sitemap entry, and the by-form view is addressable and shareable.
  const byForm = ((await searchParams)?.by ?? "") === "form";
  const forms = byForm ? groupByForm() : null;

  const byCategory = new Map<string, MetricListItem[]>();
  for (const m of metrics) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category)!.push(m);
  }

  return (
    // Design-round stamps (2026-08-10): data-oid/data-role feed the Ottomate design
    // pipeline's decompose() and the computed pass's cross-component coherence check,
    // which asserts a given data-role resolves to the same styling here, in the atlas
    // chooser and in the region rail. Presentational no-ops. data-oid sits on <main>
    // rather than the <ul> because there is one <ul> per category and an oid must be
    // unique in the document.
    <main data-oid="metric-catalogue" className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
        ← Back to the map
      </Link>
      <div className="mt-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 30px inline logo */}
        <img
          src="/brand/mark.png"
          alt=""
          aria-hidden="true"
          width={30}
          height={30}
          className="h-[30px] w-[30px] flex-none object-contain"
        />
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">All metrics</h1>
      </div>
      <p className="mt-4 max-w-3xl leading-relaxed text-muted">
        {metrics.length.toLocaleString("en-IN")} indicators drawn from official government and
        top-tier institutional sources, each on its own permanent, cited page you can link to and
        embed. Pick one to see it mapped across India with a ranked table of every district.
      </p>

      {/* The facet switch. Two links rather than a control, so each view has a URL a
          reader can send someone (#575 item 1081). */}
      <div className="mt-6 flex items-center gap-2 text-[11px] font-bold tracking-[.08em]" data-facet-switch>
        <Link
          href="/metric"
          data-facet="category"
          aria-current={byForm ? undefined : "page"}
          className={`rounded-sm border px-2 py-1 no-underline ${byForm ? "border-border text-faint hover:bg-elevated" : "border-accent-border bg-elevated text-accent-text"}`}
        >
          BY SUBJECT
        </Link>
        <Link
          href="/metric?by=form"
          data-facet="form"
          aria-current={byForm ? "page" : undefined}
          className={`rounded-sm border px-2 py-1 no-underline ${byForm ? "border-accent-border bg-elevated text-accent-text" : "border-border text-faint hover:bg-elevated"}`}
        >
          BY FORM
        </Link>
      </div>

      {byForm && forms ? (
        <>
          <p className="mt-6 max-w-3xl leading-relaxed text-muted">
            The form a map takes is a property of the DATA, not a preference. A total
            adds up across districts, so shading it lets a large district shout and it
            is drawn as circles instead; a rate is already measured per person, so it
            is shaded. Each indicator appears once, under the instrument its numbers
            can honestly take &mdash; the same rule the map itself uses when it opens.
          </p>
          {forms.groups.map((g) => (
            <section key={g.viz} className="mt-10" data-form-group={g.viz}>
              <h2 className="border-b border-border-soft pb-2 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
                {g.name} <span className="font-normal text-faint">&middot; {g.metrics.length}</span>
              </h2>
              <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-muted" data-form-suits>
                {g.suits}
              </p>
              {/* The resolver's reader-facing sentence, once per DISTINCT reason —
                  not once per group, and not once per row.
                  Once per group was the first version, taken from the first metric on
                  the argument that "within a form it is the same sentence". It is not:
                  forest_change_km2 is a km² change that shading can carry because a
                  circle cannot say which way it went, and the page filed it under
                  "already measured per person or per unit of area", which is the one
                  thing a page about what the data can honestly be must not do.
                  Once per row would make it true and unreadable — 125 sentences under
                  125 single-line rows bury the list they annotate. Clustering the rows
                  by the sentence says each one exactly once and leaves the circles
                  group, whose members really do share a reason, as it was. */}
              {byReason(g.metrics).map(([reason, rows], i) => (
                <div key={reason} data-form-reason-group>
                  <p
                    className={`${i === 0 ? "mt-2" : "mt-6"} max-w-3xl text-[12.5px] leading-relaxed text-faint`}
                    data-form-reason
                  >
                    {reason}
                  </p>
                  <ul data-role="category-list" className="mt-3 border-t border-border-faint">
                    {rows.map(({ metric: m }) => (
                      <li key={m.id}>
                        <Link
                          href={`/metric/${m.id}`}
                          data-role="category-row"
                          title={`${m.name} — ${m.source}`}
                          className="grid h-8 items-center gap-x-2 border-b border-border-faint px-2 no-underline transition-colors duration-[160ms] hover:bg-elevated"
                          style={{ gridTemplateColumns: ROW_COLS }}
                        >
                          <span className="truncate text-[13.5px] font-semibold text-bright">{m.name}</span>
                          <span aria-hidden className="h-0 border-b border-dotted border-border" />
                          <CoverageMark levels={m.levels} />
                          <span className="text-right font-mono text-[10px] text-muted">{m.year}</span>
                          <span className="truncate text-right font-mono text-[9px] font-bold tracking-[.06em] text-foreground">
                            {sourceSigil(m.source)}
                          </span>
                          <span className="truncate text-right font-mono text-[9.5px] text-muted">{m.unit}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
          {/* Said out loud rather than quietly dropped. A metric with no values in the
              store cannot be asked what form suits it, and filing it under a guess
              would put a claim on this page that nothing backs. */}
          {forms.omitted > 0 ? (
            <p className="mt-8 text-[12px] leading-relaxed text-faint" data-form-omitted>
              {forms.omitted} indicator{forms.omitted === 1 ? " is" : "s are"} not listed here:
              the store carries no values for {forms.omitted === 1 ? "it" : "them"} yet, and the
              form that suits an indicator is decided from its numbers.
            </p>
          ) : null}
        </>
      ) : (
      [...byCategory.entries()].map(([cat, ms]) => (
        <section key={cat} className="mt-10">
          <h2 className="border-b border-border-soft pb-2 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
            {cat} <span className="font-normal text-faint">· {ms.length}</span>
          </h2>
          <ul data-role="category-list" className="mt-3 border-t border-border-faint">
            {ms.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/metric/${m.id}`}
                  data-role="category-row"
                  title={`${m.name} — ${m.source}`}
                  className="grid h-8 items-center gap-x-2 border-b border-border-faint px-2 no-underline transition-colors duration-[160ms] hover:bg-elevated"
                  style={{ gridTemplateColumns: ROW_COLS }}
                >
                  <span className="truncate text-[13.5px] font-semibold text-bright">{m.name}</span>
                  <span aria-hidden className="h-0 border-b border-dotted border-border" />
                  <CoverageMark levels={m.levels} />
                  <span className="text-right font-mono text-[10px] text-muted">{m.year}</span>
                  <span className="truncate text-right font-mono text-[9px] font-bold tracking-[.06em] text-foreground">
                    {sourceSigil(m.source)}
                  </span>
                  <span className="truncate text-right font-mono text-[9.5px] text-muted">{m.unit}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* Standing key for the two encoded columns, per section, listing only the
              sigils this section actually shows. Not a tooltip: `title` never fires on
              touch, and this is a public catalogue page. */}
          <div className="mt-2 border border-border-faint px-2 py-1.5 text-[9px] leading-[1.9] text-muted">
            {sourceLegend(ms.map((m) => m.source)).map((e) => (
              <span key={e.sigil} className="mr-3 inline-block">
                <b className="font-mono font-bold tracking-[.06em] text-foreground">{e.sigil}</b> {e.label}
              </span>
            ))}
            <span className="mr-3 inline-block">
              <CoverageMark levels={["district", "state"]} silent /> districts &amp; states
            </span>
            <span className="mr-3 inline-block">
              <CoverageMark levels={["district"]} silent /> districts only
            </span>
            <span className="inline-block">
              <CoverageMark levels={["state"]} silent /> states only
            </span>
          </div>
        </section>
      )))}

      <footer className="mt-12 border-t border-border-soft pt-5 text-[12px] leading-relaxed text-muted">
        See the{" "}
        <Link className="text-accent-text hover:underline" href="/methodology">
          methodology &amp; sources
        </Link>{" "}
        for how each number is computed.
      </footer>
    </main>
  );
}
