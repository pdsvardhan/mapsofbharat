import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Basic per-IP rate limiting for /api/* (risk no-rate-limit / #56).
// In-memory + per-instance — fine for a single container. A second layer at
// nginx-proxy-manager / Cloudflare is added once the public URL exists.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const buckets = new Map<string, { count: number; reset: number }>();

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const now = Date.now();
    const b = buckets.get(ip);

    if (!b || now > b.reset) {
      buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    } else {
      b.count++;
      if (b.count > MAX_PER_WINDOW) {
        const retry = Math.ceil((b.reset - now) / 1000);
        return new NextResponse(JSON.stringify({ error: "rate-limited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": String(retry) },
        });
      }
    }

    // opportunistic cleanup so the map can't grow unbounded
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }

    // Cache headers on the public read APIs (todo 270, iter-102). The canonical
    // store only changes at ingestion waves, so short browser caching + a CDN
    // directive are safe; stale-while-revalidate papers over origin blips.
    // /api/health and /api/log deliberately stay uncached. NOTE: Cloudflare
    // only edge-caches /api JSON once a dashboard Cache Rule exists — until
    // then this buys browser caching and readiness.
    const res = NextResponse.next();
    if (req.method === "GET" && /^\/api\/(metrics|region|regions)(\/|$)/.test(pathname)) {
      res.headers.set(
        "Cache-Control",
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
      );
    }
    return res;
  }

  // clickjacking (risk #58): pages refuse framing, except the purpose-built
  // /embed view which any site may iframe
  const res = NextResponse.next();
  res.headers.set(
    "Content-Security-Policy",
    pathname.startsWith("/embed") ? "frame-ancestors *" : "frame-ancestors 'none'"
  );
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next|geo|favicon\\.ico).*)"],
};
