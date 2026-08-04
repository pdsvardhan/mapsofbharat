// Same-origin analytics helper (iter-131 item 825). A thin, SSR-safe wrapper
// over the self-hosted Umami tracker, which is loaded first-party through the
// /stats reverse proxy (next.config rewrites) and stays cookieless — no
// third-party script, no PII. Every call no-ops when the tracker has not loaded
// (blocked, disabled, or still loading) or during SSR, and never throws:
// analytics must never break the app.

declare global {
  interface Window {
    umami?: {
      track: (event?: string, data?: Record<string, unknown>) => void;
      identify?: (data: Record<string, unknown>) => void;
    };
  }
}

/** Fire a custom Umami event. Safe to call from anywhere. */
export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch {
    /* never let analytics throw */
  }
}
