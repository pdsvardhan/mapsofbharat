import type { MetadataRoute } from "next";

import { getAllMetrics } from "@/lib/metric-page-data";
import { CANONICAL_URL } from "@/lib/site";

// Sitemap (iter-b item 881): the static public pages plus every canonical
// /metric/{id} page. The metric set lives in the runtime-mounted store, not the
// build image, so this is dynamic and enumerated read-only from the DB the same
// way app/methodology and lib/metric-page-data do. It degrades to just the static
// routes when the store isn't mounted (getAllMetrics returns []), and never 500s.
// Absolute URLs use the canonical public domain (lib/site), never the deploy host.
// /api and /embed are intentionally absent — both are disallowed in robots, and
// /embed additionally carries X-Robots-Tag: noindex (item 882).
//
// to-do 440 (iter-36): /metric — the crawlable catalogue built by item 829 as the
// browse surface every metric page hangs off — was present in the original
// sitemap and was dropped when item 881 rewrote this file around a flat
// STATIC_PATHS list. metric-pages.spec.ts:125 has asserted it since item 829 and
// went red at that rewrite. Restored, and the per-path crawl hints are now
// explicit so a hub page can outrank a legal page instead of every static route
// sharing one priority.
export const dynamic = "force-dynamic";

type StaticEntry = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

// Ordered most- to least-important; a sitemap's order is a hint, priority is the
// explicit signal.
const STATIC_PATHS: readonly StaticEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/metric", changeFrequency: "weekly", priority: 0.9 },
  { path: "/coverage", changeFrequency: "weekly", priority: 0.7 },
  { path: "/methodology", changeFrequency: "monthly", priority: 0.6 },
  { path: "/corrections", changeFrequency: "monthly", priority: 0.5 },
  // /explore redirects to `/` with the query string intact, kept alive for
  // pre-iter-51 permalinks (app/explore/page.tsx). It is listed because
  // seo.spec.ts requires every static public path, but it is NOT a destination of
  // its own — hence the lowest crawl priority of the set. Search Console will
  // report it under "Page with redirect", which is expected, not a defect.
  { path: "/explore", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = STATIC_PATHS.map(
    ({ path, changeFrequency, priority }) => ({
      url: path === "/" ? `${CANONICAL_URL}/` : `${CANONICAL_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })
  );

  let metricPages: MetadataRoute.Sitemap = [];
  try {
    metricPages = getAllMetrics().map((m) => ({
      url: `${CANONICAL_URL}/metric/${m.id}`,
      lastModified: m.last_updated ? new Date(m.last_updated) : now,
      changeFrequency: "yearly",
      priority: 0.7,
    }));
  } catch {
    // getAllMetrics already returns [] for a missing DB; this also swallows a
    // mid-read failure so a degraded store can never take the whole sitemap down.
    metricPages = [];
  }

  return [...staticPages, ...metricPages];
}
