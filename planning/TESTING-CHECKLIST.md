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

---

## Wave 1 — 2026-08-20 (streams Q, O, S, M)

Test the whole batch in one sitting. Nothing here is deployed to production yet.

### The big new thing — proportional symbol maps (#408)

Nine metrics are **counts** (total population, rice and wheat production, cropped
area, the four livestock ones, area). A count painted as colour is read as *area*,
so Kutch — 291× the area of Mumbai City — outweighed Mumbai whatever colour either
one got. Those nine now draw as **circles sized by value** instead.

- [ ] **Open `/?m=pop_total&lvl=district`.** You should get circles, not a colour
      wash, on a dark neutral India. Does the distribution read the way you expect —
      the Gangetic plain dense, Delhi and Mumbai emphatic, the north-east sparse?
- [ ] **Switch to STATES.** Uttar Pradesh should be unmistakably the largest circle.
      This is the view I think looks best; tell me if you disagree.
- [ ] **The SIZE / SHADE toggle** on the legend flips between circles and the old
      choropleth. Flip it back and forth on the same metric and tell me whether the
      circle version actually reads better to you. **This is the judgement call I
      most want your eye on** — I set circles as the default for those nine.
- [ ] **Legend.** Three nested circles with values, replacing the colour ramp. Are
      the three sizes distinguishable enough to be useful?
- [ ] **Hover and click a circle.** Tooltip, selection, the region panel, compare
      pinning and drill should all behave exactly as they do on the polygon map.
- [ ] **Try a rate metric** (`literacy_rate`, `pop_density`). It should stay a
      choropleth and offer **no** SIZE/SHADE toggle at all. If you see circles on a
      percentage, that is a bug and an important one.
- [ ] **Circle size at district level.** First attempt had them too large and the
      Gangetic plain merged into one blob; I cut the maximum radius. Check it reads
      as separate districts to you rather than a smear.

### The metric detail page (#913) — e.g. `/metric/literacy_rate`

- [ ] **Overall impression first.** It used to be eight identical bordered boxes
      down the page with no hierarchy. Everything is now a ruled band, matching the
      atlas. Does it read as a page about a number rather than as a form?
- [ ] **The three stats.** "National average" is now much larger than Range and
      Coverage. Right call?
- [ ] **The map** should now fill its frame instead of floating in a wide letterbox.
- [ ] **The methodology paragraph** still sits above the numbers (moving it is a
      content change I did not make), but the first sentence is brighter and the
      rest recedes. Does the number feel reachable now?
- [ ] **"Download processed dataset — Pro (coming soon)"** is now dashed rather than
      faded. Does it read as *not built yet* rather than as *broken*?

### Nothing should have changed here — flag it if it did

- [ ] **The atlas generally.** ~70 hardcoded colours were replaced with their design
      tokens and five recurring colours were given proper names. The values are
      identical, so nothing should look different anywhere. Any colour that looks
      off is a real bug.
- [ ] **Keyboard focus rings, borders, the ranking rail, the export card.** Same
      reason — flag anything that shifted.

### For information — no action

- The site still carries `noindex` and `Disallow: /` from last session. Launch flips it.
- Backups now run nightly at 03:45, and a restore has actually been performed and
  timed (12 seconds, catalogue identical to production). They still do not leave the
  box — that needs a cloud remote only you can set up.
- `mapsofbharat` has **no uptime monitor**, while 16 other services on the box do.

---

## Wave 2 — 2026-08-20 (CI, guards, backups)

Almost all of this is invisible to a reader. Nothing here changes the site's
appearance, so the only thing to *look* at is the one item below.

### Worth a glance

- [ ] **`/api/health`** now does real work — it opens the database and counts the
      catalogue, and answers **503** instead of 200 when it cannot. Visit
      `https://mapsofbharat.vault7a.xyz/api/health` **after the next production
      deploy** and you should see `"checks":{"db":true,"metrics":124}`. Before that
      deploy it still shows the old always-ok response.

### Nothing to test, but worth knowing

- **CI now actually runs.** It had been failing on every push for weeks and nobody
  noticed — the build step needed data that CI did not have. The full 249-test
  suite now runs on every push against the real database, in about three minutes.
- **Lint is a ratchet.** It cannot go up. It also fails if it goes *down*, to make
  you bank the improvement.
- **The boundary gate is proven.** It has guarded Survey-of-India compliance since
  #405 and had never been shown to fail at anything. It now catches all seven
  defects tested, including a property-rename hole it used to wave through as a
  "reformat".
- **Backups got ~8x cheaper.** The raw tree is mirrored incrementally rather than
  re-archived nightly: ~1.3GB total instead of ~10GB, which fits a free tier.

## iter-43 — the 404 page, and one thing to check at launch

- [ ] **There is a real 404 page now.** Follow a dead link — for example
      `https://mapsofbharat.vault7a.xyz/does-not-exist` — and you should get a
      proper page: the brand mark, "Page not found", a sentence explaining that an
      indicator id may have been renamed or retired, and four cards linking to
      Every indicator / Indicator families / Coverage / Report a problem. Check the
      four links go where they say.

- [ ] **Two routes still look bare without JavaScript, deliberately.**
      `/metric/no-such-metric` and `/family/no-such-family` show the same page in a
      browser, but their text is delivered by JavaScript rather than sitting in the
      HTML. That is a framework limitation, it is written up in `adr-037`, and it
      costs nothing that matters — the page still returns a proper 404, so search
      engines never index it either way. Nothing to do; listed so it is not
      reported as a bug later.

- [ ] **The homepage is no longer pre-built.** It is generated per request now, so
      the indexing switch can be flipped without a rebuild. It should look and feel
      exactly as before — the map, the START HERE card, all the controls. If it
      feels slower to first paint, say so; measured it was about 3ms slower, which
      should be invisible.

### AT LAUNCH — one check that only becomes possible then

- [ ] **After the site is rebuilt with `SITE_LAUNCHED=true`**, fetch any dead URL
      and confirm the page does NOT contain `index, follow`. A 404 built in the
      launched state bakes both `noindex` and `index, follow` into its HTML. It is
      harmless — a 404 is never indexed, and crawlers obey the stricter of the two —
      but this is the one state no test can reach, because CI builds unlaunched and
      only runs launched. Raised by the iter-43 verifiers; see `app/layout.tsx`.
