# C7 — Choropleth classification: why one colour dominates, and the fix

**Comment (C7):** *"why so many maps where one colour dominates and other extremes small places (districts) look weird… understand nuances like which data type, spread, how to handle the map gradient, see if we are the issue or what else."*

**Verdict: the data is fine — the classifier is the issue.** Most of our metrics are right-skewed (a few high districts, a long low tail — income, density, counts, rare-religion %, crime rates). Equal-interval breaks cut the *value range* into 5 equal slabs, so the low tail — where nearly every district sits — falls in one slab and paints one colour. This is a method-vs-distribution mismatch, not broken data.

## Measured (all 87 district metrics, 5 classes)

Share of districts landing in the single largest **equal-interval** class:

- **36 / 87 metrics (41%)** put ≥60% of districts in ONE class.
- **24 / 87 (28%)** are ≥80% — effectively monochrome.

Worked examples (counts per class, low→high):

| metric | skew (max/median) | equal-interval | quantile | log-equal |
|---|---|---|---|---|
| `pop_density` | 68× | **727**,1,1,1,3 | 147,148,145,147,146 | 5,45,369,303,11 |
| `crime_cyber_rate` | 99× | **696**,6,1,1,2 | 151,144,135,136,140 | — (has 0s) |
| `upi_value_per_capita` (C8's metric) | 15× | **682**,38,5,3,3 | 147,146,146,146,146 | 9,297,313,97,15 |
| `buddhist_pct` | 70× | **711**,15,1,3,3 | 445,0,0,157,131 | — (has 0s) |

The map defaults to **jenks** (natural breaks, `components/india-map.tsx:78`), which is better than equal but still collapses on heavy skew; **equal** is offered in the UI and is the worst option — the commenter's link (`?brk=equal`) selected exactly that.

## The four "how to handle the gradient" options on OUR data

- **equal-interval** — even value slabs. Fails on skew (above). Only good for uniform/bounded data.
- **quantile** — equal *count* per class (~146/731). **Robustly spreads colour on every metric** (see the quantile column — always even). Trade-off: classes have unequal value widths, so it flattens magnitude (a district 100× another can sit one class away).
- **jenks** (current default) — natural breaks minimising within-class variance. Good for *clustered* data; still collapses when the low cluster holds ~90% of districts.
- **log-equal** (not yet built) — equal slabs in log space. For strictly-positive right-skew (density, counts, ₹) it both spreads colour AND preserves orders-of-magnitude (`upi log=[9,297,313,97,15]`). Cannot be used where values hit 0 (many `_pct` metrics).

Palette is not the problem — navy→yellow sequential is correct for magnitude. The fix is classification.

## Recommendation (per-metric smart default + a log method)

1. **Wire per-metric `default_scale`** so each metric opens in its best method — this finishes adr-025 / to-do #154 (the column exists, values `quantile`/`equal` are present, but the map hard-defaults to `jenks` and doesn't honour it). Choose by measured skew:
   - heavy right-skew (≥80% one-class under equal, or skew > 5×) → **quantile** (or **log** if strictly positive) ;
   - moderate skew → **jenks** ;
   - symmetric / bounded (sex ratio, turnout, literacy) → **equal** or **jenks**.
2. **Add a `log` break method** for strictly-positive skewed metrics — keeps the magnitude story quantile loses. Sits alongside the existing `zeroFloor` / `reference` specials.
3. **Auto-classify script** computes each metric's skew and writes `default_scale`, re-runnable as data refreshes (the analysis in `c7-analysis` is the seed).
4. Optional: soft-warn or de-prioritise `equal` in the UI for heavy-skew metrics — it's the trap this comment hit.

Net effect: a visitor landing on any metric sees a well-differentiated map by default, and power users keep every method. No data changes, no re-ingest.

## Elections (basic scoping)

- **Shipped:** `voter_turnout_ls2024` — state-level, 36 states/UTs, %, ECI Statistical Report 12 (state-wise).
- **Available, un-ingested:** `pipeline/raw-new/elections/LS2024_13_PC_Wise_Voters_Turn_Out.xls` — turnout by **Parliamentary Constituency**.
- **Gap:** a PC is not a district (PCs span and split districts), so district-level turnout needs a **PC→district crosswalk** or a **PC-boundary map layer** (new geometry) — both larger than a normal ingest. Multi-year (2019/2014) needs those ECI reports, not yet acquired.
- **Recommendation:** state-level is the clean win and is already live. Treat district/PC-level turnout and multi-year as a scoped, separate effort — defer unless prioritised.
