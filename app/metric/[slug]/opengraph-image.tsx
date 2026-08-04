import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { getMetricDetail, getMetricMeta } from "@/lib/metric-page-data";

// Branded social card for a canonical metric page (iter-131 item 829, AC 2).
// The full choropleth social card is a client-canvas render and can't run
// server-side; this is its correct server equivalent — a clean next/og card with
// the metric name, a headline national stat, the source, and the MapsOfBharat
// mark. Node runtime (not edge): it reads the metric from the SQLite store, whose
// native driver is a server-external package.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Maps of Bharat — India statistics, mapped";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0d0f14";
const CREAM = "#eae4d6";
const MUTED = "#a49d8c";
const FAINT = "#8a8477";
const GOLD = "#e6b34a";
const ACCENT = "#d1502f";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = getMetricMeta(slug);
  const detail = getMetricDetail(slug, meta && meta.levels.includes("district") ? "district" : "state");

  const name = meta?.name ?? "India statistics";
  const unit = meta?.unit ?? "";
  const pct = unit === "%";
  const decimals = meta?.decimals ?? 0;
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: decimals }) + (pct ? "%" : "");

  const headline =
    detail && detail.stats_count
      ? `National average ${fmt(detail.mean)}  ·  ${fmt(detail.min)} to ${fmt(detail.max)}`
      : meta
        ? `${meta.source}`
        : "Official statistics, mapped";

  const footer = meta ? `${meta.source.split(",")[0]} · ${meta.year} · ${meta.license}` : "mapsofbharat";

  let markSrc = "";
  try {
    const bytes = readFileSync(join(process.cwd(), "public/brand/mark.png"));
    markSrc = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    /* mark missing → render the card without the logo rather than failing */
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: CREAM,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {markSrc ? (
            <img src={markSrc} width={56} height={56} alt="" style={{ marginRight: 18 }} />
          ) : null}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 3, color: GOLD }}>
            MAPS OF BHARAT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.05, color: CREAM }}>
            {name}
            {unit ? <span style={{ marginLeft: 16, fontSize: 34, fontWeight: 600, color: FAINT }}>({unit})</span> : null}
          </div>
          <div style={{ display: "flex", width: 140, height: 8, background: ACCENT, marginTop: 26 }} />
          <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 26 }}>{headline}</div>
        </div>

        <div style={{ display: "flex", fontSize: 24, color: FAINT }}>{footer}</div>
      </div>
    ),
    { ...size }
  );
}
