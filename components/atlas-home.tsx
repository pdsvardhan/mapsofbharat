"use client";

import nextDynamic from "next/dynamic";

// The client half of `/` (iter-43, #580). Split out of app/page.tsx so that file
// can be a Server Component and export `dynamic = "force-dynamic"`; see the
// comment there for why that matters to indexing.
//
// `ssr: false` is the reason this needs to be a Client Component at all —
// next/dynamic refuses it in a Server Component, and the map cannot server-render
// because MapLibre needs a real DOM and a WebGL context.
//
// The import is renamed only to keep `dynamic` free as a name in app/page.tsx;
// it is the same next/dynamic that has always been used here.
const IndiaMap = nextDynamic(() => import("@/components/india-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-background text-faint">
      Loading map…
    </div>
  ),
});

export function AtlasHome() {
  return <IndiaMap />;
}
