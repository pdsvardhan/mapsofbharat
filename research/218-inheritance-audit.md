# Slice 1 calibration audit — grading sibling inheritances (to-do 218)

- **id:** audit-218-inheritance-grading
- **status:** read-only calibration audit (Slice 1). NO schema/data/UI/app-code changed.
- **date:** 2026-08-03
- **data source:** live app read APIs only, `GET /api/health` -> commit `1c4e87b`, tree `clean`
- **scope note:** the earlier scope doc is `decisions/218-inheritance-grading-scope.md`. This report executes its Slice 1.

## Method

For every inherited district value the pipeline records a donor in `district_estimate_source`; the app exposes it per row as `estimated_from` on `/api/metrics/[id]?level=district`. I enumerated every distinct `(child, donor)` pair by scanning `estimated_from` across all metrics where `estimate_kind='inherited'`, then scored each pair on the three structural axes from the proposal, all pulled from the same read APIs:

- **divergence** = robust-z MAX distance over `urban_pct`, `female_literacy_rate`, `log(pop_density)`. Robust-z normalises each axis by the national IQR of its real district values, so a raw delta becomes "IQR-multiples of the national spread" and the three axes are comparable. MAX (not sum) => "differs from its donor by more than K spreads on at least one structural axis".
- **reach** = child `pop_total` (a real count, never inherited); also its share of its current state's population.
- **risk** = divergence x reach, expressed as `divergence x (pop_total / 1e6)`.

Axis coverage is fully real (no inherited copies polluting the spread), verified via `estimated_count`:

| axis | districts | estimated | national median | national IQR (robust-z denom) |
|---|---:|---:|---:|---:|
| `urban_pct` | 733 | 0 | 19.4 | 21.600 |
| `female_literacy_rate` | 733 | 0 | 62.5 | 18.550 |
| `pop_density` (log) | 733 | 0 | 355/km2 | 1.2731 (in log) |
| `pop_total` (reach) | 733 | 0 | — | — |

**Population scored:** 124 metrics scanned; **115 distinct (child, donor) pairs** across **110 child districts**; **0 unresolved** (every donor name resolved to exactly one same-state district code). A few children appear twice because they inherit different metrics from different donors (Mancherial <- Nirmal and <- Adilabad; adr-020).

## 1. Full ranked table (by risk, desc)

Deltas are raw (`Durban`,`Dflit` in points; `Dlogdens` in log-density). `div` is the robust-z MAX (IQR-multiples). `reach` in millions. `share` = child share of state pop. `risk` = div x reach(M). `risk_share` = div x share (small-state view).

| # | child | donor | Δurban | Δflit | Δlogden | div | driver | reach(M) | share | risk | risk_share | #metrics |
|--:|---|---|--:|--:|--:|--:|:--|--:|--:|--:|--:|--:|
| 1 | Anakapalli `37_744` | Visakhapatnam `37_520` | 75.2 | 20.8 | 1.520 | 3.48 | urban | 1.73 | 0.035 | 6.013 | 0.1212 | 33 |
| 2 | Purba Bardhaman `19_335` | Paschim Bardhaman `19_777` | 17.0 | 4.9 | 0.098 | 0.79 | urban | 6.56 | 0.072 | 5.162 | 0.0566 | 1 |
| 3 | Palghar `27_732` | Thane `27_517` | 34.0 | 13.2 | 1.197 | 1.57 | urban | 2.99 | 0.027 | 4.707 | 0.0419 | 5 |
| 4 | Alluri Sitharama Raju `37_745` | Visakhapatnam `37_520` | 80.9 | 31.7 | 3.215 | 3.75 | urban | 1.00 | 0.020 | 3.761 | 0.0758 | 33 |
| 5 | Hapur `09_705` | Ghaziabad `09_140` | 51.7 | 11.6 | 0.812 | 2.39 | urban | 1.34 | 0.007 | 3.203 | 0.0160 | 6 |
| 6 | NTR `37_749` | Krishna `37_510` | 30.9 | 2.6 | 0.396 | 1.43 | urban | 2.22 | 0.045 | 3.174 | 0.0640 | 33 |
| 7 | Medchal Malkajgiri `36_742` | Ranga Reddy `36_537` | 23.1 | 9.2 | 1.394 | 1.09 | logdens | 2.83 | 0.081 | 3.099 | 0.0886 | 7 |
| 8 | Warangal Urban `36_540` | Warangal Rural `36_749` | 63.6 | 17.6 | 0.882 | 2.94 | urban | 1.04 | 0.030 | 3.055 | 0.0874 | 5 |
| 9 | West Tripura `16_289` | Sipahijala `16_707` | 62.9 | 9.7 | 0.777 | 2.91 | urban | 0.99 | 0.270 | 2.883 | 0.7848 | 4 |
| 10 | Chhota Udaipur `24_731` | Vadodara `24_486` | 57.6 | 35.6 | 0.891 | 2.67 | urban | 1.07 | 0.018 | 2.858 | 0.0473 | 9 |
| 11 | Baloda Bazar `22_721` | Raipur `22_410` | 46.4 | 14.2 | 0.976 | 2.15 | urban | 1.31 | 0.051 | 2.804 | 0.1098 | 2 |
| 12 | Palnadu `37_751` | Guntur `37_506` | 28.8 | 17.8 | 1.128 | 1.33 | urban | 2.04 | 0.041 | 2.722 | 0.0549 | 33 |
| 13 | Vikarabad `36_743` | Ranga Reddy `36_537` | 56.3 | 20.4 | 0.955 | 2.61 | urban | 0.95 | 0.027 | 2.466 | 0.0705 | 6 |
| 14 | Mahabubabad `36_751` | Warangal Urban `36_540` | 61.4 | 20.7 | 1.391 | 2.84 | urban | 0.81 | 0.023 | 2.293 | 0.0656 | 1 |
| 15 | Warangal Rural `36_749` | Warangal Urban `36_540` | 63.6 | 17.6 | 0.882 | 2.94 | urban | 0.76 | 0.022 | 2.236 | 0.0639 | 5 |
| 16 | Bametara `22_718` | Durg `22_409` | 54.8 | 16.4 | 0.991 | 2.54 | urban | 0.80 | 0.031 | 2.019 | 0.0790 | 5 |
| 17 | Balod `22_719` | Durg `22_409` | 51.4 | 3.7 | 1.117 | 2.38 | urban | 0.83 | 0.032 | 1.966 | 0.0770 | 1 |
| 18 | Sangareddy `36_740` | Medak `36_535` | 28.1 | 10.1 | 0.205 | 1.30 | urban | 1.50 | 0.043 | 1.946 | 0.0556 | 6 |
| 19 | Konaseema `37_747` | East Godavari `37_505` | 22.6 | 1.6 | 0.076 | 1.05 | urban | 1.79 | 0.036 | 1.873 | 0.0377 | 33 |
| 20 | Botad `24_726` | Ahmedabad `24_474` | 53.7 | 16.5 | 1.401 | 2.49 | urban | 0.66 | 0.011 | 1.631 | 0.0270 | 9 |
| 21 | Eluru `37_748` | West Godavari `37_523` | 11.0 | 6.7 | 1.001 | 0.79 | logdens | 2.06 | 0.042 | 1.623 | 0.0327 | 33 |
| 22 | Sambhal `09_754` | Moradabad `09_135` | 15.7 | 12.4 | 0.420 | 0.73 | urban | 2.20 | 0.011 | 1.599 | 0.0080 | 6 |
| 23 | Tirupati `37_752` | Chittoor `37_503` | 15.1 | 1.9 | 0.111 | 0.70 | urban | 2.15 | 0.043 | 1.501 | 0.0302 | 33 |
| 24 | Jangaon `36_752` | Warangal Urban `36_540` | 57.8 | 16.5 | 1.248 | 2.68 | urban | 0.55 | 0.016 | 1.461 | 0.0418 | 5 |
| 25 | Gariaband `22_720` | Raipur `22_410` | 52.3 | 16.3 | 1.794 | 2.42 | urban | 0.60 | 0.023 | 1.447 | 0.0566 | 2 |
| 26 | Chengalpattu `33_9004` | Kancheepuram `33_604` | 12.9 | 5.8 | 0.233 | 0.60 | urban | 2.28 | 0.032 | 1.361 | 0.0189 | 28 |
| 27 | Sipahijala `16_707` | West Tripura `16_289` | 62.9 | 9.7 | 0.777 | 2.91 | urban | 0.45 | 0.122 | 1.303 | 0.3548 | 7 |
| 28 | Annamayya `37_753` | YSR `37_504` | 16.2 | 1.3 | 0.092 | 0.75 | urban | 1.70 | 0.034 | 1.273 | 0.0257 | 33 |
| 29 | Bapatla `37_750` | Prakasam `37_517` | 1.5 | 8.4 | 0.939 | 0.74 | logdens | 1.59 | 0.032 | 1.170 | 0.0236 | 33 |
| 30 | Amethi `09_706` | Sultanpur `09_179` | 2.3 | 8.3 | 0.175 | 0.45 | flit | 2.55 | 0.013 | 1.141 | 0.0057 | 6 |
| 31 | Morbi `24_727` | Rajkot `24_476` | 25.3 | 8.2 | 0.693 | 1.17 | urban | 0.96 | 0.016 | 1.125 | 0.0186 | 6 |
| 32 | Alipurduar `19_774` | Jalpaiguri `19_328` | 16.4 | 2.1 | 0.327 | 0.76 | urban | 1.43 | 0.016 | 1.083 | 0.0119 | 32 |
| 33 | Mulugu `36_780` | Warangal Urban `36_540` | 67.5 | 16.2 | 2.439 | 3.13 | urban | 0.34 | 0.010 | 1.051 | 0.0301 | 28 |
| 34 | Sri Sathya Sai `37_754` | Anantapuramu `37_502` | 12.3 | 1.4 | 0.066 | 0.57 | urban | 1.84 | 0.037 | 1.048 | 0.0211 | 33 |
| 35 | Nandyal `37_755` | Kurnool `37_511` | 12.0 | 6.4 | 0.459 | 0.56 | urban | 1.78 | 0.036 | 0.990 | 0.0199 | 33 |
| 36 | Tenkasi `33_9001` | Tirunelveli `33_628` | 12.1 | 12.7 | 0.127 | 0.68 | flit | 1.38 | 0.019 | 0.948 | 0.0131 | 33 |
| 37 | Paschim Bardhaman `19_777` | Purba Bardhaman `19_335` | 17.0 | 4.9 | 0.098 | 0.79 | urban | 1.16 | 0.013 | 0.912 | 0.0100 | 5 |
| 38 | Khowai `16_708` | West Tripura `16_289` | 66.7 | 6.6 | 1.251 | 3.09 | urban | 0.29 | 0.078 | 0.889 | 0.2421 | 7 |
| 39 | Tirupathur `33_9003` | Vellore `33_605` | 14.9 | 4.7 | 0.203 | 0.69 | urban | 1.22 | 0.017 | 0.845 | 0.0117 | 33 |
| 40 | Mancherial `36_735` | Nirmal `36_734` | 22.7 | 8.6 | 0.091 | 1.05 | urban | 0.80 | 0.023 | 0.843 | 0.0241 | 4 |
| 41 | Kallakurichi `33_729` | Viluppuram `33_607` | 4.8 | 8.3 | 0.139 | 0.45 | flit | 1.69 | 0.023 | 0.758 | 0.0105 | 33 |
| 42 | Kamareddy `36_736` | Nizamabad `36_533` | 16.8 | 8.8 | 0.322 | 0.78 | urban | 0.97 | 0.028 | 0.758 | 0.0217 | 6 |
| 43 | Mancherial `36_735` | Adilabad `36_532` | 20.4 | 2.3 | 0.167 | 0.94 | urban | 0.80 | 0.023 | 0.758 | 0.0217 | 6 |
| 44 | Jhargram `19_776` | Paschim Medinipur `19_344` | 14.3 | 12.5 | 0.765 | 0.67 | flit | 1.07 | 0.012 | 0.724 | 0.0079 | 29 |
| 45 | Mungeli `22_717` | Bilaspur `22_406` | 22.0 | 10.4 | 0.338 | 1.02 | urban | 0.70 | 0.027 | 0.715 | 0.0280 | 1 |
| 46 | Nagarkurnool `36_746` | Mahabubnagar `36_538` | 18.3 | 7.6 | 0.912 | 0.85 | urban | 0.83 | 0.024 | 0.706 | 0.0202 | 6 |
| 47 | Devbhumi Dwarka `24_728` | Jamnagar `24_477` | 19.7 | 12.1 | 0.175 | 0.91 | urban | 0.75 | 0.012 | 0.686 | 0.0114 | 7 |
| 48 | Pathankot `03_773` | Gurdaspur `03_35` | 21.8 | 6.3 | 0.131 | 1.01 | urban | 0.68 | 0.024 | 0.683 | 0.0246 | 1 |
| 49 | Kakinada `37_746` | East Godavari `37_505` | 0.1 | 6.0 | 0.000 | 0.32 | flit | 2.09 | 0.042 | 0.677 | 0.0136 | 33 |
| 50 | Komaram Bheem `36_733` | Mancherial `36_735` | 27.4 | 8.3 | 0.584 | 1.27 | urban | 0.52 | 0.015 | 0.661 | 0.0189 | 23 |
| 51 | Bhadradri Kothagudem `36_753` | Khammam `36_541` | 5.5 | 0.1 | 0.794 | 0.62 | logdens | 1.03 | 0.029 | 0.640 | 0.0183 | 7 |
| 52 | Ranipet `33_9002` | Vellore `33_605` | 10.9 | 2.7 | 0.114 | 0.50 | urban | 1.20 | 0.017 | 0.605 | 0.0084 | 33 |
| 53 | Gir Somnath `24_729` | Junagadh `24_479` | 10.2 | 8.5 | 0.064 | 0.47 | urban | 1.22 | 0.020 | 0.575 | 0.0095 | 6 |
| 54 | Narayanpet `36_781` | Mahabubnagar `36_538` | 21.5 | 11.6 | 0.317 | 1.00 | urban | 0.57 | 0.016 | 0.567 | 0.0162 | 33 |
| 55 | Jogulamba Gadwal `36_744` | Mahabubnagar `36_538` | 18.4 | 11.7 | 0.364 | 0.85 | urban | 0.61 | 0.017 | 0.520 | 0.0149 | 7 |
| 56 | Jagtial `36_737` | Karimnagar `36_534` | 7.4 | 9.7 | 0.312 | 0.52 | flit | 0.99 | 0.028 | 0.517 | 0.0148 | 6 |
| 57 | Fazilka `03_701` | Ferozepur `03_43` | 8.9 | 3.1 | 0.098 | 0.41 | urban | 1.20 | 0.043 | 0.496 | 0.0179 | 1 |
| 58 | North Tripura `16_292` | Unokoti `16_710` | 23.2 | 3.9 | 0.289 | 1.07 | urban | 0.45 | 0.123 | 0.486 | 0.1324 | 4 |
| 59 | Parvathipuram Manyam `37_743` | Vizianagaram `37_521` | 8.9 | 2.4 | 0.626 | 0.49 | logdens | 0.93 | 0.019 | 0.455 | 0.0092 | 34 |
| 60 | Mulugu `36_780` | Warangal Rural `36_749` | 3.9 | 1.4 | 1.557 | 1.22 | logdens | 0.34 | 0.010 | 0.412 | 0.0118 | 5 |
| 61 | Balrampur `22_716` | Surguja `22_401` | 11.6 | 4.0 | 0.585 | 0.54 | urban | 0.73 | 0.029 | 0.392 | 0.0154 | 2 |
| 62 | Kalimpong `19_775` | Darjeeling `19_327` | 40.5 | 0.1 | 1.456 | 1.88 | urban | 0.20 | 0.002 | 0.379 | 0.0042 | 32 |
| 63 | Jayashankar Bhupalapally `36_750` | Karimnagar `36_534` | 18.5 | 10.7 | 1.271 | 1.00 | logdens | 0.38 | 0.011 | 0.374 | 0.0107 | 7 |
| 64 | Suryapet `36_748` | Nalgonda `36_539` | 7.2 | 1.4 | 0.271 | 0.33 | urban | 1.10 | 0.031 | 0.367 | 0.0105 | 6 |
| 65 | Shamli `09_704` | Muzaffarnagar `09_133` | 2.2 | 5.3 | 0.040 | 0.29 | flit | 1.27 | 0.006 | 0.364 | 0.0018 | 6 |
| 66 | Hojai `18_757` | Nagaon `18_305` | 8.1 | 2.1 | 0.126 | 0.38 | urban | 0.93 | 0.030 | 0.349 | 0.0112 | 6 |
| 67 | Wanaparthy `36_745` | Mahabubnagar `36_538` | 12.8 | 5.7 | 0.167 | 0.59 | urban | 0.58 | 0.017 | 0.343 | 0.0098 | 6 |
| 68 | Mahabubabad `36_751` | Warangal Rural `36_749` | 2.2 | 3.1 | 0.509 | 0.40 | logdens | 0.81 | 0.023 | 0.322 | 0.0092 | 5 |
| 69 | Charaideo `18_755` | Sivasagar `18_311` | 5.1 | 13.0 | 0.037 | 0.70 | flit | 0.46 | 0.015 | 0.321 | 0.0103 | 6 |
| 70 | Siddipet `36_741` | Medak `36_535` | 7.0 | 6.1 | 0.018 | 0.33 | flit | 0.97 | 0.028 | 0.319 | 0.0091 | 6 |
| 71 | Peddapalli `36_738` | Karimnagar `36_534` | 8.6 | 2.7 | 0.248 | 0.40 | urban | 0.79 | 0.023 | 0.315 | 0.0090 | 6 |
| 72 | South Salmara Mankachar `18_758` | Dhubri `18_301` | 8.0 | 9.8 | 0.101 | 0.53 | flit | 0.56 | 0.018 | 0.293 | 0.0094 | 11 |
| 73 | Mahisagar `24_730` | Panchmahal `24_484` | 6.3 | 3.4 | 0.233 | 0.29 | urban | 0.99 | 0.016 | 0.290 | 0.0048 | 6 |
| 74 | Charkhi Dadri `06_765` | Bhiwani `06_81` | 12.2 | 1.0 | 0.041 | 0.56 | urban | 0.50 | 0.020 | 0.284 | 0.0112 | 6 |
| 75 | Agar Malwa `23_724` | Shajapur `23_436` | 1.8 | 9.1 | 0.263 | 0.49 | flit | 0.57 | 0.008 | 0.280 | 0.0039 | 11 |
| 76 | Surajpur `22_715` | Surguja `22_401` | 7.2 | 1.1 | 0.370 | 0.33 | urban | 0.79 | 0.031 | 0.263 | 0.0103 | 1 |
| 77 | Unokoti `16_710` | North Tripura `16_292` | 23.2 | 3.9 | 0.289 | 1.07 | urban | 0.24 | 0.066 | 0.259 | 0.0705 | 6 |
| 78 | Nirmal `36_734` | Adilabad `36_532` | 2.3 | 6.3 | 0.077 | 0.34 | flit | 0.71 | 0.020 | 0.241 | 0.0069 | 6 |
| 79 | Aravalli `24_725` | Sabarkantha `24_472` | 4.9 | 1.4 | 0.046 | 0.23 | urban | 1.04 | 0.017 | 0.236 | 0.0039 | 9 |
| 80 | Rajanna Sircilla `36_739` | Karimnagar `36_534` | 8.5 | 7.7 | 0.461 | 0.42 | flit | 0.55 | 0.016 | 0.228 | 0.0065 | 6 |
| 81 | Dakshin Bastar Dantewada `22_416` | Sukma `22_723` | 7.5 | 13.9 | 0.968 | 0.76 | logdens | 0.28 | 0.011 | 0.215 | 0.0084 | 4 |
| 82 | Yadadri Bhuvanagiri `36_747` | Nalgonda `36_539` | 6.0 | 1.6 | 0.013 | 0.28 | urban | 0.73 | 0.021 | 0.204 | 0.0058 | 11 |
| 83 | Bastar `22_414` | Kondagaon `22_722` | 4.8 | 3.3 | 0.234 | 0.22 | urban | 0.91 | 0.036 | 0.203 | 0.0080 | 4 |
| 84 | Majuli `18_760` | Jorhat `18_312` | 23.8 | 6.9 | 1.235 | 1.10 | urban | 0.17 | 0.005 | 0.184 | 0.0059 | 7 |
| 85 | Komaram Bheem `36_733` | Adilabad `36_532` | 7.0 | 6.0 | 0.417 | 0.33 | logdens | 0.52 | 0.015 | 0.171 | 0.0049 | 6 |
| 86 | Biswanath `18_756` | Sonitpur `18_306` | 5.8 | 4.8 | 0.121 | 0.27 | urban | 0.61 | 0.020 | 0.164 | 0.0053 | 6 |
| 87 | Jangaon `36_752` | Warangal Rural `36_749` | 5.8 | 1.1 | 0.366 | 0.29 | logdens | 0.55 | 0.016 | 0.157 | 0.0045 | 5 |
| 88 | South Tripura `16_290` | Gomati `16_709` | 6.4 | 0.7 | 0.158 | 0.30 | urban | 0.49 | 0.133 | 0.145 | 0.0395 | 4 |
| 89 | West Karbi Anglong `18_759` | Karbi Anglong `18_314` | 8.4 | 8.3 | 0.065 | 0.45 | flit | 0.30 | 0.009 | 0.132 | 0.0042 | 11 |
| 90 | Sukma `22_723` | Dakshin Bastar Dantewada `22_416` | 7.5 | 13.9 | 0.968 | 0.76 | logdens | 0.17 | 0.007 | 0.130 | 0.0051 | 1 |
| 91 | Kondagaon `22_722` | Bastar `22_414` | 4.8 | 3.3 | 0.234 | 0.22 | urban | 0.58 | 0.023 | 0.129 | 0.0050 | 2 |
| 92 | Kangpokpi `14_767` | Senapati `14_272` | 5.7 | 17.3 | 0.257 | 0.93 | flit | 0.13 | 0.046 | 0.122 | 0.0426 | 28 |
| 93 | Gomati `16_709` | South Tripura `16_290` | 6.4 | 0.7 | 0.158 | 0.30 | urban | 0.39 | 0.105 | 0.114 | 0.0311 | 6 |
| 94 | Namsai `12_762` | Lohit `12_259` | 21.7 | 6.4 | 1.438 | 1.13 | logdens | 0.10 | 0.069 | 0.108 | 0.0784 | 6 |
| 95 | South West Garo Hills `17_711` | West Garo Hills `17_293` | 15.1 | 0.4 | 0.454 | 0.70 | urban | 0.15 | 0.049 | 0.103 | 0.0346 | 7 |
| 96 | East Jaintia Hills `17_714` | West Jaintia Hills `17_299` | 10.4 | 8.4 | 1.021 | 0.80 | logdens | 0.12 | 0.041 | 0.099 | 0.0332 | 6 |
| 97 | North Garo Hills `17_712` | East Garo Hills `17_294` | 2.6 | 9.9 | 0.627 | 0.53 | flit | 0.16 | 0.053 | 0.083 | 0.0281 | 9 |
| 98 | Tengnoupal `14_769` | Chandel `14_280` | 28.5 | 8.5 | 0.178 | 1.32 | urban | 0.06 | 0.021 | 0.078 | 0.0273 | 28 |
| 99 | South West Khasi Hills `17_713` | West Khasi Hills `17_296` | 15.0 | 5.5 | 0.027 | 0.69 | urban | 0.10 | 0.032 | 0.066 | 0.0224 | 2 |
| 100 | Longding `12_761` | Tirap `12_254` | 22.7 | 21.5 | 0.209 | 1.16 | flit | 0.06 | 0.041 | 0.066 | 0.0477 | 1 |
| 101 | Siang `12_764` | West Siang `12_250` | 36.6 | 2.6 | 1.012 | 1.69 | urban | 0.04 | 0.027 | 0.064 | 0.0465 | 2 |
| 102 | Niwari `23_782` | Tikamgarh `23_424` | 3.2 | 1.2 | 0.092 | 0.15 | urban | 0.40 | 0.006 | 0.060 | 0.0008 | 32 |
| 103 | Pherzawl `14_772` | Churachandpur `14_274` | 8.1 | 1.4 | 1.463 | 1.15 | logdens | 0.05 | 0.017 | 0.054 | 0.0190 | 28 |
| 104 | Lower Siang `12_779` | West Siang `12_250` | 44.5 | 0.0 | 1.012 | 2.06 | urban | 0.02 | 0.015 | 0.042 | 0.0307 | 27 |
| 105 | Kamjong `14_770` | Ukhrul `14_279` | 19.6 | 0.7 | 1.147 | 0.91 | urban | 0.05 | 0.016 | 0.041 | 0.0145 | 28 |
| 106 | Jiribam `14_766` | Imphal East `14_278` | 20.2 | 7.5 | 0.706 | 0.94 | urban | 0.04 | 0.015 | 0.041 | 0.0144 | 28 |
| 107 | Noney `14_771` | Tamenglong `14_273` | 18.6 | 0.2 | 0.092 | 0.86 | urban | 0.04 | 0.013 | 0.032 | 0.0111 | 27 |
| 108 | Kakching `14_768` | Thoubal `14_276` | 0.1 | 3.9 | 0.216 | 0.21 | flit | 0.14 | 0.047 | 0.028 | 0.0100 | 28 |
| 109 | Shi Yomi `12_785` | West Siang `12_250` | 44.5 | 28.8 | 1.887 | 2.06 | urban | 0.01 | 0.010 | 0.027 | 0.0198 | 27 |
| 110 | Lepa Rada `12_784` | West Siang `12_250` | 25.2 | 2.9 | 0.405 | 1.17 | urban | 0.02 | 0.016 | 0.026 | 0.0187 | 27 |
| 111 | Kra Daadi `12_763` | Kurung Kumey `12_256` | 5.2 | 4.0 | 0.693 | 0.54 | logdens | 0.04 | 0.031 | 0.024 | 0.0170 | 1 |
| 112 | Hnahthial `15_994` | Lunglei `15_265` | 18.0 | 12.8 | 0.342 | 0.83 | urban | 0.03 | 0.024 | 0.022 | 0.0198 | 33 |
| 113 | Pakke Kessang `12_783` | East Kameng `12_247` | 29.0 | 3.1 | 0.606 | 1.34 | urban | 0.02 | 0.011 | 0.021 | 0.0149 | 27 |
| 114 | Kamle `12_778` | Lower Subansiri `12_255` | 18.0 | 18.9 | 1.414 | 1.11 | logdens | 0.02 | 0.011 | 0.017 | 0.0123 | 27 |
| 115 | Khawzawl `15_996` | Champhai `15_262` | 1.4 | 0.0 | 0.130 | 0.10 | logdens | 0.04 | 0.033 | 0.004 | 0.0033 | 32 |

## 2. Where the two anchor pairs land

| pair | risk rank | div | driver | Δurban | Δflit | Δlogden | reach | risk | divergence-only rank |
|---|--:|--:|:--|--:|--:|--:|--:|--:|--:|
| **NTR <- Krishna** | **6/115** | 1.43 | urban | 30.9 | 2.6 | 0.396 | 2,218,591 | 3.174 | 24/115 |
| **Shi Yomi <- West Siang** | **109/115** | 2.06 | urban | 44.5 | 28.8 | 1.887 | 13,310 | 0.027 | 20/115 |

**This is the headline result.** By **risk**, NTR is near the top (rank 6) and Shi Yomi near the bottom (rank 109) — exactly the owner's intuition. But by **divergence alone** the order INVERTS: Shi Yomi is the 20th most divergent pair, MORE divergent than NTR (24th). Shi Yomi actually diverges from West Siang harder than NTR from Krishna on every axis (Δurban 44.5 vs 30.9; Δflit 28.8 vs 2.6; Δlogden 1.89 vs 0.40). The ONLY thing that flips the order is reach — NTR 2,218,591 people vs Shi Yomi 13,310. Similarity alone would flag the wrong example; the reach term is doing all the work.

## 3. Distribution / gap analysis — is there a clean cut?

- risk max / median / min: **6.013 / 0.486 / 0.004**
- risk deciles (10-quantiles): `[0.042, 0.116, 0.213, 0.32, 0.486, 0.698, 1.001, 1.493, 2.755]`

The risk distribution is a **smooth, roughly log-spaced continuum, not bimodal**. There is no dramatic cliff separating a "shaky" cluster from the rest. The largest gaps between consecutive risks sit at the very top (tiny sets) and then shrink:

| cut after rank | gap in risk | resulting shaky-set size |
|--:|--:|--:|
| 3 | 0.946 | 3 |
| 1 | 0.851 | 1 |
| 4 | 0.557 | 4 |
| 2 | 0.455 | 2 |
| 12 | 0.256 | 12 |
| 19 | 0.242 | 19 |
| 15 | 0.217 | 15 |
| 13 | 0.173 | 13 |

So a threshold is a **policy choice, not a natural boundary**. The ordering, however, is sound: the top of the list is dominated by large districts that gained a city and inherited a rural parent's survey (Anakapalli/Vizag, Palghar/Thane, NTR/Krishna, Hapur/Ghaziabad, Warangal Urban), and the bottom is tiny remote Arunachal/Manipur/Mizoram micro-districts (Shi Yomi, Lepa Rada, Kamle, Khawzawl) — the ones the intuition calls fine.

### Caveat: the pure product lets reach dominate

Pure `div x reach` can rank a **big-but-similar** district high on population alone. Purba Bardhaman <- Paschim Bardhaman sits at risk rank 2 with divergence only 0.79 (a genuinely similar donor) purely because it is 6.6M people. Whether that should read as "shaky" is debatable — the estimate there is probably fine, it just affects many readers. This argues for a **gate** (two floors AND-ed) rather than a raw product.

## 4. Verdict — does divergence x reach carve a defensible shaky set?

**Yes, with a refinement.** Reach is essential and works: it separates the two anchors by 103 ranks and matches the intuition across the whole list. But because the distribution is a continuum and the raw product over-weights reach, the **defensible rule is a gate, not the product**:

> flag "shaky" iff **divergence >= 1.0** (differs from its donor by >= 1 national IQR on at least one of urban_pct / female_literacy / log-density) **AND** **reach >= 1,000,000** people.

That yields **12 pairs** — NTR **in**, Shi Yomi **out**, and it correctly drops the big-but-similar Purba Bardhaman (div 0.79 < 1.0). The set is coherent: every member is a populous district with a large structural gap from its donor.

| shaky set (gate: div>=1.0 & reach>=1M) | donor | div | driver | reach(M) |
|---|---|--:|:--|--:|
| Anakapalli `37_744` | Visakhapatnam | 3.48 | urban | 1.73 |
| Palghar `27_732` | Thane | 1.57 | urban | 2.99 |
| Alluri Sitharama Raju `37_745` | Visakhapatnam | 3.75 | urban | 1.00 |
| Hapur `09_705` | Ghaziabad | 2.39 | urban | 1.34 |
| NTR `37_749` | Krishna | 1.43 | urban | 2.22 |
| Medchal Malkajgiri `36_742` | Ranga Reddy | 1.09 | logdens | 2.83 |
| Warangal Urban `36_540` | Warangal Rural | 2.94 | urban | 1.04 |
| Chhota Udaipur `24_731` | Vadodara | 2.67 | urban | 1.07 |
| Baloda Bazar `22_721` | Raipur | 2.15 | urban | 1.31 |
| Palnadu `37_751` | Guntur | 1.33 | urban | 2.04 |
| Sangareddy `36_740` | Medak | 1.30 | urban | 1.50 |
| Konaseema `37_747` | East Godavari | 1.05 | urban | 1.79 |

Sensitivity of the gate (both floors matter):

| gate | shaky count | NTR in | Shi Yomi in |
|---|--:|:--:|:--:|
| div>=1.0 & reach>=1.00M | 12 | yes | no |
| div>=1.0 & reach>=0.50M | 26 | yes | no |
| div>=1.3 & reach>=1.00M | 10 | yes | no |
| div>=0.8 & reach>=1.00M | 12 | yes | no |
| div>=1.5 & reach>=0.75M | 13 | no | no |

`div>=1.0 & reach>=1M` is the sweet spot: `div>=1.5` drops NTR itself (its divergence is 1.43); reach>=0.5M more than doubles the set with marginal cases.

## 5. Recommendation

**Proceed to Slice 2 (persist + surface), scoped to the gate above.** The audit answers the open question from the scope doc: divergence x reach — as a two-floor gate — DOES carve a small, defensible, intuition-consistent shaky set (**12 of 115 inheritances, ~10%**), with NTR in and Shi Yomi out, and it exposed that similarity-alone would flag the wrong example. Concretely:

1. **Store the grade in the pipeline.** `fill_new_districts.py` already holds every real value and `pop` in its fill loop, so it can compute divergence beside each `src` and write a `divergence` + `shaky` flag — either as columns on `district_estimate_source` or a derived `district_inheritance_grade` table (rebuilt each run, like the citation table). Fully backfill-derivable; testable with the same invariant-assert pattern already in that file.
2. **Surface via existing machinery.** Emit the flag from `/api/metrics/[id]` and `/api/region/[code]` beside `estimate_kind`; add ONE wording branch in `lib/estimate-kind.ts` (stronger badge + numeric caveat, e.g. "Krishna is 28% urban vs this district's 59%"); render it in `right-rail.tsx`. No value and no statistic moves — inherited values are already rank-less and stats-excluded, so this is disclosure-strength only. Defer the shaky-only hatch revival to its own decision (adr-019 requires one).
3. **Record the thresholds in an ADR.** div>=1.0 & reach>=1M is a modelling choice (like adr-022's stats rule); it must be owned by a decision, not slipped in. The gate, not the raw product, is the recommendation — the product over-weights reach (Purba Bardhaman).

**If the owner prefers to park:** the ordering is sound but there is no natural cliff, so any cutoff is a judgment call; that is the honest caveat. Parking loses nothing already shipped — all inheritances remain disclosed identically as today.
