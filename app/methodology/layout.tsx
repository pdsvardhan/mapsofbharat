import type { Metadata } from "next";

import { SITE_OG_IMAGE, SITE_TWITTER_IMAGE, SITE_URL } from "@/lib/site";

// /methodology was the one public page with no metadata of its own (iter-36 item
// 406): it fell back to the site-wide title and description, so it had no
// distinct search result and — once the root layout gained a self-referencing
// canonical for the atlas at `/` — would have inherited `/` as its canonical and
// asked to be de-indexed in favour of the map.
//
// The metadata lives on this pass-through layout rather than in page.tsx so the
// page file itself is untouched. Same shape as the other content pages: title,
// description, self-referencing canonical, and an OG/Twitter block restated in
// FULL — Next merges metadata shallowly, so a partial openGraph would silently
// drop siteName, locale and the root opengraph-image, leaving a WhatsApp share
// of this page with no preview card (see lib/site SITE_OG_IMAGE).
const TITLE = "Methodology & sources";
const DESCRIPTION =
  "How every number on Maps of Bharat is produced: the official source behind each indicator, how values are harmonized onto current-day boundaries, how estimates are labelled, and where the data is imperfect.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/methodology` },
  openGraph: {
    type: "article",
    siteName: "Maps of Bharat",
    locale: "en_IN",
    title: `${TITLE} · Maps of Bharat`,
    description: DESCRIPTION,
    url: `${SITE_URL}/methodology`,
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Maps of Bharat`,
    description: DESCRIPTION,
    site: "@maps_of_bharat",
    creator: "@maps_of_bharat",
    images: [SITE_TWITTER_IMAGE],
  },
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
