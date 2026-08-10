import type { Metadata } from "next";
import Link from "next/link";

import { getAllMetrics, type MetricListItem } from "@/lib/metric-page-data";

// Crawlable catalogue of every metric (iter-131 item 829, AC 5). /explore
// redirects to the atlas /, so this server-rendered index is where the linkable
// list of canonical /metric/{id} pages lives — grouped by category, each a real
// crawlable link. This is the browse surface the sitemap and the home page point
// at.
export const dynamic = "force-dynamic";

const SITE_URL = "https://mapsofbharat.vault7a.xyz";

export const metadata: Metadata = {
  title: "All metrics",
  description:
    "Browse every indicator on Maps of Bharat — India's official statistics mapped by district and state, each on its own cited, permanent page.",
  alternates: { canonical: `${SITE_URL}/metric` },
  openGraph: {
    type: "website",
    title: "All metrics · Maps of Bharat",
    description:
      "Browse every indicator on Maps of Bharat — India's official statistics mapped by district and state.",
    url: `${SITE_URL}/metric`,
  },
};

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
      <Link href="/" className="text-[13px] font-semibold text-accent hover:underline">
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
            {cat} <span className="font-normal text-dim">· {ms.length}</span>
          </h2>
          <ul data-role="category-list" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ms.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/metric/${m.id}`}
                  data-role="category-row"
                  className="flex items-baseline justify-between gap-3 border border-border px-4 py-3 hover:border-faint"
                  style={{ background: "var(--panel)" }}
                >
                  <span className="text-[13.5px] font-semibold text-bright">
                    {m.name}
                    {m.unit ? <span className="ml-1.5 text-[11px] font-normal text-faint">({m.unit})</span> : null}
                  </span>
                  <span className="flex-none font-mono text-[10px] text-dim">{m.year}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-12 border-t border-border-soft pt-5 text-[12px] leading-relaxed text-dim">
        See the{" "}
        <Link className="text-accent hover:underline" href="/methodology">
          methodology &amp; sources
        </Link>{" "}
        for how each number is computed.
      </footer>
    </main>
  );
}
