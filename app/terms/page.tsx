import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site";

// Terms of use (iter-33 item 849). Plain-language, impersonal, factual voice —
// no "we"/"I". OWNER-REVIEW copy: a legal page whose wording is the operator's to
// sign off before launch. Placeholders (operator legal name, contact email) are
// marked with a greppable comment so they can be confirmed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms of use for Maps of Bharat: official data presented as is without warranty, boundaries per the Survey of India, attribution-based reuse, and permitted embeds.",
  // SITE_URL, not CANONICAL_URL: a canonical must name a host that resolves.
  // mapsofbharat.in is not bought yet (to-do 407), and a canonical pointing at a
  // dead domain is a de-index instruction, not a redirect hint. One line in
  // lib/site.ts flips every URL at the domain move.
  alternates: { canonical: `${SITE_URL}/terms` },
};

const H2 =
  "mt-10 border-b border-border-soft pb-2 text-[13px] font-bold tracking-[.12em] text-faint";
const P = "mt-4 text-[14px] leading-relaxed text-muted";

export default function TermsPage() {
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
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Terms of Use</h1>
      </div>

      <p className="mt-4 leading-relaxed text-muted">
        These terms govern use of Maps of Bharat. Using the site means accepting them. Maps of Bharat
        is operated as a sole proprietorship based in India, and these terms are governed by the laws
        of India.
        {/* operator intentionally faceless (sole proprietorship); a legal operator name is added at the formal pre-public-launch legal review */}
      </p>

      <h2 className={H2}>THE DATA IS PROVIDED &ldquo;AS IS&rdquo;</h2>
      <p className={P}>
        The figures on Maps of Bharat are aggregated from official and government publications and
        other top-tier institutional sources, harmonised onto current-day boundaries, and kept with
        their citations (see the{" "}
        <Link href="/methodology" className="text-accent-text hover:underline">
          methodology
        </Link>
        ). The data is presented <strong className="font-semibold text-foreground">&ldquo;as
        is&rdquo;</strong>, without warranty of accuracy, completeness, timeliness, or fitness for a
        particular purpose. Source publications can contain errors, revisions, and gaps, and the
        harmonisation onto current boundaries is documented but imperfect. The site should not be
        relied upon as the sole basis for any legal, financial, administrative, or safety-critical
        decision.
      </p>

      <h2 className={H2}>WHAT THE SITE DOES AND DOES NOT CLAIM</h2>
      <p className={P}>
        Maps of Bharat presents official numbers and the classifications used to map them. It does{" "}
        <strong className="font-semibold text-foreground">not</strong> make causal claims, verdicts,
        or rankings offered as judgments about a place or its people. Where regions are ordered, that
        ordering is a direct consequence of the underlying figures and their stated method, not an
        editorial ranking. Interpretation of what a number means, or why it is what it is, rests with
        the reader.
      </p>

      <h2 className={H2}>MAP BOUNDARIES</h2>
      <p className={P}>
        The depiction of India&apos;s external boundaries follows the Survey of India and is
        published in accordance with the Government of India&apos;s guidelines. The maps are
        schematic representations for statistical visualization and are not authoritative for legal,
        administrative, or international-boundary purposes. Further detail is on the{" "}
        <Link href="/methodology" className="text-accent-text hover:underline">
          methodology
        </Link>{" "}
        page.
      </p>

      <h2 className={H2}>REUSE AND ATTRIBUTION</h2>
      <p className={P}>
        You may cite and link to Maps of Bharat, and quote individual figures, with attribution to
        &ldquo;MapsOfBharat&rdquo;. A formal{" "}
        <strong className="font-semibold text-foreground">CC-BY reuse licence</strong> covering
        broader reuse of the compiled dataset will be published once the LGD crosswalk swap lands.
        Until then, bulk or commercial reuse of the compiled data should be arranged by contacting
        the operator using the address below.
      </p>

      <h2 className={H2}>EMBEDS AND FAIR USE OF THE SERVICE</h2>
      <p className={P}>
        Maps may be embedded on other sites using the purpose-built{" "}
        <Link href="/embed" className="text-accent-text hover:underline">
          embed
        </Link>{" "}
        view. Automated access that degrades the service — high-volume scraping, or requests that
        place a disproportionate load on the infrastructure — is not permitted.
      </p>

      <h2 className={H2}>LIABILITY</h2>
      <p className={P}>
        To the fullest extent permitted by law, the operator of Maps of Bharat is not liable for any
        loss or damage arising from use of, or reliance on, the site or its data.
      </p>

      <h2 className={H2}>CHANGES AND CONTACT</h2>
      <p className={P}>
        Changes to these terms are posted on this page. Questions about these terms can be sent to{" "}
        <a className="text-accent-text hover:underline" href="mailto:contact@mapsofbharat.in">
          contact@mapsofbharat.in
        </a>
        .
      </p>

      <SiteFooter />
    </main>
  );
}
