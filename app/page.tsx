import { AtlasHome } from "@/components/atlas-home";

// The homepage IS the explorer (iter-51 item 386, adr-015). The map stays
// neutral until an indicator is picked — no marketing landing page.
//
// THIS FILE IS A SERVER COMPONENT AND MUST STAY ONE (iter-43, #580).
//
// `/` has no metadata of its own — everything a crawler reads about it comes
// from the root layout, robots directive included. app/layout.tsx derives that
// directive from IS_LAUNCHED, as app/robots.ts and middleware.ts do at request
// time. If `/` is statically prerendered, the layout's generateMetadata runs at
// BUILD time and the answer is frozen into .next/server/app/index.html: flipping
// SITE_LAUNCHED would then move the header and robots.txt while the markup on
// the most valuable URL on the site kept whatever was true when the image was
// built. Before this split, `/` baked `noindex, nofollow` — so at launch the
// homepage would have told crawlers to skip it, with no header left to disagree.
//
// The route segment config below is why the split exists. `export const dynamic`
// is READ ONLY FROM A SERVER COMPONENT — Next silently ignores it in a file
// marked "use client", which was measured: with the config exported from the old
// client page, `/` still built as ○ (static) and index.html still shipped a baked
// robots meta. The client half now lives in components/atlas-home.tsx.
// THE COST, stated rather than discovered under load. As a prerender, `/` was the
// only content page a CDN could hold (`s-maxage=31536000`); dynamic, it now sends
// `private, no-store` like every other page, so at launch the busiest URL becomes
// always-origin on a single home server. Measured TTFB went ~1.5-2.9ms to
// ~4.7-6.5ms, which is nothing — the body is a loading shell, since the map is
// `ssr: false` and every heavy asset (geometry, JS chunks) is still static and
// edge-cached. Re-adding a cache header here is possible but is a trap while the
// robots directive still depends on SITE_LAUNCHED: a year-long edge copy would
// outlive the flag flip. If it is ever wanted, it needs a purge at launch.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <AtlasHome />;
}
