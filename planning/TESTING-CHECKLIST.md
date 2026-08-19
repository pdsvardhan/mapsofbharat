# Maps of Bharat — what to test, accumulated

_One list of every user-visible change since your last test pass, so you can test once
instead of after each session. I add to this as things ship; you tick and we clear it._

**Nothing here has been looked at by you yet.**
Test at: `https://mapsofbharat.vault7a.xyz` · live commit `ecf1399`

---

## Batch 1 — shipped 2026-08-13 (iter-39 + iter-40)

### Look at these (visual)

- [ ] **The selected-region panel** (click any district on the map, panel appears in the
      right rail). It should read as a *band ruled off the sheet*: a 3px line above and
      below, no line down the left edge, no orange tint behind it, square corners.
      Previously it had an orange left bar and a gradient wash.
- [ ] **The nine little bars** in that panel (the rank distribution). They should now
      **grow upward** when the panel appears, and **glide** to new heights when you
      change indicator with the panel open. Before today they snapped instantly — the
      animation had never worked. The bars should also **touch each other** now, with no
      gaps.
- [ ] **The big number** in that panel should count up. It always did — check it still
      finishes at the same moment the bars settle, not before or after.
- [ ] **Borders everywhere, all pages.** This is the widest change. Row separators in
      tables and lists should now be *faint hairlines*; panel edges slightly stronger;
      only structural rules full strength. Before today every single border painted at
      full strength. If any page now looks too washed out or lines have disappeared
      where you need them, say so — this one is easy to dial back.
- [ ] **The topic swatch** in the indicator chooser (the little square with the icon,
      top of the metric list) is now square-cornered, not rounded.

### Click these (behaviour)

- [ ] **Table view → click a row.** Rows in the data table are now clickable and select
      that region — the map paints it, the panel opens. Clicking the selected row again
      deselects. This never worked before; the capability was declared in code and wired
      to nothing.
- [ ] **The selected table row** should show a small orange dot next to its rank, plus a
      lighter background. Check the dot is visible enough to find at a glance.
- [ ] **Selected row colour matches the chooser.** A selected row in the rank table and a
      selected metric in the chooser should be the *same* shade. They were two different
      shades before.

### Check if you use them

- [ ] **Segmented toggles** (STATES/DISTRICTS, VALUE/VS AVG, boundary toggles, COMPARE,
      DOWNLOAD PNG). The text on the orange "on" state was failing accessibility contrast
      and is now darker. Should look essentially identical — flag it if any label looks
      muddy.
- [ ] **Exported PNG card** — same fix applied to the card's text-on-orange. Export one
      and check nothing looks off.
- [ ] **Reduced motion.** If you ever turn on "reduce motion" in Windows, the bar growth
      and count-up should stop entirely rather than half-play.

### Known and accepted (not bugs)

- The panel spends its accent colour on two elements (the pulsing dot and the selected
  bar) where the design rule said one. You approved this on 2026-08-13.
- On the metric detail page (`/metric/<id>`) table rows are **not** clickable. That page
  has no map to select on, so it's deliberate.
