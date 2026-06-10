# MapsOfBharat — Iteration Log

## 2026-06-10 — Stage 3 completion

Built feat-region-detail, feat-export-share, feat-find-my-district. Resolved 7
open risks (tests, CI, error-tracking, backup, rate-limit, page-load, data-drift);
accepted/deferred a11y (#57). Added CODING_GUIDELINES, Gitea CI, Playwright + pytest
suites, /api/log sink, rate-limit middleware, geo cache headers, backup + drift scripts.
Decoupled metric fetch from map load; added pipeline/README.

Deploy: rebound container to 127.0.0.1:8610 (freed host 8601, resolved tg-ingest
collision); NPM proxy host #44 + CF DNS CNAME → https://mapsofbharat.vault7a.xyz live
on LAN. Public tunnel ingress pending cloudflared go-ahead.

Verification: tsc clean, 7/7 pipeline tests pass, next build OK, independent
verifier APPROVE. Commit fc507ba + docker-compose port rebind.

