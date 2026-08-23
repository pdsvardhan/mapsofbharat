import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FamilyGrid } from "@/components/atlas/family-grid";
import { SiteFooter } from "@/components/site-footer";
import { getFamilyDetail, type FamilyDetail } from "@/lib/family-data";
import { districtPaths } from "@/lib/family-paths";
import { FAMILY_BY_ID } from "@/lib/metric-families";
import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";

// Canonical, server-rendered page for one metric family (#547 phase B, iter-40
// item 969) — the small-multiple grid and the citations behind it.
//
// PER-REQUEST, NOT STATIC, and that is a decision rather than an oversight
// (adr-d3geo). The values come from the canonical store, .dockerignore excludes
// `data`, so the store is absent at build — the same constraint that makes
// app/metric/[slug]/page.tsx:49 force-dynamic. Statically generating this page
// would also make everything it imports a BUILD-time dependency, which is exactly
// the door adr-d3geo closed: the projection runs in prebuild and this route reads
// the artefact, so nothing here imports d3-geo.
export const dynamic = "force-dynamic";

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function describe(f: Pick<FamilyDetail, "label" | "blurb" | "source" | "declaredMembers">): string {
  return truncate(
    `${f.label} across India's districts — ${f.declaredMembers} related indicators on one grid of maps. ${f.blurb} Official data from ${f.source}.`,
    230
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const family = FAMILY_BY_ID.get(id);
  // Metadata is served from the DECLARATION, not the store: the family exists
  // whether or not the data volume is mounted, and a page that 404s its title
  // while rendering its body would emit two different answers about the same URL.
  if (!family || family.blockedBy) {
    return {
      title: "Metric family not found",
      robots: { index: false, follow: false },
      alternates: { canonical: null },
    };
  }
  const url = `${SITE_URL}/family/${family.id}`;
  const title = `${family.label} across India`;
  const description = describe({
    label: family.label,
    blurb: family.blurb,
    source: family.source,
    declaredMembers: family.members.length,
  });
  // No segment-level opengraph-image here, so the site card must be restated —
  // declaring `openGraph` at all replaces the root layout's wholesale (lib/site).
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
      images: [SITE_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Maps of Bharat`,
      description,
      site: "@maps_of_bharat",
      creator: "@maps_of_bharat",
      images: [SITE_TWITTER_IMAGE],
    },
  };
}

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const family = getFamilyDetail(id);
  if (!family) notFound();

  const axisLabel = family.axis === "shared" ? "One shared scale" : "Its own scale per map";
  const geo = family.members.length ? districtPaths() : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
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
          Metric family
        </div>
        <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight text-bright">
          {family.label}{" "}
          <span className="text-[18px] font-semibold text-muted">across India</span>
        </h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-muted">{family.blurb}</p>
      </header>

      {!family.storeAvailable ? (
        // The family is declared but the store is not mounted. Said plainly rather
        // than rendered as an empty grid, which would read as "no data exists".
        <p className="mt-8 border-y-[3px] border-border py-4 text-[13px] text-muted">
          The data store is not mounted on this instance, so the maps cannot be drawn.
          The family and its {family.declaredMembers} indicators are listed below.
        </p>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="members">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">Indicators</div>
          <div className="mt-1 font-mono text-[34px] font-bold leading-none text-bright">
            {family.resolvedMembers}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            drawn as one grid, from the same source
          </div>
        </div>
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="shared">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">
            Shared districts
          </div>
          <div className="mt-1 font-mono text-[15px] font-semibold leading-snug text-foreground">
            {family.measuredSharedDistricts.toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            carry a value for every indicator here
          </div>
        </div>
        <div className="border-y-[3px] border-border px-1 py-3" data-band="stat" data-stat="axis">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">Scale</div>
          <div className="mt-1 font-mono text-[15px] font-semibold leading-snug text-foreground">
            {axisLabel}
          </div>
          <div className="mt-1 text-[11px] text-muted">{family.unit === "%" ? "percent" : family.unit}</div>
        </div>
      </section>

      {family.storeAvailable && family.missingMembers.length ? (
        // Declared-but-absent members are surfaced, never quietly dropped: a grid
        // silently one panel short is the failure this whole feature is supposed
        // to make impossible.
        <p className="mt-6 border-y-[3px] border-border py-3 text-[12px] text-muted">
          {family.missingMembers.length} declared indicator
          {family.missingMembers.length === 1 ? " is" : "s are"} missing from the store and
          not drawn: <span className="font-mono text-faint">{family.missingMembers.join(", ")}</span>.
        </p>
      ) : null}

      {family.members.length ? (
        <section className="mt-10">
          {geo ? (
            <FamilyGrid family={family} paths={geo.paths} panel={geo.panel} />
          ) : (
            // The prebuild guard fails the build when the artefact is missing, so
            // reaching this means something got past it. Said out loud rather than
            // rendered as an empty grid.
            <p className="border-y-[3px] border-border py-4 text-[13px] text-muted">
              The projected boundaries are unavailable on this instance, so the maps
              cannot be drawn. The indicators and their ranges are listed below.
            </p>
          )}
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">
          The indicators
        </h2>
        {/* With no store there are no names, ranges or vintages — those live in the
            DB. The declared ids do exist, so the list is rendered from those rather
            than left empty under a heading that promises it. A heading above
            nothing is the page contradicting itself one paragraph later.
            
            The condition is "are there members to show", NOT "is the store here".
            Those come apart when the store is mounted but every member of a family
            has been retired: storeAvailable is true, members is empty, and keying
            off the store alone put the heading back over an empty list. Same
            defect, one corner further out. */}
        <ul className="mt-3 divide-y divide-border-soft">
          {family.members.length
            ? family.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <Link
                    href={`/metric/${m.id}`}
                    className="text-[14px] font-semibold text-foreground hover:text-accent-text hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="font-mono text-[11px] text-faint">
                    {m.statsCount
                      ? `${m.min.toLocaleString("en-IN", { maximumFractionDigits: m.decimals })}–${m.max.toLocaleString("en-IN", { maximumFractionDigits: m.decimals })}${m.unit === "%" ? "%" : ""}`
                      : "—"}
                  </span>
                  <span className="ml-auto text-[11px] text-muted">{m.year}</span>
                </li>
              ))
            : family.memberIds.map((id) => (
                <li key={id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <Link
                    href={`/metric/${id}`}
                    className="font-mono text-[13px] font-semibold text-foreground hover:text-accent-text hover:underline"
                  >
                    {id}
                  </Link>
                  <span className="text-[11px] text-faint">
                    name and range need the data store
                  </span>
                </li>
              ))}
        </ul>
      </section>

      <section className="mt-10 border-t-[3px] border-border pt-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">Source</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          {family.source}
          {family.members.length ? (
            <>
              {" "}
              <a
                href={family.members[0].source_url}
                className="text-accent-text hover:underline"
                rel="noreferrer"
              >
                Source data
              </a>
              .
            </>
          ) : null}
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
