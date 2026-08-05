// Metric -> raw-source lineage map for the canonical /metric/{id} page (iter-131
// item 831). It does two jobs:
//
//   1. Data lineage — raw source -> processing -> external inputs -> final data.
//      The `processing` + `externalInputs` here are the STRUCTURED spine of the
//      lineage chain; the metric's own `methodology` prose stays the long form.
//
//   2. Free raw download — where the ingested raw file is a single, reasonably
//      sized file it is SERVED (app/metric/[slug]/raw/route.ts) with a citation
//      header. Where the raw source is a large PDF, a gridded binary, or a
//      multi-file publication, we LINK the official source_url instead of hosting
//      a copy (the user-confirmed fallback), honouring the non-goal "not a raw
//      microdata / CSV-dump repository".
//
// The map is DERIVED by reading each pipeline/ingest_*.py: every metric is traced
// to the exact file(s) its ingest script opens (grep for os.path.join / SRC_FILE /
// glob). Honest coverage — 77 of 124 metrics get a hosted raw file, 47 link the
// official source. The link cases are: Census C-01 religion (35 workbooks) & C-16
// language (36 workbooks) & HH-14 assets (hundreds of per-district workbooks),
// 20th Livestock Census (37 per-state JSONs), ASER (25 per-state PDFs), and the
// large publication PDFs (UDISE+, ISFR vol-2, NITI MPI, FR375, CEA review, MoRTH
// road, NCRB ADSI, Tourism compendium) plus the IMD gridded daily .grd binaries.

export type RawFile = {
  kind: "file";
  /** Repo-relative path to the ingested raw file the pipeline actually parses. */
  path: string;
  /** Filename offered to the browser. */
  filename: string;
  mime: string;
  /** true for CSV/TSV: the citation is PREPENDED as `#` comment lines. false for
   *  binary (xls/xlsx/json/pdf): the citation rides in the HTTP response headers. */
  text: boolean;
  /** ISO date the raw file was captured (from the ingest script's FETCHED), when
   *  known; otherwise the route falls back to the metric's last_updated. */
  retrieved?: string;
};

export type RawLink = {
  kind: "link";
  /** Why we link the official source instead of hosting a copy. */
  reason: string;
};

export type RawSource = RawFile | RawLink;

export type Lineage = {
  /** What the pipeline did to turn the raw source into the final values. */
  processing: string;
  /** Outside datasets pulled in during processing (denominators, crosswalks,
   *  geometry). Empty array => the published figures are used directly. */
  externalInputs: string[];
  raw: RawSource;
};

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS = "application/vnd.ms-excel";
const CSV = "text/csv";
const JSON_MIME = "application/json";
const PDF = "application/pdf";

const f = (
  path: string,
  filename: string,
  mime: string,
  text = false,
  retrieved?: string,
): RawFile => ({ kind: "file", path, filename, mime, text, retrieved });

const L = (reason: string): RawLink => ({ kind: "link", reason });

// Shared external-input phrases (kept identical so the same processing input reads
// the same on every metric that uses it).
const CENSUS_POP =
  "Census-2011 reaggregated district/state population (the per-capita / per-1,000 denominator)";
const CENSUS_FEMALE_POP =
  "Census-2011 reaggregated district FEMALE population (the per-100k-women denominator)";
const CROSSWALK =
  "Persisted sub-district crosswalk (Census 2011 sub-districts → current districts) for boundary harmonisation";
const GEO_POLY =
  "District/state boundary polygons (public/geo GeoJSON) for the zonal statistics";
const RBI_GSDP =
  "RBI HBS Table 21 — GSDP at current prices (the % of GSDP denominator)";

function group(ids: string[], lin: Lineage): Record<string, Lineage> {
  return Object.fromEntries(ids.map((id) => [id, lin]));
}

export const RAW_SOURCES: Record<string, Lineage> = {
  // ---- Census 2011 Primary Census Abstract (demographics + livelihood) --------
  // pipeline/ingest_pca.py opens raw/2011-IndiaStateDist.xlsx (sheet "Data").
  ...group(
    [
      "child_sex_ratio",
      "female_literacy_rate",
      "literacy_rate",
      "pop_total",
      "sc_pct",
      "sex_ratio",
      "st_pct",
      "work_participation",
      "agri_labourers_pct",
      "cultivators_pct",
      "household_industry_pct",
      "other_workers_pct",
    ],
    {
      processing:
        "Primary Census Abstract district rows (Total residence) are reaggregated onto current-day districts, then the rate / share / ratio is computed from the PCA population, literacy and worker columns.",
      externalInputs: [CROSSWALK],
      raw: f(
        "pipeline/raw/2011-IndiaStateDist.xlsx",
        "census2011_PCA_state_district.xlsx",
        XLSX,
      ),
    },
  ),

  // ---- Census 2011 Table A-01 (area / density / urban share) ------------------
  ...group(["area_km2", "pop_density", "urban_pct"], {
    processing:
      "Census A-01 sub-district rows (Total residence) are reaggregated onto current districts; density = population / geographic area and urban share = urban / total population. State rows use the official A-01 figures, with four boundary-change cases derived from the crosswalk.",
    externalInputs: [CROSSWALK],
    raw: f(
      "pipeline/raw-new/demographics/census2011_A01_villages_towns_households_population_area_district_subdistrict.xlsx",
      "census2011_A01_district_subdistrict.xlsx",
      XLSX,
      false,
      "2011-07-03",
    ),
  }),

  // ---- Census 2011 Table C-01 (religion shares) — LINK ------------------------
  // pipeline/ingest_religion_c01.py globs raw-new/religion/census2011_C01_states/*
  ...group(
    ["buddhist_pct", "christian_pct", "hindu_pct", "jain_pct", "muslim_pct", "sikh_pct"],
    {
      processing:
        "Community population as a share of total district population; the 2011 districts are mapped to current boundaries by population-weighted parent attribution.",
      externalInputs: [CROSSWALK],
      raw: L(
        "Census C-01 is published as 35 separate state workbooks (DDWxxC-01_MDDS); there is no single hostable file, so the official ORGI census-tables page is linked.",
      ),
    },
  ),

  // ---- Agriculture: APY district/season/crop 2014 -----------------------------
  ...group(["agri_cropped_area", "agri_rice_production", "agri_wheat_production"], {
    processing:
      "District / season / crop rows for crop-year 2014 are filtered to the crop (or all crops, for gross cropped area) and summed to the district.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/agriculture/datagov_APY_district_season_crop_2014.json",
      "datagov_APY_district_season_crop_2014.json",
      JSON_MIME,
    ),
  }),

  // ---- 20th Livestock Census 2019 — LINK (37 per-state JSONs) ------------------
  livestock_buffalo: livestock("Buffalo head-counts are summed to the district."),
  livestock_cattle: livestock("Cattle head-counts are summed to the district."),
  livestock_goat: livestock("Goat head-counts are summed to the district."),
  livestock_poultry: livestock("Poultry head-counts are summed to the district."),
  cattle_per_1000: {
    processing:
      "Cattle head-counts are summed to the district, then divided by Census-2011 population × 1,000.",
    externalInputs: [CENSUS_POP],
    raw: L(
      "The 20th Livestock Census district tables were pulled as 37 per-state JSON files (one data.gov.in OGD resource each); there is no single hostable file, so the official data.gov.in catalog is linked.",
    ),
  },

  // ---- Census 2011 Table HH-14 (household assets) — LINK ----------------------
  ...group(["assets_car", "assets_computer", "assets_none", "assets_scooter", "assets_tv"], {
    processing:
      "Household asset counts as a share of total households; the per-district workbooks are reaggregated onto current boundaries.",
    externalInputs: [CROSSWALK, "Census-2011 sub-district household totals (the denominator)"],
    raw: L(
      "Census HH-14 is published as one workbook per district (hundreds of files, ~545 MB total); there is no single hostable file, so the official ORGI HH-14 catalog is linked.",
    ),
  }),

  // ---- NCRB Crime in India 2022 (per-table district CSVs) ---------------------
  crime_ipc_rate: {
    processing:
      "Police-district IPC-crime counts are summed into the host revenue district (railway / non-geographic units dropped); the rate per 100,000 is computed against Census-2011 reaggregated population.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/crime/ncrb_cii2022_district_1.1_ipc_crimes.csv",
      "ncrb_cii2022_district_1.1_ipc_crimes.csv",
      CSV,
      true,
      "2026-06-10",
    ),
  },
  crime_murder_rate: {
    processing:
      "Murder counts (Sec. 302 IPC) are read from the same IPC-crimes table, summed into the host revenue district, and expressed per 100,000 against Census-2011 population.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/crime/ncrb_cii2022_district_1.1_ipc_crimes.csv",
      "ncrb_cii2022_district_1.1_ipc_crimes.csv",
      CSV,
      true,
      "2026-06-10",
    ),
  },
  crime_women_rate: {
    processing:
      "Crimes-against-women counts are summed into the host revenue district and expressed per 100,000 WOMEN against Census-2011 reaggregated female population.",
    externalInputs: [CENSUS_FEMALE_POP],
    raw: f(
      "pipeline/raw-new/crime/ncrb_cii2022_district_1.3_crime_against_women.csv",
      "ncrb_cii2022_district_1.3_crime_against_women.csv",
      CSV,
      true,
      "2026-06-10",
    ),
  },
  crime_cyber_rate: {
    processing:
      "Cyber-crime counts (IT Act + IPC + SLL) are summed into the host revenue district and expressed per 100,000 against Census-2011 population.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/crime/ncrb_cii2022_district_1.9_cyber_crimes.csv",
      "ncrb_cii2022_district_1.9_cyber_crimes.csv",
      CSV,
      true,
      "2026-06-10",
    ),
  },

  // ---- Economy: MoSPI per-capita NSDP -----------------------------------------
  econ_percapita_nsdp: {
    processing:
      "State-wise per-capita NSDP at current prices is read from the 'PC curr.' sheet.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/economy/mospi_state_wise_sdp_15032024.xls",
      "mospi_state_wise_sdp_15032024.xls",
      XLS,
    ),
  },

  // ---- Economy: RBI Handbook of Statistics on Indian States 2025 --------------
  econ_percapita_nsdp_rbi: rbiFiscal(
    "State per-capita NSDP at current prices is read from Table 19; each state carries its own latest fiscal year.",
    [],
    "rbi_hbs2025_T19_percapita_nsdp_current.xlsx",
  ),
  gsdp_growth: rbiFiscal(
    "Nominal year-on-year GSDP growth is computed from the GSDP-at-current-prices series (Table 21).",
    [],
    "rbi_hbs2025_T21_gsdp_current.xlsx",
  ),
  fiscal_deficit_pct_gsdp: rbiFiscal(
    "Gross fiscal deficit (Table 164) is expressed as a percentage of GSDP.",
    [RBI_GSDP],
    "rbi_hbs2025_T164_gross_fiscal_deficit.xlsx",
  ),
  own_tax_pct_gsdp: rbiFiscal(
    "Own tax revenue (Table 168) is expressed as a percentage of GSDP.",
    [RBI_GSDP],
    "rbi_hbs2025_T168_own_tax_revenue.xlsx",
  ),
  outstanding_debt_pct_gsdp: rbiFiscal(
    "Outstanding liabilities (Table 176) are expressed as a percentage of GSDP.",
    [RBI_GSDP],
    "rbi_hbs2025_T176_outstanding_liabilities.xlsx",
  ),

  // ---- Economy: HCES 2023-24 fact sheet (PDF, hostable ~2.6 MB) ---------------
  ...group(["mpce_rural", "mpce_urban"], {
    processing:
      "State-wise rural and urban Monthly Per-Capita Consumption Expenditure are read from Statement 7 of the HCES 2023-24 fact sheet.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/consumption/HCES_FactSheet_2023-24.pdf",
      "HCES_FactSheet_2023-24.pdf",
      PDF,
    ),
  }),

  // ---- Economy: Tourism compendium — LINK (large PDF) -------------------------
  ...group(["tourist_visits_domestic", "tourist_visits_foreign"], {
    processing:
      "State/UT-wise domestic and foreign tourist visits for 2024 are read from Table 4.1.2.",
    externalInputs: [],
    raw: L(
      "The India Tourism Data Compendium is a large (~16 MB) PDF; the official Ministry of Tourism statistics page is linked instead of hosting a copy.",
    ),
  }),

  // ---- Education: ASER 2024 — LINK (25 per-state PDFs) ------------------------
  ...group(
    [
      "aser_division_std6_8",
      "aser_govt_school",
      "aser_out_of_school",
      "aser_read_std3_5",
      "aser_subtract_std3_5",
    ],
    {
      processing:
        "District-level rural estimates are parsed from the per-state ASER 2024 district-estimate PDFs.",
      externalInputs: [],
      raw: L(
        "ASER 2024 district estimates are published as one PDF per state (25 files); there is no single hostable file, so the official ASER 2024 page is linked.",
      ),
    },
  ),

  // ---- Education: UDISE+ 2024-25 — LINK (large PDF) ---------------------------
  ...group(["udise_dropout_secondary", "udise_ger_secondary", "udise_ptr_secondary"], {
    processing:
      "State-wise secondary-stage GER, dropout rate and pupil-teacher ratio are read from the UDISE+ 2024-25 booklet.",
    externalInputs: [],
    raw: L(
      "The UDISE+ 2024-25 booklet is a large (~11 MB) PDF; the official UDISE+ portal is linked instead of hosting a copy.",
    ),
  }),

  // ---- Elections: ECI Lok Sabha 2024 turnout ---------------------------------
  voter_turnout_ls2024: {
    processing:
      "State-wise Lok Sabha 2024 voter turnout is parsed directly from ECI Statistical Report 12 (.xls).",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/elections/LS2024_12_State_Wise_Voters_Turn_Out.xls",
      "LS2024_12_State_Wise_Voters_Turn_Out.xls",
      XLS,
    ),
  },

  // ---- Environment: FSI ISFR 2023 — LINK (large PDF) -------------------------
  ...group(["forest_change_km2", "forest_cover_pct"], {
    processing:
      "District-wise forest cover (and its change since 2021) is read from the ISFR 2023 Vol-2 district tables; forest_cover_pct = forest cover / geographic area.",
    externalInputs: [],
    raw: L(
      "ISFR 2023 Volume 2 is a large (~15 MB) PDF; the official FSI report URL is linked instead of hosting a copy.",
    ),
  }),

  // ---- Environment: IMD gridded daily 2024 — LINK (gridded binary) -----------
  ...group(["heatwave_days_40c", "rain_annual_mm", "rain_monsoon_mm", "tmax_mean_c"], {
    processing:
      "IMD daily 0.25° / 1° grids for 2024 are zonally aggregated over each district / state polygon (rainfall summed, temperature averaged; heatwave = count of days ≥ 40 °C).",
    externalInputs: [GEO_POLY],
    raw: L(
      "IMD gridded daily data are large binary .grd grids (rainfall ~25 MB) read with imdlib and held per variable in separate directories; the official IMD open-data page is linked instead of hosting a copy.",
    ),
  }),

  // ---- Environment: UrbanEmissions satellite PM2.5 ---------------------------
  pm25_satellite: {
    processing:
      "Satellite-derived annual district PM2.5 concentrations are read from the APnA district workbook.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/environment/urbanemissions-satpm25-districts.xlsx",
      "urbanemissions-satpm25-districts.xlsx",
      XLSX,
    ),
  },

  // ---- Finance: RBI Handbook on the Indian Economy 2024-25 (SCB tables) ------
  bank_offices_per_lakh: rbiBank(
    "State-wise scheduled-commercial-bank offices (Table 152) ÷ population × 100,000.",
    [CENSUS_POP],
    "rbi-handbook-2024-25-table152-scb-offices-statewise.xlsx",
  ),
  bank_deposits_per_capita: rbiBank(
    "State-wise SCB deposits (Table 155) ÷ population.",
    [CENSUS_POP],
    "rbi-handbook-2024-25-table155-scb-deposits-statewise.xlsx",
  ),
  bank_credit_per_capita: rbiBank(
    "State-wise SCB credit (Table 156) ÷ population.",
    [CENSUS_POP],
    "rbi-handbook-2024-25-table156-scb-credit-statewise.xlsx",
  ),
  credit_deposit_ratio: rbiBank(
    "State-wise SCB credit (Table 156) ÷ SCB deposits.",
    ["RBI HBS Table 155 — SCB deposits (the denominator)"],
    "rbi-handbook-2024-25-table156-scb-credit-statewise.xlsx",
  ),

  // ---- Finance: GSTN statewise domestic collection ---------------------------
  gst_total: {
    processing:
      "State-wise domestic GST collection for FY 2025-26 is read from the GSTN statistics workbook.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/finance/statewise_GST_collection_2025-26.xlsx",
      "statewise_GST_collection_2025-26.xlsx",
      XLSX,
    ),
  },
  gst_per_capita: {
    processing:
      "State-wise domestic GST collection for FY 2025-26 ÷ population.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/finance/statewise_GST_collection_2025-26.xlsx",
      "statewise_GST_collection_2025-26.xlsx",
      XLSX,
    ),
  },

  // ---- Health + Lifestyle: NFHS-5 district factsheets (one CSV) ---------------
  ...group(
    [
      "nfhs5_child_marriage",
      "nfhs5_clean_fuel",
      "nfhs5_full_immunization",
      "nfhs5_health_insurance",
      "nfhs5_improved_sanitation",
      "nfhs5_institutional_births",
      "nfhs5_stunting_u5",
      "nfhs5_underweight_u5",
      "nfhs5_women_anaemia",
      "nfhs5_alcohol_men",
      "nfhs5_alcohol_women",
      "nfhs5_bp_high_men",
      "nfhs5_bp_high_women",
      "nfhs5_csection",
      "nfhs5_csection_private",
      "nfhs5_srb",
      "nfhs5_sugar_high_men",
      "nfhs5_sugar_high_women",
      "nfhs5_teen_mothers",
      "nfhs5_tobacco_men",
      "nfhs5_tobacco_women",
      "nfhs5_women_bmi_low",
      "nfhs5_women_obese",
    ],
    {
      processing:
        "The district-factsheet indicator (Total residence) is read directly from the compiled NFHS-5 district-factsheets table and matched onto current districts.",
      externalInputs: [],
      raw: f(
        "pipeline/raw-new/health/nfhs5_district_factsheets_provisional.csv",
        "nfhs5_district_factsheets_provisional.csv",
        CSV,
        true,
      ),
    },
  ),

  // ---- Lifestyle: NFHS-5 India Report FR375 — LINK (large PDF) ----------------
  ...group(
    [
      "diet_aerated_weekly_men",
      "diet_aerated_weekly_women",
      "diet_eggs_weekly_men",
      "diet_eggs_weekly_women",
      "diet_nonveg_weekly_men",
      "diet_nonveg_weekly_women",
    ],
    {
      processing:
        "State-wise weekly consumption frequencies are read from Tables 10.27.1 / 10.27.2.",
      externalInputs: [],
      raw: L(
        "The NFHS-5 India Report (FR375) is a large (~11 MB) PDF; the official DHS Program FR375 URL is linked instead of hosting a copy.",
      ),
    },
  ),

  // ---- Infrastructure: TRAI QPIR (PDF, hostable ~2.6 MB) ---------------------
  ...group(["internet_subs_per_100", "teledensity"], {
    processing:
      "Service-area subscriber and teledensity figures are read from the TRAI QPIR and mapped to states.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/telecom/TRAI_QPIR_2026-03.pdf",
      "TRAI_QPIR_2026-03.pdf",
      PDF,
    ),
  }),

  // ---- Infrastructure: CEA General Review 2025 — LINK (large PDF) ------------
  percapita_power_kwh: {
    processing:
      "State-wise per-capita electricity consumption is read from Table 9.9.",
    externalInputs: [],
    raw: L(
      "The CEA General Review 2025 is a large (~12 MB) PDF; the official CEA report page is linked instead of hosting a copy.",
    ),
  },

  // ---- Infrastructure: Jal Jeevan Mission district coverage ------------------
  tap_water_pct: {
    processing:
      "The district tap-water coverage snapshot is read directly from the JJM (Har Ghar Jal) dashboard export.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/water/JJM_HarGharJal_district_coverage_2026-07-03.csv",
      "JJM_HarGharJal_district_coverage_2026-07-03.csv",
      CSV,
      true,
      "2026-07-03",
    ),
  },

  // ---- Labour: MGNREGA district data-at-a-glance (one JSON) -------------------
  mgnrega_active_workers_per_1000: {
    processing:
      "The FY 2025-26 March cumulative district snapshot's active-workers count ÷ Census-2011 population × 1,000.",
    externalInputs: [CENSUS_POP],
    raw: mgnregaFile(),
  },
  mgnrega_avg_days_employment_hh: {
    processing:
      "Average days of employment per household is read from the FY 2025-26 March cumulative district snapshot.",
    externalInputs: [],
    raw: mgnregaFile(),
  },
  mgnrega_avg_wage_day: {
    processing:
      "Average wage per day is read from the FY 2025-26 March cumulative district snapshot.",
    externalInputs: [],
    raw: mgnregaFile(),
  },
  mgnrega_pct_hh_100_days: {
    processing:
      "Share of households completing 100 days is read from the FY 2025-26 March cumulative district snapshot.",
    externalInputs: [],
    raw: mgnregaFile(),
  },
  mgnrega_scst_persondays_share: {
    processing:
      "SC+ST share of persondays is read from the FY 2025-26 March cumulative district snapshot.",
    externalInputs: [],
    raw: mgnregaFile(),
  },
  mgnrega_women_persondays_share: {
    processing:
      "Women's share of persondays is read from the FY 2025-26 March cumulative district snapshot.",
    externalInputs: [],
    raw: mgnregaFile(),
  },

  // ---- Labour: MoSPI PLFS 2023-24 annual (one JSON) --------------------------
  ...group(["plfs_lfpr", "plfs_unemployment_rate", "plfs_wpr"], {
    processing:
      "State-wise LFPR / WPR / UR (usual status, ps+ss, all ages) are read from the PLFS 2023-24 OGD resource.",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/economy/plfs_state_lfpr_wpr_ur_2023-24.json",
      "plfs_state_lfpr_wpr_ur_2023-24.json",
      JSON_MIME,
      false,
      "2026-07-02",
    ),
  }),

  // ---- Language: Census 2011 Table C-16 — LINK (36 workbooks) ----------------
  ...group(["language_diversity", "language_hindi_pct", "language_top_share"], {
    processing:
      "Mother-tongue populations are aggregated per district / state; diversity = 1 − Σ share², top-share = the largest mother-tongue share, and Hindi share = Hindi speakers / total.",
    externalInputs: [],
    raw: L(
      "Census C-16 (mother tongue) is published as 36 separate state workbooks (~31 MB); there is no single hostable file, so the official ORGI C-16 catalog is linked.",
    ),
  }),

  // ---- Payments: NPCI district-wise UPI --------------------------------------
  ...group(["upi_txn_per_capita", "upi_value_per_capita"], {
    processing:
      "District UPI transaction count / value for Jun 2026 ÷ Census-2011 population.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/payments/npci-upi-districtwise-2026-06.xlsx",
      "npci-upi-districtwise-2026-06.xlsx",
      XLSX,
      false,
      "2026-06-30",
    ),
  }),

  // ---- Poverty: NITI Aayog MPI 2023 — LINK (large PDF) -----------------------
  ...group(["poverty_intensity", "poverty_mpi", "poverty_mpi_hcr"], {
    processing:
      "District MPI, multidimensional-poverty headcount ratio and intensity are read from the district Overview tables.",
    externalInputs: [],
    raw: L(
      "The NITI Aayog MPI Progress Review 2023 is a large (~23 MB, 410-page) PDF; the official NITI Aayog page is linked instead of hosting a copy.",
    ),
  }),

  // ---- Safety: MoRTH Road Accidents 2023 — LINK (large PDF) ------------------
  road_accident_death_rate: {
    processing:
      "State/UT persons killed (Table 5.6) ÷ Census-2011 population × 100,000.",
    externalInputs: [CENSUS_POP],
    raw: L(
      "MoRTH Road Accidents in India 2023 is a large (~9 MB) PDF; the official MoRTH page is linked instead of hosting a copy.",
    ),
  },

  // ---- Safety: NCRB ADSI — LINK (large PDF) ----------------------------------
  suicide_rate: {
    processing:
      "State suicide counts (ADSI Table 2.2) are turned into a rate per 100,000 as published.",
    externalInputs: [],
    raw: L(
      "The NCRB ADSI publication is a large (~24 MB) PDF; the official NCRB ADSI page is linked instead of hosting a copy.",
    ),
  },

  // ---- Transport: Vahan EV share ---------------------------------------------
  ev_share_pct: {
    processing:
      "State-wise EV registrations ÷ total registrations (CY2025), from the Vahan dashboard export ('reportTable' sheet).",
    externalInputs: [],
    raw: f(
      "pipeline/raw-new/transport/vahan-statewise-fuel-cy2025.xlsx",
      "vahan-statewise-fuel-cy2025.xlsx",
      XLSX,
    ),
  },

  // ---- Transport: MoRTH registered-vehicle stock -----------------------------
  vehicles_per_1000: {
    processing:
      "State registered motor vehicles (Table 20.4, 'State wise' sheet) ÷ population × 1,000.",
    externalInputs: [CENSUS_POP],
    raw: f(
      "pipeline/raw-new/transport/Table-20.4_0.xlsx",
      "MoRTH_Table-20.4_registered_vehicles.xlsx",
      XLSX,
    ),
  },
};

// ---- small builders (declared after use is fine — hoisted function decls) -----

function livestock(processing: string): Lineage {
  return {
    processing,
    externalInputs: [],
    raw: L(
      "The 20th Livestock Census district tables were pulled as 37 per-state JSON files (one data.gov.in OGD resource each); there is no single hostable file, so the official data.gov.in catalog is linked.",
    ),
  };
}

function rbiFiscal(processing: string, externalInputs: string[], file: string): Lineage {
  return {
    processing,
    externalInputs,
    raw: f(`pipeline/raw-new/economy/${file}`, file, XLSX),
  };
}

function rbiBank(processing: string, externalInputs: string[], file: string): Lineage {
  return {
    processing,
    externalInputs,
    raw: f(`pipeline/raw-new/finance/${file}`, file, XLSX),
  };
}

function mgnregaFile(): RawFile {
  return f(
    "pipeline/raw-new/labour/mgnrega_district_2025-26_march.json",
    "mgnrega_district_2025-26_march.json",
    JSON_MIME,
  );
}

/** The metric's raw-source lineage record, or null if the metric is unmapped. */
export function getMetricLineage(id: string): Lineage | null {
  return RAW_SOURCES[id] ?? null;
}

/** True when the metric has a hosted raw file (vs. an official-source link). */
export function hasHostedRaw(id: string): boolean {
  return RAW_SOURCES[id]?.raw.kind === "file";
}

// ── multi-source card credits (iter-33 item 850) ──────────────────────────────
//
// A per-capita / rate / share metric's headline number is built from MORE THAN one
// dataset: a numerator source (the metric's own `source`) divided by a DENOMINATOR
// dataset — e.g. Census-2011 population, Census-2011 female population, an RBI GSDP
// series, or another SCB table. The social export card previously credited only the
// headline source, so it needs these extra datasets too.
//
// They are already recorded structurally on each metric's lineage as `externalInputs`.
// The ones that are a genuine second DATA source are exactly the ones described as a
// "denominator". Boundary-harmonisation inputs (the sub-district crosswalk, the
// boundary polygons) are deliberately NOT credited here — they reshape existing
// values onto current districts rather than contribute a second measurement, and
// boundary provenance is already disclosed by the card's "Boundaries per Survey of
// India" note.

/** Compact, card-sized credit labels for the shared denominator phrases, so the
 *  same input reads the same short way on every metric that uses it. */
const DENOMINATOR_CREDIT: Record<string, string> = {
  [CENSUS_POP]: "Census 2011 (population)",
  [CENSUS_FEMALE_POP]: "Census 2011 (female population)",
  [RBI_GSDP]: "RBI Handbook of Statistics (GSDP)",
};

/** Fallback compaction for any other denominator phrase: drop a trailing
 *  "(the … denominator)" clause, e.g.
 *  "RBI HBS Table 155 — SCB deposits (the denominator)" →
 *  "RBI HBS Table 155 — SCB deposits". */
function compactDenominator(phrase: string): string {
  return phrase.replace(/\s*\(the\b[^)]*\)\s*$/i, "").trim();
}

/**
 * Compact credits for the ADDITIONAL datasets a metric's headline number is built
 * from — the second (denominator) source in a per-capita / rate / share metric.
 * Derived from the lineage's `externalInputs`: an input is a citable second data
 * source when it names a dataset used as a DENOMINATOR. Returns an empty array for
 * single-source metrics and for metrics whose only external inputs are boundary /
 * geometry harmonisation (not a second measurement). Deduped, order-stable so the
 * card renders deterministically.
 */
export function additionalSourceCredits(id: string): string[] {
  const inputs = RAW_SOURCES[id]?.externalInputs ?? [];
  const out: string[] = [];
  for (const phrase of inputs) {
    if (!/denominator/i.test(phrase)) continue; // only a second DATA source counts
    const credit = DENOMINATOR_CREDIT[phrase] ?? compactDenominator(phrase);
    if (credit && !out.includes(credit)) out.push(credit);
  }
  return out;
}

// ---- citation helpers (pure; shared by the download route) --------------------

export type CitationInput = {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  license: string;
  retrieved: string;
  canonicalUrl: string;
};

/** HTTP header values must be ASCII/latin1-safe (undici throws on smart dashes &
 *  the like), so fold the common typographic characters and strip the rest. The
 *  prepended comment block keeps full UTF-8 because it lives in the body. */
export function asciiSafe(s: string): string {
  return s
    .replace(/[‒-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/₹/g, "Rs")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/** The citation carried by every raw download: source, licence, retrieval date
 *  and the canonical metric URL, as HTTP response headers. */
export function citationHttpHeaders(c: CitationInput): Record<string, string> {
  return {
    "X-Citation-Source": asciiSafe(c.source),
    "X-Citation-Source-Url": asciiSafe(c.sourceUrl),
    "X-Citation-License": asciiSafe(c.license),
    "X-Citation-Retrieved": asciiSafe(c.retrieved),
    "X-Citation-Canonical": asciiSafe(c.canonicalUrl),
    "X-Data-Citation": asciiSafe(
      `${c.source} | Licence: ${c.license} | Retrieved: ${c.retrieved} | Source: ${c.sourceUrl} | Canonical: ${c.canonicalUrl}`,
    ),
  };
}

/** The `#`-comment citation prepended to text/CSV downloads. */
export function citationCommentBlock(c: CitationInput): string {
  return (
    [
      "# Maps of Bharat — raw source data",
      `# Metric: ${c.name} (${c.id})`,
      `# Source: ${c.source}`,
      `# Source URL: ${c.sourceUrl}`,
      `# Licence: ${c.license}`,
      `# Retrieved: ${c.retrieved}`,
      `# Canonical metric page: ${c.canonicalUrl}`,
      "# This is the RAW ingested source file, provided free with attribution.",
      "# The processed, boundary-harmonised dataset (the values shown in the table)",
      "# is a separate download (Pro — coming soon).",
      "#",
      "",
    ].join("\n") + "\n"
  );
}
