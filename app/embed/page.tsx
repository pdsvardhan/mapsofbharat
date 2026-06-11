"use client";

import dynamic from "next/dynamic";

// Chrome-less map for iframe embeds (iter-15 item 165). All view state comes
// from URL params (m / lvl / mode / brk / pal), same as /explore permalinks.
const IndiaMap = dynamic(() => import("@/components/india-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-background text-foreground-muted">
      Loading map…
    </div>
  ),
});

export default function EmbedPage() {
  return <IndiaMap minimal />;
}
