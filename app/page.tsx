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
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <AtlasHome />;
}
