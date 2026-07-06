# MapsOfBharat

Map-first statistics & data visualization for India. Pick an official statistic — literacy, population density, crime rate, voter turnout, and more — and explore it as an interactive choropleth that drills **India → state → district**, with linked charts, rankings, side-by-side comparison (region / year / metric), citations on every number, and one-click export.

Live at **https://mapsofbharat.vault7a.xyz** · tracked by [Ottomate](https://ottomate.vault7a.xyz/projects/mapsofbharat).

## Why

Reliable India statistics are scattered across government portals, locked in PDFs, or paywalled — and almost never on a map. MapsOfBharat harmonizes official data to one canonical region key and renders it the way it should be explored.

## Stack

- **Next.js 15** (App Router, `output: "standalone"`) · React 19 · TypeScript strict
- **MapLibre GL** map · **d3-scale-chromatic** ramps · Tailwind v4 (Observatory tokens)
- **better-sqlite3, read-only** over the canonical store `data/mapsofbharat.db`
- **Python pipeline** under `pipeline/` — the only thing that ever writes data

## Data rules (the short version)

- App is read-only; all writes happen offline in the pipeline.
- Canonical join key: `rid = "<st_code>_<dt_code>"` (LGD/Census-2011 crosswalk). Unmappable rows are rejected.
- Every dataset validates against `pipeline/expectations.json` before entering the DB.
- Official sources only: Census 2011, MoSPI eSankhyiki (data.gov.in, key in `.env` as `DATA_GOV_IN_API_KEY`), NCRB/ADSI, CEA, EC-13, Survey-of-India-compliant boundaries.

## Run

```bash
npm install
npm run dev          # app without data works (lib/db() returns null-safe empties)
# with data: mount/copy data/mapsofbharat.db, then
docker compose up -d --build   # :8610
```

## Routes

`/` (the map) · `/explore` · `/methodology` (sources & method, in-app) · `/embed` (embeddable views)

## Docs & decisions

- `CODING_GUIDELINES.md` — conventions enforced by CI
- `decisions/` — dated decision records (boundaries, pipeline, Atlas UI overhaul, …)
- `public_docs/` — narrative docs mirrored to the Ottomate showcase
- `iteration-log.md` — session-by-session build history
