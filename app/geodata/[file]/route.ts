import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// Geometry, served brotli-first (#405-F, iter-45).
//
// WHY THIS ROUTE EXISTS AT ALL. public/geo/* is served by the static handler, which
// gzips and cannot be told to hand back a pre-compressed brotli variant. Measured:
// a probe handler claiming /geo/districts.geojson never ran — public wins that URL
// outright, and the static 825,354 B answered. So the .br files live beside their
// originals in public/geo (unmoved, so the boundary fingerprint, the centroid guard
// and the family-paths artefact all keep their paths) and this route is the door
// that can negotiate encoding. /geo/* still works and still serves the raw file.
//
// The win, measured over public/geo: 623.5 KB gzip -> 398.9 KB brotli, -36.0%.
//
// Node runtime, not edge: it reads files from the standalone output.
export const runtime = "nodejs";

// force-dynamic, and the first version had this wrong. With `force-static` the route
// is rendered ONCE at build time against a request that carries no Accept-Encoding, so
// the brotli branch never ran and every reader got the identity file - a negotiating
// route that had been compiled into a single fixed answer. Measured: no
// Content-Encoding on a request that offered br. A route whose response depends on a
// request header cannot be static, by definition.
export const dynamic = "force-dynamic";

const GEO_DIR = join(process.cwd(), "public", "geo");

/** Filenames only, and a strict shape. Anything with a slash, a backslash, a `..` or
 *  a character outside this class is refused BEFORE it reaches the filesystem — this
 *  route takes a path segment from the URL and joins it to a directory, which is the
 *  exact shape of a traversal bug. `[file]` cannot contain a slash in App Router, so
 *  this is the second lock rather than the only one. */
const SAFE = /^[a-z0-9][a-z0-9._-]*\.(geojson|json)$/i;

const TYPES: Record<string, string> = {
  geojson: "application/geo+json",
  json: "application/json",
};

export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;

  if (!SAFE.test(file) || file.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const raw = join(GEO_DIR, file);
  const ext = file.split(".").pop()!.toLowerCase();

  // Same caching contract the /geo/:path* header block gives the static files: the
  // geometry is effectively immutable between data rebuilds. Vary is load-bearing
  // here in a way it is not there — this route returns different BYTES for the same
  // URL depending on Accept-Encoding, so a shared cache that ignored it would hand
  // brotli to a client that cannot read it.
  const headers = new Headers({
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    Vary: "Accept-Encoding",
  });

  // BROTLI, THEN GZIP, THEN THE ORIGINAL — and the gzip rung is load-bearing rather
  // than tidy. Next's own `compress: true` does NOT compress a route handler's
  // response: measured, a client offering gzip but not brotli received the raw
  // 825,354 B here, where the static path had been giving it 179,820 B. An
  // optimisation that is a 4.6x regression for part of the audience is worse than no
  // optimisation, so both variants are pre-built and this only chooses between them.
  const accept = req.headers.get("accept-encoding") ?? "";
  const rungs: Array<[RegExp, string, string]> = [
    [/\bbr\b/, "br", `${raw}.br`],
    [/\bgzip\b/, "gzip", `${raw}.gz`],
  ];

  for (const [pattern, encoding, path] of rungs) {
    if (!pattern.test(accept)) continue;
    try {
      await stat(path);
      const body = await readFile(path);
      headers.set("Content-Encoding", encoding);
      headers.set("Content-Length", String(body.byteLength));
      return new Response(new Uint8Array(body), { status: 200, headers });
    } catch {
      // No pre-compressed variant — try the next rung, and ultimately the original,
      // rather than 404. A missing variant is a build-freshness problem, which
      // `build-geo-compressed.mjs --check` fails on in prebuild; it must never turn
      // into a missing MAP for a reader.
    }
  }

  try {
    const body = await readFile(raw);
    return new Response(new Uint8Array(body), { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
