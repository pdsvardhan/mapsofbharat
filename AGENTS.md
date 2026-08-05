# AGENTS.md — how this repository is run

Guidance for any agent (Claude Code, the Ottomate pipeline) or person working on Maps of Bharat. Read this, `CODING_GUIDELINES.md`, `VOICE.md`, and `does-not-claim.md` before making changes.

## The canonicity rule (source of truth, in order)

When two things disagree, trust them in this order:

1. **Live behaviour** of the running app and its data.
2. **The Ottomate tracker DB** — the canonical record of features, flows, pages, risks, decisions, iterations, and verification. The `ottomate/*.yaml` files in this repo are **mirrors**, regenerated from the DB (`npm run mirror:write -- mapsofbharat` in the Ottomate app); never hand-edit them.
3. **ADRs** (`decisions/adr-*.md`, indexed in `DECISIONS.md`) — the canonical record of *decisions* and their rationale. A decision that isn't in an ADR isn't decided.
4. **This repo's code and docs.**

If a document contradicts the DB or an ADR, the document is stale — fix it, and say so. Silent divergence is the failure this project exists to avoid.

## Non-negotiables (anti-gaslight bedrock)

- **Lock before build.** Scope is confirmed with the owner before code is written (the Ottomate lock-in gate). No code changes before the lock.
- **Verifier-gated.** Every code change is checked by an independent verifier (blind to the coder's claims), against the locked spec + the real diff + the running app. User-facing work also gets the feature verifier, which asserts *system state*, not a 200. "Done" = both green.
- **No stubs.** No placeholder returns, mock data, or "coming soon" code paths shipped as real. Intentional, disabled placeholders must be visibly labelled as such.
- **Provenance always.** Every number carries its source, year, and methodology, and discloses whether it is measured, inherited, re-aggregated, or projected. If it isn't sourced, it isn't shown.
- **Drop with a reason.** Nothing is silently deferred; a dropped or deferred item leaves an ADR or a recorded reason.

## Domain rules

- **Boundaries** follow the Survey of India (current-day districts). No GADM / global boundary files (non-compliant + legal risk). See `/methodology` and adr-002/003/010.
- **Sources** are official/government or top-tier only, stored in our own canonical DB — never live calls to a source at request time (adr-004/005).
- **Licence:** the Census crosswalk is CC-BY-NC-SA (non-commercial) until the LGD swap (to-do #384) lands; the site stays non-commercial until then (adr-027).
- **No user-generated content**, ever (adr-029) — the only inbound channel is the private corrections report route.
- **Voice + claims:** impersonal and neutral (`VOICE.md`); present numbers, never verdicts or causation (`does-not-claim.md`).

## Working conventions

- **Branch per iteration**; **one commit per item**; commit each item as it lands.
- **Commit before any docker rebuild.** `gitleaks` runs on commit — keep it clean.
- **Never touch the production checkout/container while developing.** Use an isolated git worktree (own `.next`, port, and temp DBs) for parallel or in-flight work. The canonical DB is opened **read-only**; writable state (corrections reports, logs) lives in separate files.
- **Mirror at milestones** (lock-in, integrate, pack-up), then commit + push — the Gitea recovery net (adr-018).
- The tracker DB has **one door**: read/write it through the Ottomate API, never a second SQLite client on a live DB.

## Deploy

Internal deploy is `mapsofbharat.vault7a.xyz` (Cloudflare Tunnel). The public `mapsofbharat.in` domain goes live only at the Phase 3 go-live gate. Deploy stamps the commit into `/api/health` (`GIT_SHA`/`GIT_DIRTY` build args).
