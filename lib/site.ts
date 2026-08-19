// Shared site constants (iter-32; SITE_URL added iter-36 item 406).
//
// TWO base URLs, deliberately distinct only while the public domain is being
// acquired (to-do 407). Both live here so neither is ever re-typed as a literal.
//
//   CANONICAL_URL — the permanent PUBLIC domain. Used for citations, robots.txt
//     and the sitemap: a citation must point at the durable public address, not
//     at the box the site happens to run on.
//
//   SITE_URL — the origin this deployment is actually SERVED from today. Every
//     absolute URL that a crawler or an unfurler (WhatsApp, Twitter, Slack) has
//     to FETCH *right now* resolves against this: metadataBase, <link
//     rel="canonical">, og:url and — critically — og:image. mapsofbharat.in does
//     not resolve yet, so pointing those at CANONICAL_URL would mean no link
//     preview at all.
//
// At the domain switchover this collapses to a one-line change: set SITE_URL to
// the same value as CANONICAL_URL and every canonical, OG and sitemap URL agrees
// again. Nothing else needs editing.
// LAUNCH STATE (to-do 525). The site is DEPLOYED and reachable at SITE_URL long
// before it is LAUNCHED, and those are different things. While unlaunched it must
// not be indexed AT ALL — not because the content is secret, but because the only
// address that exists today is the internal one. If a crawler indexes
// mapsofbharat.vault7a.xyz first, that becomes the URL search engines know, and
// the real domain then has to fight its own predecessor for the same content.
//
// Default is UNLAUNCHED, deliberately: forgetting to set a flag must fail toward
// "not indexed", never toward an accidental public debut. Flip by setting
// SITE_LAUNCHED=true in the environment at the same moment SITE_URL becomes
// CANONICAL_URL — one switchover, both changes.
export const IS_LAUNCHED = process.env.SITE_LAUNCHED === "true";

export const CANONICAL_URL = "https://mapsofbharat.in";

export const SITE_URL = "https://mapsofbharat.vault7a.xyz";

// The site-wide social card — app/opengraph-image.png and app/twitter-image.png,
// both 1200x630 and ~31KB, comfortably inside WhatsApp's ~600KB preview ceiling.
//
// WHY THIS HAS TO EXIST (iter-36 item 406). Next merges metadata SHALLOWLY per
// top-level key, and the root `opengraph-image` file convention is attached to
// the ROOT layout's `openGraph`. So the moment a page declares an `openGraph` of
// its own it replaces the root's WHOLESALE — and silently loses the image. That
// is exactly what /metric, /methodology and /coverage were doing: correct title,
// correct description, correct canonical, and NO og:image, i.e. no WhatsApp link
// preview card at all. Any page that declares its own openGraph/twitter and does
// NOT ship a segment-level opengraph-image file must therefore restate these.
//
// The URLs are RELATIVE on purpose: Next resolves them against `metadataBase`
// (SITE_URL), so they follow the domain switchover for free and are still
// emitted as the absolute URLs an unfurler requires.
const OG_ALT = "Maps of Bharat — India statistics, mapped";

export const SITE_OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: OG_ALT,
  type: "image/png",
} as const;

export const SITE_TWITTER_IMAGE = {
  url: "/twitter-image.png",
  width: 1200,
  height: 630,
  alt: OG_ALT,
  type: "image/png",
} as const;
