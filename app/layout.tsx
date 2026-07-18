import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { ClientErrorReporter } from "@/components/client-error-reporter";
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

const SITE_URL = "https://mapsofbharat.vault7a.xyz";
const TITLE = "Maps of Bharat — India statistics, mapped";
const DESCRIPTION =
  "Map-first data visualization for India. Official statistics as interactive choropleths, drilling India to state to district, fully cited.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Maps of Bharat",
  },
  description: DESCRIPTION,
  applicationName: "Maps of Bharat",
  // opengraph-image.png / twitter-image.png (app/) and manifest.ts are picked up
  // by the App Router file conventions — no need to list images here.
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
        {children}
      </body>
    </html>
  );
}
