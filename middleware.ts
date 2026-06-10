import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Basic per-IP rate limiting for /api/* (risk no-rate-limit / #56).
// In-memory + per-instance — fine for a single container. A second layer at
// nginx-proxy-manager / Cloudflare is added once the public URL exists.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const buckets = new Map<string, { count: number; reset: number }>();

export function middleware(req: NextRequest) {
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

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
