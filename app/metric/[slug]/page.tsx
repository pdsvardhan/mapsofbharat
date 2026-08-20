import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CiteBlock } from "@/components/atlas/cite-block";
import { MetricLineage } from "@/components/atlas/metric-lineage";
import { MetricTable } from "@/components/atlas/metric-table";
import { MetricShare } from "@/components/atlas/metric-share";
import { SiteFooter } from "@/components/site-footer";
import { estimateFootnote } from "@/lib/estimate-kind";
import {
  buildMetricRows,
  getAllMetrics,
  getMetricDetail,
  getMetricMeta,
  rankRows,
  type MetricListItem,
} from "@/lib/metric-page-data";
import { getMetricLineage } from "@/lib/metric-raw-source";
import { SITE_URL } from "@/lib/site";

// Canonical, server-rendered, indexable page for one metric (iter-131 item 829).
// The ranked table, coverage stats and every citation line are in the SSR HTML so
// crawlers and readers-without-JS get the data; only the interactive map (an
// /embed iframe) and the sort/copy controls hydrate. Data comes from the DB via
// lib/metric-page-data — this page never HTTP-fetches its own API to render.
export const dynamic = "force-dynamic";

/** Prefer district-level (the ranked-table default); fall back to state for the
 *  state-only series (RBI finance, etc.). Mirrors india-map's level pick. */
function pageLevel(m: Pick<MetricListItem, "levels">): "state" | "district" {
  return m.levels.includes("district") ? "district" : "state";
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** Meta / OG description: what the metric is, its scope, source and year, then the
 *  methodology sentence if there is room. */
function describe(m: MetricListItem): string {
  const scope = pageLevel(m) === "district" ? "district" : "state";
  const base = `${m.name} across India, mapped by ${scope}${m.year ? ` (${m.year})` : ""}. Official data from ${m.source}.`;
  return truncate(m.methodology ? `${base} ${m.methodology}` : base, 230);
}

// All 124 ids — pre-renders the known set when the store is present at build.
// The store is a runtime-mounted volume (absent at build), so this returns [] in
// the image and the page renders per-request (force-dynamic); on any environment
// where the DB is present at build, it enumerates every metric.
export async function generateStaticParams() {
  return getAllMetrics().map((m) => ({ slug: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = getMetricMeta(slug);
  // An unknown slug 404s in the page body; make sure it also can't inherit the
  // root layout's `/` canonical while it is being rendered.
  if (!m)
    return {
      title: "Metric not found",
      robots: { index: false, follow: false },
      alternates: { canonical: null },
    };
  const url = `${SITE_URL}/metric/${m.id}`;
  const description = describe(m);
  const title = `${m.name} across India`;
  // og:image / twitter:image come from opengraph-image.tsx (file convention) —
  // deliberately NOT listed here, because declaring openGraph.images would
  // override the generated per-metric card. That route also supplies
  // og:image:width/height/type/alt, which is what makes WhatsApp render the
  // large preview instead of a thumbnail (or nothing).
  //
  // Next merges metadata shallowly per top-level key, so `openGraph` here
  // REPLACES the root layout's — siteName and locale must be restated or the
  // per-metric card silently loses them.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Maps of Bharat",
      locale: "en_IN",
      title: `${title} · Maps of Bharat`,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Maps of Bharat`,
      description,
      site: "@maps_of_bharat",
      creator: "@maps_of_bharat",
    },
  };
}

export default async function MetricPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = getMetricMeta(slug);
  if (!meta) notFound();

  const level = pageLevel(meta);
  const detail = getMetricDetail(slug, level);
  if (!detail) notFound();

  const rows = buildMetricRows(detail);
  const ranks = rankRows(rows);
  const lineage = getMetricLineage(detail.id);
  const scopeNoun = level === "district" ? "districts" : "states";
  const measured = detail.count - detail.estimated_count;
  const footnote = estimateFootnote(rows, scopeNoun);

  const pct = detail.unit === "%";
  const fmt = (v: number) =>
    v.toLocaleString("en-IN", { maximumFractionDigits: detail.decimals });
  const fmtUnit = (v: number) => fmt(v) + (pct ? "%" : "");
  const unitLabel = detail.unit && !pct ? ` ${detail.unit}` : "";
  const updated = detail.last_updated ? String(detail.last_updated).slice(0, 10) : null;

  const pageUrl = `${SITE_URL}/metric/${detail.id}`;
  const atlasUrl = `/?m=${encodeURIComponent(detail.id)}&lvl=${level}`;
  const embedUrl = `${SITE_URL}/embed?m=${encodeURIComponent(detail.id)}&lvl=${level}`;
  const embedSnippet = `<iframe src="${embedUrl}" width="800" height="560" style="border:0" loading="lazy" title="Maps of Bharat — ${detail.name.replace(/"/g, "")}"></iframe>`;

  // JSON-LD Dataset (item 829 AC 3): makes the page a first-class dataset record
  // for search engines and dataset crawlers, cited to the underlying source.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${detail.name} across India${detail.year ? ` (${detail.year})` : ""}`,
    description: describe(meta),
    url: pageUrl,
    license: detail.license || undefined,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Maps of Bharat", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Maps of Bharat", url: SITE_URL },
    temporalCoverage: detail.year ? String(detail.year) : undefined,
    spatialCoverage: { "@type": "Place", name: "India" },
    variableMeasured: detail.name,
    measurementTechnique: detail.methodology || undefined,
    citation: detail.source || undefined,
    sameAs: detail.source_url || undefined,
    dateModified: detail.last_updated || undefined,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
          ← Back to the map
        </Link>
        <Link href="/metric" className="text-[13px] font-semibold text-faint hover:text-accent-text">
          All metrics →
        </Link>
      </div>

      <header className="mt-5">
        <div className="text-[10px] font-bold uppercase tracking-[.12em] text-accent-text">
          {detail.category}
        </div>
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 30px inline logo */}
          <img
            src="/brand/mark.png"
            alt=""
            aria-hidden="true"
            width={30}
            height={30}
            className="h-[30px] w-[30px] flex-none object-contain"
          />
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-bright">
            {detail.name}
            {detail.unit ? <span className="ml-2 text-[18px] font-semibold text-faint">({detail.unit})</span> : null}{" "}
            <span className="text-[18px] font-semibold text-muted">across India</span>
          </h1>
        </div>
        {detail.methodology ? (
          (() => {
            // Seven dense lines of caveat sit above the first number on a page
            // people reach from search. Moving them is a CONTENT-ORDER change and
            // is explicitly out of scope (and CSS order would desync the visual
            // and screen-reader orders). Weight is not: the lead sentence reads
            // at body weight and the rest recedes, so the eye reaches the number.
            const m = detail.methodology.match(/^([\s\S]*?[.!?])(\s+)([\s\S]*)$/);
            const lead = m ? m[1] : detail.methodology;
            const rest = m ? m[3] : "";
            return (
              <p className="mt-4 max-w-3xl leading-relaxed text-muted" data-methodology>
                <span data-methodology-lead className="text-foreground">{lead}</span>
                {rest ? <span data-methodology-rest className="text-faint"> {rest}</span> : null}
              </p>
            );
          })()
        ) : null}
      </header>

      {/* Headline stats + coverage, all in the SSR HTML */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="average">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">
            National average
          </div>
          <div className="mt-1 font-mono text-[34px] font-bold leading-none text-bright">
            {detail.stats_count ? fmtUnit(detail.mean) : "—"}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            over {detail.stats_count.toLocaleString("en-IN")} {scopeNoun}
          </div>
        </div>
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="range">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">Range</div>
          <div className="mt-1 font-mono text-[15px] font-semibold leading-snug text-foreground">
            {detail.stats_count ? `${fmtUnit(detail.min)} – ${fmtUnit(detail.max)}` : "—"}
          </div>
          <div className="mt-2 text-[11px] text-muted">lowest to highest{unitLabel ? ` (${detail.unit})` : ""}</div>
        </div>
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="coverage">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">Coverage</div>
          <div className="mt-1 font-mono text-[15px] font-semibold leading-snug text-foreground">
            {measured.toLocaleString("en-IN")} of {detail.count.toLocaleString("en-IN")} {scopeNoun}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            measured directly
            {detail.estimated_count > 0
              ? ` · ${detail.estimated_count.toLocaleString("en-IN")} estimated`
              : ""}
          </div>
        </div>
      </section>

      {footnote ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{footnote}</p>
      ) : null}

      <div className="mt-3 font-mono text-[11px] text-faint">
        Source:{" "}
        <a
          className="text-accent-text hover:underline"
          href={detail.source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {detail.source}
        </a>
        {" · "}
        {detail.license} · {detail.year}
        {updated ? (
          <>
            {" · "}
            <span data-testid="last-updated">{`Last updated ${updated}`}</span>
          </>
        ) : null}
      </div>

      {/* Interactive map — the real /embed atlas view, framed same-origin. It
          hydrates inside the iframe; the ranked data above/below stays in SSR. */}
      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
          Interactive map
        </h2>
        <iframe
          src={`/embed?m=${encodeURIComponent(detail.id)}&lvl=${level}`}
          title={`${detail.name} — interactive choropleth of India`}
          loading="lazy"
          data-map-frame
          className="mx-auto block h-[660px] w-full max-w-[700px] border border-border"
          style={{ background: "var(--panel)" }}
        />
      </section>

      {/* Ranked table — reuses the atlas DataTable; every row is in SSR HTML */}
      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
          Ranked {scopeNoun}
        </h2>
        <div className="atl-scroll flex max-h-[640px] flex-col overflow-auto border border-border" style={{ background: "var(--panel)" }}>
          <MetricTable
            metricLabel={detail.name}
            unit={detail.unit}
            year={detail.year}
            scopeNoun={scopeNoun}
            decimals={detail.decimals}
            entries={rows}
            rankOf={ranks}
          />
        </div>
      </section>

      {/* Data lineage + tiered download (iter-131 item 831), server-rendered */}
      <MetricLineage
        metricId={detail.id}
        source={detail.source}
        sourceUrl={detail.source_url}
        scopeNoun={scopeNoun}
        lineage={lineage}
      />

      {/* To cite this (iter-32 item 846) — sits with the provenance/lineage area.
          Client island so the "Accessed" date is the reader's real access date. */}
      <CiteBlock
        kind="metric"
        metricName={detail.name}
        source={detail.source}
        year={detail.year}
        metricId={detail.id}
      />

      {/* Share / embed */}
      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
          Share &amp; embed
        </h2>
        <div className="border-y-[3px] border-border px-1 py-4" data-band="share">
          <MetricShare pageUrl={pageUrl} embedSnippet={embedSnippet} atlasUrl={atlasUrl} />
        </div>
      </section>

      <footer className="mt-10 border-t border-border-soft pt-5 text-[12px] leading-relaxed text-muted">
        Values are harmonized onto current-day boundaries and keep their citation. See the{" "}
        <Link className="text-accent-text hover:underline" href="/methodology">
          methodology &amp; sources
        </Link>{" "}
        for how each number is computed and where it is imperfect.
      </footer>

      <SiteFooter />
    </main>
  );
}
