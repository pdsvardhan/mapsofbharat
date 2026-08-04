import type { NextConfig } from "next";

// Same-origin analytics proxy (iter-131 item 825): the browser only ever talks
// to this origin, never a third-party host. These two PUBLIC paths are the only
// ones reverse-proxied to the internal self-hosted Umami container, so tracking
// stays first-party — cookieless (Umami default), no third-party script, no PII.
// Nothing else under /stats is exposed: the Umami dashboard stays private.
const UMAMI_INTERNAL_URL = process.env.UMAMI_INTERNAL_URL || "http://umami:3000";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    return [
      { source: "/stats/script.js", destination: `${UMAMI_INTERNAL_URL}/script.js` },
      { source: "/stats/api/send", destination: `${UMAMI_INTERNAL_URL}/api/send` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // Static geometry is large and effectively immutable between data
        // rebuilds — cache aggressively on the wire (risk slow-page-load / #51).
        source: "/geo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
