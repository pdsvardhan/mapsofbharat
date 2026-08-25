import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";

// Site-wide 404 (iter-43 item 1006, to-do #579).
//
// WHAT THIS FIXES, MEASURED. There was no `app/not-found.tsx` at all, so a route
// MISS fell to Next's built-in default: a correct 404 whose <body> held ZERO
// characters outside <script>. It now holds 680 — the copy below, in the markup,
// server-rendered, no hydration required.
//
// WHAT IT DOES NOT FIX, ALSO MEASURED — see adr-037. `notFound()`, which is how
// /metric/{slug} and /family/{id} reject an unknown id, does NOT route here. It
// renders Next's not-found boundary, which is a CLIENT boundary, so its copy
// reaches the browser inside the RSC flight payload and the served markup carries
// 41 characters. Proven independent of streaming: a synchronous, statically
// rendered probe page calling notFound() produced 0 visible characters too. The
// only escape in 15.5.19 is `app/global-not-found.tsx`, which is wired only into
// Next's EXPERIMENTAL app-page runtime. The status code is 404 in every one of
// these cases, which is the part that governs indexing, so the residue is a
// non-JS reader seeing a bare page on two routes — recorded, not silently kept.
//
// Everything here is a Server Component; `next/link` renders to a plain <a> on
// the server, so nothing below needs hydration to be readable.

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[13px] font-semibold text-accent-text hover:underline">
          ← Back to the map
        </Link>
        <Link href="/metric" className="text-[13px] font-semibold text-faint hover:text-accent-text">
          All metrics →
        </Link>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark; next/image adds no value for a 30px inline logo */}
        <img
          src="/brand/mark.png"
          alt=""
          aria-hidden="true"
          width={30}
          height={30}
          className="h-[30px] w-[30px] flex-none object-contain"
        />
        <h1 className="text-[30px] font-extrabold tracking-tight text-bright">Page not found</h1>
      </div>

      <p className="mt-4 max-w-3xl leading-relaxed text-muted">
        Nothing lives at this address. The likeliest reason is a link to an indicator or a family
        that has since been renamed or retired — the data behind this atlas is re-ingested as
        official sources publish, and ids occasionally change with it.
      </p>

      <nav aria-label="Where to go instead" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/metric"
          className="block border border-border px-4 py-3.5 hover:border-accent-text"
          style={{ background: "var(--panel)" }}
        >
          <span className="block text-[13px] font-semibold text-bright">Every indicator</span>
          <span className="mt-1 block text-[12px] leading-snug text-muted">
            The full list, grouped by topic — find the one you were looking for by name.
          </span>
        </Link>

        <Link
          href="/family"
          className="block border border-border px-4 py-3.5 hover:border-accent-text"
          style={{ background: "var(--panel)" }}
        >
          <span className="block text-[13px] font-semibold text-bright">Indicator families</span>
          <span className="mt-1 block text-[12px] leading-snug text-muted">
            Related indicators drawn together as one grid of maps.
          </span>
        </Link>

        <Link
          href="/coverage"
          className="block border border-border px-4 py-3.5 hover:border-accent-text"
          style={{ background: "var(--panel)" }}
        >
          <span className="block text-[13px] font-semibold text-bright">Coverage</span>
          <span className="mt-1 block text-[12px] leading-snug text-muted">
            How much of each indicator is directly measured rather than estimated.
          </span>
        </Link>

        <Link
          href="/corrections"
          className="block border border-border px-4 py-3.5 hover:border-accent-text"
          style={{ background: "var(--panel)" }}
        >
          <span className="block text-[13px] font-semibold text-bright">Report a problem</span>
          <span className="mt-1 block text-[12px] leading-snug text-muted">
            If a link here is broken, say so — the corrections log is public.
          </span>
        </Link>
      </nav>

      <SiteFooter />
    </main>
  );
}
