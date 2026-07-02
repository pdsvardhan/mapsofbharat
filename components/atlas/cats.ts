// Topic (category) accents, icons and descriptions for the Atlas chooser.
// Categories mirror the live taxonomy in the metrics table — six verticals,
// all real data (iter-51 item 385; prototype topics were placeholders).

export type Metric = {
  id: string; name: string; category: string; unit: string; year: number; source: string;
  higher_is_better: number | null; levels?: string[]; methodology?: string | null;
  decimals?: number; default_scale?: string | null;
};

export const CAT_ORDER = ["demographics", "economy", "health", "crime", "labour", "livelihood"];

export const CAT_ACCENT: Record<string, string> = {
  demographics: "#d1502f",
  economy: "#c8a24a",
  health: "#5fa88a",
  crime: "#b0574f",
  labour: "#7a86c4",
  livelihood: "#8f9c54",
};

export const CAT_DESC: Record<string, string> = {
  demographics: "People, literacy & settlement — Census 2011",
  economy: "Output, fiscal health & enterprise",
  health: "Wellbeing, nutrition & healthcare — NFHS-5",
  crime: "Safety & justice — NCRB 2022",
  labour: "Jobs & participation — PLFS",
  livelihood: "How workers earn — Census 2011",
};

// Simple stroke icon paths (24×24 viewBox), drawn in the topic accent.
export const CAT_ICON: Record<string, string> = {
  demographics: "M12 8a3 3 0 100-6 3 3 0 000 6z M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6",
  economy: "M4 6h16v12H4z M4 10h16 M7 15h4",
  health: "M3 12h4l2-5 3 10 2-5h5",
  crime: "M12 3l8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6z",
  labour: "M4 8h16v11H4z M9 8V6a3 3 0 016 0v2 M4 13h16",
  livelihood: "M12 21v-7 M12 14c0-3 2.5-5 5.5-5 0 3-2.5 5-5.5 5z M12 14c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5z",
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
