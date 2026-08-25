"use client";

// "To cite this" block (iter-32 item 846, feat-source-trust). A bespoke Atlas-style
// box that shows a formatted citation in monospace with a Copy button.
//
// The "Accessed" date is the CITER's real access date, so it is computed on the
// client: server-render and first hydration show a neutral placeholder (no
// hydration mismatch), a useEffect fills in the mounted date for display, and the
// Copy handler recomposes with `new Date()` at click-time so the copied citation
// always carries the moment the reader actually took the reference.

import { useEffect, useState } from "react";

import { CANONICAL_URL } from "@/lib/site";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** DD Mon YYYY — e.g. "05 Aug 2026". Fixed month table keeps it locale-stable. */
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export type CiteProps =
  | {
      kind: "metric";
      metricName: string;
      source: string;
      year: number | string | null;
      metricId: string;
    }
  | { kind: "platform" };

/** Compose the citation string. Corporate author is MapsOfBharat throughout. */
function compose(props: CiteProps, accessed: string): string {
  if (props.kind === "platform") {
    return `MapsOfBharat. India's official statistics, mapped. Accessed ${accessed}. ${CANONICAL_URL}/methodology.`;
  }
  const year = props.year ? `, ${props.year}` : "";
  return `MapsOfBharat. "${props.metricName}." ${props.source}${year}. Accessed ${accessed}. ${CANONICAL_URL}/metric/${props.metricId}.`;
}

export function CiteBlock(props: CiteProps) {
  const [accessed, setAccessed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fill the mounted access date only on the client, after hydration.
  useEffect(() => setAccessed(fmtDate(new Date())), []);

  const shown = compose(props, accessed ?? "…");

  const onCopy = async () => {
    // Recompose at click-time so the copied "Accessed" date is the reader's own.
    const text = compose(props, fmtDate(new Date()));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin / permissions) — the citation is also
      // selectable in the box above, so the action still degrades usefully.
    }
  };

  return (
    <section className="mt-8" data-testid="cite-block">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[.12em] text-faint">
        To cite this
      </h2>
      <div className="flex flex-col gap-3 border-y-[3px] border-border px-1 py-4" data-band="cite">
        {/* break-words is load-bearing for WCAG 1.4.10 reflow (iter-44 item 1056).
            The citation ends in a source URL, and a monospace URL is one
            unbreakable token: at 12px it measures well past the 272px content
            column a 320px viewport leaves, so the TEXT overflowed while this
            paragraph's own box stayed 272 wide. That is why the document gained
            23px of horizontal scroll on /metric/[slug] while no element's
            rectangle exceeded the viewport — the overflow had no box to find it
            by. Measured before/after: documentElement.scrollWidth 343 -> 320. */}
        <p className="break-words font-mono text-[12px] leading-relaxed text-muted">{shown}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCopy}
            data-testid="cite-copy"
            aria-label="Copy citation to clipboard"
            className="inline-flex w-fit items-center gap-2 border border-border px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-elevated"
          >
            {copied ? "Copied ✓" : "Copy citation"}
          </button>
          <span aria-live="polite" role="status" className="font-mono text-[10px] text-muted">
            {copied ? "Copied to clipboard" : ""}
          </span>
        </div>
      </div>
    </section>
  );
}
