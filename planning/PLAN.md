# Maps of Bharat — the plan

_Written 2026-08-20. This is the main plan; substantial items link to their own
sub-plan. Ottomate tool work is NOT here — it lives in `../Ottomate/TASKS.md`._

## Vocabulary (so "live" stops meaning four things)

| Term | Meaning | Now |
|---|---|---|
| **Deployed** | code running on the server | many times a session |
| **Internal** | reachable at `mapsofbharat.vault7a.xyz`, unannounced, not indexable | **← we are here** |
| **Friends & family** | you actively share the link for feedback | not started |
| **Launch** | `mapsofbharat.in` + social handles + first content, together | the public moment |

Every item below is tagged `before-launch`, `at-launch`, `after-launch` or `anytime`.

## Not in my hands

`#499` domain/handles/prod token → you, once the name is settled · `#157` RBI export →
your browser agent · `#433` analytics baseline → needs four weeks of post-launch traffic
· **testing** → you, once the queue below is clear.

---

# Phase 1 — Guards and small debts
**Why first:** each is hours, not days, and three of them stop a bug class that hit four
times this month. `anytime`.

### 1.1 · #533 — fix #408's title `[tiny]`
Its title roadmaps cartograms and hex maps; our own `research/758` says cartograms are a
**do-not-build** and hex is state-level only. Rewrite the title to match the brief so the
backlog stops advertising work we've decided against. *Ten minutes.*

### 1.2 · #522 — kill the stale planning doc `[tiny]`
`PENDING-AND-NEXT-SESSION.md` is dated 2026-06-09 and lists long-shipped features as
pending. Delete it. If a next-session view is wanted later it should be generated from
the tracker, never hand-maintained as a second source of truth.

### 1.3 · #482 — kill-port helper `[tiny]`
A scratch `next start` renames itself to `next-server` once running, so `pkill -f` on the
start command misses it — and worse, a pattern containing the port matches the SSH
command line and kills the session. Ship `scripts/kill-port.sh` that resolves the PID
from `ss -lntp` and kills that. I've hand-rolled this five times this week.

### 1.4 · #481 — stop tests writing to the live database `[small]`
`playwright.config.ts` defaults `BASE_URL` to production and `tests/corrections.spec.ts`
POSTs real submissions; seven junk rows have already landed in the live DB. The intended
guard ("ask the server which DB it writes to") was never built — `/api/corrections`
doesn't expose the path, and the spec carries a skip message describing a check that
doesn't exist.

**Two-part fix.** (a) Add the configured corrections path to an authenticated
`/api/corrections` response so a test can *prove* where it is writing. (b) Make the spec
refuse to run unless that path is a temp/scratch DB. Fail closed: no answer means don't
write. The working recipe from this week (`CORRECTIONS_DB_PATH` pointed at a copy) goes
in the runbook.

### 1.5 · #523 — lint rule: no hex literals in components `[small]`
`--accent-ink` moved to fix a WCAG failure and seven hard-coded copies didn't, so the
controls the fix was for kept failing. Add a lint rule banning hex colours in
`components/` and `app/`, with an allowlist for `lib/social-export.ts` (canvas, cannot
read a CSS variable) that requires a comment naming the token each literal tracks.

### 1.6 · #524 — guard the cascade `[small]`
An unlayered rule in `globals.css` outranked every Tailwind utility, so 52 border
declarations across 18 files painted the wrong colour for months. Add a check that
`globals.css` declares no bare top-level selectors outside `@layer`. Cheap, and it closes
the exact hole adr-034 admits it left open.

---

# Phase 2 — Research you asked for, converted into decisions
**Why now:** three items are parked behind questions only research answers. Each ends in
either a build plan or a written "no, and here's why".

### 2.1 · #455 — review the animated-dataviz conclusion `[data]` `[feature]`
`research/766` concluded: build three forms — metric-to-metric transition, small
multiples, slope chart — and explicitly **not** animated map fills. That conclusion is a
year of data older than the catalogue.

**What to answer:** does the data support it *now*? Slope charts and metric-to-metric
transitions need at least two comparable time points; small multiples need several
related metrics on one scale. Count what we actually have, per form. Then either write a
build plan or record "still blocked on data depth" with the numbers that say so.

### 2.2 · #386 — is the constituency→district mapping easy? `[data]`
You asked directly: easy, useful, if yes go. I don't know yet and won't guess.

**The real question:** parliamentary constituencies do **not** nest inside districts —
one PC spans several districts and one district can be split across PCs. So this is
either a clean lookup table (easy) or an area-weighted spatial join with a defensible
apportionment rule (not easy, and arguably not honest for turnout). Determine which,
using the PC-wise file already in `pipeline/raw-new/elections/`.

**Ends in:** a build plan, or a recorded "district turnout cannot be derived honestly
from PC results" — which is a perfectly good answer and matches how we handled Saitual.

### 2.3 · #531 — which metrics actually want symbols `[data]`
Audit the 29 HOTSPOT metrics: which genuinely need a symbol map, and which are really a
missing per-capita denominator. Eurostat normalises to rate/share *specifically* to avoid
area bias, so some of the 29 may be a data fix rather than a chart fix. Then scout
official sources for count data only symbols can show honestly. **Feeds Phase 3.**

---

# Phase 3 — The two product builds

### 3.1 · #532 — proportional symbol maps `[feature]` `before-launch`
**Sub-plan: `BUILD-PLAN-408-symbol-maps.md`** — written, buildable cold.
Unlocks 29 metrics (a third of the district library) that cannot be shown honestly today.
Biggest single product win on the list.

### 3.2 · #913 — the metric detail page `[design]` `before-launch`
**Sub-plan: `BUILD-PLAN-913-metric-detail.md`.**
Approach changed on your instruction: **no design round.** Match components already used
elsewhere on the site. Visual treatment only — heading structure, content order, internal
linking and metadata stay exactly as they are, because these pages are the organic-search
surface and the SEO floor shipped at `bf4c374`.

---

# Phase 4 — Pre-launch hardening
### 4.1 · #405 `[ops]` `before-launch`
**Sub-plan: `BUILD-PLAN-405-hardening.md`** — the one to-do splits into seven real items.

This is the item where *nothing has gone wrong yet* is the only thing protecting you.
There is no tested backup and no alerting: a disk failure loses the site and nothing
tells you it happened.

---

# Phase 5 — Launch machinery
Sequenced, not planned in detail yet — they follow the phases above and their shape
depends on what launch actually looks like.

- **#409 content machine** `before-launch` — compositor → batch card export CLI → the
  piece bank → scheduling. The pipeline half is mine; **captions are yours and are the
  real bottleneck.**
- **#384 licence swap** `at-launch` — swap the non-commercial crosswalk for LGD. Automatic
  prerequisite of charging for anything.
- **#410 paid tier** `after-launch` by default — accounts, payment, gating, bulk/API.
  You've said build the full suite if we go public; V2 scope can change.

---

# Standing decisions

- **Design rounds are suspended.** Pending UI is matched to components already on the
  site. Revisit once the Ottomate design skill is redesigned (`../Ottomate/TASKS.md` #526).
- **Nothing is indexable until `SITE_LAUNCHED=true`.** Shipped 2026-08-20; both states
  tested.
- **The R2 colour budget overage (accent on two elements, not one) is accepted.**
- **Tests run against an isolated instance**, never the prod container.
- **Every user-visible change is appended to `TESTING-CHECKLIST.md`** — you test once,
  at the end, not per session.
