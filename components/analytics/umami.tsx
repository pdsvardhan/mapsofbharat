"use client";

// First-party Umami tracker loader (iter-131 item 825). The script AND its
// collect endpoint are same-origin via the /stats reverse proxy (next.config
// rewrites), so the browser only ever talks to this origin — no third-party
// host, no cookies (Umami default), no PII. Mounted in the root layout so it
// loads on every page, including /embed.

import Script from "next/script";
import { useEffect, useState } from "react";

// PUBLIC value — appears in page source by design, not a secret.
const WEBSITE_ID = "bafed581-cbda-468f-92da-b7ff78f4fb72";

export function Umami() {
  // Umami posts to `${data-host-url}/api/send`, so pointing it at `${origin}/stats`
  // lands the beacon on the same-origin proxy path /stats/api/send. The origin is
  // resolved on the client (no window during SSR); rendering the <Script> only
  // once it is known also keeps server and first-client markup identical (no
  // hydration mismatch on the data-host-url attribute).
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Escape hatch for tests/dev — ON by default; only an explicit "1" disables.
  if (process.env.NEXT_PUBLIC_UMAMI_DISABLED === "1") return null;
  if (!origin) return null;

  return (
    <Script
      id="umami-tracker"
      src="/stats/script.js"
      strategy="afterInteractive"
      data-website-id={WEBSITE_ID}
      data-host-url={`${origin}/stats`}
    />
  );
}
