# The component-pick gate applies to new components, not to fixes on existing ones

**Status:** accepted · **Date:** 2026-08-09 · **Curated:** yes
**Related:** iteration #35 items #911/#915/#917, report 154 (visual-QA batch, 2026-08-04), iteration #112 items #752–#755 (blocked on this gate since 2026-07-26), to-do #432

## Context

The Ottomate Stage-4 pipeline routes every item classified as `component_modification` through a **component-pick gate**: before any code, 2–3 candidates are fetched from the shared `master_components` library and the owner picks one. The gate exists for a real failure it prevents — a component invented in place of one the library already offers, chosen by nobody.

Iteration #112 has sat at `building` since 26 July with four items (#752–#755) waiting on exactly this gate. None of them has been built. The gate is not free: it costs an owner decision per item, and an item nobody gets round to deciding is an item that never ships.

Iteration #35 raised the question again. Three of its locked items are `component_modification` by classification:

- **#911** — the "Browse all metrics" link is small and easily missed
- **#915** — the "ALL INDICATORS" disclosure reads as a caption, not a control
- **#917** — the clear-selection ✕ is too faint to find

Each names an element that already exists, already has a chosen treatment, and is wrong on a measurable axis. Measured against the panel ground, `--dim` scores **3.17:1** and `--accent` **4.35:1**, both under the 4.5:1 WCAG AA floor for text; the ✕ presented a bare 12px hit target. Nothing here is a choice between components. Sending them to a library picker asks the owner to choose a replacement for a component that is not being replaced.

## Decision

**The component-pick gate fires when a component is being introduced or swapped. It does not fire when an existing, already-picked component is corrected on a measurable property** — contrast, hit area, type size, alignment, spacing, or a missing ARIA attribute.

The test is whether the item could be satisfied by picking a different component from the library. If it could, the gate applies. If the only sensible outcome is "the component that is already there, corrected", it does not.

Two guards keep this from becoming a loophole:

1. **A corrective fix states its measurement.** Each of #911, #915 and #917 records the before and after contrast ratio or target size in the code comment at the change. A fix with no number attached is a restyle, and a restyle is a pick.
2. **Anything that changes what a component *is* — its structure, its interaction model, its layout role — remains gated.** #752–#755 stay gated on that basis: "metric rows become poster cards" is a different component, not a corrected one.

## Consequences

- Iteration #35's three corrective items build without an owner decision each, and ship in the session they were raised in.
- Iteration #112's four items stay blocked, correctly — they are genuine picks, now recorded as to-do #432 rather than sitting invisible inside a stalled iteration.
- The waiver is auditable: this ADR is the explicit override the skill's bedrock requires, rather than a classification quietly relabelled to dodge a gate. The three items were classified `component_modification` honestly and then exempted in the open.
- Accessibility fixes stop being gated behind a design decision. A contrast failure is a defect with a correct answer, and the picker has no opinion about it.
- Risk accepted: "measurable property" is a judgement at the margins. The stated test — could a different library component satisfy this? — is the tie-breaker, and a genuine tie resolves toward gating.
