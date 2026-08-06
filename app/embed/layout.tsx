import type { Metadata } from "next";

// The chrome-less /embed view exists only to live inside other pages' iframes; it
// must never be indexed as a standalone search result (iter-b item 882). This
// pairs with the X-Robots-Tag: noindex header middleware.ts sets on /embed
// responses — a crawler that only reads the HTML sees this meta, one that only
// reads headers sees the tag. page.tsx is a client component and cannot export
// metadata, so the robots directive lives on this pass-through layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
