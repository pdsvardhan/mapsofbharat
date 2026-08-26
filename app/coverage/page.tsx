import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";
import { getCoverageSummary } from "@/lib/metric-page-data";
import {
  PROVENANCE_CLASSES,
  PROVENANCE_COLOR,
  PROVENANCE_LABEL,
  PROVENANCE_NOTE,
  coverageStat,
  type ProvenanceClass,
} from "@/lib/coverage";

// Coverage league table (iter-131 item 830). MoB's differentiator is that it
// knows, per region per metric, whether a value is the region's own measurement
// or an estimate — and of which kind. This server-rendered page ranks every
// metric by the share directly measured, so the ones that lean most on inherited
// or projected values are visible at a glance, each linking to its /metric/{id}
// page and its coverage-mode map. Data comes from the DB via lib/metric-page-data
// (getCoverageSummary reuses getMetricDetail's counts) — no self-HTTP.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coverage — measured vs estimated",
  description:
    "How much of each indicator on Maps of Bharat is directly measured versus inherited, re-aggregated or projected — every metric ranked by its measured share.",
  alternates: { canonical: `${SITE_URL}/coverage` },
  openGraph: {
    type: "website",
    title: "Coverage — measured vs estimated · Maps of Bharat",
    description:
      "Every indicator ranked by how much is directly measured versus estimated, with per-metric measured and inherited counts.",
    url: `${SITE_URL}/coverage`,
    siteName: "Maps of Bharat",
    locale: "en_IN",
    // Next merges metadata SHALLOWLY per top-level key, so declaring `openGraph`
    // here replaced the root layout's wholesale — including its opengraph-image
    // file convention. Without this the page shared as a bare link with no card.
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coverage — measured vs estimated · Maps of Bharat",
    description:
      "Every indicator ranked by how much is directly measured versus estimated.",
    images: [SITE_TWITTER_IMAGE],
  },
};

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default function CoveragePage() {
  const metrics = getCoverageSummary();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
          ← Back to the map
        </Link>
        <Link href="/metric" className="text-[13px] font-semibold text-faint hover:text-accent-text">
          All metrics →
        </Link>
      </div>

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
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Coverage</h1>
      </div>
      <p className="mt-4 max-w-3xl leading-relaxed text-muted">
        Every number on Maps of Bharat is tagged with its provenance: the region&apos;s own reported
        measurement, or an estimate — and, when estimated, of which kind. This page ranks all{" "}
        {metrics.length.toLocaleString("en-IN")} indicators by the share directly measured, so the
        ones that lean most on estimates sit at the top. Each links to its full page, where the map
        can be switched to the <strong className="font-semibold text-foreground">Coverage</strong>{" "}
        view and shaded by provenance.
      </p>

      {/* Provenance key — the same classes and colours the coverage map uses */}
      <dl className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* dl > div > (dt, dd) — the ONE div wrapper HTML permits, and no more
            (iter-44, axe definition-list + dlitem, 18 nodes).

            This used to nest a second div to stack the label over its note, which
            put dt and dd two levels down, so their parent was not a child of the
            dl — an invalid content model, and 9 axe nodes per viewport.

            WHAT THIS DOES NOT CLAIM, corrected after verification. An earlier
            version of this comment said a screen reader read the key as loose
            text. That is not demonstrable: Chromium's accessibility tree exposed
            correctly paired term/definition nodes BEFORE the change as well, and
            the ariaSnapshot is byte-identical either side. What actually changed
            is a valid content model and one less ignored generic — real
            conformance, at zero visual cost, but not a change in what Chromium
            announces. Other engines were not measured, so whether any AT ever
            behaved differently here is unknown rather than established.

            A grid does the stacking that the inner div was doing — swatch in the
            first column spanning both rows, dt above dd in the second — so the
            rendering is unchanged and the semantics are correct. */}
        {PROVENANCE_CLASSES.map((c) => (
          <div
            key={c}
            className="grid grid-cols-[auto_1fr] items-start gap-x-2.5 border border-border px-3 py-2.5"
            style={{ background: "var(--panel)" }}
          >
            <span
              className="row-span-2 mt-0.5 h-3 w-4 flex-none rounded-[2px]"
              style={{ background: PROVENANCE_COLOR[c] }}
              aria-hidden="true"
            />
            <dt className="text-[12.5px] font-semibold text-bright">{PROVENANCE_LABEL[c]}</dt>
            <dd className="text-[11.5px] leading-snug text-muted">{PROVENANCE_NOTE[c]}</dd>
          </div>
        ))}
      </dl>

      {metrics.length === 0 ? (
        <p className="mt-10 text-[13px] text-muted">Coverage data is not available right now.</p>
      ) : (
        <ol className="mt-8 space-y-2" data-coverage-list>
          {metrics.map((m, i) => {
            const noun = m.level === "district" ? "districts" : "states";
            const counts = {
              measured: m.measured,
              aggregated: m.aggregated,
              inherited: m.inherited,
              projected: m.projected,
            };
            const seg: [ProvenanceClass, number][] = [
              ["measured", m.measured],
              ["aggregated", m.aggregated],
              ["inherited", m.inherited],
              ["projected", m.projected],
            ];
            return (
              <li key={m.id} data-coverage-row data-measured-share={m.measuredShare.toFixed(4)}>
                <Link
                  href={`/metric/${m.id}`}
                  className="block border border-border px-4 py-3 no-underline hover:border-faint"
                  style={{ background: "var(--panel)" }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {/* THE UNIT IS NOT PART OF WHAT TRUNCATES (#630, iter-45).
                        One `truncate` used to sit on a span wrapping rank, name AND
                        unit, so at 320px the ellipsis ate the unit: 21 of these rows
                        had their unit's right edge 3-77px outside the viewport and
                        simply lost it, which turns "Literacy rate (%)" into a number
                        with no idea what it counts. The row is a flex line now — rank
                        and unit are flex-none, and only the NAME may be shortened,
                        because the name is the part a reader can still recognise from
                        its first few words. */}
                    <span className="flex min-w-0 items-baseline gap-1.5 text-[13.5px] font-semibold text-bright">
                      <span className="flex-none font-mono text-[10px] text-faint">{i + 1}.</span>
                      <span className="truncate">{m.name}</span>
                      {m.unit ? <span data-coverage-unit className="flex-none text-[11px] font-normal text-faint">({m.unit})</span> : null}
                    </span>
                    <span className="flex-none font-mono text-[13px] font-bold text-bright" data-measured-pct>
                      {pct(m.measuredShare)}
                    </span>
                  </div>

                  {/* Stacked provenance bar — measured vs each estimate kind */}
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-[2px]" style={{ background: "var(--map-nodata)" }}>
                    {seg.map(([cls, n]) =>
                      n > 0 ? (
                        <span
                          key={cls}
                          title={`${PROVENANCE_LABEL[cls]}: ${n.toLocaleString("en-IN")}`}
                          style={{ width: `${(n / m.total) * 100}%`, background: PROVENANCE_COLOR[cls] }}
                        />
                      ) : null,
                    )}
                  </div>

                  <div className="mt-1.5 text-[11px] text-muted" data-coverage-counts>
                    {coverageStat(counts, m.total, noun)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="mt-12 border-t border-border-soft pt-5 text-[12px] leading-relaxed text-muted">
        &ldquo;Measured&rdquo; is the region&apos;s own reported figure; the estimate kinds are
        defined in the{" "}
        <Link className="text-accent-text hover:underline" href="/methodology">
          methodology &amp; sources
        </Link>
        . Estimates are always disclosed at the point the number is read — in the rail, the map
        hover, the region panel and every exported card.
      </footer>

      <SiteFooter />
    </main>
  );
}
