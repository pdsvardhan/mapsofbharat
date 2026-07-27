# MapsOfBharat -- Animated/Time-Based Dataviz: Research Brief

## Executive Summary

Build three forms, none of them animated map fills. Small-multiple grid: cheapest, best-evidenced for accuracy and mobile. Animated metric-to-metric transition (Gapminder-style re-sort): the strongest pro-animation result in the evidence, and the only "beyond choropleth" form needing zero new data. Slope chart: near-free, matches the two-point reality of most held series. Skip bar-chart races, streamgraphs, fly-throughs, and time-slider choropleths -- decorative, change-blindness-prone, or still just another map. Skip the owner's literal "general animation builder" ask too: no comparably-resourced tool has shipped one, and ~90% of the ~150-stat catalog is single-vintage, so a general builder dead-ends on first use. Ship a thin template-parameterizing builder instead. Export client-side via MediaRecorder to MP4/WebM -- server-side rendering risks OOMing the box. The blocker is data depth, not engineering.

## Q1 -- Form Taxonomy

| Form | Good For | Exemplar | Fit for Admin Data | Verdict |
|---|---|---|---|---|
| Time-slider choropleth | Metric browsing across years | [USAFacts COVID map](https://usafacts.org/visualizations/coronavirus-covid-19-spread-map/) | OK 36-state; risky 735-district | Mixed, still a map |
| Bar-chart race | Ranking-reshuffle hook | [Bar chart race: cities](https://observablehq.com/@johnburnmurdoch/bar-chart-race-the-most-populous-cities-in-the-world) | Unreadable at 735 districts | Decorative |
| Scrollytelling | Reader-paced narrative | [Snow Fall](https://www.nytimes.com/projects/2012/snow-fall/) | Strong, no time series | Mixed, mobile-dependent |
| Small-multiple grid | Compare trends at once | [MLB small multiples](https://gregstoll.com/baseballdivisionraces) | Best at 36-state | Informative |
| Connected scatterplot | Joint 2-metric trajectory | [Driving Safety](https://www.nytimes.com/interactive/2012/09/17/science/driving-safety-in-fits-and-starts.html) | Only APY (~430 districts) | Mixed |
| Slope chart | Rank shift, 2 points | [Slope chart](https://en.wikipedia.org/wiki/Slope_chart) | Matches 2-point data | Informative |
| Streamgraph | Composition over time | [Ebb and Flow of Movies](http://archive.nytimes.com/www.nytimes.com/interactive/2008/02/23/movies/20080223_REVENUE_GRAPHIC.html) | Weak, no series held | Decorative |
| Flow/particle map | Directional field, motion | [Wind Map](http://hint.fm/projects/wind/) | Weak, no OD data | Mixed, data-conditional |
| Metric-to-metric transition | Re-rank, no time series | [Gapminder Tools](https://www.gapminder.org/tools/) | Best fit, zero new data | Informative |
| Tour/fly-through | Cinematic establishing shot | [Forensic Architecture](https://en.wikipedia.org/wiki/Forensic_Architecture) | Poor, no 3rd dimension | Decorative |
| Horizon chart | Many series, small footprint | [Horizon graph](https://flowingdata.com/2015/07/02/changing-price-of-food-items-and-horizon-graphs/) | Strong match to APY | Mixed, needs onboarding |

## Q2 -- When Animation Is Wrong

- [Tversky, Morrison & Betrancourt, 2002](https://www.sciencedirect.com/science/article/abs/pii/S1071581902910177) -- animation rarely beats static graphics; wins trace to added info, not motion. Supports time-slider, fly-through, streamgraph verdicts.
- [Robertson et al., 2008](https://faculty.cc.gatech.edu/~stasko/papers/infovis08-anim.pdf) -- animation fastest/most-enjoyed but most error-prone; static small multiples most accurate. Supports small-multiple's informative verdict.
- [Fish, Goldsberry & Battersby, 2011](https://www.researchgate.net/publication/233615293_Change_Blindness_in_Animated_Choropleth_Maps_An_Empirical_Study) -- change blindness: viewers miss real value changes between animated-choropleth frames. Supports time-slider's mixed verdict.
- [Heer & Robertson, 2007](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf) -- staged ~1s transitions with object constancy improve tracking/estimation. Supports metric-to-metric transition -- strongest pro-animation result here.
- [Cotgreave and Bostock, Built In](https://builtin.com/data-science/bar-chart-races) -- bar chart races are the "fidget spinner of data viz," "entertainment not analysis." Supports ranking-race decorative verdict.
- [Brehmer et al., 2019](https://arxiv.org/abs/1907.03919) -- on phones, small multiples beat animation on trend tasks. Supports small-multiple verdict, matches mobile traffic.

## Q3 -- Data Requirements and the Boundary Problem

| Form | Viable Now? | Carrier Data |
|---|---|---|
| Ranking race / time-slider | Partial | Vehicle stock (36-state, annual); UPI (short window); APY (stale); rainfall (granularity TBD) |
| Flagship district panel (literacy/poverty/crime/health) | **No** | All 12 datasets single-vintage |
| Scrollytelling | Yes | Entire single-vintage catalog |
| Metric-to-metric transition | Yes | Entire ~150-stat catalog |
| Small multiples | Yes | Whole catalog (indicator-mode); vehicle stock/turnout/APY/rainfall (sparse-time) |
| Connected scatterplot / slope chart | Partial | Vehicle stock, turnout (2009+), APY (1997 vs. 2014), rainfall decadal |

**Boundary approach: aggregate to stable parent units (SHRUG/CDE-style), not IPUMS-style interpolation.**

- Roll finer districts up to the coarsest vintage needed, via the LGD/Census-2011 crosswalk (many-to-one sum/weighted average); never push old data onto finer districts -- that needs interpolation we can't do honestly.
- Mark aggregated units visibly (hatch + footnote); suppress non-clean splits rather than forcing a number; handle state splits (Telangana/AP 2014) with a hardcoded merge table.
- Elections: animate only post-2008 years (2009+); show the seam only as a static slope chart.

Reasoning: we hold one crosswalk, not the geometries/weighting surface true interpolation needs -- disproportionate GIS work here. Aggregation is a cacheable groupby-sum, near-zero cost -- the same choice [SHRUG](https://www.devdatalab.org/shrug) and the [CDE working paper](https://ideas.repec.org/p/cde/cdewps/248.html) made for India. APY's ~430-district vintage is coarser than held Census-2011 (~640) -- decide per product, not globally.

## Q4 -- Building on This Stack

| Technology | Bundle Cost | Smoothness @735 | Next.js/SSR Friction | Mobile | Verdict |
|---|---|---|---|---|---|
| [MapLibre transitions](https://maplibre.org/maplibre-style-spec/transition/) | Already in prod | No time expression; step `setFeatureState`+`-transition` works, per-frame loop doesn't | None | GPU-bound, "resource intensive" at small scale | Map steps only |
| [deck.gl overlay](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) | +~200-250KB gzip | Handles 735 fine | Client-only | 2nd WebGL context, constrained hardware | One flagship feature |
| [D3](https://d3js.org/what-is-d3) (SVG or Canvas target) | 92KB gzip, modular | SVG smooth to ~3K nodes; Canvas better past ~4-7K | Client-only | SVG: DOM count drives jank. Canvas: one paint per frame | SVG for stepped transitions; Canvas if continuous 60fps needed |
| [Observable Plot](https://observablehq.com/plot/getting-started) | 128KB gzip | Not for map polygons | Client-only at scale | SVG, same DOM-jank as D3 | Small-multiples companion |
| [Framer Motion](https://motion.dev/docs/react-reduce-bundle-size) | 60KB; LazyMotion ~4.6KB+ | N/A, UI chrome | `'use client'` | WAAPI-accelerated, cheap | Play/scrub controls, lean import |
| [CSS `animation-timeline`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline) | Zero JS | N/A to polygons | None, pure CSS | 82.58% support, no Firefox Android | Decorative scroll |
| [Scrollama](https://github.com/russellsamora/scrollama) | 2KB, zero deps | N/A, step callbacks only | Client wrapper | IntersectionObserver-native | Default scroll-swap choice |

## Q5 -- Performance and Accessibility Rails

**FPS mitigations** (16ms/frame @60fps, ~10ms free after browser overhead):

- Step-based `setFeatureState`+`-transition` per tick, never a per-frame `setPaintProperty` loop (naive updates hit 30-50 renders/sec from 1/sec unthrottled); simplify geometry at low zoom; throttle to 15-30Hz where 60fps isn't perceptible.
- Offload heavy computation to a Web Worker/OffscreenCanvas; cap simultaneous animated layers (don't stack MapLibre + deck.gl + Motion at once); test on real mid-range hardware (Galaxy A15/A54-class, 4-9x slower than dev machines).

**prefers-reduced-motion**: a technique ([W3C C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)) satisfying SC 2.2.2/2.3.3 below. Detect `reduce`, replace motion with an instant state change. Essential motion needs a non-motion equivalent, not deletion.

| Criterion | Level | Requirement |
|---|---|---|
| [2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) | A | Off/10x-extend/warn-extend for auto-advancing timelines |
| [2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | A | Pause/stop/hide for auto-updating content >5s |
| [2.3.1 Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG20/Understanding/three-flashes-or-below-threshold) | A | No >3 flashes/sec above luminance threshold |
| [2.3.2 Three Flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html) | AAA | Stricter -- no >3 flashes/sec at all, any size |
| [2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | AAA | Disable-able; `prefers-reduced-motion` is the sufficient technique |
| [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | AA | Current value determinable via `aria-live` |

**Keyboard/screen-reader equivalent**: a synchronized data table (district/state by year) as primary, using the existing drill structure; static small multiples (5-6 snapshots) as secondary. Controls must be real, focusable, arrow-key-operable. Values update inside `aria-live="polite"` (SC 4.1.3) -- 735 unlabeled paths can't be enumerated by a screen reader, so the region is the announcement surface.

**Static fallback per form**: map animation freezes; a keyboard dropdown/slider jumps years. Scrollytelling: each step's end-state stands alone. Flow/3D: static arrow map or ranked table. PNG social card: already static. CSS scroll effects: gate behind `@media (prefers-reduced-motion: no-preference)`.

## Q6 -- Export to GIF/MP4/WebM

**Verdict**: client-side capture (`MediaRecorder`+`canvas.captureStream()`), never server-side rendering. MP4 (H.264) default, WebM fallback. A modern GIF encoder as a secondary embed-only export.

The 4-CPU/2GB/no-GPU ceiling rules out server-side rendering entirely: no GPU means WebGL falls back to SwiftShader software rasterization -- [~24s per complex frame](https://microlink.io/blog/webgl-without-a-gpu); Mesa llvmpipe cuts that to ~6s isolated, only ~2x under shared load. A single headless-Chrome instance can consume 2GB alone -- this container's entire budget -- before anything else runs; one export could OOM-kill the container.

Client-side `MediaRecorder` costs the server nothing (~95% browser support, uses the visitor's own hardware encoder). [ffmpeg.wasm](https://ffmpegwasm.netlify.app/docs/performance/) is a poor client-side fit -- 0.04x native speed, ~4.8MB payload; its own FAQ admits multithread's 2x gain costs much more memory/CPU, bad on 2-4GB phones. The [WebGL capture blank-frame bug](https://bugs.webkit.org/show_bug.cgi?id=170325) is resolved everywhere, but don't force `preserveDrawingBuffer` globally on the live map -- instead `drawImage()` the MapLibre canvas into the existing PNG-export 2D canvas, and capture that.

MP4 wins because it's the container WhatsApp, Instagram, and X want; GIF loses on quality and platform fit (X transcodes uploaded GIFs to silent MP4 anyway). Keep [gifenc](https://github.com/mattdesl/gifenc)-class encoding only as a secondary embed export.

## Q7 -- Builder Tool Verdict

| Tool | Animation Capability |
|---|---|
| [Flourish](https://flourish.studio/) | Bar/Line Chart Race + date-slider built in; self-host export paid-tier only |
| [Datawrapper](https://www.datawrapper.de/) | No native animated playback; manual PNG-stitch workaround |
| [RAWGraphs](https://www.rawgraphs.io/) | Open source, ~30 templates, no animation |
| [Observable Plot](https://observablehq.com/plot/) | No built-in animation -- "no mechanism (yet!)" |
| [Gapminder Tools](https://www.gapminder.org/tools/) | Animates only its own curated data, no visitor upload |
| [Vega-Lite](https://github.com/vega/vega-lite/issues/4060) / [Animated Vega-Lite (MIT)](https://vis.csail.mit.edu/pubs/animated-vega-lite/) | No native animation channel; MIT's proposal is unshipped |
| [racing-bars](https://github.com/hatemhosny/racing-bars) | MIT, ~45KB gzip, vendorable, maintained |
| [Google Data GIF Maker](https://datagifmaker.withgoogle.com/) | 5 values, 4 templates, GIF only -- best "minimal" case |

**Verdict: minimal version, not the literal ask.** A general "any metric, any animation" builder is a skip as stated -- not even Flourish, Datawrapper, or Vega-Lite has shipped one (table above). The bigger blocker is data: only a handful of ~150 stats are genuine multi-year panels, so a general builder dead-ends for most of the catalog. The real infra risk is client-side export on mid-range Android (Q6), not server load.

**Minimum credible version**: 2-3 fixed templates (bar race, line race, maybe state trajectory) wired to the qualifying series -- vehicle stock, turnout, APY, rainfall if subdivision-level, RBI/GST if confirmed. "Building" means picking entities/metric/template/speed/palette, not authoring keyframes. Reuse [racing-bars](https://github.com/hatemhosny/racing-bars) for the bar-race template; hand-roll a Scrubber timeline for MapLibre playback, gated per series on a data check (min. time points/entity coverage). Export PNG first via the existing pipeline, WebM after mobile testing, GIF as a stretch goal.

## Recommended Plan

**1. Small-multiple time/indicator grid** -- effort: small (2-4 days). Stack: [Observable Plot](https://observablehq.com/plot/getting-started) for chart grids; reuse existing Canvas 2D/MapLibre rendering for map-snapshot grids. Data: entire ~150-stat catalog (indicator-mode); vehicle stock/turnout/APY/rainfall (sparse-time). Fallback: none needed, already static; pair with a data table. Holdings: yes.

**2. Animated metric-to-metric transition** (Gapminder-style re-sort) -- effort: medium (1-2 weeks). Stack: D3 + SVG (735 nodes within the ~3,000-node smooth zone), ~1s staged transitions per Heer & Robertson; Framer Motion for the play/picker UI. Data: any two of the ~150 single-vintage stats, same geography -- e.g. literacy rank to MPI poverty rank. Fallback: instant swap under `prefers-reduced-motion`; keyboard metric-picker; `aria-live` announcement. Holdings: yes -- best-fitting form, the real "beyond choropleth" answer.

**3. Slope chart** -- effort: small (2-3 days). Stack: D3 + SVG, 36-72 nodes at state level. Data: vehicle stock (2001 vs. latest), turnout (2009 vs. latest). Don't build a Census-2001-vs-2011 version -- stated holdings confirm only Census 2011. Fallback: already static; add labels plus a paired table. Holdings: partial.

## Not Doing

- **Bar-chart/ranking race** -- decorative; only vehicle stock/turnout have annual depth, general-audience metrics are single-vintage.
- **Time-slider choropleth** -- still a map form with documented change blindness (Q2); boundary seam breaks continuity at district level.
- **Streamgraph and tour/fly-through** -- both decorative: no part-to-whole series held, and a flat choropleth has no 3rd dimension to fly through; gimmicks, not analysis.
- **Flow/particle map** -- no origin-destination data held.
- **Connected scatterplot and horizon chart** -- both blocked: their only carrier (APY) sits on an unresolved vintage with no crosswalk; horizon is also audience-mismatched for general-public clarity.
- **Scrollytelling at launch** -- good fit, but cost is ongoing editorial production, not engineering.
- **Server-side video/GIF rendering** -- one headless-Chrome instance can consume the entire 2GB budget alone.
- **General "any metric, any animation" no-code builder** -- no comparably-resourced tool has shipped one; see Q7.

## Open Questions / Thin Evidence

- IMD rainfall granularity (district vs. ~36 subdivisions) unconfirmed -- subdivision-level would be the strongest carrier.
- RBI/GST series frequency and geographic level unconfirmed.
- Whether the LGD/Census-2011 crosswalk is a clean many-to-one join, and whether APY's ~430-district vintage can be crosswalked to it, both need an internal audit.
- No live slope-chart exemplar found (verdict rests on FT design consensus); whether a 2001 Census point is held is also unconfirmed (see Recommended Plan #3).
- No India-specific exemplar exists for any of the 11 forms.
- USAFacts time-slider mechanics unconfirmed live -- page now frozen, only a "Reset Date" control found.
- Browser-support specifics are inferred: `MediaRecorder`'s native MP4 support across Chrome/Edge, and `animation-timeline`'s Firefox support-start version.
- No benchmark exists for headless Chrome on our choropleth -- Q6 timing is extrapolated.
- Share of mobile visitors with `prefers-reduced-motion` enabled is unmeasured.
- Sonification's evidence base is thin (a pilot candidate, not launch-tier), and no general-purpose public "any metric, any animation" builder exists anywhere to benchmark against.