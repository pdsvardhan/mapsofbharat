import type { MetadataRoute } from "next";

// PWA web manifest (App Router file convention → served at /manifest.webmanifest
// and linked via <link rel="manifest">). Icons live in public/icons and are the
// circular MB badge; 192/512 are declared both "any" and "maskable" so Android
// home-screen install crops cleanly inside the safe zone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maps of Bharat",
    short_name: "MapsOfBharat",
    description:
      "Map-first data visualization for India. Official statistics as interactive choropleths, drilling India to state to district, fully cited.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0c10",
    theme_color: "#0b0c10",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
