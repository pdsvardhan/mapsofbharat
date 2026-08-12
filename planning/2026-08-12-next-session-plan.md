# Next-session plan — two tracks in parallel

_Written 2026-08-11 at the end of the session that shipped iterations 148 and 149.
Live: `ffa8962`, `tree=clean`, suite 197/197, 0 HARD anti-gaslight violations._

Two tracks run side by side: **design picks** (owner-bound, fast) and **build**
(unattended, no design dependency). The design track is the long pole only because
each round needs a human eye; the build track fills the gaps between picks.

---

## Track A — design: close out the deferred rounds

Three rounds, not three to-dos: **#472's motion half and #432's item 752 are the same
round.** Picking happens in the app at `/projects/mapsofbharat/design/<target>?round=N`,
which writes straight to the `design_decisions` ledger.

| Round | Target | Axes | Prereq |
|---|---|---|---|
| **R2 weight** | `metric-row-cluster` | swatch-shape · surface-depth · corner-radius · border-treatment · bar-shape | **none — generated and published ahead of this session** |
| **R3 motion** | `metric-row-cluster` | count-up-motion · bar-grow-motion, plus item 752's entrance / hover / un-hover | **R2 must be LOCKED first** |
| **R4 metric detail** | `metric-rank-table`, region-row archetype | visual only — see scope ruling below | stamping pass DONE (`f5379a6`); anatomy + context drafted |

**Order of play:** pick R2 → generate R3 → pick R3 → generate R4 → pick R4.

**Why R3 cannot be pre-generated.** Motion animates the forms R2 chooses, and the
isolation gate holds every non-contested axis constant. Generating R3 against an
unlocked base would either vary two things at once or freeze values the owner has
not chosen yet. It is a real dependency, not caution.

**R2's contested axes are not a proposal.** R1's manifest recorded them under
`constraints.deferred_with_assent["round weight"]` when the owner deferred them on
2026-08-10. The frozen controls carried forward from R1 are
`category-list.row-layout=single-line`, `category-list.row-density=32`,
`category-row.row-layout=baseline-columns-with-leader`, `panel.padding-density=12`.
Rejected at R1 and never to be re-offered: `card-2up`, `88`, `banded-card`, `24`,
`stacked-two-line`, `52`, `headword-over-provenance`, `18`.

**R4 had a blocker that this plan originally missed.** The prep pass measured the
metric-detail subtree and found **zero design stamps** — `decompose()` returned
`{oid:null, parts:[], hasStamps:false}`, `scopeChoices()` returned a single option
with `opensAxes:[]`, and `anatomyForScope(whole)` returned `sub_decisions:[]`. The
round had nothing to name. `data-testid` is a test hook the extractor does not read,
so the 747 test ids on the page counted for nothing. Fixed at `f5379a6`: the same
presentational no-op stamps the locked cluster uses — `data-oid=metric-rank-table`
plus roles `region-list` / `region-row` / `region-estimate`. `decompose()` now
returns those three parts. 22/22 on the table specs, typecheck clean.

**Two further findings from that prep, both real:**
- **The page is not a clean archetype at page level.** The whole subtree derives as
  tier `surface`, and `questionsForTier("surface")` returns zero questions, so
  `validateRecord` fails outright. R4 must run at **composite tier on the rank
  table**, never as a surface round.
- **`region-row` is not in the anatomy catalog** (`archetypes` holds only
  `media-card`, `button`, `data-table-row`). Same gap R1 hit for `metric-row`, same
  answer: carry a derived `anatomy_inline`. Do not reuse `data-table-row` — it is a
  near neighbour, not this row.
- **The component mounts TWICE** — the `/metric/<id>` page and the atlas table view
  (`india-map.tsx:1781`). Any region-row change lands on both surfaces.
- **Row hover / selected / click are dead code.** `DataTable` declares `onRowClick`
  and `selectedCode`; neither mount passes them. So `required_states` is `["rest"]`
  only, and the round must not offer hover-highlight, select-affordance or
  selected-signal axes — they would be inventing behaviour that does not exist
  (to-do #503).

**R4 scope ruling (owner, 2026-08-11): VISUAL TREATMENT ONLY.** `/metric/<id>` pages
are the project's organic-search surface — item 913's own description says the
redesign "has consequences beyond looks". Heading structure, content order, internal
linking and metadata stay exactly as they are; the SEO floor shipped at `bf4c374` is
not to be disturbed. Axes are about form only.

---

## Track B — build: three items, no design dependency

### 1. #481 — the corrections spec writes REAL rows into the live database

**The hazard, precisely.** `playwright.config.ts` defaults `BASE_URL` to
`http://localhost:8610`, which is **production**. `tests/corrections.spec.ts` POSTs
real submissions. So `npx playwright test tests/corrections.spec.ts` with no
`BASE_URL` set writes into the live `/data-rw/corrections.db`. It has already
happened once: seven rows landed and had to be purged with `docker exec`, because
the file is uid 1001 and the host user is not.

**Why the obvious guard does not work.** The intended check would be "ask the server
which database it is writing to" — but `/api/corrections` does **not** return the
configured path. The spec at `tests/corrections.spec.ts:104` even carries the skip
message *"needs CORRECTIONS_ADMIN_TOKEN to prove the configured path"* while
asserting only that a wrong token gets a 401. The message describes a check that
was never written.

**Plan.**
1. `app/api/corrections/route.ts` — the owner-only GET also returns the configured
   `db_path`. It is already token-gated, so this exposes nothing new to the public,
   and it makes the effect surface *answerable* instead of inferred.
2. `tests/corrections.spec.ts` — a `beforeAll` reads that path and **fails** if it is
   the production mount (`/data-rw/corrections.db`), unless `CORRECTIONS_WRITE_OK=1`
   is explicitly set.
3. **Fail, never skip.** A skip reads as green, and this session hit that exact
   failure mode three separate times (doc-lint's silent pass, the analytics spy, the
   raw-asset guard's blind spot). The whole point is that the run cannot look fine
   while writing to production.
4. Fix the misleading skip message at :104 while in there.

**Mutation proof required:** point the suite at production with the guard in place
and confirm it fails before any POST; point it at a scratch container and confirm it
passes; confirm the live corrections DB row count is unchanged either way.

### 2. #482 — a scratch server survives `pkill -f`, and the pattern kills your session

**The hazard.** Once running, `next start -p NNNN` renames itself to
`next-server (vX)`, so `pkill -f` on its start command never matches. Worse,
`pkill -f` with the port in the pattern matches the **ssh command line itself** and
kills the session with exit 255. I hit this again on 2026-08-11.

**Plan.** `scripts/kill-port.sh <port>`:
- resolves PIDs from `ss -lntp`, kills **by PID**, never by pattern;
- **refuses outright** on protected ports — 8610 (production), 8620 (Umami), 8110
  (Ottomate) — so the tool cannot be the thing that takes production down;
- verifies the port is actually free afterwards and says so, rather than assuming
  the kill worked.

**Mutation proof required:** start a throwaway server on a scratch port, kill it with
the script, confirm the port is free; then attempt it against 8610 and confirm it
refuses without touching anything.

### 3. Risk 57 — a stale claim the registry has been asserting since June

`risk_instances` #57 still reads `a11y-missing / accepted`, with a note from
2026-06-10 saying a full audit "requires a foreground/interactive browser session,
not available this run". That stopped being true on 2026-08-10, when the a11y floor
shipped (items 470/431/473: focus vocabulary where there was none, `--dim` off all
read text, `--accent-ink` lifted 4.38→4.67:1).

**Plan.** Resolve it with a summary naming what shipped and what genuinely remains
(no full keyboard / screen-reader audit has been run end to end — that part of the
June note is still true and should survive into the resolution rather than being
quietly dropped). This is a two-minute registry write, not a build.

---

## What is deliberately NOT in either track

`#405` reliability, `#408`/`#410`/`#409` growth and monetisation, `#386` elections,
`#455` research conversion — all marked SOON by the owner. `#416`, `#407` and `#499`
(go-live remainder) are owner-only and were removed from the working list on purpose.
`#433`'s remaining half is a four-week baseline that cannot start before launch.
