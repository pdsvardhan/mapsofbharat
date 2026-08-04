import type { MetadataRoute } from "next";

import { getAllMetrics } from "@/lib/metric-page-data";

// Sitemap (iter-131 item 829, AC 5): the canonical /metric/{id} pages plus the
// catalogue, home, methodology and embed. Dynamic because the metric set lives in
// the runtime-mounted store, not the build image.
export const dynamic = "force-dynamic";

const SITE_URL = "https://mapsofbharat.vault7a.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const metrics = getAllMetrics();

  const metricPages: MetadataRoute.Sitemap = metrics.map((m) => ({
    url: `${SITE_URL}/metric/${m.id}`,
    lastModified: m.last_updated ? new Date(m.last_updated) : now,
    changeFrequency: "yearly",
    priority: 0.7,
  }));

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/metric`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/embed`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    ...metricPages,
  ];
}
