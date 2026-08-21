// Small-multiples families (#547 phase A).
//
// A family is a set of metrics that can honestly share one grid: same source
// cohort, same unit, same geometry, one vintage. `research/2026-08-20-455-...` (R1)
// found eight; the numbers below are a re-derivation against the 125-metric
// catalogue on 2026-08-21, not a copy of R1's table, because R1's part-to-whole
// claims did not survive testing (see `partToWhole` on each family).
//
// EVERY NUMBER HERE IS ASSERTED BY tests/metric-families.spec.ts. If a metric is
// retired, re-united or loses district coverage, that spec fails rather than the
// grid quietly rendering a family that no longer exists.

export type FamilyAxis = "shared" | "free";

export type PartToWhole = {
  /** Mean of the per-district member sum. Stated, not assumed to be 100. */
  sumsTo: number;
  /** Districts whose members sum within 97-103, out of `of`. */
  within: number;
  of: number;
};

export type MetricFamily = {
  id: string;
  label: string;
  /** One line a reader can act on — what the grid is showing them. */
  blurb: string;
  /** Exact `metrics.source` string. This IS the cohort key, not a display label. */
  source: string;
  unit: string;
  members: string[];
  /**
   * Shared axis or free per panel. Never defaulted: a shared linear axis flattens
   * 5 of 6 religion panels and 3 of 4 crime panels into near-empty maps, and a free
   * axis on a genuine decomposition hides that the parts are comparable.
   */
  axis: FamilyAxis;
  axisWhy: string;
  /** false unless the members genuinely decompose one quantity — tested, not claimed. */
  partToWhole: PartToWhole | false;
  /** Floor for districts on which EVERY member has a value. Measured 2026-08-21. */
  sharedDistricts: number;
  /** Set when the family must not ship as a grid yet, with the reason. */
  blockedBy?: string;
};

export const METRIC_FAMILIES: MetricFamily[] = [
  {
    id: "religion",
    label: "Religion",
    blurb: "The six communities Census 2011 counts, as a share of each district.",
    source: "Census of India 2011, Table C-01: Population by religious community (ORGI)",
    unit: "%",
    members: ["hindu_pct", "muslim_pct", "christian_pct", "sikh_pct", "buddhist_pct", "jain_pct"],
    axis: "free",
    axisWhy:
      "24.2x spread across members — jain_pct maxes at 4.1% against hindu_pct's 99.4%. " +
      "One shared linear axis would render five of the six panels as flat empty maps.",
    // The only candidate that survived the test. Note it averages 97.6, not 100:
    // C-01's 'other' and 'not stated' communities are not in the catalogue, so the
    // caption must state the real figure rather than implying the six exhaust it.
    partToWhole: { sumsTo: 97.6, within: 663, of: 733 },
    sharedDistricts: 733,
  },
  {
    id: "household-assets",
    label: "Household assets",
    blurb: "What households own, from Census 2011's amenities and assets table.",
    source: "Census of India 2011, Table HH-14 (Households by Amenities and Assets)",
    unit: "%",
    members: ["assets_car", "assets_scooter", "assets_tv", "assets_computer", "assets_none"],
    axis: "shared",
    axisWhy: "3.4x spread; all members sit on 0-95, so one axis makes the panels comparable.",
    // R1 called this part-to-whole. It is not: a household can own a car AND a TV,
    // so the members overlap. Only 63 of 733 districts sum near 100, and one reaches
    // 201.6. Captioning it as a decomposition would be false.
    partToWhole: false,
    sharedDistricts: 733,
  },
  {
    id: "nfhs5-health",
    label: "Health and lifestyle (NFHS-5)",
    blurb: "Twenty-two district health indicators from the 2019-21 national family health survey.",
    source: "NFHS-5 (2019-21) District Factsheets, IIPS / MoHFW",
    unit: "%",
    members: [
      "nfhs5_institutional_births", "nfhs5_full_immunization", "nfhs5_improved_sanitation",
      "nfhs5_clean_fuel", "nfhs5_health_insurance", "nfhs5_stunting_u5",
      "nfhs5_underweight_u5", "nfhs5_women_anaemia", "nfhs5_women_bmi_low",
      "nfhs5_women_obese", "nfhs5_child_marriage", "nfhs5_teen_mothers",
      "nfhs5_csection", "nfhs5_csection_private", "nfhs5_alcohol_men", "nfhs5_alcohol_women",
      "nfhs5_tobacco_men", "nfhs5_tobacco_women", "nfhs5_bp_high_men", "nfhs5_bp_high_women",
      "nfhs5_sugar_high_men", "nfhs5_sugar_high_women",
    ],
    axis: "free",
    axisWhy:
      "Coverage indicators (institutional births, immunisation) sit at 20-100 while " +
      "burden indicators (anaemia, stunting) sit at 0-63. R1's two sub-blocks are the " +
      "right treatment; a single axis compresses the burden half into invisibility.",
    partToWhole: false,
    // 555 with nfhs5_csection_private included. R1 excluded it to lift the base;
    // the floor here matches what the declared member list actually yields.
    sharedDistricts: 555,
  },
  {
    id: "aser-learning",
    label: "Learning outcomes (ASER 2024)",
    blurb: "What rural children can actually read and calculate, surveyed in 2024.",
    source: "ASER 2024 (Annual Status of Education Report), ASER Centre / Pratham — district estimates",
    unit: "%",
    members: ["aser_read_std3_5", "aser_subtract_std3_5", "aser_division_std6_8",
              "aser_govt_school", "aser_out_of_school"],
    axis: "shared",
    axisWhy: "4.7x spread on a 0-96.6 range; one axis keeps the panels honest against each other.",
    partToWhole: false,
    sharedDistricts: 622,
  },
  {
    id: "crime",
    label: "Recorded crime",
    blurb: "Four NCRB rates per 100,000 people, as recorded in 2022.",
    source: "NCRB, Crime in India 2022 (district tables via data.gov.in OGD)",
    unit: "per 100k",
    members: ["crime_ipc_rate", "crime_women_rate", "crime_murder_rate", "crime_cyber_rate"],
    axis: "free",
    axisWhy:
      "153.7x spread — the overall IPC rate reaches 2168 while murder tops out near 14. " +
      "A shared axis would show three flat panels and one map.",
    partToWhole: false,
    sharedDistricts: 706,
  },
  {
    id: "livestock",
    label: "Livestock",
    blurb: "Cattle, buffalo and goats counted in the 20th Livestock Census.",
    source: "20th Livestock Census 2019, DAHD (Dept. of Animal Husbandry & Dairying) — district-wise tables via data.gov.in",
    unit: "head",
    members: ["livestock_cattle", "livestock_buffalo", "livestock_goat"],
    axis: "shared",
    axisWhy:
      "2.0x spread, but these are counts over a 0-2.9M range, so the shared axis needs " +
      "the sqrt or log treatment the symbol layer already uses for counts (#408).",
    partToWhole: false,
    sharedDistricts: 695,
  },
  {
    id: "mgnrega",
    label: "MGNREGA",
    blurb: "Who the rural employment guarantee actually reached, FY 2025-26.",
    source: "MGNREGA 'District-wise MGNREGA Data at a Glance', Ministry of Rural Development, via data.gov.in OGD (resource ee03643a-ee4c-48c2-ac30-9f2ff26ab722), FY 2025-26 (March year-end)",
    unit: "%",
    members: ["mgnrega_pct_hh_100_days", "mgnrega_women_persondays_share",
              "mgnrega_scst_persondays_share"],
    axis: "shared",
    axisWhy: "2.1x spread across a 0-100 range.",
    // The per-district sums average exactly 100.0, which is a coincidence and not a
    // decomposition: households completing 100 days is unrelated to the two
    // persondays shares. Only 34 of 683 districts land in the 97-103 band, and one
    // reaches 194.4. Recorded here so the coincidence is never mistaken for a whole.
    partToWhole: false,
    sharedDistricts: 683,
  },
  {
    id: "census-pca",
    label: "Population and livelihood (Census 2011)",
    blurb: "Literacy, caste share and how districts earn a living.",
    source: "Census of India 2011, Primary Census Abstract (ORGI)",
    unit: "%",
    members: ["literacy_rate", "female_literacy_rate", "sc_pct", "st_pct", "work_participation",
              "cultivators_pct", "agri_labourers_pct", "household_industry_pct", "other_workers_pct"],
    axis: "free",
    axisWhy: "5.6x spread and three unrelated concepts (literacy, caste, livelihood) in one cohort.",
    partToWhole: false,
    sharedDistricts: 733,
    // The four worker-category members take MAIN_*_P numerators over TOT_WORK_P
    // (pipeline/ingest_pca.py:65-66), so they are MAIN workers as a share of ALL
    // workers: they sum to 73.6% on average and to 100 in zero of 733 districts.
    // The missing ~26% is marginal workers, undisclosed in descriptions that say
    // only "% of total workers". Until that is resolved this family must not ship
    // as a livelihood decomposition.
    blockedBy:
      "worker-category metrics understate by ~26% (main workers over all workers) — " +
      "see the ingest_pca to-do before shipping this family",
  },
];

export const FAMILY_BY_ID = new Map(METRIC_FAMILIES.map((f) => [f.id, f]));

/** Families a grid may render today — everything without a recorded blocker. */
export const SHIPPABLE_FAMILIES = METRIC_FAMILIES.filter((f) => !f.blockedBy);
