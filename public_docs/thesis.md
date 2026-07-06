---
public: true
type: thesis
title: Project Thesis — MapsOfBharat
order: 1
summary: Why official Indian statistics deserve a map-first home — cited, comparable, and free of paywalls.
read_minutes: 3
---

# MapsOfBharat — Project Thesis

## The problem

Reliable India statistics are scattered across government portals — Census, NCRB, MoSPI, ECI, ministry dashboards — often locked in PDFs or behind paywalled aggregators, rarely comparable across regions or years, and almost never shown on a map. Non-experts cannot explore them, and even experts spend hours wrangling spreadsheets and reconciling district boundaries that change over time.

## The answer

A map-first data-visualization platform: pick an official statistic — literacy, population density, crime rate, voter turnout, and more — and see it as an interactive choropleth that drills India → state → district, with linked charts, rankings, and side-by-side comparison across regions, years, or metrics.

## The rules the platform holds itself to

- **Official or top-tier sources only** — no opaque private datasets.
- **Every metric cited** with source, year, and methodology.
- **Survey of India compliant boundaries** — J&K, Ladakh, Arunachal, Aksai Chin rendered correctly.
- **Data lives in our own canonical store** — never dependent on source-portal uptime.
- **Current-day map with an as-reported-year toggle** — no silently mixing eras.
- **Per-capita / rate normalization** — no misleading raw-count choropleths.

## Who it's for

Clarity-first for the general public; depth — compare mode, time series, export, embed — for journalists, researchers, and analysts.

## Where it stands

Live at mapsofbharat.vault7a.xyz. The ingestion wave keeps widening coverage — the latest added 11 verticals and ~23 new metrics, each landing through the same cite-and-verify pipeline.
