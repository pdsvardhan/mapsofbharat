# One definition per visual fact: colour, motion and the classes that carry them

**Status:** accepted · **Date:** 2026-08-13 · **Curated:** yes · **Category:** cat:system
**Related:** to-dos #501, #502, #503, #472, item 752 · [adr-026](2026-08-03-iter-27-inheritance-grading.md) (the shaky signal this tokenises) · design ledger rows 94–100

## Context

Four defects found in one pass, unrelated on the surface and identical underneath.
Each was a **visual fact with more than one definition**, or a definition that had
drifted from the thing it named.

**The accent ink.** `--accent-ink` was raised to `#0a0806` on 2026-08-10 because
`#16110b` measures 4.38:1 on `--accent`, under the 4.5:1 AA floor for the 10–13px
bold labels it carries. The token moved. Seven on-screen literals did not, so every
control the change was made for kept failing — the fix had been applied to the
definition and not to the uses, which is the same as not applying it.

**The shaky signal.** `SHAKY_COLOR = "#e0a92e"` was a private const in *both*
`right-rail.tsx` and `data-table.tsx`. One data-quality caveat, two definitions,
free to diverge between the atlas and the metric detail page.

**The rank bars.** The nine histogram bins carried `.rankbar`, whose only transition
is on `width`. The bins are `flex-1` with an inline `height`, so their width never
changes and **the transition animated nothing**. They had snapped since they were
written, wearing a class that promised a grow they could not perform. The same class
is correct at its two other mounts, where width genuinely is the data dimension.

**A dead capability.** `DataTable` declared `onRowClick` and `selectedCode` and
neither mount passed them, so row hover, selected and click shipped as dead code on
every row.

## Decision

**A visual fact gets exactly one definition, and the name of a thing must be true
everywhere it appears.**

- Every on-screen use of the accent ink reads `var(--accent-ink)`. The `--accent`
  and `--muted` literals sitting on the same style objects were tokenised with them:
  a literal beside a token is how the next drift starts.
- The PNG export theme in `lib/social-export.ts` keeps a literal, because the card
  draws to a canvas and cannot read a CSS variable — but it is the *same* text on
  the *same* accent, so it carries the corrected value and a comment saying why it
  is allowed to be a literal at all. An exported card is read too.
- The shaky amber is `--shaky` in `globals.css`. Deliberately **not** merged into
  `--gold`: gold is ornament, this is a warning, and one token for both means
  restyling the ornament silently restyles a caveat.
- `.rankbar` (width) and `.rankbin` (height) are separate classes. Splitting them
  fixes the dead transition *by construction* rather than by vigilance — one class
  covering two geometries can always be true in one place and false in the other.
- Data motion shares `--motion-data-dur` and `--motion-data-ease` so the count-up
  and the bars settle as one event. Ease-**out**, not ease-in-out: data arriving
  should decelerate into place; easing in makes a figure look like it hesitated.
- A declared prop is wired or removed. `onRowClick`/`selectedCode` are wired on the
  atlas mount, which has selection state, and correctly left unwired on
  `/metric/{id}`, which is server-rendered and has no selection concept.

## Consequences

The atlas panel now matches the ruled-sheet design (ledger rows 94–98): the 2px
accent rule down its left edge and the accent wash behind it are gone, the nine bins
abut, and the chooser swatch is square. Accent on the panel drops from four elements
to two — the live dot and the selected bin — against a stated budget of one. The
remaining two are the ones that carry "selected" now that the left rule is gone;
that is a known, accepted overage rather than a met budget.

**What this does not fix.** Nothing prevents the next literal. The guard is
`CODING_GUIDELINES.md` and review, not a linter — a rule that colours must come from
tokens is mechanically checkable and is not yet checked. Recorded as the honest
limit of this decision.

The motion is pinned by `tests/motion.spec.ts`, which is mutation-proven: reverting
`.rankbin` to `transition: width` fails it. That mutation run also caught the test
itself passing for the wrong reason — it sampled `getBoundingClientRect()`, which
includes transforms, inside the 420ms grow-in, so it was filming the mount animation
rather than the transition. A check that passes for a reason other than the one it
names is the same defect class as the code it guards.
