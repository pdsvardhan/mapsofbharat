# MapsOfBharat — Coding Guidelines

Conventions for contributing to MapsOfBharat. Required by the Ottomate Stage 2→3
gate; kept short and enforced by CI (`.gitea/workflows/ci.yml`).

## Stack

- **Next.js 15** (App Router, `output: "standalone"`), **React 19**, **TypeScript** (strict).
- **MapLibre GL** for the map; **d3-scale-chromatic** for colour ramps.
- **better-sqlite3** read-only against the canonical store (`lib/db.ts`).
- **Tailwind v4** with the Observatory token set in `app/globals.css`.
- Data **pipeline** in Python under `pipeline/`.

## Data access

- The app is **read-only** over `data/mapsofbharat.db`. Never write to it from the app.
- All DB reads go through `lib/db()`, which returns `null` when the DB isn't
  present — **always handle the null case** (return empty/404), so builds and
  CI work without the data volume.
- The canonical join key is `rid = "<st_code>_<dt_code>"`. Keep API
  `region_code` values and the geojson `rid` property in lockstep.
- API routes that read data are `runtime = "nodejs"` + `dynamic = "force-dynamic"`.

## Frontend

- The map lives in `components/india-map.tsx` (client component, dynamically
  imported with `ssr: false`).
- Heavy/stateful values that map event handlers read live in refs
  (`valuesRef`, `rankRef`, `viewRef`, …); React state drives rendering. Don't
  read React state inside long-lived MapLibre handlers — use the mirror ref.
- Metric list loads independently of the map (do not couple data fetches to
  `map.on("load")`); colouring waits on both `ready` and a selected metric.
- Shareable state is encoded in the URL query (`m, mode, st, stn, cmp`) and kept
  in sync via `history.replaceState`. Extend that schema rather than adding
  parallel state stores.

## Accessibility

- Every icon-only / short-label control needs an `aria-label`.
- Toggle buttons expose `aria-pressed`.
- Map colour ramps must stay colour-vision-safe (viridis / RdBu diverging).
  A full keyboard + screen-reader audit is tracked as risk #57.

## Sources & trust (product invariant)

- Official / government or top-tier sources **only**; no private/paywalled data
  as source of truth (ADR-005).
- Every metric must carry `source`, `source_url`, and `year`; surface them in
  any view that shows a value.

## Errors & ops

- Uncaught client errors flow to the self-hosted sink at `/api/log`
  (`components/client-error-reporter.tsx`); no third-party trackers.
- `/api/*` is rate-limited in `middleware.ts` (per-instance); a second layer
  lives at the proxy once the public URL exists.
- Back up the DB with `scripts/backup-db.sh`; re-validate with
  `scripts/validate-and-notify.sh` (cron).

## Workflow

- Write code locally, **SCP to the server** — never paste code through an SSH
  heredoc (it corrupts files).
- **One commit per iteration item.** Each locked Ottomate item lands as its own
  commit, message prefixed `iter-<N> item <id>:`, so per-item attribution and
  verifier scoping stay clean even when two iterations share a session
  (to-do 252: iter-93's "removal only" item rode in an iter-91 bundle commit).
  Cross-item mechanical changes (lockfile, generated mirrors) ride with the
  item that caused them; iteration-log/bookkeeping edits may share a final
  housekeeping commit.
- `git add -A && git commit && git push` **before** `docker compose up --build`.
- CI must pass: `npm run lint`, `npm run typecheck`, `npm run build`, and
  `pytest pipeline/test_pipeline.py`.
- Smoke tests (`npm run test:e2e`) run against a live instance; set `BASE_URL`.
