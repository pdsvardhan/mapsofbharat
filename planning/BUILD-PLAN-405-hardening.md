# Build plan — #405, pre-launch hardening

_Written 2026-08-20. One to-do that is really seven. Split here so they can be worked and
finished independently instead of a checklist that is never "done"._

## The honest position

There is **no tested backup and no alerting**. A disk failure loses the site and nothing
tells you it happened. Everything else on this page is secondary to those two.

Ordered by what actually reduces risk per hour spent.

---

## 405-A · Off-box backups, with a restore that has been *performed* `[ops]` — P0

**Now:** backup scripts exist and write to the same machine that holds the data. A backup
on the failing disk is not a backup, and a restore procedure nobody has run is a
hypothesis.

**Build:**
- Nightly snapshot of the canonical DB, the writable corrections DB, and the raw-data
  tree, pushed **off** VAULT7A (Cloudflare R2 or Backblaze B2 — both cheap, both already
  plausible given the geometry-CDN item below).
- Retention that survives a mistake you don't notice for a week: 7 daily, 4 weekly.
- **A restore drill, actually executed**: pull last night's snapshot to a scratch
  directory, stand the app up against it, load the site, confirm the metric count matches
  production. Write down how long it took.

**Done when:** the drill has been run end to end and its elapsed time is recorded. Not
when the script exists.

**Note:** the raw-data tree is ~825MB and untracked by git. It is the one thing that
cannot be rebuilt from the repo, so it is the highest-value thing in the snapshot.

---

## 405-B · Uptime monitoring that reaches your phone `[ops]` — P0

**Now:** nothing watches the site. If the container dies you find out by visiting.

**Build:** an external check (not on VAULT7A — a monitor on the box it monitors is
useless) hitting `/api/health` every few minutes, alerting to your phone. The endpoint
already returns commit and tree state, so the check can assert *reachable and serving the
expected build*, not just TCP-open.

**Alert on:** unreachable, non-200, or a JSON body that isn't `status: ok`.

**Done when:** you deliberately stop the container and your phone buzzes.

---

## 405-C · Boundary CI gate `[ops]` — P1

**Now:** nothing prevents a corrupted or wrong-vintage boundary file reaching users. Map
geometry is the one asset where a silent regression is both invisible in tests and
politically sensitive — this project has already published an ADR about a district it
refuses to draw rather than invent (adr-031).

**Build, three layers:**
1. **Checksum** every boundary file against a committed manifest; any change must be
   deliberate.
2. **Golden render** — rasterise the country at a fixed zoom and compare against a
   committed reference. Catches geometry that parses but draws wrong.
3. **Runtime assert** — district count and total area within tolerance at load.

**Done when:** deliberately corrupting one boundary file fails the gate. Mutation-proven
or it doesn't count.

---

## 405-D · Tests on every push `[ops]` — P1

**Now:** Gitea Actions CI exists but the suite is not gating. Everything green this month
was green because I ran it by hand.

**Build:** run typecheck, lint, build and the Playwright suite on every push, against an
**isolated instance** with `CORRECTIONS_DB_PATH` on a temp copy — the 405-D and #481 work
share that harness, so do #481 first.

Includes fixing flaky **#380**; a suite that cries wolf gets ignored, which is worse than
no suite.

**Done when:** a deliberately broken commit is refused by CI, not by me noticing.

---

## 405-E · Warm standby `[ops]` — P2

A static fallback (Cloudflare Pages) that serves a recent snapshot of the key pages when
the origin is down, so an outage degrades to stale rather than dead.

**Explicitly after A–D.** A standby is worth less than a backup you can restore and an
alert that tells you to.

---

## 405-F · Geometry CDN + compression `[ops]` — P2, performance not safety

Boundary files are the heaviest thing shipped. Move them to R2 behind a CDN and compress.
Pairs naturally with 405-A, which already needs an object store.

**Measure first.** If the current cache hit rate is fine, this buys little; the to-do's
own migration trigger is "cache-hit below 90%", so check that number before building.

---

## 405-G · Migration trigger `[ops]` — P3

The to-do names a rule — migrate when cache-hit drops under 90% — with nothing measuring
it. Either instrument it or drop the rule. **A threshold nobody measures is not a
policy**, and this project has spent the month finding checks that never ran.

---

## Sequencing

`#481` (shared test harness) → **405-A** → **405-B** → 405-D → 405-C → 405-F/G → 405-E

A and B are the two that change what happens on a bad day. Everything after is
improvement, not insurance.
