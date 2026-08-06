# Friends & family test — kit (#416)

The V1 milestone: watch 5 real people use Maps of Bharat, unsupervised, ~15 min each, and note every stall. Fix the cheap ones before V2. This is an **owner-run** task — the kit below makes it turnkey.

## Recruit (5 people)
- **≥1 on a mid-range Android** (the #419 mobile-toolbar fix and card export most need a real device, not an emulator).
- **≥1 non-technical** (someone who won't forgive a confusing UI).
- Mix of interests; nobody who has seen the project before.

## Setup
- Give them the link only: `https://mapsofbharat.vault7a.xyz` (internal, pre-launch). No explanation, no demo.
- **Unsupervised**: let them drive; you observe (in person, screen-share, or a quick recording) without helping. The point is discoverability — if they get stuck, that's the finding.
- ~15 minutes. Have them think aloud if they're comfortable.

## Tasks — give as GOALS, not steps (this tests whether the UI is discoverable)
1. **Find a statistic that interests you** and look at it on the map. *(watch: is the metric selector obvious? do they know what they're looking at?)*
2. **Search for your home district.** *(watch: do they find search at all — without being told about Ctrl-K? does the palette help?)*
3. **Go from India into a state, then into a district.** *(watch: do they discover the drill? is there a way back up? do they get lost?)*
4. **Share or save a map as an image** — on your phone if you're on one. *(watch: do they find Share/Export? does the card export work on their device? #415's core path.)*
5. **Find a number marked as an "estimate"** and tell me what you think it means. *(watch: is the estimate disclosure visible where they read the number? is it understandable?)*
6. **Would you trust these numbers? Why or why not?** *(watch: do they notice the source/year/citation? does it read credible?)*

## What "done" looks like
- Every tester completes tasks 1–4 without help.
- Nobody is confused by an "estimate" (task 5) or doubts the sourcing (task 6) for the wrong reason.
- Every stall is written down; the cheap fixes are made before starting V2.

## Observation sheet (one row per stall)

| Tester | Device | Task | What happened / their words | Severity (blocker / annoying / nit) | Cheap fix? |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

## After the sessions
- Group the stalls; rank by how many testers hit each.
- **Fix the cheap, high-frequency ones now** (copy, a label, a hint, a tap target). File the rest as todos.
- Anything that blocked task 4 on a real Android is a launch blocker — bump it.
- Then the board moves to **V2** (hardening + go-live).

*Prepared 2026-08-06 alongside the automated pre-test QA sweep (#415), which covers the same three critical paths at emulated mobile + desktop — this human pass is what the emulator can't do: real devices, real confusion, real trust judgments.*
