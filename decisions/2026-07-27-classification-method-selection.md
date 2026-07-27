# Classification follows the distribution, and two requested methods were dropped

- **id:** adr-025-classification-method-selection
- **status:** accepted
- **date:** 2026-07-27
- **item:** iter-26 item 757 (from visual-QA comment 7)
- **input:** `research/758-choropleth-classification-findings.md`
- **supersedes:** the `computeBreaksGuarded` degeneracy guard (item 756)

## Context

The owner's complaint: *"why so many maps where one colour dominates and other
extremeses small places (districts) looks weird ... see if we are the issue or what
else"*. Item 757 was written from it as "add log / percentile-rank methods and
choose method from the data", pending research (item 758).

The research came back and split the complaint into two independent defects:
classification-method choice, and area-size bias (extremes sitting in tiny urban
districts). Only the first is in scope here.

Measuring our own data then contradicted parts of both the item and the brief.

### What the data said

`buddhist_pct` at district level is the worst case, and it is worse than "one
colour dominates". 60.7% of districts (445 of 733) report exactly 0, so all four
quantile breakpoints collapse onto 0. Because binning is `v >= edge`, all four
collapsed edges clear at once:

```
quantile class counts = [0, 0, 0, 574, 159]
```

The three lowest colours rendered for **nobody**, and every district with **no**
Buddhist population was painted **class 4 of 5** — three-quarters up the ramp. That
is a correctness defect, not an aesthetic one. `sikh_pct` (51.4% zero) and
`jain_pct` (51.0%) have the same shape.

The item-756 guard could not fix this, and its own comment said so: its ladder was
jenks → quantile, and neither can split a tie mass.

### Where the research brief did not survive contact with our data

The brief's decision table routes `|skew| >= 1.0` to jenks. Measured across all 193
live series, jenks *degenerates* exactly where the brief expects it to help, because
minimising within-class variance on a heavy tail produces one vast low class:

| series | jenks | quantile |
|---|---|---|
| christian_pct/district | 0.866 | 0.353 |
| muslim_pct/district | 0.484 | 0.210 |
| hindu_pct/district | 0.487 | 0.201 |
| buddhist_pct/district | 0.930 | 0.783 |

Shipping the table literally would have regressed 21 series — every one of them a
step *towards* the complaint this item exists to fix.

The brief also proposed a near-zero-fraction threshold of 0.80 for the
negligible-bucket case. That misses `jain_pct/district` (51.0% exactly zero, near-zero
fraction 0.510), which is unambiguously zero-inflated. The brief flagged its own
thresholds as thin evidence and noted they were derived from k=5; this is that
re-derivation.

## Decision

### 1. Method selection is occupancy-checked, not threshold-driven

`selectMethod()` walks a preference-ordered ladder and takes the first candidate
whose realised dominant-class share is within `MAX_CLASS_SHARE` (0.45):

```
reference   — metric has an external pivot (METRIC_REFERENCE)
zeroFloor   — share of values at the minimum >= 1/k  (the tie-collapse threshold,
              derived from k rather than picked: quantile's first breakpoint lands
              inside the tied mass at exactly 1/k)
equal       — bounded percentage, |skew| < 0.5, not flagged multimodal
quantile    — the workhorse
jenks       — when quantile itself collapses
```

Because the test is on realised class counts rather than on a proxy statistic, this
**cannot regress a metric** relative to a method further down the ladder. Quantile
sits above jenks deliberately, on the measurements above and on Brewer & Pickle
(2002), who found quantile most accurate for single-map reading — which is how this
atlas is overwhelmingly used.

Class count stays fixed at **k=5**. The brief found no citable threshold justifying a
variable count, and 5 matches modal cartographic practice.

### 2. Two new methods, both conditional

- **`zeroFloor`** — the tie mass at the minimum becomes class 0, at the *bottom* of
  the ramp; jenks subdivides the strictly-greater values. Evans (1977) is the named
  precedent. The legend labels that class by its single value (`0`), never as a range.
- **`reference`** — diverging, with the external reference as an **edge**, so no class
  can straddle parity and imply that a deficit district is "about parity". Classes are
  allocated to each side in proportion to how many regions sit there: every district's
  child sex ratio is below 1000, and fixed symmetric bands around the pivot put the
  whole country in one class.

Neither is offered where it is meaningless — `applicableMethods()` gates them.

### 3. `log` / geometric-interval and `percentile-rank` are NOT built

Both were named in the item title. Both were advised against by the research the item
itself was blocked on:

- **percentile-rank** — "do not add percentile-rank as a general option". It
  guarantees a full, evenly-populated partition regardless of spread, so on a
  near-uniform metric it manufactures five confident colour bands and a reader infers
  geographic variation that is not there. The brief would reserve it only for an
  explicit "district rank" feature with a mandatory companion histogram.
- **log / geometric interval** — correct for strictly-positive multiplicative
  comparison, but the brief found it *compounds this specific complaint*: it
  compresses colour-distance at the top of the ramp, making the already-tiny
  high-value urban districts chromatically less distinct too.

This is a scope reduction against a locked item, recorded here rather than taken
silently (bedrock rule 7). Neither is refused on principle — if the owner wants
either, `geometric` is the cheaper of the two and needs only a legend disclosure of
non-linearity.

### 4. The legend discloses

Per-class **counts** render beside each legend row, so a lopsided scale is visible
rather than hidden behind a plausible legend. The scale popover states **why** an
automatic method was chosen, and goes silent once the user picks by hand. The legend
now receives the map's actual edges instead of recomputing its own — it was cutting
breaks from `entries` while the paint used `statsEntries`, so the two could disagree.

## Consequences

Measured across 193 series: **13 improvements**, **0 unintended regressions**.

```
mgnrega_women_persondays_share/district  0.496 -> 0.206
nfhs5_women_anaemia/district             0.494 -> 0.207
nfhs5_bp_high_women/district             0.475 -> 0.206
heatwave_days_40c/state                  0.611 -> 0.361   (zeroFloor)
buddhist_pct/district                    0.783 -> 0.607   (zeroFloor)
```

Eleven series show a *higher* dominant-class share by design: eight are
`sex_ratio` / `child_sex_ratio` gaining the parity pivot (0.25–0.34, well inside the
guard), and three are near-symmetric percentages taking `equal` for round, legible
edges. That `equal`-over-`quantile` preference is the one genuinely editorial call
here and is the obvious knob to turn if the owner prefers minimum dominance to round
edges.

Three series remain above 0.45 — `buddhist_pct` (0.607), `sikh_pct` (0.514),
`jain_pct` (0.510). That residue is **real**: a majority of Indian districts genuinely
report zero. The map now says so honestly, with those districts in the lowest class
instead of the fourth.

`computeBreaksGuarded` is deleted; `selectMethod` is a strict superset. The contract
it documented survives at the call site: the selector runs on the automatic path only
and never overrides a deliberate pick.

## Alternatives considered

- **Ship the brief's table as written** — rejected: 21 measured regressions.
- **Minimise dominant-class share outright** — rejected: it collapses to "always
  quantile", discarding jenks's respect for natural gaps and equal's legible edges,
  and the brief warns quantile can manufacture apparent variation.
- **Compute the shape statistics offline into `metrics.default_scale`** — rejected:
  the same metric has a different distribution at state and district level (and at
  each boundary vintage), so a single per-metric column cannot be right for all of
  them. Computed per-series client-side from values already fetched; the cost is O(n)
  on n<=735.
- **Cartogram or value-by-alpha for the area bias** — out of scope here, and the brief
  advises against cartograms for an India-facing site on boundary-sensitivity
  grounds. The area-vs-value half of comment 7 remains unaddressed.
