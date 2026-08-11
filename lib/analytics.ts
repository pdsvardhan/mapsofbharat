// Same-origin analytics helper (iter-131 item 825; the twelve-event set landed
// at iter-37 item 938). A thin, SSR-safe wrapper over the self-hosted Umami
// tracker, which is loaded first-party through the /stats reverse proxy
// (next.config rewrites) and stays cookieless — no third-party script, no PII.
// Every call no-ops when the tracker has not loaded (blocked, disabled, or still
// loading) or during SSR, and never throws: analytics must never break the app.

declare global {
  interface Window {
    umami?: {
      track: (event?: string, data?: Record<string, unknown>) => void;
      identify?: (data: Record<string, unknown>) => void;
    };
  }
}

// The measurement plan names exactly twelve events (planning/2026-08-05,
// MSR-02), and Umami funnels match on the event NAME — a funnel step pointing at
// a name nothing fires is silently empty rather than an error. So the twelve are
// a union, not strings: a typo is a build failure, and a thirteenth event cannot
// appear without being added here deliberately. Names are the plan's snake_case
// verbatim; the earlier kebab-case set (metric-select, drill, share, export,
// search-empty, embed-load) was renamed to these at item 938 so the four
// specified funnels can be built as written.
export type AnalyticsEvent =
  | "metric_selected"
  | "search_performed"
  | "search_no_results"
  | "drill_in"
  | "region_opened"
  | "compare_used"
  | "viz_customised"
  | "card_exported"
  | "permalink_copied"
  | "embed_copied"
  | "embed_loaded"
  | "methodology_viewed";

/** Fire a custom Umami event. Safe to call from anywhere. */
export function track(event: AnalyticsEvent, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch {
    /* never let analytics throw */
  }
}

/**
 * The host of the page that embedded us, for embed_loaded (MSR-12) — the only
 * proof of off-site reach we get. Inside the /embed iframe document.referrer is
 * the EMBEDDING page, which is exactly the thing worth counting.
 *
 * Deliberately reduced to a bare hostname and nothing more: the full referrer
 * URL can carry a path and query that identify a person or a private document,
 * and the question being answered is "which domains embed us", not "which page".
 * Returns "direct" when there is no referrer (opened standalone) and "unknown"
 * when it will not parse, so the dimension is never empty and the two cases stay
 * distinguishable.
 */
export function embedHost(): string {
  if (typeof document === "undefined") return "unknown";
  const ref = document.referrer;
  if (!ref) return "direct";
  try {
    return new URL(ref).hostname || "unknown";
  } catch {
    return "unknown";
  }
}
