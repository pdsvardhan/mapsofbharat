import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getMetricMeta } from "@/lib/metric-page-data";
import {
  citationCommentBlock,
  citationHttpHeaders,
  getMetricLineage,
  type CitationInput,
} from "@/lib/metric-raw-source";

// Free per-metric raw-source download (iter-131 item 831 AC 2). The raw source
// data used for a metric is downloadable by EVERY user, carrying a citation
// (source, licence, retrieval date, canonical metric URL) — in the HTTP response
// headers on every download, and additionally PREPENDED as `#` comment lines on
// text/CSV files. Where the ingested raw file exists in the repo and is a
// reasonable single file we serve it; where the raw is a large PDF or a
// many-file / gridded publication we redirect to the official source_url (the
// user-confirmed fallback), so the action is never a broken hosted file.
//
// This lives under /metric/[slug]/raw — NOT under /api — so the /api rate limiter
// in middleware.ts never throttles it, and it is per-metric only (no bulk dump),
// honouring the "not a raw microdata / CSV-dump repository" non-goal.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = "https://mapsofbharat.vault7a.xyz";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const meta = getMetricMeta(slug);
  if (!meta) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const lineage = getMetricLineage(slug);
  const canonicalUrl = `${SITE_URL}/metric/${slug}`;
  const officialUrl = meta.source_url || SITE_URL;

  // No hosted raw (large PDF / gridded / many-file source): send the caller to the
  // official source rather than a broken download. Labelled so callers can tell.
  if (!lineage || lineage.raw.kind === "link") {
    return NextResponse.redirect(officialUrl, {
      status: 307,
      headers: { "X-Raw-Source": "official-link" },
    });
  }

  const raw = lineage.raw;
  const abs = path.join(process.cwd(), raw.path);

  const citation: CitationInput = {
    id: slug,
    name: meta.name,
    source: meta.source || "Official source",
    sourceUrl: officialUrl,
    license: meta.license || "See source",
    retrieved:
      raw.retrieved ||
      (meta.last_updated ? String(meta.last_updated).slice(0, 10) : String(meta.year)),
    canonicalUrl,
  };

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(abs);
  } catch {
    // The pipeline file isn't on disk in this deployment — degrade to the official
    // source rather than 500. Honest: labelled as a fallback so it's diagnosable.
    return NextResponse.redirect(officialUrl, {
      status: 307,
      headers: { "X-Raw-Source": "fallback-official-link" },
    });
  }

  const headers = new Headers(citationHttpHeaders(citation));
  headers.set("Content-Type", raw.mime);
  headers.set("Content-Disposition", `attachment; filename="${raw.filename}"`);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Raw-Source", "hosted");
  headers.set("X-Content-Type-Options", "nosniff");

  if (raw.text) {
    // CSV/TSV: prepend the citation as `#` comment lines, then the real bytes.
    const text = citationCommentBlock(citation) + bytes.toString("utf8");
    return new NextResponse(text, { status: 200, headers });
  }
  // Binary (xls/xlsx/json/pdf): serve as-is; citation is in the HTTP headers. Copy
  // into a fresh ArrayBuffer-backed view so the type matches BodyInit's BufferSource
  // (Node's Buffer is backed by a possibly-shared ArrayBufferLike).
  const view = new Uint8Array(bytes);
  return new NextResponse(view, { status: 200, headers });
}
