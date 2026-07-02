import Link from "next/link";
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
      <Link href="/" className="text-[13px] font-semibold text-accent hover:underline">← Back to the map</Link>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-sm bg-bright text-[13px] font-extrabold" style={{ color: "#14120d" }}>MB</span>
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Methodology &amp; sources</h1>
      </div>
      <p className="mt-4 leading-relaxed text-muted">
        Every number on Maps of Bharat comes from an official government or top-tier institutional
        source, is harmonized onto current-day boundaries, and keeps its citation. This page is
        the honest fine print: how values are computed and where they are imperfect.
      </p>

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
                <a className="text-accent hover:underline" href={m.source_url} target="_blank" rel="noopener noreferrer">{m.source}</a>
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
