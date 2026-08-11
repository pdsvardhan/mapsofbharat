# Friends & family test — kit (#416)

The V1 milestone: watch 5 real people use Maps of Bharat, unsupervised, ~15 min each, and note every stall. Fix the cheap ones before V2. This is an **owner-run** task — the kit below makes it turnkey.

## Recruit (5 people)
- **Mix desktop and phone.** #424 landed on 2026-08-10, so the mobile layout is now real: the map gets 372×652 at 390px instead of a 34px sliver, search and the masthead links are on-screen, and the export dialog's DOWNLOAD is reachable and tappable. Aim for **≥1 mid-range Android**, which is what to-do #416 asks for and what the earlier desktop-only round could not cover.
- **≥1 non-technical** (someone who won't forgive a confusing UI).
- Mix of interests; nobody who has seen the project before.

### What's new on phones — worth watching specifically
The phone layout makes two deliberate trades. Watch whether they cost anyone the task:
- The rankings rail is a **bottom sheet**, collapsed to a handle that names its scope ("RANKINGS · 733 districts nationwide"). Do people find it, or do they never realise rankings exist?
- The map controls (indicator, level, palette, map/table) sit behind a **"Show map controls"** disclosure, with a mini colour ramp left visible so the map still reads. Does anyone fail to find the indicator picker?

Both cost one tap. That was chosen over an always-visible stack, which left ~158px of map at 390px — an unreadable map beside unreadable controls.

## Setup
- Give them the link only: `https://mapsofbharat.vault7a.xyz` (internal, pre-launch). No explanation, no demo.
- **Unsupervised**: let them drive; you observe (in person, screen-share, or a quick recording) without helping. The point is discoverability — if they get stuck, that's the finding.
- ~15 minutes. Have them think aloud if they're comfortable.

## Tasks — give as GOALS, not steps (this tests whether the UI is discoverable)
1. **Find a statistic that interests you** and look at it on the map. *(watch: is the metric selector obvious? do they know what they're looking at?)*
2. **Search for your home district.** *(watch: do they find search at all — without being told about Ctrl-K? does the palette help?)*
3. **Go from India into a state, then into a district.** *(watch: do they discover the drill? is there a way back up? do they get lost?)*
4. **Share or save a map as an image.** *(watch: do they find Share/Export? does a card export cleanly? #415's core path — verified clean on desktop.)*
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

*Prepared 2026-08-06. The automated pre-test QA sweep (#415) verified the three critical paths + the trust surface are clean on desktop, and found the mobile layout collapsed at phone widths — which is why the first draft of this kit was desktop-only.*

*Updated 2026-08-10: #424 has landed, so phones are in scope. Also fixed since the kit was written and worth knowing before you watch anyone: the site now renders its actual brand font (it had been silently falling back to system sans since launch); every interactive element has a real focus ring, where before there was none and `input { outline: none }` actively removed it; source attribution and other small text moved off a 3.17:1 grey that failed WCAG AA; and the export card no longer truncates a long region name into the name of a different region. The 5-person run is still the thing automation cannot do — real confusion, real trust judgments.*
