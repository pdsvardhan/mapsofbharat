// Topic (category) accents, icons and descriptions for the Atlas chooser.
// Categories mirror the live taxonomy in the metrics table — all real data
// (iter-51 item 385; prototype topics were placeholders). iter-58 item 431
// added elections / society / safety / infrastructure / education for the
// ingestion-wave verticals.

export type Metric = {
  id: string; name: string; category: string; unit: string; year: number; source: string;
  higher_is_better: number | null; levels?: string[]; methodology?: string | null;
  decimals?: number; default_scale?: string | null;
};

// iter-26 item 751: language / assets / environment were live in the metrics
// table but missing here, so orderedCategories() dumped them at the bottom with
// the demographics fallback icon, the fallback accent and no description.
export const CAT_ORDER = [
  "demographics", "society", "language", "economy", "payments", "finance", "poverty", "health",
  "lifestyle", "assets", "education", "labour", "livelihood", "agriculture", "crime", "safety",
  "environment", "infrastructure", "transport", "elections",
];

/** no-token: a CATEGORICAL DATA palette — one hue per topic — not a set of UI roles.
 *  These are consumed as plain colour strings by MapLibre paint and the canvas card
 *  exporter, neither of which can resolve a CSS variable, and twenty single-use tokens
 *  would describe the data rather than the interface. Sibling to PALETTES in
 *  lib/breaks.ts and PROVENANCE_COLOR in lib/coverage.ts, which are the same kind of
 *  thing. The ONE value here that is also a UI role is the fallback in catAccent(),
 *  which is annotated separately. */
export const CAT_ACCENT: Record<string, string> = {
  demographics: "#d1502f",
  society: "#c2708f",
  language: "#4f9aa0",
  economy: "#c8a24a",
  payments: "#7d5bbe",
  finance: "#3f8f6f",
  poverty: "#9c5b6b",
  health: "#5fa88a",
  lifestyle: "#c98a4b",
  assets: "#8e9bb0",
  education: "#5578b4",
  labour: "#7a86c4",
  livelihood: "#8f9c54",
  agriculture: "#5e9e4f",
  crime: "#b0574f",
  safety: "#cd7f43",
  environment: "#7d9b6a",
  infrastructure: "#4d93a8",
  transport: "#4a7d9e",
  elections: "#9b6bb3",
};

export const CAT_DESC: Record<string, string> = {
  demographics: "People, density & settlement — Census 2011",
  society: "Religious composition — Census 2011",
  language: "Mother tongues & linguistic diversity — Census 2011",
  economy: "Output, spending, enterprise & tourism",
  payments: "Digital payments — UPI district flows (NPCI, Jun 2026)",
  finance: "Banking — deposits, credit & GST (RBI / GSTN)",
  poverty: "Multidimensional poverty — NITI MPI (NFHS-5)",
  health: "Wellbeing, nutrition & healthcare — NFHS-5",
  lifestyle: "Alcohol, tobacco, obesity & more — NFHS-5",
  assets: "Cars, TVs & computers at home — Census 2011",
  // to-dos 336/337/338: each of these named ONE source while the majority of the
  // category's metrics came from another, on a site whose whole promise is exact
  // attribution. Counts as at 2026-07-27 — see the CAT_DESC test in
  // tests/iter26-regressions.spec.ts, which fails if a named source stops appearing
  // in that category's metric sources.
  //   education:   5 of 8 are ASER 2024 (ASER Centre / Pratham), 3 are UDISE+
  //   labour:      6 of 9 are MGNREGA (Ministry of Rural Development), 3 are PLFS
  //   agriculture: 5 of 8 are the 20th Livestock Census 2019 (DAHD), 3 are APY
  // ASER is the one non-government source in the catalogue, so it is named
  // explicitly rather than folded into a ministry label.
  education: "Schools, learning & outcomes — UDISE+ 2024-25 / ASER 2024",
  labour: "Jobs, participation & rural works — PLFS / MGNREGA (MoRD)",
  livelihood: "How workers earn — Census 2011",
  agriculture: "Crops & livestock — APY 2014 / Livestock Census 2019 (DAHD)",
  crime: "Safety & justice — NCRB 2022",
  safety: "Road & self-harm risk — MoRTH / NCRB",
  // all three sources named: the air metric is satellite PM2.5 from UrbanEmissions
  // (APnA), not IMD or FSI — on a site whose promise is exact attribution, the
  // source line must not imply otherwise
  environment: "Rainfall, heat, forest & air — IMD / FSI / APnA",
  infrastructure: "Power, water & connectivity",
  transport: "Vehicles & mobility — Vahan / MoRTH",
  elections: "Democracy & turnout — ECI 2024",
};

// Simple stroke icon paths (24×24 viewBox), drawn in the topic accent.
export const CAT_ICON: Record<string, string> = {
  demographics: "M12 8a3 3 0 100-6 3 3 0 000 6z M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6",
  society: "M8 10a2 2 0 100-4 2 2 0 000 4z M16 10a2 2 0 100-4 2 2 0 000 4z M4 18c0-2.2 1.8-4 4-4s4 1.8 4 4 M12 18c0-2.2 1.8-4 4-4s4 1.8 4 4",
  // speech bubbles — mother tongue, not the person icon it used to fall back to
  language: "M3 5h12v8H8l-4 3v-3H3z M18 9h3v8h-2l-3 2v-2h-4",
  economy: "M4 6h16v12H4z M4 10h16 M7 15h4",
  payments: "M7 2h10v20H7z M10 20h4 M9.5 6h5 M9.5 8.5h5 M14.5 6c0 2-2 2.6-3.6 2.6l3.6 4.4",
  finance: "M4 10l8-5 8 5 M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 21h18",
  poverty: "M3 21h18 M6 21v-6 M10 21v-9 M14 21v-5 M18 21v-8",
  health: "M3 12h4l2-5 3 10 2-5h5",
  lifestyle: "M8 3h8 M12 3v5 M12 8c-3 0-5 2.5-5 5.5S9 21 12 21s5-4.5 5-7.5S15 8 12 8z",
  // sofa — household possessions (car / TV / computer), distinct from economy's card
  assets: "M5 12V9a2 2 0 012-2h10a2 2 0 012 2v3 M3 12h18v6H3z M5 18v2 M19 18v2",
  education: "M2 10l10-5 10 5-10 5z M6 12.5V17c1.5 1.5 10.5 1.5 12 0v-4.5",
  labour: "M4 8h16v11H4z M9 8V6a3 3 0 016 0v2 M4 13h16",
  livelihood: "M12 21v-7 M12 14c0-3 2.5-5 5.5-5 0 3-2.5 5-5.5 5z M12 14c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5z",
  agriculture: "M12 22V8 M12 8c-2 0-3-1.5-3-3.5C11 4.5 12 6 12 8z M12 8c2 0 3-1.5 3-3.5C13 4.5 12 6 12 8z M12 13c-2 0-3-1.5-3-3.5C11 9.5 12 11 12 13z M12 13c2 0 3-1.5 3-3.5C13 9.5 12 11 12 13z M12 18c-2 0-3-1.5-3-3.5C11 14.5 12 16 12 18z M12 18c2 0 3-1.5 3-3.5C13 14.5 12 16 12 18z",
  crime: "M12 3l8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6z",
  safety: "M12 4l9 16H3z M12 11v4 M12 17.5v.5",
  // leaf over a rain/heat cloud — rainfall, temperature, forest, air quality
  environment: "M6 14a3.5 3.5 0 010-7 4.5 4.5 0 018.2-1.8 3.5 3.5 0 011 6.8 M8 18.5l.01 0 M12 20l.01 0 M16 18.5l.01 0 M20 5c-4.5 0-7 2.6-7 6 3.4 0 6-2.4 7-6z",
  infrastructure: "M13 3L6 13h5l-1 8 7-10h-5z",
  transport: "M3 13l2-5h14l2 5v5H3z M7.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M16.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M3 13h18",
  elections: "M4 10h16v10H4z M4 14h16 M10 10l1-5h2l1 5",
};

export function catAccent(cat: string): string {
  return CAT_ACCENT[cat] ?? "#d1502f"; // token: --accent
}

export function orderedCategories(metrics: Metric[]): string[] {
  const present = new Set(metrics.map((m) => m.category));
  const known = CAT_ORDER.filter((c) => present.has(c));
  const extra = [...present].filter((c) => !CAT_ORDER.includes(c)).sort();
  return [...known, ...extra];
}

export function hexA(hex: string, a: number): string {
  const s = hex.replace("#", "");
  const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
