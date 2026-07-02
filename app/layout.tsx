import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Maps of Bharat — India statistics, mapped",
  description:
    "Map-first data visualization for India. Official statistics as interactive choropleths, drilling India to state to district, fully cited.",
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
