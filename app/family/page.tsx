import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { getFamilyList } from "@/lib/family-data";
import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";

// Crawlable index of every metric family (#547 phase B, iter-40 item 975).
//
// The owner's call at the iteration-40 lock-in gate was BOTH entrances: each
// member metric page links to its family, and this page lists them all. That
// follows #575's ordering — metric-first stays the front door and carries the
// discovery, and this is the second entrance for a reader who wants to browse by
// subject rather than arrive at one indicator.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Browse Maps of Bharat by subject — sets of related official indicators drawn as one grid of district maps, so a whole topic can be read at a glance.";

export const metadata: Metadata = {
  title: "Metric families",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/family` },
  openGraph: {
    type: "website",
    siteName: "Maps of Bharat",
    locale: "en_IN",
    title: "Metric families · Maps of Bharat",
    description: DESCRIPTION,
    url: `${SITE_URL}/family`,
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Metric families · Maps of Bharat",
    description: DESCRIPTION,
    site: "@maps_of_bharat",
    creator: "@maps_of_bharat",
    images: [SITE_TWITTER_IMAGE],
  },
};

export default async function FamilyIndexPage() {
  const families = getFamilyList();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
          ← Back to the map
        </Link>
        <Link href="/metric" className="text-[13px] font-semibold text-faint hover:text-accent-text">
          All metrics →
        </Link>
      </div>

      <header className="mt-5">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-bright">
          Metric families
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Indicators that share a source, a unit and a vintage, drawn as one grid of
          district maps. Reading a subject as a set shows what a single map cannot: where
          two things move together, and where they do not.
        </p>
      </header>

      <ul className="mt-8 divide-y divide-border-soft">
        {families.map((f) => (
          <li key={f.id} className="py-4">
            <Link href={`/family/${f.id}`} className="group block no-underline">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[15px] font-semibold text-foreground group-hover:text-accent-text group-hover:underline">
                  {f.label}
                </span>
                <span className="font-mono text-[11px] text-faint">
                  {f.resolvedMembers} maps
                </span>
                <span className="ml-auto font-mono text-[11px] text-faint">
                  {f.declaredSharedDistricts.toLocaleString("en-IN")} districts
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">{f.blurb}</p>
              {/* The part-to-whole families are the strongest small-multiple case
                  and there are only two, so they are marked here rather than left
                  for the reader to discover on the page itself. */}
              {f.partToWhole ? (
                <p className="mt-1 text-[11px] text-faint">
                  Parts of one whole — these shares sum to{" "}
                  {f.partToWhole.sumsTo.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
                  on average.
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <SiteFooter />
    </main>
  );
}
