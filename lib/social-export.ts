// Social export compositor (iter-71, feat-social-export).
// Draws an Instagram-ready map card onto an offscreen canvas: mainland-India
// crop + island insets, per-region value labels with leader lines, editorial
// headline, national anchor stat, discrete 5-class legend and brand block —
// in the dark "ink" almanac theme or its light "paper" counterpart.
// Pure module: no React, no DB, geometry in, canvas out.

import { computeBreaks, colorFor } from "@/lib/breaks";
import { estimateFootnote } from "@/lib/estimate-kind";

export type SocialPreset = "portrait" | "square";
export type SocialTheme = "ink" | "paper";

export type SocialFeature = {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

export type SocialCardSpec = {
  preset: SocialPreset;
  theme: SocialTheme;
  /** Editorial headline (user-editable in the dialog; defaults to metric name). */
  headline: string;
  metric: { name: string; unit: string; year: number; source: string; decimals: number };
  level: "state" | "district";
  /** Drilled state name, or null for the national view. */
  focusName: string | null;
  /**
   * Scope rows sorted descending by value (same rows the ranking rail shows).
   *
   * `estimated` / `estimate_kind` travel with the row because a card is the one
   * surface that leaves the site: adr-019 put estimate disclosure at the point of
   * use — rail badge, hover, region panel — and a PNG on Instagram has none of
   * those. Narrowing these rows to {code,name,value} is what made an exported map
   * disclose nothing at all (item 643).
   */
  entries: { code: string; name: string; value: number; estimated?: number; estimate_kind?: string | null }[];
  /** Features to draw for this scope (states, or districts already filtered to focus). */
  features: SocialFeature[];
  /** Value key for a feature — states: String(Number(st_code)); districts: rid. */
  codeOf: (f: SocialFeature) => string;
  paletteFn: (t: number) => string;
};

// Logical layout is 1080-wide; everything renders at 2x for print quality.
const SCALE = 2;
const W = 1080;
const MARGIN = 52;
const SANS = "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const HANDLE = "@mapsofbharat";

// Island UTs pulled out of the mainland frame into insets (st_code keyed).
const INSET_STATES: Record<string, string> = { "35": "Andaman & Nicobar", "31": "Lakshadweep" };

// True island coordinates for the Lakshadweep archipelago (iter-74 item 573).
// The explorer choropleth now uses curated island geometry in public/geo
// (iter-11 #196); this inset still draws them as point symbols, which read
// cleaner than tiny filled polygons at inset scale.
const LAKSHADWEEP_ISLANDS: [number, number][] = [
  [72.18, 11.60], // Bitra
  [72.71, 11.70], // Chetlat
  [73.00, 11.49], // Kiltan
  [72.78, 11.22], // Kadmat
  [72.73, 11.12], // Amini
  [72.19, 10.86], // Agatti
  [72.64, 10.57], // Kavaratti
  [73.68, 10.82], // Andrott
  [73.64, 10.08], // Kalpeni
  [73.04, 8.28],  // Minicoy
];

type Palette = {
  bg: string; plate: string; text: string; muted: string; dim: string;
  border: string; accent: string; accentInk: string; nodata: string; nodataLine: string;
  mapLine: string; leader: string; halo: string;
};

const THEMES: Record<SocialTheme, Palette> = {
  ink: {
    bg: "#0d0f14", plate: "#101109", text: "#e9e3d5", muted: "#a49d8c", dim: "#6a6455",
    border: "#3b3626", accent: "#d1502f", accentInk: "#16110b", nodata: "#2a271d",
    nodataLine: "rgba(233,227,213,0.16)",
    mapLine: "rgba(233,227,213,0.30)", leader: "rgba(164,157,140,0.65)", halo: "rgba(13,15,20,0.72)",
  },
  paper: {
    bg: "#f4efe3", plate: "#efe9d9", text: "#1c1a14", muted: "#5a5548", dim: "#8a8477",
    border: "#d5ccb6", accent: "#b8431f", accentInk: "#f7f2e6", nodata: "#e4dcc8",
    nodataLine: "rgba(28,26,20,0.16)",
    mapLine: "rgba(28,26,20,0.28)", leader: "rgba(90,85,72,0.6)", halo: "rgba(244,239,227,0.78)",
  },
};

/** Diagonal-hatch fill for no-data regions (iter-76 item 580) — visibly
    "not a class" against any ramp; falls back to the flat base colour. */
function hatchPattern(ctx: CanvasRenderingContext2D, base: string, line: string): CanvasPattern | string {
  const t = document.createElement("canvas");
  t.width = 8; t.height = 8;
  const c = t.getContext("2d");
  if (!c) return base;
  c.fillStyle = base;
  c.fillRect(0, 0, 8, 8);
  c.strokeStyle = line;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-2, 6); c.lineTo(6, -2);
  c.moveTo(2, 10); c.lineTo(10, 2);
  c.stroke();
  return ctx.createPattern(t, "repeat") ?? base;
}

export function presetSize(preset: SocialPreset): { w: number; h: number } {
  return preset === "portrait" ? { w: W, h: 1350 } : { w: W, h: 1080 };
}

/** Indian short-scale format: 12,345 → 12.3K · 3,705,000 → 37.1 L · 2.1e7 → 2.1 Cr. */
export function fmtIndianShort(v: number, decimals: number, unit: string): string {
  if (unit === "%") return v.toLocaleString("en-IN", { maximumFractionDigits: decimals }) + "%";
  const a = Math.abs(v);
  const t = (x: number) => {
    const s = x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, "");
    return s;
  };
  if (a >= 1e7) return t(v / 1e7) + " Cr";
  if (a >= 1e5) return t(v / 1e5) + " L";
  if (a >= 1e3) return t(v / 1e3) + "K";
  return v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}

/** Rates/shares average; counts total. Mirrors how the anchor stat is labelled. */
export function anchorStat(spec: SocialCardSpec): { label: string; value: string } {
  const { unit, decimals } = spec.metric;
  const vals = spec.entries.map((e) => e.value);
  const rate = unit === "%" || /per\s|rate|ratio|index|years|km2|density/i.test(unit) || decimals > 0;
  const scopeName = spec.focusName ?? "National";
  if (rate) {
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label: `${scopeName} average`, value: fmtIndianShort(mean, decimals, unit) };
  }
  const sum = vals.reduce((a, b) => a + b, 0);
  return { label: spec.focusName ? `${scopeName} total` : "All-India total", value: fmtIndianShort(sum, decimals, unit) };
}

// ── geometry helpers ────────────────────────────────────────────────────────

type Ring = [number, number][];

function rings(f: SocialFeature): Ring[][] {
  // → array of polygons, each an array of rings (outer first)
  if (f.geometry.type === "Polygon") return [f.geometry.coordinates as Ring[]];
  return f.geometry.coordinates as Ring[][];
}

function geoBounds(fs: SocialFeature[]): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of fs)
    for (const poly of rings(f))
      for (const [x, y] of poly[0]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}

type Proj = (lon: number, lat: number) => [number, number];

/** Equirectangular fit with cos(mid-lat) x-correction, centred in rect. */
function fitProjection(b: [number, number, number, number], rect: { x: number; y: number; w: number; h: number }, pad: number): Proj {
  const cos = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180);
  const gw = (b[2] - b[0]) * cos || 1e-9;
  const gh = b[3] - b[1] || 1e-9;
  const s = Math.min((rect.w - pad * 2) / gw, (rect.h - pad * 2) / gh);
  const ox = rect.x + (rect.w - gw * s) / 2;
  const oy = rect.y + (rect.h - gh * s) / 2;
  return (lon, lat) => [ox + (lon - b[0]) * cos * s, oy + (b[3] - lat) * s];
}

/** Area centroid of the largest outer ring, in screen px. */
function centroidPx(f: SocialFeature, proj: Proj): { x: number; y: number; areaPx: number; bw: number; bh: number } {
  let best: Ring | null = null, bestA = -1;
  for (const poly of rings(f)) {
    const r = poly[0];
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a = Math.abs(a / 2);
    if (a > bestA) { bestA = a; best = r; }
  }
  if (!best) return { x: 0, y: 0, areaPx: 0, bw: 0, bh: 0 };
  const pts = best.map(([lon, lat]) => proj(lon, lat));
  let a2 = 0, cx = 0, cy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const cross = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    a2 += cross;
    cx += (pts[i][0] + pts[i + 1][0]) * cross;
    cy += (pts[i][1] + pts[i + 1][1]) * cross;
  }
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const area = a2 / 2;
  if (Math.abs(area) < 1e-6) return { x: pts[0][0], y: pts[0][1], areaPx: 0, bw: 0, bh: 0 };
  return { x: cx / (6 * area), y: cy / (6 * area), areaPx: Math.abs(area), bw: maxX - minX, bh: maxY - minY };
}

function tracePath(ctx: CanvasRenderingContext2D, f: SocialFeature, proj: Proj) {
  ctx.beginPath();
  for (const poly of rings(f))
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
}

// ── text helpers ────────────────────────────────────────────────────────────

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const probe = cur ? cur + " " + w : w;
    if (ctx.measureText(probe).width <= maxW || !cur) cur = probe;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.includes(" "))
      last = last.slice(0, last.lastIndexOf(" "));
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

// ── main renderer ───────────────────────────────────────────────────────────

export async function renderSocialCard(spec: SocialCardSpec): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* draw with fallbacks */ }
  }
  const P = THEMES[spec.theme];
  const { w: LW, h: LH } = presetSize(spec.preset);
  const canvas = document.createElement("canvas");
  canvas.width = LW * SCALE; canvas.height = LH * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, LW, LH);

  const values: Record<string, number> = {};
  for (const e of spec.entries) values[e.code] = e.value;
  const vals = spec.entries.map((e) => e.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  // Social cards are always classed — jenks 5 (AC: never a continuous ramp).
  const k = Math.min(5, Math.max(1, vals.length));
  const breaks = computeBreaks(vals, vals.length >= 5 ? "jenks" : "quantile", k);
  const fill = (v: number) => colorFor(v, min, max, breaks, spec.paletteFn);

  // ── header: headline (accent-highlighted last word) + subtitle + anchor ──
  const anchor = anchorStat(spec);
  const anchorW = 236;
  const headMaxW = LW - MARGIN * 2 - anchorW - 28;
  let hSize = spec.preset === "portrait" ? 54 : 46;
  ctx.font = `800 ${hSize}px ${SANS}`;
  let lines = wrap(ctx, spec.headline.trim() || spec.metric.name, headMaxW, 2);
  if (lines.length === 2 && hSize > 40) {
    hSize -= 6;
    ctx.font = `800 ${hSize}px ${SANS}`;
    lines = wrap(ctx, spec.headline.trim() || spec.metric.name, headMaxW, 2);
  }
  const lineH = Math.round(hSize * 1.14);
  let y = MARGIN + hSize;
  lines.forEach((line, li) => {
    const isLast = li === lines.length - 1;
    const words = line.split(" ");
    const hi = isLast && words.length >= 1 ? words.pop()! : null;
    const head = words.join(" ");
    let x = MARGIN;
    ctx.font = `800 ${hSize}px ${SANS}`;
    if (head) {
      ctx.fillStyle = P.text;
      ctx.fillText(head, x, y);
      x += ctx.measureText(head + " ").width;
    }
    if (hi) {
      const hw = ctx.measureText(hi).width;
      ctx.fillStyle = P.accent;
      ctx.fillRect(x - 7, y - hSize * 0.82, hw + 14, hSize * 1.06);
      ctx.fillStyle = P.accentInk;
      ctx.fillText(hi, x, y);
    }
    y += lineH;
  });
  y -= lineH;

  const scopeNoun = spec.focusName
    ? `districts of ${spec.focusName}`
    : spec.level === "district" ? "districts" : "states & UTs";
  ctx.font = `500 20px ${SANS}`;
  ctx.fillStyle = P.muted;
  // metric name only when the user rewrote the headline — never echo it twice;
  // no year here — the source citation carries it (iter-74 item 576)
  const customHead = spec.headline.trim() && spec.headline.trim().toLowerCase() !== spec.metric.name.toLowerCase();
  const sub = `${customHead ? spec.metric.name + " · " : ""}${spec.entries.length} ${scopeNoun}`;
  ctx.fillText(sub, MARGIN, y + 34);

  // brand block top-right: mark + wordmark + handle (iter-74 item 575)
  const bxr = LW - MARGIN;
  ctx.fillStyle = P.text;
  ctx.fillRect(bxr - 34, MARGIN - 8, 34, 34);
  ctx.fillStyle = P.bg;
  ctx.font = `800 15px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("MB", bxr - 17, MARGIN + 15);
  ctx.textAlign = "right";
  ctx.fillStyle = P.text;
  ctx.font = `700 16px ${SANS}`;
  ctx.fillText("Maps of Bharat", bxr - 44, MARGIN + 6);
  ctx.fillStyle = P.muted;
  ctx.font = `500 12px ${MONO}`;
  ctx.fillText(HANDLE, bxr - 44, MARGIN + 23);
  ctx.textAlign = "left";

  // anchor stat callout below the brand (iter-74 item 575)
  const ax = LW - MARGIN - anchorW;
  const ay = MARGIN + 40;
  ctx.fillStyle = P.plate;
  ctx.strokeStyle = P.accent;
  ctx.lineWidth = 1.5;
  const ah = 78;
  ctx.fillRect(ax, ay, anchorW, ah);
  ctx.strokeRect(ax, ay, anchorW, ah);
  ctx.fillStyle = P.accent;
  ctx.font = `800 30px ${SANS}`;
  ctx.fillText(anchor.value, ax + 16, ay + 36);
  ctx.fillStyle = P.muted;
  ctx.font = `600 12.5px ${SANS}`;
  ctx.fillText(anchor.label.toUpperCase(), ax + 16, ay + 58);
  const headerBottom = Math.max(y + 34, ay + ah) + 10;

  // ── frame bottom-up: footer, legend, then the map gets the rest ──────────
  const footerH = 46;
  const legendH = 76;
  const footerTop = LH - MARGIN - footerH + 18;
  const legendTop = footerTop - legendH - 6;
  const mapRect = { x: MARGIN, y: headerBottom + 8, w: LW - MARGIN * 2, h: legendTop - 14 - (headerBottom + 8) };

  // mainland vs inset split (national views only; a drilled island state draws as-is)
  const stCode = (f: SocialFeature) => String(Number(String(f.properties?.st_code ?? "")));
  const isNational = !spec.focusName;
  const mainland = isNational ? spec.features.filter((f) => !INSET_STATES[stCode(f)]) : spec.features;
  const insetFs = isNational ? spec.features.filter((f) => INSET_STATES[stCode(f)]) : [];

  const proj = fitProjection(geoBounds(mainland.length ? mainland : spec.features), mapRect, 26);

  const nodataFill = hatchPattern(ctx, P.nodata, P.nodataLine);
  const drawRegion = (f: SocialFeature, pr: Proj) => {
    const v = values[spec.codeOf(f)];
    tracePath(ctx, f, pr);
    ctx.fillStyle = v == null ? nodataFill : fill(v);
    ctx.fill("evenodd");
    ctx.strokeStyle = P.mapLine;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  };
  for (const f of mainland) drawRegion(f, proj);

  // island insets, bottom corners of the map plate (empty ocean in the crop)
  const insetGroups = new Map<string, SocialFeature[]>();
  for (const f of insetFs) {
    const g = insetGroups.get(stCode(f)) ?? [];
    g.push(f);
    insetGroups.set(stCode(f), g);
  }
  let insetIdx = 0;
  const insetRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const [code, fs] of insetGroups) {
    const iw = 128, ih = code === "35" ? 176 : 132;
    const right = insetIdx === 0;
    const bx = right ? mapRect.x + mapRect.w - iw - 6 : mapRect.x + 6;
    const by = mapRect.y + mapRect.h - ih - 6;
    insetRects.push({ x: bx, y: by, w: iw, h: ih });
    ctx.strokeStyle = P.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, iw, ih);
    // island value in the header at state level (iter-72 item 567)
    const insetVal = spec.level === "state" && values[code] != null
      ? fmtIndianShort(values[code], spec.metric.decimals, spec.metric.unit) : null;
    const geoTop = insetVal ? 38 : 18;
    const irect = { x: bx, y: by + geoTop, w: iw, h: ih - geoTop - 6 };
    if (code === "31") {
      // Lakshadweep is a tiny archipelago; in the small inset the true island
      // coordinates read far cleaner as point symbols than as filled polygons.
      // The explorer choropleth uses the curated island geometry now shipped in
      // public/geo (iter-11 #196); this inset keeps the point representation.
      const v = spec.level === "state" ? values[code] : undefined;
      const dotFill = v == null ? P.nodata : fill(v);
      const lonLats = LAKSHADWEEP_ISLANDS;
      const b: [number, number, number, number] = [
        Math.min(...lonLats.map((p) => p[0])), Math.min(...lonLats.map((p) => p[1])),
        Math.max(...lonLats.map((p) => p[0])), Math.max(...lonLats.map((p) => p[1])),
      ];
      const ipr = fitProjection(b, irect, 12);
      for (const [lon, lat] of lonLats) {
        const [x, yy] = ipr(lon, lat);
        ctx.beginPath();
        ctx.arc(x, yy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = dotFill;
        ctx.fill();
        ctx.strokeStyle = P.mapLine;
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    } else {
      const ipr = fitProjection(geoBounds(fs), irect, 10);
      for (const f of fs) drawRegion(f, ipr);
    }
    ctx.fillStyle = P.muted;
    ctx.font = `600 11.5px ${MONO}`;
    ctx.fillText(INSET_STATES[code].toUpperCase(), bx + 6, by + 14);
    if (insetVal) {
      ctx.fillStyle = P.text;
      ctx.font = `700 15px ${SANS}`;
      ctx.fillText(insetVal, bx + 6, by + 32);
    }
    insetIdx++;
  }

  // ── region callouts ──────────────────────────────────────────────────────
  // National state view labels everything on-map; dense views (districts /
  // >40 regions) use numbered rank markers + list panels (iter-76 item 579).
  const dense = spec.level === "district" || spec.entries.length > 40;
  const nameByCode = new Map(spec.entries.map((e) => [e.code, e.name]));
  const mapCx = mapRect.x + mapRect.w / 2, mapCy = mapRect.y + mapRect.h / 2;

  if (!dense) {
  const labelCodes = new Set(spec.entries.map((e) => e.code));

  type Lbl = { code: string; cx: number; cy: number; val: string; name: string; inside: boolean; side: "l" | "r"; x: number; y: number };
  const labels: Lbl[] = [];
  for (const f of mainland) {
    const code = spec.codeOf(f);
    if (!labelCodes.has(code) || values[code] == null) continue;
    const c = centroidPx(f, proj);
    const val = fmtIndianShort(values[code], spec.metric.decimals, spec.metric.unit);
    const name = nameByCode.get(code) ?? code;
    // mobile-legible label sizes (iter-74 item 574): value 19px / name 13px
    ctx.font = `700 19px ${SANS}`;
    const valW = ctx.measureText(val).width;
    ctx.font = `500 13px ${SANS}`;
    const nameW = ctx.measureText(name).width;
    const needW = Math.max(valW, nameW);
    const inside = c.bw * 0.86 > needW && c.bh > 52 && c.areaPx > 6000;
    labels.push({ code, cx: c.x, cy: c.y, val, name, inside, side: c.x >= mapCx ? "r" : "l", x: c.x, y: c.y });
  }

  // push outside labels to the flank and resolve vertical collisions per side
  for (const side of ["l", "r"] as const) {
    const outs = labels.filter((l) => !l.inside && l.side === side).sort((a, b) => a.cy - b.cy);
    outs.forEach((l) => {
      const dx = l.cx - mapCx, dy = l.cy - mapCy;
      const len = Math.hypot(dx, dy) || 1;
      const push = 74;
      l.x = l.cx + (dx / len) * push;
      l.y = l.cy + (dy / len) * push;
      // clamp by measured text width so long names (DNH&DD…) never leave the canvas (iter-72 item 566)
      ctx.font = `700 19px ${SANS}`;
      const vw = ctx.measureText(l.val).width;
      ctx.font = `500 13px ${SANS}`;
      const tw = Math.max(vw, ctx.measureText(l.name).width);
      if (side === "l") l.x = Math.max(l.x, 12 + tw + 4);
      else l.x = Math.min(l.x, LW - 12 - tw - 4);
      l.y = Math.max(mapRect.y + 24, Math.min(mapRect.y + mapRect.h - 18, l.y));
    });
    const gap = 42;
    for (let i = 1; i < outs.length; i++)
      if (outs[i].y - outs[i - 1].y < gap) outs[i].y = outs[i - 1].y + gap;
    for (let i = outs.length - 1; i > 0; i--)
      if (outs[i].y > mapRect.y + mapRect.h - 18) outs[i].y = mapRect.y + mapRect.h - 18 - (outs.length - 1 - i) * gap;
  }

  // global collision pass: outside labels also dodge inside labels, each
  // other across sides, and the island inset boxes (movers push downward)
  type Box = { x: number; y: number; w: number; h: number };
  const boxOf = (l: Lbl): Box => {
    ctx.font = `700 19px ${SANS}`;
    const vw = ctx.measureText(l.val).width;
    ctx.font = `500 13px ${SANS}`;
    const w = Math.max(vw, ctx.measureText(l.name).width);
    if (l.inside) return { x: l.cx - w / 2, y: l.cy - 18, w, h: 40 };
    const tx = l.x + (l.side === "r" ? 4 : -4);
    return { x: l.side === "r" ? tx : tx - w, y: l.y - 18, w, h: 40 };
  };
  const hit = (a: Box, b: Box) =>
    a.x < b.x + b.w + 8 && b.x < a.x + a.w + 8 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3;
  for (let pass = 0; pass < 4; pass++)
    for (const l of labels) {
      if (l.inside) continue;
      for (const o of labels) {
        if (o === l) continue;
        const A = boxOf(l), B = boxOf(o);
        if (hit(A, B)) l.y = B.y + B.h + 23;
      }
      for (const r of insetRects) {
        const A = boxOf(l);
        if (hit(A, r)) l.y = r.y - 22; // sit above the inset frame
      }
      l.y = Math.max(mapRect.y + 24, Math.min(mapRect.y + mapRect.h - 18, l.y));
    }

  for (const l of labels) {
    if (!l.inside) {
      ctx.strokeStyle = P.leader;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(l.cx, l.cy);
      ctx.lineTo(l.x, l.y - 6);
      ctx.stroke();
    }
    const align: CanvasTextAlign = l.inside ? "center" : l.side === "r" ? "left" : "right";
    ctx.textAlign = align;
    const tx = l.inside ? l.cx : l.x + (l.side === "r" ? 4 : -4);
    const ty = l.inside ? l.cy : l.y;
    ctx.font = `700 19px ${SANS}`;
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = P.halo;
    ctx.strokeText(l.val, tx, ty);
    ctx.fillStyle = P.text;
    ctx.fillText(l.val, tx, ty);
    ctx.font = `500 13px ${SANS}`;
    ctx.strokeText(l.name, tx, ty + 16);
    ctx.fillStyle = P.muted;
    ctx.fillText(l.name, tx, ty + 16);
  }
  ctx.textAlign = "left";
  } else {
    // ── dense mode: numbered rank markers + list panels (iter-76 item 579) ──
    const tops = spec.entries.slice(0, 8);
    const bots = spec.entries.slice(-3).reverse(); // lowest first
    const want = new Set([...tops, ...bots].map((e) => e.code));
    const centroids = new Map<string, { x: number; y: number }>();
    for (const f of mainland) {
      const code = spec.codeOf(f);
      if (!want.has(code)) continue;
      const c = centroidPx(f, proj);
      centroids.set(code, { x: c.x, y: c.y });
    }
    // markers on inset islands are skipped — the panels still list them
    const marker = (x: number, yy: number, n: string, top: boolean, r = 11) => {
      ctx.beginPath();
      ctx.arc(x, yy, r, 0, Math.PI * 2);
      if (top) {
        ctx.fillStyle = P.accent;
        ctx.fill();
      } else {
        ctx.fillStyle = P.plate;
        ctx.fill();
        ctx.strokeStyle = P.text;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = top ? P.accentInk : P.text;
      ctx.font = `700 ${Math.round(r * 1.05)}px ${SANS}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n, x, yy + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };
    tops.forEach((e, i) => {
      const c = centroids.get(e.code);
      if (c) marker(c.x, c.y, String(i + 1), true);
    });
    bots.forEach((e, i) => {
      const c = centroids.get(e.code);
      if (c) marker(c.x, c.y, String(i + 1), false);
    });

    const clip = (s: string, maxW: number): string => {
      if (ctx.measureText(s).width <= maxW) return s;
      let t = s;
      while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      return t + "…";
    };
    const panelW = 236, rowH = 26, headH = 26;
    const panel = (px: number, py: number, title: string, top: boolean, rows: { code: string; name: string; value: number }[]) => {
      const ph = headH + rows.length * rowH + 8;
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = P.plate;
      ctx.fillRect(px, py, panelW, ph);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = P.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, panelW, ph);
      ctx.fillStyle = P.muted;
      ctx.font = `600 11.5px ${MONO}`;
      ctx.fillText(title, px + 12, py + 17);
      rows.forEach((e, i) => {
        const ry = py + headH + i * rowH + 15;
        marker(px + 21, ry - 4, String(i + 1), top, 8.5);
        ctx.font = `500 13px ${SANS}`;
        ctx.fillStyle = P.text;
        const valStr = fmtIndianShort(e.value, spec.metric.decimals, spec.metric.unit);
        ctx.textAlign = "right";
        ctx.font = `700 14px ${SANS}`;
        const vw = ctx.measureText(valStr).width;
        ctx.fillText(valStr, px + panelW - 12, ry);
        ctx.textAlign = "left";
        ctx.font = `500 13px ${SANS}`;
        ctx.fillStyle = P.muted;
        ctx.fillText(clip(e.name, panelW - 58 - vw), px + 36, ry);
      });
    };
    panel(MARGIN, headerBottom + 16, "HIGHEST", true, tops);
    panel(LW - MARGIN - panelW, ay + ah + 16, "LOWEST", false, bots);
  }

  // ── discrete legend (mobile-legible sizes — iter-74 item 574) ───────────
  const edges = [min, ...breaks, max];
  const sw = 108, sh = 14;
  let lx = MARGIN;
  ctx.font = `600 13.5px ${SANS}`;
  ctx.fillStyle = P.muted;
  ctx.fillText(spec.metric.unit === "%" ? "Share (%)" : spec.metric.unit, lx, legendTop + 2);
  const nClasses = Math.max(1, edges.length - 1);
  for (let i = 0; i < nClasses; i++) {
    ctx.fillStyle = spec.paletteFn(nClasses === 1 ? 0 : i / (nClasses - 1));
    ctx.fillRect(lx, legendTop + 12, sw, sh);
    ctx.strokeStyle = P.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, legendTop + 12, sw, sh);
    ctx.fillStyle = P.muted;
    ctx.font = `500 12.5px ${MONO}`;
    const lo = fmtIndianShort(edges[i], spec.metric.decimals, spec.metric.unit);
    const hi = fmtIndianShort(edges[i + 1], spec.metric.decimals, spec.metric.unit);
    ctx.fillText(`${lo}–${hi}`, lx, legendTop + 46);
    lx += sw + 12;
  }
  if (spec.entries.length < spec.features.length) {
    ctx.fillStyle = nodataFill;
    ctx.fillRect(lx, legendTop + 12, 30, sh);
    ctx.strokeStyle = P.border;
    ctx.strokeRect(lx, legendTop + 12, 30, sh);
    ctx.fillStyle = P.muted;
    ctx.font = `500 12.5px ${MONO}`;
    ctx.fillText("no data", lx, legendTop + 46);
  }

  // ── footer: source citation only — brand lives top-right (iter-74 item 575)
  ctx.strokeStyle = P.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, footerTop);
  ctx.lineTo(LW - MARGIN, footerTop);
  ctx.stroke();

  ctx.font = `500 12.5px ${SANS}`;
  ctx.fillStyle = P.muted;
  // The estimate disclosure has to ride along on the card itself (item 643). This
  // image travels with no tooltip, no rail and no methodology link, so if the
  // footnote is not drawn here the reader has no way to learn the map contains
  // numbers no one measured. Worded per kind — "estimated from a parent district"
  // is false of an RBI Budget/Revised Estimate (adr-021).
  const srcText = `Source: ${spec.metric.source} · ${spec.metric.year}`;
  const note = estimateFootnote(spec.entries, spec.level === "district" ? "districts" : "states");
  const srcLines = wrap(ctx, note ? `${srcText} · ${note}` : srcText, LW - MARGIN * 2 - 20, 2);
  srcLines.forEach((s, i) => ctx.fillText(s, MARGIN, footerTop + 24 + i * 17));

  return canvas;
}
