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

These four are the *manual* method options. The map's actual default is a data-driven auto-selector, not any fixed method — see the CORRECTION section below. `equal` is the worst manual option, and the commenter's `?brk=equal` link is a manual override of the auto-selector.

## The four "how to handle the gradient" options on OUR data

- **equal-interval** — even value slabs. Fails on skew (above). Only good for uniform/bounded data.
- **quantile** — equal *count* per class (~146/731). **Robustly spreads colour on every metric** (see the quantile column — always even). Trade-off: classes have unequal value widths, so it flattens magnitude (a district 100× another can sit one class away).
- **jenks** — natural breaks minimising within-class variance. Good for *clustered* data; still collapses when the low cluster holds ~90% of districts.
- **log-equal** (not yet built) — equal slabs in log space. For strictly-positive right-skew (density, counts, ₹) it both spreads colour AND preserves orders-of-magnitude (`upi log=[9,297,313,97,15]`). Cannot be used where values hit 0 (many `_pct` metrics).

Palette is not the problem — navy→yellow sequential is correct for magnitude. The fix is classification.

## CORRECTION + what we actually built (2026-08-04)

**The map does NOT default to a fixed method.** It runs a data-driven auto-selector — `selectMethod` (item 757) — that occupancy-checks a preference ladder and takes the first method that does NOT bury >45% of regions in one class. Measured against the live data, it already spreads **86 of 87** district metrics well by default (only `buddhist_pct`, an all-zeros case, stays >60%). Heavy-skew metrics like `upi_value_per_capita` / `pop_density` default to **quantile**, not equal. `default_scale` is only a one-frame placeholder until values load and `selectMethod` refines it (india-map.tsx:304-306). **`equal` is a manual option the selector deliberately never overrides** — the commenter's `?brk=equal` link picked exactly that, the only reason those maps looked monochrome. So there is no default bug; a per-metric `default_scale`-by-skew scheme would be redundant (and is the skew-threshold approach item-757 measured and rejected as worse). Palette is fine; classification is already handled by default.

Given that, the two genuine, owner-approved improvements — both shipped:

1. **`log` break method** (equal-interval in log space). For strictly-positive right-skew it BOTH spreads the low tail AND preserves orders of magnitude (which quantile flattens). Offered in the picker only for strictly-positive series (undefined at ≤0), and added to `selectMethod`'s ladder ABOVE quantile with an occupancy check, so a positive-skew metric prefers log only when it actually declusters (`upi` → log; `pop_density` fails the log occupancy check → stays quantile).
2. **Collapse warning.** When a user MANUALLY picks a method that buries >60% of regions in one class (the `equal`-on-skew trap), the scale popover shows a soft amber hint naming a better method with a one-click switch. Never fires on the auto-default or a reasonable pick.

Net effect: defaults stay as strong as they already are; power users gain a magnitude-faithful `log` view, and the `equal` trap now guides you out of it. No data changes, no re-ingest.

## Elections (basic scoping)

- **Shipped:** `voter_turnout_ls2024` — state-level, 36 states/UTs, %, ECI Statistical Report 12 (state-wise).
- **Available, un-ingested:** `pipeline/raw-new/elections/LS2024_13_PC_Wise_Voters_Turn_Out.xls` — turnout by **Parliamentary Constituency**.
- **Gap:** a PC is not a district (PCs span and split districts), so district-level turnout needs a **PC→district crosswalk** or a **PC-boundary map layer** (new geometry) — both larger than a normal ingest. Multi-year (2019/2014) needs those ECI reports, not yet acquired.
- **Recommendation:** state-level is the clean win and is already live. Treat district/PC-level turnout and multi-year as a scoped, separate effort — defer unless prioritised.
