"use client";

import { useEffect, useRef } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/**
 * Fire one analytics event when a page is viewed (item 938).
 *
 * Exists because the pages that need a view event — /methodology above all — are
 * SERVER components reading SQLite directly, and the Umami tracker only runs in
 * the browser. This is the smallest possible client island: it renders nothing
 * and holds no state, so a server page keeps its server rendering and simply
 * mounts one line of client code.
 *
 * Guarded against React's development double-mount so a single visit is a single
 * event; without the ref, StrictMode reports every methodology view twice and the
 * number quietly inflates.
 */
export function TrackView({ event, data }: { event: AnalyticsEvent; data?: Record<string, unknown> }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
