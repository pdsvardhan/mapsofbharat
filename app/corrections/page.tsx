import type { Metadata } from "next";
import Link from "next/link";

import { CorrectionsForm } from "@/components/atlas/corrections-form";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site";
import correctionsLog from "@/data/corrections.json";

// Public corrections log + private report intake (iter-32 item 848). The log is a
// curated, owner-maintained list (data/corrections.json); the form sends reports
// PRIVATELY to /api/corrections and nothing a visitor submits is ever published —
// the site hosts no user-generated content.
export const dynamic = "force-dynamic";

type Correction = { date: string; area: string; summary: string };

export const metadata: Metadata = {
  title: "Corrections",
  description:
    "Corrections log for Maps of Bharat, and a private form to report an error in the data or maps. Reports are sent privately and are never published.",
  // SITE_URL, not CANONICAL_URL — see the note in app/terms/page.tsx. A canonical
  // on a host that does not resolve is a de-index instruction.
  alternates: { canonical: `${SITE_URL}/corrections` },
};

export default function CorrectionsPage() {
  const log = correctionsLog as Correction[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
        ← Back to the map
      </Link>

      <div className="mt-5 flex items-center gap-3">
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-sm bg-bright text-[13px] font-extrabold"
          style={{ color: "#14120d" }}
        >
          MB
        </span>
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Corrections</h1>
      </div>

      <p className="mt-4 leading-relaxed text-muted">
        Maps of Bharat aims to be exactly as accurate as its official sources, and no more. When we
        find and fix a substantive error — a mislabelled region, a bad join, a stale value — we log
        it here in the open. If you spot something wrong, the form below sends it to us privately.
      </p>

      <h2 className="mt-10 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">
        CORRECTIONS LOG
      </h2>
      <div data-testid="corrections-log" className="mt-4">
        {log.length === 0 ? (
          <p className="text-[13px] text-muted">No corrections logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {log.map((c, i) => (
              <li
                key={`${c.date}-${i}`}
                className="border border-border px-4 py-3"
                style={{ background: "var(--panel)" }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[11px] text-faint">{c.date}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[.1em] text-accent-text">
                    {c.area}
                  </span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{c.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-10 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint">
        REPORT AN ERROR
      </h2>
      <p className="mt-4 leading-relaxed text-muted">
        Reports are <strong className="font-semibold text-foreground">sent to us privately and are
        not published</strong>. Maps of Bharat hosts no user-generated content — nothing you submit
        here appears on the site. If a report leads to a fix, it is summarised (in our own words) in
        the log above. Email is optional and used only if we need to follow up.
      </p>

      <CorrectionsForm />

      <SiteFooter />
    </main>
  );
}
