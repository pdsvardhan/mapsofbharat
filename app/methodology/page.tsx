import Link from "next/link";
import { CiteBlock } from "@/components/atlas/cite-block";
import { SiteFooter } from "@/components/site-footer";
import { TrackView } from "@/components/analytics/track-view";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Methodology + caveats, one click from the map (iter-15 item 161;
// restyled to the Atlas editorial system at iter-51, adr-015).
export default function MethodologyPage() {
  const d = db();
  const metrics = d
    ? (d
        .prepare(
          `SELECT id, name, category, unit, year, source, source_url, license,
                  methodology, last_updated FROM metrics ORDER BY category, name`
        )
        .all() as Array<Record<string, string>>)
    : [];
  const byCategory = new Map<string, typeof metrics>();
  for (const m of metrics) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category)!.push(m);
  }
  // one methodology note per source family, not per metric
  const dedup = (ms: typeof metrics) => {
    const seen = new Set<string>();
    return ms.filter((m) => {
      const k = m.methodology ?? "";
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* methodology_viewed (item 938, MSR-02): reaching the fine print is the
          closest thing the site has to a trust signal, and it is the one of the
          twelve events that no interaction on the map can stand in for. */}
      <TrackView event="methodology_viewed" data={{ metrics: metrics.length }} />
      <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">← Back to the map</Link>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-sm bg-bright text-[13px] font-extrabold" style={{ color: "var(--bright-ink)" }}>MB</span>
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Methodology &amp; sources</h1>
      </div>
      <p className="mt-4 leading-relaxed text-muted">
        Every number on Maps of Bharat comes from an official government or top-tier institutional
        source, is harmonized onto current-day boundaries, and keeps its citation. This page is
        the honest fine print: how values are computed and where they are imperfect.
      </p>
      <p className="mt-3 leading-relaxed text-muted">
        Each value is tagged with its provenance — the region&apos;s own measurement, or an
        inherited, re-aggregated or projected estimate. See the{" "}
        <Link href="/coverage" className="text-accent-text hover:underline">
          coverage table
        </Link>{" "}
        for how much of every metric is directly measured, and switch the map to its{" "}
        <strong className="font-semibold text-foreground">Coverage</strong> view to shade any
        indicator by provenance.
      </p>

      {/* Platform citation (iter-32 item 846) */}
      <CiteBlock kind="platform" />

      {/* Boundary self-certification (iter-32 item 847). OWNER-REVIEW copy — the
          standard web-map self-certification form; wording is the owner's to sign off. */}
      <section className="mt-10" data-testid="boundary-cert">
        <h2 className="border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">BOUNDARY SELF-CERTIFICATION</h2>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          The maps on Maps of Bharat are schematic representations for statistical visualization.
          The depiction of India&apos;s external boundaries follows the Survey of India and is
          published in accordance with the Government of India&apos;s guidelines (National Map
          Policy / Department of Science &amp; Technology). Jammu &amp; Kashmir, Ladakh, Arunachal
          Pradesh and Aksai Chin are shown as claimed and administered by India. These maps are not
          authoritative for legal, administrative, or international-boundary purposes.
        </p>
      </section>

      <h2 className="mt-10 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">KNOWN LIMITATIONS</h2>
      <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-muted">
        <li>
          <strong className="font-bold text-foreground">Boundaries:</strong> current-day districts (735 polygons,
          Survey-of-India compliant). Census-2011 data is re-expressed on these boundaries by
          summing sub-district raw counts (ADR-010); merged Mumbai is one polygon by design.
        </li>
        <li>
          <strong className="font-bold text-foreground">Withheld districts:</strong> the sub-district source
          undercovers urban populations in Mizoram, Tripura, West Bengal, Lakshadweep and
          Puducherry, so census-derived district values there are withheld rather than shown
          wrong; state-level values come straight from the official state PCA.
        </li>
        <li>
          <strong className="font-bold text-foreground">Crime rates:</strong> NCRB 2022 counts divided by
          Census-2011 population — the only district denominator available. Rates in
          fast-growing districts are slightly inflated. Police commissionerates are mapped to
          their host revenue districts (documented approximation).
        </li>
        <li>
          <strong className="font-bold text-foreground">NFHS-5:</strong> survey estimates with sampling error;
          district names matched to current boundaries at 95% — unmatched districts (incl. Delhi
          sub-districts) are absent rather than guessed.
        </li>
        <li>
          <strong className="font-bold text-foreground">Single year per series:</strong> most series currently
          carry one reference year; trends will appear once a second year is ingested.
        </li>
      </ul>

      <h2 id="classification" className="mt-10 scroll-mt-24 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">HOW THE MAP IS CLASSED</h2>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        A choropleth turns a column of numbers into colour bands, and the rule that
        cuts those bands changes the map as much as the data does. Maps of Bharat picks
        a break method automatically from the shape of each series &mdash; you can
        override it, and read why the automatic choice was made, in the &#9881; SCALE
        panel on the map. The resting legend always names the method and class count in
        use. Here is what each one does, and where it misleads if used blindly.
      </p>
      <dl className="mt-4 space-y-3">
        {(
          [
            ["breaks-continuous", "Smooth (continuous)", "A single colour ramp stretched linearly from the lowest value to the highest, with no discrete classes. It shows the raw gradient, but small differences near the crowded end of a skewed series become impossible to tell apart."],
            ["breaks-quantile", "Quantile", "An equal COUNT of regions falls in each class, so every colour is equally common and no class is ever empty. Rank-balanced and the easiest to read on a single map — but two regions with very different values can share a class wherever the data is flat."],
            ["breaks-equal", "Equal-interval", "Every class spans an equal VALUE width, giving round, evenly-spaced edges. Most intuitive for bounded percentages, but on a skewed series a single class can swallow most of the country while the rest render for almost nobody."],
            ["breaks-jenks", "Jenks (natural breaks)", "Places the cuts where the data has natural gaps, minimising the spread within each class. Faithful to real clusters, but on a heavy tail it tends to bury most regions in one wide low class."],
            ["breaks-log", "Log", "Equal-interval computed in log space. On a strictly-positive, right-skewed series it spreads the crowded low tail across classes while preserving orders of magnitude. Offered only when every value is above zero, where the logarithm is defined."],
            ["breaks-zerofloor", "Floor", "When a large share of regions sit at exactly the minimum — often zero, e.g. districts reporting no population of a given group — that floor gets its OWN class at the bottom of the ramp and the remainder is subdivided, so “none” is never coloured as though it were “some.”"],
            ["breaks-reference", "Pivot (reference)", "A diverging classification pinned at an external reference that carries real-world meaning — 1000 females per 1000 males is sex-ratio parity, not the data’s own median. The reference is a class EDGE, never a class centre, so a band straddling parity can never masquerade as “at parity.”"],
            ["breaks-vs-avg", "Value vs average", "Not a break method but a separate diverging view: colour runs from one hue for regions below the scope’s average to the other hue for those above it, centred on that mean. There are no discrete classes — the scale is continuous on either side of the average."],
          ] as [string, string, string][]
        ).map(([id, name, body]) => (
          <div key={id} id={id} className="scroll-mt-24 border border-border px-4 py-4" style={{ background: "var(--panel)" }}>
            <dt className="text-[13px] font-semibold text-bright">{name}</dt>
            <dd className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</dd>
          </div>
        ))}
      </dl>

      <h2 id="forms" className="mt-10 scroll-mt-24 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">HOW THE MAP IS DRAWN</h2>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        Classing decides which colours the map uses. This decides whether colour is the
        right instrument at all. A choropleth gives every region the visual weight of its
        AREA, and for most of what this atlas publishes that is the wrong weight &mdash;
        so two of these forms exist to take it back. Which one a map uses is a property of
        the DATA, not a preference: the map opens in the form its numbers can honestly
        take, and offers you the alternatives only where they are also honest.
      </p>
      <dl className="mt-4 space-y-3">
        {(
          [
            ["symbol-maps", "Proportional circles", "For a COUNT \u2014 people, tonnes, head of livestock \u2014 shading is simply the wrong instrument. The eye reads area, so on a shaded map Kutch outweighs Mumbai City by the 291\u00d7 ratio of their surfaces whatever colour either one takes, and a count is a quantity that adds up rather than one already measured per person. A circle\u2019s radius is tied only to the value, so it is decoupled from the polygon entirely. Circle AREA is proportional to the value, not radius \u2014 four times the count draws twice the radius, so twice the ink means twice the quantity. Each circle sits on a point computed offline to lie inside its own region, so none is drawn out at sea or over a neighbour."],
            ["value-by-alpha", "Faded by population", "A rate is already measured per person, so circles would invent a distortion that normalising had removed. But the shaded map still gives every district the weight of its acreage, and India\u2019s districts are not the same size or anything like as evenly peopled: 82% of the country\u2019s surface sits in the lowest population-density band while only 51% of Indians do. Where a map\u2019s colour is not where its people are, regions are faded by how many people they hold, so the picture reads closer to the country than to its acreage. The fade never reaches invisibility \u2014 carrying few people is a reason to be quieter, never a reason to be unreadable, and every region stays hoverable, readable and correctable. It is applied only where measured to be warranted, and the legend says so and why whenever it fires. It is never used on a count, which has circles instead, nor on the as-reported 2011 view, whose vintage has no density series to weigh with."],
          ] as [string, string, string][]
        ).map(([id, name, body]) => (
          <div key={id} id={id} className="scroll-mt-24 border border-border px-4 py-4" style={{ background: "var(--panel)" }}>
            <dt className="text-[13px] font-semibold text-bright">{name}</dt>
            <dd className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</dd>
          </div>
        ))}
      </dl>

      {[...byCategory.entries()].map(([cat, ms]) => (
        <section key={cat} className="mt-10">
          <h2 className="border-b border-border-soft pb-2 text-[13px] font-bold uppercase tracking-[.12em] text-faint">{cat}</h2>
          {dedup(ms).map((m) => (
            <div key={m.id} className="mt-3 border border-border px-4 py-4" style={{ background: "var(--panel)" }}>
              <div className="text-[13px] font-semibold text-bright">
                {ms.filter((x) => x.methodology === m.methodology).map((x) => x.name).join(" · ")}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{m.methodology ?? "Methodology note pending."}</p>
              <div className="mt-2.5 font-mono text-[11px] text-faint">
                Source:{" "}
                <a className="text-accent-text hover:underline" href={m.source_url} target="_blank" rel="noopener noreferrer">{m.source}</a>
                {" · "}{m.license} · {m.year}
                {m.last_updated ? ` · loaded ${String(m.last_updated).slice(0, 10)}` : ""}
              </div>
            </div>
          ))}
        </section>
      ))}

      <SiteFooter />
    </main>
  );
}
