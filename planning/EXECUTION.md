# Execution plan — everything ready to run

> ## ▶ NEXT SESSION: RUN WAVE 1 WITHOUT CHECKING IN
>
> **Owner instruction, 2026-08-20.** Do not ask the owner anything until **Wave 1 is
> finished** or **your context is close to exhausted**. Then stop and report.
>
> Start by firing the three Stream R research agents (they run unattended), then work
> Stream Q yourself. Streams O, S and M follow the merge order below.
>
> **Everything you need has already been decided. Do not re-ask any of it:**
>
> | Question | Answer, already given |
> |---|---|
> | Design rounds? | **Suspended.** Author the design; match components already on the site. |
> | How much to ask the owner? | *I author, you react.* Show the built thing, not options. |
> | Ottomate source of truth? | The **tracker**; `../Ottomate/TASKS.md` becomes generated (Q0). |
> | #913 methodology paragraph? | **Stays in place.** Change its visual weight only. |
> | R2 colour budget over by one? | **Accepted.** Leave it. |
> | Paid tier #410? | After launch. #384 moves with it. |
> | Deploy to production? | **Ask first.** Everything else is yours to run. |
>
> **If a research task's answer is "no, don't build it"** — write that down with the
> numbers and move on. That is a successful outcome, not a blocker.
>
> **If you hit something genuinely ambiguous**, pick the reading a careful colleague
> would, write down the assumption, and keep going. Do not stop to ask.
>
> **Every guard must be mutation-proven.** Reintroduce the defect, watch the check fail,
> restore. Four of this month's bugs were checks that could not fail — two of them in
> tests written in this very session.
>
> Append everything user-visible to `TESTING-CHECKLIST.md`. The owner tests the whole
> batch once, at the end.


_Written 2026-08-20. This is the runbook: what runs, in what order, and what can run at
the same time. Scope is Maps of Bharat. Ottomate tool work runs as its own track
(`../Ottomate/TASKS.md`)._

Nothing here is blocked on you. Your five open items are listed at the bottom.

---

## How parallel this can honestly be

Research is **genuinely** parallel — three agents, read-only, writing to separate files,
zero interaction. Code is **not** free to parallelise: several agents editing one repo
produce merge conflicts, and this repo has one hot shared file.

So the rule below is **file ownership**. Each stream owns a set of paths and touches
nothing outside them. Where two streams need the same file, one owns it and the other
asks.

| Stream | Owns | Branch |
|---|---|---|
| **R** research | `research/` only | none (no code) |
| **Q** guards | `scripts/`, `eslint.config.*`, `app/api/corrections/`, `docs`, **`app/globals.css`** | `iter-42-guards` |
| **O** ops | `scripts/backup*`, infra + cron, monitoring config | `iter-43-ops` |
| **S** symbol maps | `pipeline/`, `components/india-map.tsx`, new symbol components, `lib/` | `iter-44-symbols` |
| **M** metric page | `app/metric/[slug]/`, `components/atlas/metric-*` | `iter-45-metric-page` |

**`app/globals.css` is owned by Q.** S and M both want tokens; both request them from Q
rather than editing. This is the single most likely conflict and the cheapest to prevent.

**Merge order:** Q → O → S → M. Q first because it lands the lint rules and the isolated
test harness everything else is verified against.

---

# WAVE 1 — start everything below at once

## Stream R · Research — 3 parallel agents, no code

Each ends in a written finding in `research/` **and** either a build plan or a recorded
"no, and here is the number that says so". A research task that ends in "maybe" has
failed.

### R1 · #455 — does the animated-dataviz conclusion still hold?
`research/766` said: build metric-to-metric transition, small multiples, slope chart —
and explicitly **not** animated map fills. That was written against a smaller catalogue.

Answer with counts, not opinion: how many metrics have **two or more comparable time
points** (slope charts and transitions need this); how many sit in **families sharing one
unit and scale** (small multiples need this). Then per form: buildable now, or blocked and
by exactly what.
→ `research/2026-08-XX-455-animation-recheck.md`

### R2 · #386 — is the constituency→district mapping easy?
Parliamentary constituencies do **not** nest inside districts: one PC spans several
districts, one district splits across PCs. So this is either a lookup table (easy) or an
area-weighted spatial join with an apportionment rule (not easy, and possibly not honest
for turnout — a turnout *rate* cannot be meaningfully area-weighted).

Use the PC-wise file already in `pipeline/raw-new/elections/`. Decide which case we are
in and say so plainly. **"District turnout cannot be derived honestly from PC results" is
a perfectly good answer** and matches how adr-031 handled Saitual.
→ `research/2026-08-XX-386-pc-district-feasibility.md`

### R3 · #531 — which of the 29 metrics actually want symbols?
For each HOTSPOT metric: does it need a symbol map, or is it really a missing per-capita
denominator? Eurostat normalises to rate/share *specifically* to avoid area bias, so some
of the 29 are a data fix, not a chart fix. Then scout official sources for count data only
symbols can show honestly.
→ `research/2026-08-XX-531-symbol-metric-audit.md` · **feeds S4**

---

## Stream Q · Guards and small debts — one branch, in this order

### Q0 · Generate the Ottomate task file
Tracker is source of truth; `../Ottomate/TASKS.md` becomes generated with a provenance
header (doc-lint R-DOC-1 requires one). Kills the second hand-kept copy before it drifts.
`scripts/generate-ottomate-tasks.mjs`.

### Q1 · #533 — fix #408's title
It roadmaps cartograms and hex maps; `research/758` says cartograms are a **do-not-build**
and hex is state-level only. Tracker edit, no code.

### Q2 · #522 — delete `PENDING-AND-NEXT-SESSION.md`
Dated 2026-06-09, lists shipped features as pending. Delete. Any future next-session view
is generated, never hand-kept.

### Q3 · #482 — `scripts/kill-port.sh`
Resolve the PID from `ss -lntp` and kill that. `pkill -f` misses a renamed `next-server`
and can match the SSH command line and kill the session. Hand-rolled five times this week.

### Q4 · #481 — stop tests writing to the live database
(a) Return the configured corrections path from an authenticated `/api/corrections` so a
test can **prove** where it writes. (b) Make the spec refuse to run unless that path is a
scratch DB. **Fail closed** — no answer means don't write.
**Everything downstream verifies against this harness, so it lands before S and M.**

### Q5 · #523 — lint: no hex literals in components
`--accent-ink` moved to fix a WCAG failure and seven hardcoded copies didn't. Ban hex in
`components/` and `app/`, allowlist `lib/social-export.ts` (canvas, cannot read a CSS
variable) and require a comment naming the token each literal tracks.

### Q6 · #524 — guard the cascade
An unlayered rule in `globals.css` outranked every utility; 52 border declarations across
18 files painted wrong for months. Check that `globals.css` declares no bare top-level
selectors outside `@layer`. Closes the hole adr-034 admits it left.

**Definition of done for Q:** each guard is **mutation-proven** — reintroduce the original
defect and watch the guard fail. A guard that has never failed has not been tested.

---

## Stream O · The two things that change what happens on a bad day

Independent of all app code. **Highest real-risk reduction per hour on this page.**

### O1 · 405-A — off-box backups + a restore actually performed
Nightly snapshot of the canonical DB, the writable corrections DB and the raw-data tree,
pushed **off** VAULT7A. Retention 7 daily / 4 weekly.
Then **run the restore**: pull last night's snapshot, stand the app against it, load the
site, confirm the metric count matches production, record the elapsed time.
**Done when the drill has been performed — not when the script exists.**
The ~825MB raw tree is untracked by git and is the one thing the repo cannot rebuild.

### O2 · 405-B — uptime alerting to your phone
External check (**not** hosted on the box it watches) hitting `/api/health`. Alert on
unreachable, non-200, or a body that isn't `status: ok`. The endpoint already reports
commit and tree, so it can assert *serving the expected build*, not just TCP-open.
**Done when you stop the container deliberately and your phone buzzes.**

---

## Stream S · #532 symbol maps — plan: `BUILD-PLAN-408-symbol-maps.md`

Start S1–S3 immediately; only S4 waits on R3.

- **S1 · centroids** — a point-in-polygon representative point per district and state,
  computed once. Not a bounding-box centre: crescent and multi-part districts put a naive
  centroid outside their own polygon, in the sea for coastal ones. Reuse the routine the
  crosswalk work already has.
- **S2 · the layer** — MapLibre `circle` with data-driven `interpolate`. **Radius ∝ √value**,
  because perceived quantity tracks disc *area*. Radius-proportional sizing overstates
  large values by the square and would make this less honest than the choropleth it
  replaces. Min radius floor, max ceiling, both per-metric.
- **S3 · legend** — nested reference circles, not a colour ramp. Sibling component to the
  existing legend, not a modification.
- **S4 · per-metric routing** ← **needs R3**.
- **S5 · interaction parity** — hover, select, compare, drill, URL state all work in symbol
  mode. Parameterise the existing specs over both modes. A mode that drops half the
  interactions is a demo.

**Basemap stays untouched** — polygons drawn neutral underneath. The compliance verdict in
`research/758` depends on that.

---

## Stream M · #913 metric detail page — plan: `BUILD-PLAN-913-metric-detail.md`

No design round; match what the atlas already settled.

- **M1** — apply the ruled-band treatment (ledger 95/96/97: flat, radius 0, 3px rules above
  and below, no side edges) to the eight look-alike boxes: three stat cards, four lineage
  steps, citation, share/embed.
- **M2** — hierarchy in the headline stats. National average is the headline; range is
  context; coverage is a caveat. Same band, different weight. No reflow.
- **M3** — **the methodology paragraph keeps its DOM position** (owner ruling: content order
  is out of scope; CSS-reordering would desync visual and screen-reader order). Lead
  sentence prominent, remainder secondary.
- **M4** — reclaim the map's dead space; tighten to India's bounds.
- **M5** — consistency sweep: downloads vs the atlas CTA, and the disabled "Pro — coming
  soon" button, which currently reads as broken rather than deliberately unavailable.

**Guard:** `tests/seo-metadata.spec.ts` must stay green untouched — that is the mechanical
proof the scope ruling was honoured.

---

# WAVE 2 — unlocked by Wave 1

| Item | Waits on | Note |
|---|---|---|
| **S4** per-metric routing | R3 | the only intra-stream dependency |
| **405-D** CI on every push | Q4 | shares the isolated harness; includes fixing flaky #380 |
| **405-C** boundary CI gate | 405-D | checksum + golden render + runtime assert; mutation-proven |
| build from **R1** | R1 | only if the data supports it |
| build from **R2** | R2 | only if the mapping is honest |

---

# WAVE 3 — after the above

**405-E** warm standby · **405-F** geometry CDN (*measure cache-hit first — the migration
trigger is <90% and nothing currently measures it*) · **405-G** instrument that trigger or
drop the rule · **#409** content pipeline (compositor → batch export CLI; **captions are
yours and are the real bottleneck**) · **#384** licence swap · **#410** paid tier.

---

# Running it

- Each code stream on its own branch, merged in order **Q → O → S → M**.
- Every stream: typecheck, lint at the 64-problem baseline, build, full suite against an
  **isolated instance** — never the prod container.
- Every user-visible change is appended to `TESTING-CHECKLIST.md`. You test once, at the
  end, not per stream.
- Nothing deploys to production without saying so first.

## Still yours

`#499` domain/handles/prod token · `#157` RBI export (agent running) · `#526` design-system
direction (your separate session) · `#433` analytics baseline (needs four weeks of
post-launch traffic) · **testing the batch when the queue is clear**.

## Separate track

`../Ottomate/TASKS.md` — **#237, the plaintext admin password, should be done regardless of
anything on this page.** It is reused across the media stack and `/opt/homeserver/.env`,
and rotation is the fix; deleting the line only hides it.
