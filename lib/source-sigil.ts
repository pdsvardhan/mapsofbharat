// Publisher sigils + coverage marks for the single-line metric row (design round
// `metric-row-cluster`, Option A "single-line", locked 2026-08-10; ledger rows
// 80-83).
//
// WHY A SIGIL. The approved panel gives the source column 42px. A source string in
// this catalogue runs to 170 characters ("MGNREGA 'District-wise MGNREGA Data at a
// Glance', Ministry of Rural Development, via data.gov.in OGD (resource …), FY
// 2025-26"), and the shortest useful cut — everything before the first comma — is
// still 47. Neither fits a one-line row at any of the three widths, so each row
// carries a 3-7 character publisher key.
//
// WHY A LEGEND AND NOT A TOOLTIP. A sigil is a lossy encoding, and the panel pays
// for it with a STANDING legend under each list rather than a hover title: this is
// a P3 public surface, target_devices=both, and `title` never fires on touch. The
// legend is authored in the same pass as the sigil so the two cannot drift — see
// sourceLegend() below, which derives the key from the rows actually on screen.
//
// WHY CURATED AND NOT DERIVED. A rule ("take the first acronym-shaped token")
// splits the 29 Census metrics between ORGI and Census depending on whether an
// individual table caption happens to end in "(ORGI)", and reads "HH" off
// "Table HH-14". One publisher under two keys is the one thing a sigil may not do,
// because the whole point of the column is "who published this". Matching is on a
// PREFIX of metrics.source; add a row here when a new publisher lands, and the
// fallback below keeps an unmatched source rendering something honest meanwhile.

type SigilRule = {
  /** Matched against the start of metrics.source. */
  prefix: string;
  sigil: string;
  /** Spelt out in the standing legend under every list that shows this sigil. */
  label: string;
};

const RULES: SigilRule[] = [
  { prefix: "Census of India 2011", sigil: "ORGI", label: "Census of India 2011 · Office of the Registrar General" },
  { prefix: "NFHS-5", sigil: "NFHS", label: "NFHS-5 (2019–21), IIPS / MoHFW" },
  { prefix: "MGNREGA", sigil: "MGNREGA", label: "MGNREGA, Ministry of Rural Development · data.gov.in" },
  { prefix: "Reserve Bank of India", sigil: "RBI", label: "Reserve Bank of India · Handbook of Statistics" },
  { prefix: "RBI", sigil: "RBI", label: "Reserve Bank of India · Handbook of Statistics" },
  { prefix: "NCRB", sigil: "NCRB", label: "National Crime Records Bureau" },
  { prefix: "ASER", sigil: "ASER", label: "ASER 2024, ASER Centre / Pratham" },
  { prefix: "20th Livestock Census", sigil: "DAHD", label: "20th Livestock Census 2019, Dept. of Animal Husbandry & Dairying" },
  { prefix: "India Meteorological Department", sigil: "IMD", label: "India Meteorological Department, Pune · gridded daily data" },
  { prefix: "NITI Aayog", sigil: "NITI", label: "NITI Aayog · National Multidimensional Poverty Index 2023" },
  { prefix: "MoSPI", sigil: "MoSPI", label: "Ministry of Statistics & Programme Implementation" },
  { prefix: "Ministry of Education", sigil: "UDISE", label: "Ministry of Education · UDISE+ 2024-25" },
  { prefix: "Directorate of Economics & Statistics", sigil: "DES", label: "Directorate of Economics & Statistics, DA&FW" },
  { prefix: "TRAI", sigil: "TRAI", label: "Telecom Regulatory Authority of India" },
  { prefix: "NPCI", sigil: "NPCI", label: "National Payments Corporation of India" },
  { prefix: "Vahan Dashboard", sigil: "Vahan", label: "Vahan Dashboard (MoRTH) · vehicle registrations" },
  { prefix: "MoRTH", sigil: "MoRTH", label: "Ministry of Road Transport & Highways" },
  { prefix: "Ministry of Tourism", sigil: "MoT", label: "Ministry of Tourism · India Tourism Data Compendium" },
  { prefix: "GSTN", sigil: "GSTN", label: "GSTN · GST Statistics" },
  { prefix: "FSI", sigil: "FSI", label: "Forest Survey of India · India State of Forest Report 2023" },
  { prefix: "UrbanEmissions", sigil: "APnA", label: "UrbanEmissions.info (APnA) · satellite-derived annual PM2.5" },
  { prefix: "Jal Jeevan Mission", sigil: "JJM", label: "Jal Jeevan Mission, DDWS / Ministry of Jal Shakti" },
  { prefix: "Election Commission of India", sigil: "ECI", label: "Election Commission of India" },
  { prefix: "CEA", sigil: "CEA", label: "Central Electricity Authority" },
];

/** Everything up to the first comma / dash / bracket — the publisher clause. */
function head(source: string): string {
  return source.split(/[,(—–]/)[0].trim();
}

function ruleFor(source: string): SigilRule | null {
  const s = source.trim();
  for (const r of RULES) if (s.startsWith(r.prefix)) return r;
  return null;
}

/** The 3-7 character publisher key shown in a row's source column. */
export function sourceSigil(source: string): string {
  const r = ruleFor(source);
  if (r) return r.sigil;
  // Unmatched publisher: the first word of the publisher clause, letters and
  // digits only. Never empty, never the whole 170-character string.
  const first = head(source).split(/\s+/)[0]?.replace(/[^A-Za-z0-9+]/g, "") ?? "";
  return first.slice(0, 7) || "SRC";
}

export type SourceLegendEntry = { sigil: string; label: string };

/**
 * The standing legend for a set of rows: one entry per DISTINCT sigil actually on
 * screen, in first-appearance order. Derived from the same `source` strings the
 * rows render, so a list can never show a key its legend does not explain.
 */
export function sourceLegend(sources: Iterable<string>): SourceLegendEntry[] {
  const seen = new Set<string>();
  const out: SourceLegendEntry[] = [];
  for (const s of sources) {
    const sigil = sourceSigil(s);
    if (seen.has(sigil)) continue;
    seen.add(sigil);
    out.push({ sigil, label: ruleFor(s)?.label ?? head(s) });
  }
  return out;
}

export type Coverage = { district: boolean; state: boolean; label: string };

/**
 * Which region levels a metric carries, for the row's two-cell coverage mark.
 * metric_values.region_level also holds the 2011-vintage levels ("district2011",
 * "state2011"), which are the same geography at an older boundary set — they count
 * as coverage of that level, so match on the prefix rather than the exact string.
 */
export function coverageOf(levels: string[] | undefined): Coverage {
  const district = !!levels?.some((l) => l.startsWith("district"));
  const state = !!levels?.some((l) => l.startsWith("state"));
  return {
    district,
    state,
    label: district ? (state ? "Districts and states" : "Districts only") : "States only",
  };
}
