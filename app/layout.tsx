import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { Umami } from "@/components/analytics/umami";
import { SITE_URL } from "@/lib/site";
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

export const metadata: Metadata = {
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
  // Indexable, and allow the full-size image + snippet in a result card (this is
  // the directive that lets the OG card show large in Google/Discover).
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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

export const viewport: Viewport = {
  themeColor: "#0b0c10",
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
