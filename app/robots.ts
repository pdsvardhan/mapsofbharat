import type { MetadataRoute } from "next";

import { CANONICAL_URL } from "@/lib/site";

// SEO floor (iter-b item 881): the public site is indexable, but the JSON read
// API and the chrome-less /embed iframe view are kept out of the index, and
// crawlers are pointed at the sitemap. Absolute URLs use the canonical public
// domain (lib/site), never the deploy host.
//
// /embed is disallowed here AND carries X-Robots-Tag: noindex (middleware.ts) AND
// robots:{index:false} metadata (app/embed/layout.tsx). The overlap is
// intentional: a Disallow alone stops a crawler READING the noindex, so a
// disallowed URL that is linked from elsewhere can still surface as a bare URL —
// the header and the meta close that gap for any crawler that does fetch it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api", "/embed"],
    },
    sitemap: `${CANONICAL_URL}/sitemap.xml`,
    host: CANONICAL_URL,
  };
}
