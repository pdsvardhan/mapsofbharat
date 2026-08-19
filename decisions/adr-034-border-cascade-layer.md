# The border hierarchy the code asked for and the cascade threw away

**Status:** accepted · **Date:** 2026-08-13 · **Curated:** yes · **Category:** cat:system
**Related:** [adr-033](adr-033-one-definition-per-visual-fact.md) (one definition per visual fact) · design ledger row 102 · `tests/cascade.spec.ts`

## Context

`app/globals.css` opened with an unlayered rule:

```css
* { border-color: var(--border); box-sizing: border-box; }
```

Tailwind v4 emits its utilities into `@layer utilities`. In the CSS cascade,
**unlayered declarations beat layered ones regardless of specificity** — layer order
is considered before specificity, and unlayered styles sort above every named layer.
So a `.border-border-faint` class (specificity 0,1,0, inside `utilities`) lost to a
universal selector (specificity 0,0,0, unlayered).

Measured 2026-08-13: **52 border-colour declarations across 18 files** asked for
something other than `--border` — 31 `--border-soft`, 16 `--border-faint`, 5 accent —
and **every one painted `--border`**. Counted in a real browser across four pages,
**86.8%–100% of all border-painting elements** resolved to the wrong colour.

The whole intended hierarchy — faint hairlines between table rows, soft edges on
panels, the strong rule reserved for structure — was collapsed to a single strongest
value, everywhere, while the class names in the source read as though it were not.

**Why it survived.** Nothing was misspelled. No utility was missing from the built
CSS (`.border-border-faint{border-color:var(--border-faint)}` is present and
correct). The class is on the element in the DOM. Read the JSX and it is right; read
the stylesheet and it is right; only the *interaction* is wrong. There is no lint for
"this declaration is real but the cascade discards it", and no test asserted a
resolved border colour anywhere in the suite — every test checked content.

It surfaced only because design round R4 needed to decide a row-separation weight,
and measuring the current one showed a row asking for `#211e14` painting `#3b3626`.

## Decision

Put the base rule in `@layer base`:

```css
@layer base { * { border-color: var(--border); box-sizing: border-box; } }
```

It still supplies the default border colour for every element that asks for none,
and now loses to any element that asks for a specific one — which is what a base
layer is for. **The visual change is app-wide but restores intent rather than
introducing it: no component's source changed, 52 declarations simply started
painting what they already said.**

The `region-row.row-separation` axis was then decided on its merits, by looking:
**keep `--border-faint`.** 733 rows is a tabulation sheet and a sheet rules its rows
quietly. At full `--border` the table read as heavily striped and the rules competed
with the data; at `--border-faint` the rows still separate cleanly, and the selected
row (adr-033, ledger row 101) reads *better* because the surrounding rules stopped
shouting.

## Consequences

`tests/cascade.spec.ts` guards it, and deliberately asserts **resolved colour**, not
class names — the class name was never the thing that broke. It is mutation-proven:
un-layering the rule fails two of its three specs with `rgb(59,54,38)` where faint
and soft are required. The third spec — an element with no colour utility still gets
the base default — passes either way by design, since that behaviour must not change.

**What this does not fix.** Any future unlayered rule in `globals.css` will outrank
every utility again, silently and app-wide. There is no check for it. The file now
carries a comment at the rule saying why the layer is load-bearing, which is a
comment, not a guard — stated here as the honest limit, the same way adr-033 recorded
that nothing mechanically prevents the next hard-coded literal.

This is the third defect in one session of the same shape: a value declared in one
place and silently contradicted somewhere else — the accent ink that moved while
seven uses did not, a motion class naming a property its element could not move, and
now an entire colour layer outranked into irrelevance. In each case the source read
correctly and the running page disagreed.
