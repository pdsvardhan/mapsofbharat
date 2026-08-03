# 762 social-card — ROUND 2 spec (owner pick, 2026-08-03)

Owner picked **A (Hero Number = preset `v3`)** from round 1, with modifications. Round 2 = build this one composition and show a render for approval.

## Owner's exact words
> "A - but move the national number above andaman and the two tables side by side to right of jammu and kashmir and top of bihar/nepal"

## Translation into the renderer (`design/762-social-card-round1/social-export.variants.ts`, `LAYOUTS`)
Start from **v3 (Hero Number)** and change two things — it becomes v3's hero anchor + v2's tables-abreast-in-Tibet:

1. **National number (anchor) → the Bay, above the Andamans.**
   - `anchor.place`: `"tibet"` → **`"bay"`** (keep `value: 110, boxed: false` = the 110px hero numeral).
   - It must sit in the UPPER part of the Bay void so it doesn't collide with the Andaman & Nicobar island inset (which the void allocator places from the BOTTOM of the bay — see `voidBox`/"island insets from the bottom" note ~line 825). Claim height from the top of the bay.
2. **Two rank tables → side-by-side in the Tibet band** (the wide top void, right of J&K, over Bihar/Nepal).
   - `tables`: `hi: "tibet", lo: "tibet", layout: "side"` (like **v2**), style ~`T({ w: 240, rows: 5 })`. (v3 had them stacked in the bay — that space is now the hero number.)
3. Keep v3's kicker headline (`34px`), `sub.show: true`. Legend: v3 used `"arabian"` vertical stack — keep, or move `"under"` if the Arabian is needed; decide on render.
4. Watch collisions: hero (bay-top) + Andaman inset (bay-bottom); tables-abreast need Tibet width (~500px+, fine); legend in Arabian.

## How to build + render (verified working this session)
- Add a new `LayoutId` (e.g. `"v7"`) to the union type + a `LAYOUTS.v7` entry with the config above. (Or repurpose an unused preset.)
- Render: `cd /mnt/storage/websites/mapsofbharat && node design/762-social-card-round1/render.mjs` — it bundles the variants via esbuild, drives a real Chromium against the running app (`ORIGIN=http://127.0.0.1:8610`, so real fonts/geojson/`/api/metrics`), writes `vN-district.png` / `vN-state.png` to `/tmp/mob-design/round1/`. Pass a preset id arg to render just one.
- NOTE: render.mjs imports the variants from `/tmp/mob-design/round1/social-export.variants` (OUT dir), not the repo copy — keep the two in sync (copy the edited file into OUT before rendering), or fix the import.
- scp the PNG local + show the owner for round-2 approval (mixing still allowed). On approval, WIRE the chosen layout into production `lib/social-export.ts` as a proper Stage-4 item (component-pick skip per adr-008 + design-taste already satisfied → build → BOTH verifiers → deploy). Also: the pack-up flagged "add a poster-export archetype to component-anatomy.json" (doctrine rule 40 blocked the 762 ledger write in iter-26) before recording 762 as a design decision.

## Round-1 preset → composition map (for reference)
A = Hero Number = `v3` · B = Four Quarters = `v6` · C = Ocean Ledger = `v1` · (v0 baseline/shipped, v2 Sky Ledger, v4 Left Rail, v5 Edge to Edge).
Round-1 renders were at `/tmp/mob-design/round1/v{0..6}-{district,state}.png`; the 3 curated PNGs were copied to this session's scratchpad `762-cards/` (A_Hero-Number / B_Four-Quarters / C_Ocean-Ledger).
