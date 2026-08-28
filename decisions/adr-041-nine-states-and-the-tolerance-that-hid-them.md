# Nine states drew nothing, and the tolerance we added to be safe is what hid it

**Status:** accepted · **Date:** 2026-08-28 · **Curated:** yes · **Category:** cat:reliability
**Related:** [adr-040](adr-040-absence-is-a-texture.md) (the verification pass that found this) · `components/india-map.tsx` · iteration 162 item 1091 · escalated into iteration 160's session by owner decision

## Context

While verifying an unrelated legend change in iteration 160, a probe measured how many
district polygons survive the drill filter. Maharashtra passed 35. Uttar Pradesh passed
**zero**. So did Jammu & Kashmir.

`applyFocus` built its MapLibre filter as `String(Number(code))`, which turns `"09"`
into `"9"`. The geojson stores `st_code` zero-padded — the distinct values are `01`
through `35`. For the nine states coded `01`–`09` the filter matched nothing, and
drilling into them rendered an empty map. Those nine are Jammu & Kashmir, Himachal,
Punjab, Chandigarh, Uttarakhand, Haryana, Delhi, Rajasthan and Uttar Pradesh — the last
being the most populous state in India.

It was live. The same line sits in the deployed commit.

## Why it survived this long

Two safeguards, each sensible alone, combined into a blindfold.

**`scopeCodes()` already tolerated both forms.** Somebody had met this padding mismatch
before and handled it — at the rail, the legend and the region counts. So on a broken
drill the surrounding chrome stayed *correct*: the right state name, the right district
count, the right metric summary. Only the polygons were missing. A screenshot looks
like a rendering hiccup, not a filter that matched nothing.

**Every drill spec used a high-numbered state.** Maharashtra (27), Karnataka (29). The
suite exercised the drill path constantly and never once crossed the boundary where it
breaks. 530 green tests, and not one of them could see this.

There is a comment at `components/india-map.tsx:875` reading *"Key on the RAW
zero-padded st_code, not String(Number(...))"*. The class of bug was known. It was
fixed at that call site and missed at the other.

## Decision

**Fix it now, inside this session, rather than deferring to the next iteration** —
and fix it by removing the ambiguity rather than adding a third tolerance.

Tolerating both forms at yet another layer would make the symptom go away and leave
the next call site exactly as easy to get wrong. The comparison should not be able to
care about padding at all.

## Why it was escalated rather than filed

Deferring would have been the tidier process answer. It was rejected because the defect
is live on a public site, it silently removes nine states including the largest, and
the project's stated must-have is that the map does not mislead. A blank map is not a
degraded reading of the data; it is the absence of one, presented with a correct-looking
rail beside it.

## How the escalation was routed

Iteration 160 was already locked, and the API refused to accept a new item into it —
correctly. Lock-before-build exists so that what gets built is what was agreed, and
quietly widening a locked iteration is precisely the drift it prevents. The bug went
through normal intake instead: report 177, classified into **iteration 162, item 1091**,
locked before the fix landed.

Recorded here because the work happened in iteration 160's session and a later reader
will otherwise find a commit that belongs to no locked item of the iteration it sits in.

## Consequences

- Drill coverage now exercises a low-numbered state, so the boundary that hid this is
  inside the suite rather than outside it.
- **The padded/unpadded tolerance was removed**, not kept. An earlier draft of this
  record said it would stay on as redundancy; that contradicted the decision above and
  was wrong. With `applyFocus` canonicalising its argument and `focusRef` written in
  exactly two places, the unpadded arm provably cannot fire — and a branch that cannot
  fire is a comment claiming a safety net, which is the precise thing that spent a
  release keeping the chrome correct over a blank map. The one boundary a stray
  spelling can still enter — a hand-typed or legacy `?st=9` link — is canonicalised in
  `applyFocus` and asserted by a test.
- A second defect of the same root surfaced while fixing this: the Ctrl-K search handed
  the map `String(Number(code))` as a **feature id**, and both state sources are
  `promoteId`'d on the padded `st_code`. Searching for any of the nine states selected a
  feature that does not exist, leaving it unpainted and the profile reading "No data for
  this region" about a state that has data. Same cause, different surface, found only
  because the sweep looked past the one line that was reported.
- Worth carrying forward: a tolerance added at one layer to "be safe" can hide a defect
  at another, and the safer-looking codebase is the one where the ambiguity was removed
  instead of absorbed.
