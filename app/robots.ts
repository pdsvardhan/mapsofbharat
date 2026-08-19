import type { MetadataRoute } from "next";

import { CANONICAL_URL, IS_LAUNCHED } from "@/lib/site";

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
// Rendered per REQUEST, not baked at build. Next prerenders robots.txt as a static
// file by default, which would mean flipping SITE_LAUNCHED at runtime moved the
// X-Robots-Tag header (middleware, runtime) but left robots.txt still saying
// Disallow — two halves of one switch disagreeing, which is the exact failure this
// project keeps finding. One flag, one behaviour, no rebuild required.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Pre-launch: disallow everything and advertise NOTHING. No sitemap line and no
  // host line either — a sitemap is an invitation, and the host directive would be
  // naming a domain that does not resolve yet. See IS_LAUNCHED in lib/site.
  if (!IS_LAUNCHED) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
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
