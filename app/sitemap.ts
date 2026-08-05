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
export const dynamic = "force-dynamic";

const STATIC_PATHS = [
  "/",
  "/explore",
  "/methodology",
  "/coverage",
  "/corrections",
  "/terms",
  "/privacy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: path === "/" ? `${CANONICAL_URL}/` : `${CANONICAL_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));

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
