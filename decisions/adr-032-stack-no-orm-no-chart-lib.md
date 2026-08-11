# No ORM and no chart library: the stack the code actually has

**Status:** accepted · **Date:** 2026-08-11 · **Curated:** yes · **Category:** cat:system
**Supersedes:** [adr-007](../DECISIONS.md) (tech stack) — its recorded stack named Recharts and drizzle, neither of which the code has ever imported
**Related:** iteration #149 item 942, to-do #491 · [adr-008](../DECISIONS.md) (component strategy)

## Context

adr-007 recorded the stack at Stage 2 as *"Next.js (App Router) + TS; Tailwind v4 +
shadcn/ui; MapLibre GL; Recharts + d3-scale-chromatic; better-sqlite3 + drizzle;
Python ingestion"*. It was a plan, written before the code existed.

Four of those packages were installed and then never used. Measured 2026-08-11:
`drizzle-orm`, `drizzle-kit`, `recharts` and `zustand` had **zero imports** across
`app/`, `lib/`, `components/` and `pipeline/`. They had been carried in
`package.json` for roughly two months, downloaded on every `npm ci`, and resolved
into every Docker build layer.

The gap mattered more than the disk space. `ARCHITECTURE.md` is generated from
what the repo *is*, but the ADR index is what a reader consults for what the
project *decided* — and it named an ORM the project does not use. A stack
description that is wrong is worse than absent: it sends the next contributor
looking for a schema layer that was never written.

## Decision

Record the stack as the code actually has it, and supersede adr-007 rather than
edit it — adr-007 was a true statement of intent in June, and rewriting it would
erase the fact that the intent changed.

**Data access: raw `better-sqlite3`, no ORM.** The store is opened `readonly` with
`query_only`, and every query is a hand-written prepared statement (`lib/db.ts`).
An ORM earns its keep on schemas that migrate and on writes that need a unit of
work; this schema has six tables, is rebuilt wholesale by the Python pipeline, and
the app never writes to it. Drizzle would have added a migration story to a
database with no migrations and a query builder over SQL that is already the
clearest expression of what is wanted — `RANK() OVER (...)` for the ranking rail
is not improved by being generated.

**Visualisation: bespoke on MapLibre GL + d3-scale-chromatic, no chart library.**
The choropleth is the product. It is a MapLibre style with **no basemap and no
tile host** — all geometry is local GeoJSON — driven by feature-state and class
breaks the project computes itself (adr-025). Recharts renders charts into a
component; it cannot render *this*. And there is no second surface for it to
serve: measured, the app ships **no chart component at all** — the ways a number
is shown are the choropleth, the ranking rail, the region panel and a semantic
`<table>` (`components/atlas/data-table.tsx`). The only SVG authored by hand is
iconography. A chart library here would have been a dependency used for nothing,
which is exactly what it became.

**State: React state, mirror refs and the URL, no store.** Map click handlers are
registered once, so the codebase keeps a deliberate discipline of mirroring state
into refs for handlers to read (`selectedRef`, `compareRef`, `selRef`), while the
shareable state — metric, mode, drill, comparison pins — lives in the URL query,
because a view you cannot link to is a view you cannot cite. Zustand would sit
between those two mechanisms without replacing either.

**Kept and used:** Next.js 15 (App Router, `output: "standalone"`), React 19,
TypeScript strict, Tailwind v4, MapLibre GL, d3-scale-chromatic, better-sqlite3,
and the Python ingest pipeline.

## Consequences

- Four packages removed from `package.json`; `npm ci` and every image layer get
  smaller, and the dependency surface that has to be audited shrinks by four.
- adr-007 is marked `superseded_by` this decision. Its row stays in `DECISIONS.md`
  — supersede, don't delete — so the record still shows what was planned.
- The claim in `ARCHITECTURE.md` §10 that `CODING_GUIDELINES.md` also described
  drizzle and Recharts was **wrong**, and is corrected here: that file's Stack
  section has always named MapLibre, d3-scale-chromatic and better-sqlite3
  correctly. Only adr-007 carried the stale description.
- If a future vertical genuinely needs a chart library or a client store, this
  decision does not forbid it — it records that as of today nothing did, and that
  installing one "for later" cost two months of misleading documentation.
