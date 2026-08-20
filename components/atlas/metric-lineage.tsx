import type { ReactNode } from "react";

import type { Lineage } from "@/lib/metric-raw-source";

// Data-lineage + tiered-download section for the canonical /metric/{id} page
// (iter-131 item 831). A Server Component: the whole chain and both download
// affordances are in the SSR HTML (AC 1 "server-rendered"). It renders the chain
//   raw source (link) -> processing -> external inputs -> final data
// then the two downloads: the raw source is FREE (a hosted file with a citation
// header, or the official source when we don't host a copy), while the processed
// dataset stays VIEW-ONLY with a disabled "Pro (coming soon)" placeholder — the
// paid seam, with no account / login / payment system built.

export function MetricLineage({
  metricId,
  source,
  sourceUrl,
  scopeNoun,
  lineage,
}: {
  metricId: string;
  source: string;
  sourceUrl: string;
  scopeNoun: string;
  lineage: Lineage | null;
}) {
  const hosted = lineage?.raw.kind === "file";
  const linkReason =
    lineage?.raw.kind === "link" ? lineage.raw.reason : null;
  const externalInputs = lineage?.externalInputs ?? [];
  const processing =
    lineage?.processing ??
    "See the methodology above for how this value is computed.";

  const sourceLink = (
    <a
      className="text-accent-text hover:underline"
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="lineage-raw-link"
    >
      {source}
    </a>
  );

  const steps: { label: string; body: ReactNode }[] = [
    {
      label: "Raw source",
      body: (
        <>
          {sourceLink}{" "}
          <span className="text-faint">
            — {hosted ? "hosted below, free to download" : "official source (linked below)"}
          </span>
        </>
      ),
    },
    { label: "Processing", body: processing },
    {
      label: "External inputs",
      body:
        externalInputs.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {externalInputs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <span className="text-faint">None — computed from the source&apos;s own figures.</span>
        ),
    },
    {
      label: "Final data",
      body: (
        <>
          The harmonised, current-boundary values shown in the ranked {scopeNoun} table and map
          above — viewable now; the processed dataset download is a planned Pro feature.
        </>
      ),
    },
  ];

  return (
    <section className="mt-8" data-testid="lineage">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
        Data lineage &amp; downloads
      </h2>

      {/* The lineage chain — raw source → processing → external inputs → final data */}
      <ol className="grid grid-cols-1 gap-px overflow-hidden border-y-[3px] border-border sm:grid-cols-2 lg:grid-cols-4" data-band="lineage" style={{ background: "var(--border-faint)" }}>
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-col gap-2 p-4" style={{ background: "var(--background)" }}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-sm bg-bright font-mono text-[11px] font-bold" style={{ color: "var(--bright-ink)" }}>
                {i + 1}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">
                {s.label}
              </span>
            </div>
            <div className="text-[12.5px] leading-relaxed text-muted">{s.body}</div>
          </li>
        ))}
      </ol>

      {/* Tiered downloads: raw = free for everyone, processed = view-only / Pro */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="downloads">
        {/* Raw source — free */}
        <div className="flex flex-col gap-2 border-y-[3px] border-border px-1 py-4" data-band="download-free">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.1em] text-bright">
              Raw source data
            </span>
            <span className="rounded-sm border border-border-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-accent-text">
              Free
            </span>
          </div>
          {hosted ? (
            <>
              <a
                data-testid="raw-download"
                href={`/metric/${metricId}/raw`}
                className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[12px] font-bold transition-colors hover:bg-accent-hover"
                style={{ color: "var(--accent-ink)" }}
              >
                ↓ Download raw source
              </a>
              <p className="text-[11.5px] leading-relaxed text-muted">
                The ingested source file, exactly as fetched — with a citation header (source,
                licence, retrieval date and this page&apos;s URL). Free for everyone.
              </p>
            </>
          ) : (
            <>
              <a
                data-testid="raw-official-link"
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent px-3 py-1.5 text-[12px] font-bold text-accent-text transition-colors hover:bg-elevated"
              >
                Raw source (official) ↗
              </a>
              <p className="text-[11.5px] leading-relaxed text-muted">
                {linkReason ??
                  "The raw source is not a single hostable file, so the official source is linked."}
              </p>
            </>
          )}
        </div>

        {/* Processed dataset — view-only now, Pro later. No accounts are built. */}
        <div className="flex flex-col gap-2 border-y-[3px] border-border px-1 py-4" data-band="download-pro">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.1em] text-bright">
              Processed dataset
            </span>
            <span className="rounded-sm border border-border-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-muted">
              Pro
            </span>
          </div>
          <button
            type="button"
            data-testid="processed-download-pro"
            disabled
            aria-disabled="true"
            title="Coming soon on Pro"
            className="inline-flex w-fit cursor-default items-center gap-1.5 rounded-sm border border-dashed border-border-soft px-3 py-1.5 text-[12px] font-bold text-muted"
          >
            ↓ Download processed dataset — Pro (coming soon)
          </button>
          <p className="text-[11.5px] leading-relaxed text-muted">
            The cleaned, boundary-harmonised dataset (the values in the table above) will be a Pro
            download. You can view it now in the ranked table — it is not a free download yet.
          </p>
        </div>
      </div>
    </section>
  );
}
