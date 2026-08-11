import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site";

// Privacy policy (iter-33 item 849). DPDP-aligned, plain-language. Impersonal,
// factual voice — no "we"/"I". OWNER-REVIEW copy: a legal page whose wording is
// the operator's to sign off before launch. Placeholders (operator legal name,
// contact email) are marked with a greppable comment so they can be confirmed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Maps of Bharat handles data: cookieless self-hosted analytics, no accounts, no third-party trackers, no raw IP addresses, and your rights under India's DPDP Act.",
  // SITE_URL, not CANONICAL_URL — see the note in app/terms/page.tsx. A canonical
  // on a host that does not resolve is a de-index instruction.
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const H2 =
  "mt-10 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint";
const P = "mt-4 text-[14px] leading-relaxed text-muted";

export default function PrivacyPage() {
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
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Privacy</h1>
      </div>

      <p className="mt-4 leading-relaxed text-muted">
        Maps of Bharat is a public data-visualization site. It is built to need as little personal
        data as possible: there are no accounts, no advertising, and no third-party trackers. This
        page describes, in plain terms, what data the site does and does not handle, and the rights a
        visitor has under India&apos;s Digital Personal Data Protection Act, 2023 (the DPDP Act).
      </p>
      <p className={P}>
        Maps of Bharat is operated as a sole proprietorship based in India.
        {/* operator intentionally faceless (sole proprietorship); a legal operator name is added at the formal pre-public-launch legal review */}
      </p>

      <h2 className={H2}>ANALYTICS</h2>
      <p className={P}>
        Usage is measured with <strong className="font-semibold text-foreground">Umami</strong>, an
        analytics tool that is self-hosted on the same infrastructure as this site and served
        first-party through the site&apos;s own <span className="font-mono text-[12.5px]">/stats</span>{" "}
        path. It is <strong className="font-semibold text-foreground">cookieless</strong>: it sets no
        cookies and stores no identifier on a visitor&apos;s device. No data is shared with a
        third-party analytics or advertising provider, because there are none — the site carries no
        ads and no third-party trackers.
      </p>
      <p className={P}>
        Analytics record aggregate, non-identifying signals such as page path, referrer, screen
        size, and approximate country. Where an IP address is involved in producing these signals it
        is <strong className="font-semibold text-foreground">hashed or truncated and never stored in
        raw form</strong>. Aggregated analytics are retained for{" "}
        <strong className="font-semibold text-foreground">12 months</strong>; after that only
        aggregate, non-identifying totals are kept.
      </p>

      <h2 className={H2}>NO ACCOUNTS, NO PUBLISHED CONTRIBUTIONS</h2>
      <p className={P}>
        There is no sign-up and no login. The site publishes no user-generated content: nothing a
        visitor submits is displayed to other visitors or added to the public site (ADR-029). A
        correction that leads to a fix is summarised, in the site&apos;s own words, in the public{" "}
        <Link href="/corrections" className="text-accent-text hover:underline">
          corrections log
        </Link>
        .
      </p>

      <h2 className={H2}>CORRECTION REPORTS</h2>
      <p className={P}>
        The one place a visitor can submit personal data is the{" "}
        <Link href="/corrections" className="text-accent-text hover:underline">
          corrections
        </Link>{" "}
        form. An <strong className="font-semibold text-foreground">email address there is
        optional</strong> and is used only to follow up on that specific report. Reports are stored
        privately and are never published, shared, or sold. Each stored report keeps a{" "}
        <strong className="font-semibold text-foreground">hashed fingerprint of the sender&apos;s IP
        address — never the raw IP</strong> — used only to limit abuse of the form. If no email is
        supplied, a report cannot be traced back to a person.
      </p>

      <h2 className={H2}>NO RAW IP ADDRESSES ARE STORED</h2>
      <p className={P}>
        Across the whole site, a raw IP address is never written to durable storage:
      </p>
      <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
        <li>
          <strong className="font-bold text-foreground">Correction reports</strong> store only the
          first 16 hexadecimal characters of a SHA-256 hash of the IP address, not the address
          itself.
        </li>
        <li>
          <strong className="font-bold text-foreground">Rate limiting</strong> uses a visitor&apos;s
          IP only transiently, in memory, to count requests per minute; it is not logged or
          persisted.
        </li>
        <li>
          <strong className="font-bold text-foreground">Error and event logs</strong> record no IP
          address at all.
        </li>
        <li>
          <strong className="font-bold text-foreground">Analytics</strong> are cookieless and
          first-party, and any IP involved is hashed or truncated as described above.
        </li>
      </ul>

      <h2 className={H2}>YOUR RIGHTS UNDER THE DPDP ACT</h2>
      <p className={P}>
        Under the DPDP Act, a person whose personal data is held has the right to{" "}
        <strong className="font-semibold text-foreground">access</strong> a summary of that data, to
        request <strong className="font-semibold text-foreground">correction</strong> of inaccurate
        data, and to request <strong className="font-semibold text-foreground">erasure</strong> of
        data that is no longer needed. Because the site holds no accounts, the only personal data
        that can be tied to a person is an email address voluntarily included in a correction report.
        To exercise any of these rights, or to withdraw such an email from the store, use the contact
        below and include the email address that was submitted.
      </p>

      <h2 className={H2}>CONTACT</h2>
      <p className={P}>
        Data and privacy requests can be sent to{" "}
        <a className="text-accent-text hover:underline" href="mailto:privacy@mapsofbharat.in">
          privacy@mapsofbharat.in
        </a>
        . Material changes to this
        policy are posted on this page.
      </p>

      <SiteFooter />
    </main>
  );
}
