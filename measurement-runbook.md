# Measurement runbook

How MapsOfBharat is measured after launch: what each tool is for, how often the
numbers are looked at, what would make a decision, and how long the data is kept.
As of 2026-08-11. Source: the `MSR-*` rows of
`planning/2026-08-05/MoB-master-backlog.csv`.

This file records the decisions that are **not** code. The instrumentation itself
lives in `lib/analytics.ts` and the components that call it; the privacy
commitments this runbook has to honour are published on `/privacy`.

---

## 1. Two tools, two jobs (MSR-05)

**Umami measures behaviour. Cloudflare is the denominator.** Neither answers the
other's question, and reading either alone produces a wrong conclusion.

| | Umami | Cloudflare dashboard |
|---|---|---|
| Where | self-hosted on the same box, served first-party through the site's own `/stats` path | the edge in front of the tunnel; no script on the page |
| Answers | what a visitor *did* — which metric, which drill, which export, which search failed | how much traffic there was — volume, cache hit ratio, origin load, country, bot vs human |
| Blind to | anyone who blocks the script, and anything served from cache without executing it | everything that happens inside the page |

Two consequences follow, and both matter more than they sound:

- **A behaviour rate needs a denominator that is not itself behavioural.** Caching
  makes origin request logs a small and biased sample, which is why the events are
  client-side at all. Any rate quoted as "% of visitors" is a rate over sessions
  Umami saw, and that population is smaller than the population Cloudflare counted.
- **Filter on bot score before drawing any conclusion.** Early traffic to a new
  public domain is mostly crawlers and scanners. An unfiltered Cloudflare number
  will show a launch that did not happen. Expect bots first; discount them
  explicitly rather than mentally.

## 2. The event vocabulary

Twelve events, and no thirteenth without a reason written down:

`metric_selected` · `search_performed` · `search_no_results` · `drill_in` ·
`region_opened` · `compare_used` · `viz_customised` · `card_exported` ·
`permalink_copied` · `embed_copied` · `embed_loaded` · `methodology_viewed`

These snake_case names are the canonical ones and are what every number below is
defined against; the instrumentation carries them as of iteration 37. Two derived
rates are used throughout:

- **Activation rate** — share of sessions that fire `metric_selected`. A visitor
  who never picks a statistic never saw the product.
- **Export rate** — share of sessions that fire `card_exported`.

`search_no_results` is the single most valuable event in the set: it is unmet
demand, stated by a reader in their own words, and it is the input to the data
roadmap. It is treated as evidence, not as an error count.

Analytics are cookieless and carry no personal data — no accounts, no raw IP
addresses, no third-party tracker (adr-029). Nothing in this runbook requires
identifying anybody, and no measurement need is a reason to start.

## 3. Review cadence (MSR-06)

A measurement plan that needs more attention than this will not be run at all by
one person with a full-time job. Two reviews, both timeboxed:

**Weekly — 5 minutes.**

1. Activation rate.
2. Card exports.
3. Top 5 failed searches (`search_no_results`).

**Monthly — 30 minutes.**

1. Metric popularity, top 20 and bottom 20 — what is being read, and what has
   never been opened.
2. Referrers — where readers arrive from.
3. `embed_loaded` broken down by domain — the only evidence of off-site reach.
4. Drill rate (`drill_in`) and compare rate (`compare_used`).
5. Cache hit ratio and origin load, from Cloudflare.

The timebox is part of the decision. If a review starts overrunning, the fix is to
cut a line from it, not to schedule more time.

## 4. Four weeks of baseline before any threshold is fixed (MSR-07)

**The triggers in section 5 are provisional.** They are starting guesses, written
down before launch specifically so they cannot be invented afterwards to justify
whatever the numbers turned out to be — but they are not yet thresholds.

Four weeks of baseline data are collected first. At the end of week four each
number below is either confirmed against what the site actually does or replaced,
and the replacement is recorded here with its date. Until that pass happens, a
provisional trigger firing is a reason to look, not a reason to act.

## 5. Decision triggers (MSR-10, provisional until the baseline lands)

| Trigger | What it would mean |
|---|---|
| Activation rate **< 60%** | Visitors arrive and never pick a statistic. The entry experience, not the data, is the problem. |
| Export rate **< 5% of sessions** | The card export is not the distribution engine it was built to be. |
| **One platform > 80% of referrers** | Distribution is concentrated on a single channel, and the site's reach is that channel's to withdraw. |
| **Clustered failed searches** — the same missing thing asked repeatedly | A named data gap with demand attached. This is a roadmap input, and the strongest one available. |
| **`embed_loaded` from third-party domains** | Someone else has put the map on their page. This is the off-site reach signal, and it changes what is worth building next. |

Each is a trigger to *decide*, not an automatic action. The response is written
down when it fires, so the reasoning survives.

## 6. Week-one success criteria (MSR-11)

Week one is judged on **learning signals, not traffic numbers**. Traffic in week
one is a function of whoever happened to see a post; treating it as a verdict is
how a project panics into a pivot in week two. Week one succeeded if all of these
hold:

- The site stayed up.
- Activation rate above 60%.
- Nothing surfaced that the private test should have caught.
- At least three distinct failed searches were logged.
- At least one person who is not a friend used it unprompted.
- No public boundary error and no public data error.

Anything not on this list — visitor counts, follower counts, engagement on a post
— is not part of the week-one judgement.

## 7. Retention (MSR-09)

**Analytics data is retained for 12 months. After that, only aggregate,
non-identifying totals are kept.**

This is the decision, and it is already published on `/privacy`, so it is a
commitment to readers rather than an internal preference. The retention window is
what makes year-over-year comparison possible at all; the aggregate-only tail is
what keeps a growing pile of behavioural detail from accumulating for no stated
purpose.

## 8. Where the numbers live

- **Umami dashboard** — bound to loopback on the box (`127.0.0.1:8620`), reachable
  over an SSH tunnel. It is not exposed publicly; only `/stats/script.js` and
  `/stats/api/send` are, and those are the tracker, not the dashboard.
- **Cloudflare dashboard** — the account fronting the tunnel described in
  [`ARCHITECTURE.md`](ARCHITECTURE.md) § Deployment.
- **Server-side error signal**, separate from all of the above: client errors post
  to `/api/log` and land in the container's stdout and the file sink. An error
  spike is an operational signal, not a measurement one, and does not wait for the
  weekly review.
