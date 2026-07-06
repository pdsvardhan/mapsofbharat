---
public: true
type: technical-deep-dive
title: One canonical database, one join key
order: 2
summary: How a Python ingestion pipeline and a read-only SQLite store feed a MapLibre choropleth engine.
read_minutes: 4
---

# Technical deep-dive — MapsOfBharat

## Stack

Next.js 15 (App Router, standalone output) · React 19 · TypeScript strict · MapLibre GL for the map · d3-scale-chromatic for color ramps · better-sqlite3 read-only over the canonical store · Tailwind v4 with the Observatory token set · Python ingestion pipeline under `pipeline/`.

## The one-door data rule

The app is **read-only** over `data/mapsofbharat.db`. Nothing in the web app ever writes to it — all writes happen in the Python pipeline, offline. Every DB read goes through a single `lib/db()` door that returns `null` when the volume isn't mounted, so builds and CI pass without the data.

## The join key that makes it work

Indian districts change names, split, and merge. Every dataset is harmonized to a canonical region id — `rid = "<st_code>_<dt_code>"` — via an LGD/Census-2011 crosswalk. API `region_code` values and the GeoJSON `rid` property are kept in lockstep; if a source can't be mapped to the crosswalk, it doesn't ship.

## The pipeline

Per-source Python ingesters (`ingest_census_a01.py`, `ingest_adsi.py`, `ingest_cea.py`, `ingest_ec13.py`, …) pull from official portals — including the MoSPI eSankhyiki / data.gov.in API (key-authenticated) — normalize to the `rid` key via `add_rid.py`, and validate against `expectations.json` before anything reaches the canonical DB.

## The map

`components/india-map.tsx` — a client component, dynamically imported with `ssr: false`. Long-lived MapLibre event handlers never read React state directly; hot values live in mirror refs (`valuesRef`, `rankRef`, `viewRef`) while React state drives rendering. Boundaries are Survey-of-India compliant.

## Deployment

Docker on VAULT7A (`:8610` local). Public traffic arrives via Cloudflare Tunnel directly to the container; LAN traffic goes through the reverse proxy. Gitea Actions CI runs the canonical quality gates.
