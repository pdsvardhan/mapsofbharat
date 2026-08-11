# Saitual renders no polygon — its 2019 boundary is not derivable from any in-repo official source

**Status:** accepted · **Date:** 2026-08-11 · **Curated:** yes · **Category:** cat:reliability
**Amends:** [adr-013](2026-07-01-ac2-saitual-attribution.md) — closes its "future option (not required)"
**Related:** adr-002 (geography backbone), adr-003 (current-day rendering), [adr-012](2026-06-26-bug18-official-subdistrict-source.md) (official sub-district PCA), [adr-018](2026-07-16-fill-new-districts.md) (fill post-2011 districts), [adr-027](adr-027-shrug-crosswalk-accept.md) (crosswalk licence), to-do #384 · iteration 148 item 937

## Context

Saitual is one of **three** Mizoram districts created in 2019. The other two carry a present-day
entity: `region_keys` rows `15_994` (Hnahthial) and `15_996` (Khawzawl), each with a polygon in
`public/geo/districts.geojson`. Saitual carries neither — `region_keys` holds 10 Mizoram districts,
not 11 — so the Saitual rows that NCRB Crime in India 2022 and the JJM Har Ghar Jal dashboard both
print land nowhere. That two of three siblings render and the third does not is the asymmetry this
ADR resolves.

adr-013 settled the *2011* layer: Saitual's Census-2011 population correctly attributes to its 2011
parent, because a district that did not exist in 2011 cannot hold a 2011 row. It left one option
open — *"if/when a post-2011 district layer is added to render present-day boundaries, Saitual can
receive its own present-day entity."* That layer exists today: `districts.geojson` renders 735
present-day districts, Hnahthial and Khawzawl among them. So the option is live, and the only
remaining question is whether a Saitual polygon can be produced from what the repo holds. Measured
below: it cannot.

### What actually gave Hnahthial and Khawzawl their geometry

Not a pipeline step. `pipeline/raw/states/mizoram.geojson` — the Survey-of-India-compliant
current-day boundary source that `districts.geojson` is assembled from — contains exactly 10
features: the 8 Census-2011 districts (`year: "2011_c"`) plus Khawzawl (`dt_code` 996) and
Hnahthial (`dt_code` 994), both tagged `year: "2019"`. `add_rid.py` and `patch_geo.py` only assign
codes to features that already exist; neither creates geometry. The mechanism is simply that the
upstream boundary file already carried those two polygons. It does not carry Saitual, so there is
no "same mechanism" to apply.

### The boundary line exists nowhere in the repo

Measured on the committed, Survey-of-India-compliant sets (`EPSG:7755` for area):

| Measurement | Result |
|---|---|
| Mizoram state polygon − union of its 10 district polygons | **0.000 km², 0 parts** |
| 2011 Aizawl vs present-day Aizawl, symmetric difference | **0.000 km²** (2011 Aizawl 100% covered) |
| 2011 Champhai (3158.4 km²) → present-day | Champhai 67.8% + Khawzawl 32.2% = **100%** |
| 2011 Lunglei (4400.4 km²) → present-day | Lunglei 80.1% + Hnahthial 19.9% = **100%** |

The layer tiles Mizoram exactly, so there is no Saitual-shaped hole to recover. Saitual was carved
from Aizawl **and** Champhai, yet Aizawl is bit-for-bit its 2011 self and Champhai lost only
Khawzawl. The boundary source applied the 2019 Hnahthial and Khawzawl notifications and did not
apply the Saitual one. This is an upstream gap in the boundary set, not a defect in the pipeline.

### Sub-district geometry cannot fill it either

Hnahthial and Khawzawl are reconstructible from 2011 sub-districts because each is, near enough,
**one whole** Census-2011 sub-district: Hnahthial district 874.8 km² against the Hnahthial
sub-district's 880.2 km² (94% of the sub-district falls inside the district); Khawzawl district
1015.9 km² against the Khawzawl sub-district's 1139.6 km² (83%).

Saitual has no counterpart at all. The official ORGI sub-district PCA
(`pipeline/raw/2011-IndiaStateDistSbDist.xlsx`, adr-012's source) returns **zero** rows matching
`aitual` at any level, and none of Mizoram's 26 Census-2011 sub-districts is named Saitual. Nor
does any in-repo official source enumerate which units compose the district — so any subset of
whole sub-districts chosen to stand in for it would be a guess, not a derivation. (The 2019 state
notification composes it from the Saitual R.D. Block plus Phullen and Ngopa, of which the Saitual
block is not a Census-2011 unit; that constituency is **not** reproducible from anything in this
repo and is recorded here as context only, not as evidence.)

### And the only sub-district geometry we hold is not publishable

`pipeline/raw/subdistrict.gpkg` is SHRUG v2.1 (Development Data Lab), CC-BY-NC-SA — a private
academic set, not a government one. adr-027 accepted it strictly as a **build-time** crosswalk
input, and to-do #275 records precisely why the Survey-of-India depiction rules do not bind it:
*"The crosswalk geometry never reaches a user… provided no geometry from it is ever published."*
Dissolving it into `public/geo/districts.geojson` would publish non-SoI, non-government boundary
geometry and silently reverse that scope. GADM and global boundary files are a stated non-goal on
legal-risk grounds, so they are not an alternative either.

## Decision

**Saitual keeps no present-day entity, and the skip is recorded where the data is lost rather than
argued only in this file.** Concretely:

1. `region_keys` stays at **735** district rows, one per `districts.geojson` feature; Mizoram stays
   at 10. No row is inserted without a polygon — a keyed district with no geometry would appear in
   search, stats and rankings while rendering nowhere, and would break the one-for-one invariant
   between the store and the geometry that `reaggregate.py` maintains.
2. The two adapters that receive a Saitual row carry an explicit `skip_reason` in their `load_log`
   notes, in the same idiom as the existing UDISE+, APY and JJM-states skips, so the drop is
   auditable at the point of loss.
3. adr-013's future option is closed as **not actionable on present sources** — not as declined. It
   reopens the moment either unblocker below lands.

### What would unblock it

- **The boundary source ships Saitual.** `pipeline/raw/states/mizoram.geojson` gaining an 11th
  feature — a `year: "2019"` Saitual polygon with Aizawl and Champhai correspondingly re-cut — is
  the entire fix. Nothing else in the pipeline changes: `add_rid.py` keys it, `reaggregate.py`
  writes the `region_keys` row and re-homes the crosswalk, and `fill_new_districts.py` (adr-018)
  populates it by exact re-aggregation plus flagged sibling inheritance, exactly as it already does
  for Hnahthial and Khawzawl.
- **A government boundary set keyed to Saitual.** The LGD swap already scheduled by adr-027
  (to-do #384) is the natural carrier: LGD assigns Saitual district code **0800** — the code the
  JJM CSV prints — and an LGD block-to-district table with geometry would make the dissolve both
  defensible and licence-clean.

Until one of those exists, drawing the boundary means inventing it.

## Consequences

- Mizoram renders 10 districts against the 11 that NCRB and JJM report. The gap is now stated in
  the load log instead of being inferable only from a name missing out of a list.
- **NCRB.** The Saitual row is the *only* unmatched Mizoram unit, and its counts are excluded from
  both the district layer and Mizoram's state rate: 28 of 3,587 IPC cases (0.8%), 1 of 31 murders
  (3.2%), 4 of 147 crimes against women (2.7%), 0 cyber. Mizoram's crime rates are therefore very
  slightly understated, and by how much is now on the record.
- **JJM.** Saitual's 9,433 rural households are unmatched at district level but still roll into
  Mizoram's state value, per the adapter's existing rule that unmatched districts count toward
  their state. The state figure stays complete; only the district is missing.
- **This is a clean absence, not a silent misattribution.** Measured: Saitual's closest
  `region_keys` candidate is Saiha at a 0.667 difflib ratio, below `region_match.py`'s 0.82 fuzzy
  cutoff, and `RegionMatcher.match("Mizoram", "Saitual")` returns `None` with an empty fuzzy log.
  Saitual's rows are not being folded into a neighbouring district. That was the failure mode worth
  checking, and it is not present.
- `pipeline/expectations.json` is untouched — 735 remains correct and no count assertion moves.
- **No boundary was fabricated.** The alternative considered and rejected — inserting a
  `region_keys` row with no polygon so the count reads 11 — would have made the defect harder to
  see, not smaller.
