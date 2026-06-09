"use client";

import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-background text-foreground-muted">
      Loading map…
    </div>
  ),
});

export default function ExplorePage() {
  return <IndiaMap />;
}
