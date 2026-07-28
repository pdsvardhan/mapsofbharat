# Item 762 — social card, design round 1

Six compositions for `lib/social-export.ts`, 4:5 (1080×1350), Dark ink, rendered from
real data through a real Chromium canvas with the site's real webfonts.

- District / dense card: `literacy_rate`, 733 districts, Census 2011 PCA, equal-interval 5-class
  (the metric's own `default_scale`), Navy–Yellow (the atlas default for `demographics`).
- State / non-dense card: `diet_nonveg_weekly_men`, 36 states & UTs, NFHS-5.

Files: `v1.png … v6.png` (district) and `v1-state.png … v6-state.png` (state).
`v0.png` / `v0-state.png` are the **shipped** composition, rendered through the same
refactor as a control. All presets live in `social-export.variants.ts` as `LAYOUTS`.

**Frozen, and honoured by all six:** palette (`THEMES`), Hanken Grotesk / IBM Plex Mono,
accent-word highlight treatment, plate/border/halo vocabulary, all copy strings. No
gradients, no glass, no new hues. Composition only.

---

## The measured problem

Before drawing anything I rasterised the fitted mainland (61×48 cells) against the
shipped map rect to find where the empty canvas actually is, rather than guessing from
the owner's description. The result, expressed as fractions of the rect India draws into
(`u` across, `v` down), is now `VOID_UV` in the variant file:

| Void | Region the owner named | u | v | Size at the shipped map scale |
|---|---|---|---|---|
| `nw` | "beside Kashmir" | −0.20 → 0.13 | −0.06 → 0.27 | ~185 × 255 |
| `tibet` | "above north eastern india / tibet" | 0.47 → 1.20 | −0.06 → 0.27 | **~515 × 270** |
| `arabian` | Arabian Sea | −0.20 → 0.13 | 0.60 → 1.02 | ~185 × 375 |
| `bay` | Bay of Bengal | 0.67 → 1.20 | 0.56 → 1.02 | **~355 × 405** |

Roughly **half the map plate is empty**: the owner is right, and it is worse than it looks
because the empty regions are what forces the header strip to steal 300px of card height,
which in turn shrinks India.

Two findings that constrained every variant:

1. **Only `tibet` and `bay` are wide enough for a conventional rank table** (≥230px).
   `nw` and `arabian` sit at 150–190px whenever India is height-constrained — which it is
   as soon as the header strip shrinks. A table in a left void must change *form*
   (v4: value stacked over name) rather than just shrink.
2. **Emptying the header strip is the same move as enlarging India.** Moving the rank
   tables out of the strip drops `headerBottom` by ~180px, which lets India grow 8–27%.
   The dead-space fix and the mobile-legibility fix are the same fix.

---

## The six

Each was seeded to take a *different value* on the contested axes. The matrix below is the
divergence check — no two variants share a row pattern.

| | NW | Tibet | Arabian Sea | Bay of Bengal | Legend | Anchor | Headline | Map frame |
|---|---|---|---|---|---|---|---|---|
| **v0** (control) | — | — | — | — | strip under map | 30px, in strip | strip, 54px | inset plate |
| **v1** Ocean Ledger | — | **anchor** | LOWEST | HIGHEST | strip under map | 64px boxed | band, 56px | inset plate |
| **v2** Sky Ledger | **anchor** | **HIGHEST+LOWEST** | method note | **legend** | Bay, stacked | 28px boxed | band, 50px | inset plate |
| **v3** Hero Number | — | **hero stat 110px** | **legend** | **HIGHEST+LOWEST stacked** | Arabian, stacked | 110px naked | band, 34px kicker | inset plate |
| **v4** Left Rail | **HIGHEST** | **legend** | **LOWEST** | **anchor** | Tibet, strip | 52px boxed | band, 48px | inset plate |
| **v5** Edge to Edge | — | anchor + legend | — | **combined rank key** | Tibet, min/max bar | 44px naked | band, 46px | **edge to edge, no plates** |
| **v6** Four Quarters | **legend** | **headline** | **anchor 66px naked** | **HIGHEST only** | NW, stacked | 66px naked | **in-map, Tibet, right-aligned** | inset plate |

### v1 — Ocean Ledger
*Idea:* the rank tables sail into the two seas — LOWEST into the Arabian, HIGHEST into the
Bay — which empties the header strip, so the headline gets the full card width and the map
gains ~120px of height. A wide anchor plate takes the Tibet band. The legend deliberately
stays a horizontal strip under the map: **the control value on axis 4**, so the set can tell
whether moving the legend is worth anything at all.
*Seeded to differ on:* dead-space (both seas + Tibet used, NW left empty on purpose),
rank-table placement (split across the two seas), anchor (64px wide plate in Tibet),
legend (held constant).
*Rubric:* **86/100 — H22 C22 L21 Cr21 — Ship with punch-list.**
*5-second test:* "Literacy rate across India, national average 71.6%." Subject named
without reading body copy. Pass.
*Punch-list:* "Pathanamthitta" ellipses at 184px table width; anchor plate's right third
is empty.

### v2 — Sky Ledger
*Idea:* near-inverse of v1. Both tables go abreast into the Tibet band (the only void wide
enough to take them side by side), the anchor is demoted to a narrow plate in the NW, the
legend becomes a vertical stack in the Bay, and the Arabian Sea carries a short
how-to-read note. Reading order becomes headline → ranks → map → legend.
*Seeded to differ on:* dead-space (all four voids occupied), tables (paired in Tibet),
anchor (smallest of the six at 28px), legend (vertical stack in the Bay), flattest type scale.
*Rubric:* **85/100 — H18 C23 L22 Cr22 — Ship with punch-list.**
*5-second test:* subject named, but the first thing read is a table, not the statistic. Weak pass.
*Punch-list:* anchor at 28px in a 142px box is the weakest "one number" in the set;
the 11.5px note is the smallest type of any variant.

### v3 — Hero Number
*Idea:* the poster is the statistic, not the map. The headline drops to a 34px kicker and
the national average becomes a 110px numeral filling the Tibet band; the map reads as its
evidence. Ranks shrink to 3+3 stacked in the Bay so they cannot compete. The NW void is
left empty on purpose, to give the hero air on its reading diagonal.
*Seeded to differ on:* anchor (hero, 110px, unboxed — the extreme of axis 3), headline
(kicker), tables (3 rows, both stacked in one sea), legend (Arabian), most extreme type
ratio in the set (3.2× between hero and kicker).
*Rubric:* **91/100 — H22 C23 L24 Cr22 — Ship.**
*5-second test:* "71.6% — something about India." The number lands instantly; the *subject*
needs the 34px kicker. Partial pass — the sharpest trade-off in the set.
*Punch-list:* 8 distinct type steps, one over the ≤7 guide; the kicker + subtitle read thin
against the hero.

### v4 — Left Rail
*Idea:* stop treating the voids as four boxes. HIGHEST (NW) and LOWEST (Arabian) stack into
one vertical rail down the left flank, interrupted only by the Kutch bulge. Because a 178px
rail cannot hold "Pathanamthitta 96.5%" on one line, the rows change form: value over name,
the same order the on-map callouts already use. The legend hangs as a scale bar in the
Tibet band; the anchor takes the Bay.
*Seeded to differ on:* tables (single left rail, 3 rows, stacked rows), legend (horizontal
in Tibet), anchor (Bay), dead-space (left-weighted).
*Rubric:* **86/100 — H20 C23 L23 Cr20 — Ship with punch-list.**
*5-second test:* subject named. Pass.
*Punch-list:* the two rails do not read as one rail — the composition is four unrelated
islands; the Tibet legend floats with nothing anchoring it; 3+3 ranks carry less
information than v1's 5+5 for a similar footprint.

### v5 — Edge to Edge
*Idea:* the map *is* the poster. Margins drop to 40, the plate runs the full card width and
India is fitted into it, ending up the largest of the six. Nothing gets a plate: anchor,
rank key and legend all float over the sea in halo'd text — the treatment the map's own
labels already use. Ranks move **onto** the map as numbered markers, with a boxless
two-column key in the Bay to decode them.
*Seeded to differ on:* map frame (edge-to-edge, no plates anywhere), rank-table placement
(on-map markers + a single combined key), legend form (min/max bar, no class edges).
*Rubric:* **81/100 — H21 C21 L18 Cr21 — Ship with punch-list.**
*5-second test:* subject named, ranks not decodable. Weak pass.
*Punch-list:* **numerals 1–5 appear twice on the map** (top five and bottom five),
separated only by dot fill — at thumbnail size a reader cannot tell best from worst;
12.5px halo'd names over a busy choropleth is the hardest reading condition in the set;
the min/max bar drops the class edges every other variant shows.

### v6 — Four Quarters
*Idea:* no header band at all. Each void takes exactly one thing and takes it big — headline
into the Tibet band (right-aligned), anchor naked into the Arabian Sea, one HIGHEST table
into the Bay with 20px values and 15px names, legend into the NW. LOWEST is dropped on
purpose: five legible rows beat ten unreadable ones.
*Seeded to differ on:* headline placement (inside the map, in Tibet — the only variant with
no header band), tables (one table, largest rows), anchor (naked 66px in the Arabian),
legend (NW), largest minimum type size in the set.
*Rubric:* **90/100 — H22 C22 L24 Cr22 — Ship.**
*5-second test:* "Men eating fish/chicken/meat weekly — 59.4%." Cleanest pass of the six;
nothing on the card is under 12px.
*Punch-list:* the legend occupies the prime top-left slot while the headline sits top-right,
which inverts the phone reading order; LOWEST is absent, so the reader gets half the
ranking story; the bottom-left quadrant is empty.

### v0 — control (shipped composition)
*Rubric:* **73/100 — H16 C21 L19 Cr17 — Revise.** Header strip holds both tables and the
anchor; India is ~45% of the plate and half of that plate is empty; the anchor at 30px is
the fourth-loudest thing on the card. This is the score the six are beating.

---

## 6 → 3

| Rank | Variant | Total | H | C | L | Cr | Band |
|---|---|---|---|---|---|---|---|
| 1 | **v3 Hero Number** | 91 | 22 | 23 | 24 | 22 | Ship |
| 2 | **v6 Four Quarters** | 90 | 22 | 22 | 24 | 22 | Ship |
| 3 | **v1 Ocean Ledger** | 86 | 22 | 22 | 21 | 21 | Ship w/ punch-list |
| 4 | v4 Left Rail | 86 | 20 | 23 | 23 | 20 | Ship w/ punch-list |
| 5 | v2 Sky Ledger | 85 | 18 | 23 | 22 | 22 | Ship w/ punch-list |
| 6 | v5 Edge to Edge | 81 | 21 | 21 | **18** | 21 | Ship w/ punch-list |

**Survivors: v3, v6, v1.**

**v3 survives** on the only unambiguous hierarchy in the set: one element dominates, and it
is the statistic rather than the metric name — which is what a stranger scrolling a feed
stops for. It beat **v2**, which occupies the same Tibet band but with the anchor demoted to
28px, inverting the intended importance (v2's H18 is the lowest in the set). It beat **v5**,
which also treats the map as the message but pays for it with the worst legibility score
(L18) on the locked "phone first" constraint.

**v6 survives** on legibility: nothing on the card is smaller than 12px, its rank table is
the only one readable at feed-thumbnail scale, and it passes the 5-second test most
cleanly. It beat **v4**, whose stacked-row rail solved the same "narrow void" problem but
produced four unrelated islands and a legend floating unanchored in the Tibet band (Cr20).
It beat **v5** on the same axis — v6 gets more effective legibility out of a *smaller* map
than v5 gets out of the largest map in the set, which is the finding that kills the
edge-to-edge idea.

**v1 survives** as the conservative option and the tie-break winner over **v4** at equal
total: same structural answer (ranks into the ocean, header strip emptied), but v1 carries
5+5 ranks instead of 3+3 for a comparable footprint, and its legend stays anchored under
the map instead of floating. It also beat **v2** by keeping the anchor legible and the
reading order left-to-right. v1 is the variant that changes the least — everything the card
already has, in the same order, just no longer crammed into a header strip.

**Carried forward from the losers regardless of the pick:**
- v4's **stacked table rows** (value over name) are the only form that fits a 150–190px
  left void without ellipsis. Worth keeping in the preset vocabulary.
- v5's finding that **edge-to-edge does not pay** — India got 27% bigger and the card got
  harder to read. Do not revisit.
- v2's **method note** in the Arabian Sea is legitimate content for a narrow void, but at
  11.5px it is decoration on a phone. If it ships, it needs 13px+.

---

## Pre-flight checks (all six, both levels, before presenting)

| Check | Result |
|---|---|
| Text collisions | Fixed. All composed blocks now feed the on-map label collision set, and the flung-label dodge clears a block by the label's own height (it was clearing by a fixed 22px and still sitting on block top rules — visible on v6-state, DNH&DD). |
| Clipping at card edge | Fixed. Flung labels clamp to the safe box, not the plate; v5's edge-to-edge plate starts at x=0 and was letting "Dadra and Nagar Haveli and Daman and Diu" run off the left edge. |
| Anchor value / label overlap | Fixed. Baselines are now derived from the type sizes; the first generic formula collapsed them onto each other in every variant (visible in the first render of v0/v2/v4). |
| Island insets present and correct side | Fixed. Insets claim from the *bottom* of their sea while content claims from the *top*, and an inset shrinks (176→152→132) before it emigrates. v3 had put Andaman & Nicobar in the Arabian Sea and Lakshadweep in the Bay. |
| Source + estimate line present | Yes, all 14 renders. Both metrics have `estimated_count` 0, so no estimate footnote is expected or drawn. |
| 5-class legend + no-data hatch | Present in all six. v5 shows the ramp as a min/max bar (class edges dropped) — logged as a punch-list item, not a defect. |
| Contrast | No new pairings. `muted #a49d8c` on `plate #101109` and on `bg #0d0f14` are the existing shipped pairs. Flagged for the numeric gate, not adjudicated here: v2's `dim` note (11.5px) over `bg`. |
| Meaning not colour-alone | HIGHEST/LOWEST carry word labels plus filled-vs-outlined dots in every variant. v5's on-map markers repeat numerals 1–5 for both ends — flagged in its punch-list. |
| Webfonts | Real. `next/font` registers the faces but never fetches them until something paints with them; the harness forces every weight (`document.fonts.load`) before drawing, so the canvas is not silently falling back to system sans. |

## Not done / limits

- Rendered at 4:5 Dark ink only, per the brief. The presets are written against `LH`, so
  1:1 and Paper should follow, but they are **not** rendered and not verified.
- Drilled-state cards (`focusName` set) are not rendered. The void geometry is derived from
  the national mainland bbox and does not apply to a single state; those cards fall back to
  the preset's band/under placements and would need their own round.
- Rubric scores are render-derived (real pixels), not source-derived. The 5-second test was
  run on the full renders viewed cold, not on true 360px-wide feed thumbnails; type-size
  arithmetic stands in for that. Treat the legibility column as directional.
