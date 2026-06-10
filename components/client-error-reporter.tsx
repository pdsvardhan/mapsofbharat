"use client";

import { useEffect } from "react";

// Captures uncaught client errors + unhandled promise rejections and ships them
// to the self-hosted /api/log sink. No third-party services (risk #53).
export function ClientErrorReporter() {
  useEffect(() => {
    const send = (level: string, message: string, stack?: string) => {
      try {
        const payload = JSON.stringify({ level, message, stack, url: location.href });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/log", new Blob([payload], { type: "application/json" }));
        } else {
          fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        }
      } catch {
        // never let the reporter throw
      }
    };
    const onError = (e: ErrorEvent) => send("error", e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) =>
      send("error", "unhandledrejection: " + String(e.reason), (e.reason as Error)?.stack);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
