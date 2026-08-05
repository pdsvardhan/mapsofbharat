"use client";

// Report-an-error form (iter-32 item 848). Posts JSON to /api/corrections and
// shows a success / failure state. Reports are PRIVATE — never published — so the
// copy makes that explicit. A hidden honeypot field (`website`) traps bots.

import { useState } from "react";

type Status = "idle" | "sending" | "ok" | "error";

export function CorrectionsForm() {
  const [status, setStatus] = useState<Status>("idle");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      message: String(data.get("message") || ""),
      location: String(data.get("location") || ""),
      email: String(data.get("email") || ""),
      website: String(data.get("website") || ""), // honeypot
    };

    setStatus("sending");
    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && json.ok) {
        setStatus("ok");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const field =
    "w-full border border-border bg-panel-solid px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:border-faint";
  const label = "block text-[11px] font-bold uppercase tracking-[.1em] text-faint";

  return (
    <form
      onSubmit={onSubmit}
      data-testid="corrections-form"
      className="mt-4 flex flex-col gap-4 border border-border p-5"
      style={{ background: "var(--panel)" }}
    >
      {/* Honeypot — visually hidden and off the tab order; real users never fill it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="corr-website">Leave this field empty</label>
        <input id="corr-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="corr-message" className={label}>
          What&apos;s wrong? <span className="text-accent">*</span>
        </label>
        <textarea
          id="corr-message"
          name="message"
          data-testid="corrections-message"
          required
          rows={4}
          maxLength={4000}
          placeholder="Describe the error — the metric, the region, and what the number should be."
          className={`${field} resize-y`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="corr-location" className={label}>
          Where? <span className="font-normal normal-case tracking-normal text-dim">(optional — a page URL or map view)</span>
        </label>
        <input
          id="corr-location"
          name="location"
          type="text"
          data-testid="corrections-location"
          placeholder="/metric/literacy_rate"
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="corr-email" className={label}>
          Email <span className="font-normal normal-case tracking-normal text-dim">(optional — only so we can follow up)</span>
        </label>
        <input
          id="corr-email"
          name="email"
          type="email"
          data-testid="corrections-email"
          placeholder="you@example.com"
          className={field}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          data-testid="corrections-submit"
          disabled={status === "sending"}
          className="inline-flex w-fit items-center gap-2 rounded-sm bg-accent px-4 py-2 text-[13px] font-bold disabled:opacity-60"
          style={{ color: "var(--accent-ink)" }}
        >
          {status === "sending" ? "Sending…" : "Send report privately"}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-muted">
          {status === "ok" && "Thanks — your report was sent privately. It is not published."}
          {status === "error" && "Something went wrong. Please try again in a moment."}
        </span>
      </div>
    </form>
  );
}
