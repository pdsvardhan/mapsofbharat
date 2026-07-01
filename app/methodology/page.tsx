import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Methodology + caveats, one click from the map (iter-15 item 161).
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
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link href="/explore" className="text-sm text-accent-teal hover:underline">← Back to the map</Link>
      <h1 className="mt-4 text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
        Methodology &amp; caveats
      </h1>
      <p className="mt-3 text-foreground-muted">
        Every number on MapsOfBharat comes from an official government or top-tier institutional
        source, is harmonized onto current-day boundaries, and keeps its citation. This page is
        the honest fine print: how values are computed and where they are imperfect.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Known limitations</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground-muted">
        <li>
          <strong className="text-foreground">Boundaries:</strong> current-day districts (735 polygons,
          Survey-of-India compliant). Census-2011 data is re-expressed on these boundaries by
          summing sub-district raw counts (ADR-010); merged Mumbai is one polygon by design.
        </li>
        <li>
          <strong className="text-foreground">Withheld districts:</strong> the sub-district source
          undercovers urban populations in Mizoram, Tripura, West Bengal, Lakshadweep and
          Puducherry, so census-derived district values there are withheld rather than shown
          wrong; state-level values come straight from the official state PCA.
        </li>
        <li>
          <strong className="text-foreground">Crime rates:</strong> NCRB 2022 counts divided by
          Census-2011 population — the only district denominator available. Rates in
          fast-growing districts are slightly inflated. Police commissionerates are mapped to
          their host revenue districts (documented approximation).
        </li>
        <li>
          <strong className="text-foreground">NFHS-5:</strong> survey estimates with sampling error;
          district names matched to current boundaries at 95% — unmatched districts (incl. Delhi
          sub-districts) are absent rather than guessed.
        </li>
        <li>
          <strong className="text-foreground">Single year per series:</strong> most series currently
          carry one reference year; trends will appear once a second year is ingested.
        </li>
      </ul>

      {[...byCategory.entries()].map(([cat, ms]) => (
        <section key={cat} className="mt-10">
          <h2 className="text-xl font-semibold capitalize">{cat}</h2>
          {dedup(ms).map((m) => (
            <div key={m.id} className="mt-3 rounded-lg border border-border bg-card/60 p-4">
              <div className="text-sm text-foreground-muted">
                {ms.filter((x) => x.methodology === m.methodology).map((x) => x.name).join(" · ")}
              </div>
              <p className="mt-2 text-sm">{m.methodology ?? "Methodology note pending."}</p>
              <div className="mt-2 text-xs text-foreground-muted">
                Source: <a className="text-accent-teal hover:underline" href={m.source_url} target="_blank" rel="noopener noreferrer">{m.source}</a>
                {" · "}{m.license} · {m.year}
                {m.last_updated ? ` · loaded ${String(m.last_updated).slice(0, 10)}` : ""}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
