import type { Metadata } from "next";

// The chrome-less /embed view exists only to live inside other pages' iframes; it
// must never be indexed as a standalone search result, and it must never compete
// with the canonical /metric/{id} page for the same query (iter-b item 882).
// THREE layers guard it, deliberately overlapping:
//
//   1. X-Robots-Tag: noindex, nofollow — set in middleware.ts, so a crawler that
//      reads only headers (or fetches a non-HTML response) still skips it.
//   2. robots:{index:false, follow:false} here → <meta name="robots"> in the HTML,
//      for a crawler that reads only the document.
//   3. Disallow: /embed in app/robots.ts, and /embed is absent from the sitemap.
//
// page.tsx is a client component and cannot export metadata, so the directive
// lives on this pass-through layout.
export const metadata: Metadata = {
  title: "Embedded map",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  // Explicitly opt OUT of the root layout's self-referencing canonical: an
  // /embed URL must not claim `/` as its canonical, and a noindex page should
  // advertise no canonical at all.
  alternates: { canonical: null },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
