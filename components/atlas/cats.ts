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

export const CAT_ORDER = [
  "demographics", "society", "economy", "health", "education",
  "labour", "livelihood", "agriculture", "crime", "safety", "infrastructure", "elections",
];

export const CAT_ACCENT: Record<string, string> = {
  demographics: "#d1502f",
  society: "#c2708f",
  economy: "#c8a24a",
  health: "#5fa88a",
  education: "#5578b4",
  labour: "#7a86c4",
  livelihood: "#8f9c54",
  agriculture: "#5e9e4f",
  crime: "#b0574f",
  safety: "#cd7f43",
  infrastructure: "#4d93a8",
  elections: "#9b6bb3",
};

export const CAT_DESC: Record<string, string> = {
  demographics: "People, density & settlement — Census 2011",
  society: "Religious composition — Census 2011",
  economy: "Output, spending, enterprise & tourism",
  health: "Wellbeing, nutrition & healthcare — NFHS-5",
  education: "Schools & learning — UDISE+ 2024-25",
  labour: "Jobs & participation — PLFS",
  livelihood: "How workers earn — Census 2011",
  agriculture: "Crops, area & production — APY 2014",
  crime: "Safety & justice — NCRB 2022",
  safety: "Road & self-harm risk — MoRTH / NCRB",
  infrastructure: "Power, water & connectivity",
  elections: "Democracy & turnout — ECI 2024",
};

// Simple stroke icon paths (24×24 viewBox), drawn in the topic accent.
export const CAT_ICON: Record<string, string> = {
  demographics: "M12 8a3 3 0 100-6 3 3 0 000 6z M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6",
  society: "M8 10a2 2 0 100-4 2 2 0 000 4z M16 10a2 2 0 100-4 2 2 0 000 4z M4 18c0-2.2 1.8-4 4-4s4 1.8 4 4 M12 18c0-2.2 1.8-4 4-4s4 1.8 4 4",
  economy: "M4 6h16v12H4z M4 10h16 M7 15h4",
  health: "M3 12h4l2-5 3 10 2-5h5",
  education: "M2 10l10-5 10 5-10 5z M6 12.5V17c1.5 1.5 10.5 1.5 12 0v-4.5",
  labour: "M4 8h16v11H4z M9 8V6a3 3 0 016 0v2 M4 13h16",
  livelihood: "M12 21v-7 M12 14c0-3 2.5-5 5.5-5 0 3-2.5 5-5.5 5z M12 14c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5z",
  agriculture: "M12 22V8 M12 8c-2 0-3-1.5-3-3.5C11 4.5 12 6 12 8z M12 8c2 0 3-1.5 3-3.5C13 4.5 12 6 12 8z M12 13c-2 0-3-1.5-3-3.5C11 9.5 12 11 12 13z M12 13c2 0 3-1.5 3-3.5C13 9.5 12 11 12 13z M12 18c-2 0-3-1.5-3-3.5C11 14.5 12 16 12 18z M12 18c2 0 3-1.5 3-3.5C13 14.5 12 16 12 18z",
  crime: "M12 3l8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6z",
  safety: "M12 4l9 16H3z M12 11v4 M12 17.5v.5",
  infrastructure: "M13 3L6 13h5l-1 8 7-10h-5z",
  elections: "M4 10h16v10H4z M4 14h16 M10 10l1-5h2l1 5",
};

export function catAccent(cat: string): string {
  return CAT_ACCENT[cat] ?? "#d1502f";
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
