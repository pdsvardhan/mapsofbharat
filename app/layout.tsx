import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { Umami } from "@/components/analytics/umami";
import { IS_LAUNCHED, SITE_URL } from "@/lib/site";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plexmono",
  display: "swap",
});

const TITLE = "Maps of Bharat — India statistics, mapped";
const DESCRIPTION =
  "Map-first data visualization for India. Official statistics as interactive choropleths, drilling India to state to district, fully cited.";

// LAUNCH-AWARE, and a function rather than a constant (iter-43 item 1007, to-do
// #580).
//
// WHAT WAS WRONG. Three things decide whether this site is indexable, and only
// two of them read the flag. `middleware.ts` sets X-Robots-Tag noindex,nofollow
// site-wide while !IS_LAUNCHED, and `app/robots.ts` is force-dynamic precisely so
// the flag flips without a rebuild — its own comment names "two halves of one
// switch disagreeing" as the failure it exists to prevent. This block was the
// third half, and it disagreed: a hard-coded `index: true` shipped on every page
// while the header said the opposite. The header wins, so nothing was ever
// mis-indexed — but the contradiction sat directly in the launch path, where the
// header is the part that goes away.
//
// WHY A FUNCTION. `export const metadata` is evaluated once at module load. A
// `generateMetadata` is evaluated per render, and every page route in this app is
// `force-dynamic`, so flipping SITE_LAUNCHED now changes all three signals
// together with no rebuild — the same guarantee robots.ts already gives.
//
// Pages that declare their own `robots` still win: Next merges metadata shallowly
// per top-level key, which is how /embed keeps index:false in both launch states.
export function generateMetadata(): Metadata {
  return {
  // metadataBase is what turns every RELATIVE metadata URL below (and every
  // file-convention image) into the ABSOLUTE one an unfurler needs. WhatsApp —
  // the primary distribution channel for this project — will not render a link
  // preview from a relative og:image, so this must stay the origin the site is
  // actually served from (lib/site SITE_URL), not the not-yet-bought public
  // domain. See lib/site.ts for the switchover.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Maps of Bharat",
  },
  description: DESCRIPTION,
  applicationName: "Maps of Bharat",
  // Self-referencing canonical for the atlas at `/`. app/page.tsx is a client
  // component and cannot export metadata, so the home page's canonical has to be
  // declared here. Every OTHER route overrides it — the content pages in their
  // own `metadata`, /methodology in app/methodology/layout.tsx, /embed with an
  // explicit `null` — so nothing silently inherits `/` as its canonical.
  alternates: { canonical: "/" },
  // Once launched: indexable, and allow the full-size image + snippet in a result
  // card (the directive that lets the OG card show large in Google/Discover).
  // Before launch: the same noindex,nofollow the middleware header already sends,
  // so a crawler reading the markup and a crawler reading the headers are told the
  // same thing. Default is unlaunched, so a forgotten flag fails toward "not
  // indexed" here exactly as it does in lib/site.
  robots: IS_LAUNCHED
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : { index: false, follow: false, googleBot: { index: false, follow: false } },
  // opengraph-image.png / twitter-image.png (app/) and manifest.ts are picked up
  // by the App Router file conventions — no need to list images here. Those
  // conventions also emit og:image:width/height/type/alt, which is what gets
  // WhatsApp to render the LARGE preview rather than a thumbnail.
  openGraph: {
    type: "website",
    siteName: "Maps of Bharat",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    site: "@maps_of_bharat",
    creator: "@maps_of_bharat",
  },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0c10", // no-token: read by the browser chrome as a literal, before any stylesheet exists
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${hanken.variable} ${plexMono.variable} antialiased`}>
        <ClientErrorReporter />
        <Umami />
        {children}
      </body>
    </html>
  );
}
