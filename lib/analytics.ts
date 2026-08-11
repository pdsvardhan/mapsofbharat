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

// Events fired before the tracker exists are QUEUED, not dropped.
//
// The tracker is an afterInteractive script: measured on a production build, it
// installs window.umami at 115-171ms on /methodology, while that page's view
// effect runs at ~71ms. The old code was a bare `window.umami?.track(...)`, so
// the call hit `undefined`, no-opped exactly as its comment promised, and the
// event died in-process — nothing was ever attempted on the wire.
// methodology_viewed had therefore NEVER been recorded once.
//
// The bug was invisible to tests/analytics-events.spec.ts by construction: that
// spy is installed via addInitScript before any page script, so window.umami is
// always present at effect time. A spy proves the call was MADE; it cannot prove
// anything was LISTENING. Only driving the real app and then reading Umami's own
// store showed the gap.
//
// embed_loaded was not safe either, merely lucky: it survived only because
// india-map is a heavy client chunk whose effect lands at ~308ms, well after the
// tracker. A slower network or a lighter bundle flips it. The queue removes the
// race for every event rather than reordering one page's effects.
const MAX_QUEUED = 50;
const POLL_MS = 100;
const GIVE_UP_MS = 15_000;

let queue: Array<[AnalyticsEvent, Record<string, unknown> | undefined]> = [];
let poll: ReturnType<typeof setInterval> | null = null;

function tracker(): Window["umami"] | undefined {
  try {
    return typeof window !== "undefined" && window.umami?.track ? window.umami : undefined;
  } catch {
    return undefined;
  }
}

function flush(): boolean {
  const u = tracker();
  if (!u) return false;
  const pending = queue;
  queue = [];
  for (const [event, data] of pending) {
    try {
      u.track(event, data);
    } catch {
      /* never let analytics throw */
    }
  }
  return true;
}

function waitForTracker(): void {
  if (poll !== null) return;
  const started = Date.now();
  poll = setInterval(() => {
    // Stop either when the tracker turns up, or when it plainly is not coming —
    // blocked, disabled, or offline. Dropping the queue then is the correct
    // outcome, and the bounded wait is what stops a blocked tracker leaving a
    // timer and an ever-growing array behind for the life of the page.
    if (flush() || Date.now() - started > GIVE_UP_MS) {
      clearInterval(poll!);
      poll = null;
      queue = [];
    }
  }, POLL_MS);
}

/** Fire a custom Umami event. Safe to call from anywhere, at any time. */
export function track(event: AnalyticsEvent, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const u = tracker();
  if (u) {
    try {
      u.track(event, data);
    } catch {
      /* never let analytics throw */
    }
    return;
  }
  // Bounded: analytics must never be the reason a tab grows without limit.
  if (queue.length < MAX_QUEUED) queue.push([event, data]);
  waitForTracker();
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
