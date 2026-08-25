import type { Metadata } from "next";
import Link from "next/link";

import { getAllMetrics, type MetricListItem } from "@/lib/metric-page-data";
import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";
import { coverageOf, sourceLegend, sourceSigil } from "@/lib/source-sigil";

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

export default function MetricCatalogue() {
  const metrics = getAllMetrics();

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

      {[...byCategory.entries()].map(([cat, ms]) => (
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
      ))}

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
