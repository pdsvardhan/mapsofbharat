"use client";

// The homepage IS the explorer (iter-51 item 386, adr-015). The map stays
// neutral until an indicator is picked — no marketing landing page.

import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-background text-faint">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  return <IndiaMap />;
}
