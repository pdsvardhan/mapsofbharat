"use client";

// Unified Share menu (iter-51 item 394): Copy link · Copy embed code · WhatsApp.
// PNG export sits beside it as the toolbar's primary action. All are real — no
// stubs. CSV and Locate retired (items 395/396, adr-015). WhatsApp added iter-b
// item 883.

import { useRef, useState } from "react";

import { useDismiss } from "@/lib/use-dismiss";

export function ShareMenu({
  disabled, onCopyLink, onCopyEmbed, copied, shareCaption,
}: {
  disabled: boolean;
  onCopyLink: () => void; onCopyEmbed: () => void;
  copied: string | null;
  /** A short, neutral, sourced caption prepended to the WhatsApp share text — the
   *  indicator + region on view, no verdict (does-not-claim fence). Optional; the
   *  bare deep link travels alone when absent. */
  shareCaption?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), boxRef);

  // WhatsApp deep-share, built from the SAME source Copy link uses — the live
  // permalink the map's URL-sync effect keeps in window.location.href — so the two
  // can never diverge (item 883). Read only client-side; the menu that renders this
  // anchor only ever opens after a click, so window is always defined by then.
  const deepLink = typeof window !== "undefined" ? window.location.href : "";
  const waText = shareCaption ? `${shareCaption} ${deepLink}` : deepLink;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div ref={boxRef} className="relative flex items-stretch">
      <button
        onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Share this view"
        disabled={disabled}
        className="flex items-center gap-2 px-[15px] py-2.5 text-[11.5px] font-semibold tracking-[.05em] transition-colors hover:bg-elevated disabled:opacity-40"
        style={{ color: "#d8ccbe" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
      {open && (
        <div
          role="menu" aria-label="Share options"
          className="atl-pop absolute bottom-full right-0 z-30 mb-2 w-[228px] border border-border bg-panel-solid"
          style={{ boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}
        >
          <button
            role="menuitem" onClick={onCopyLink}
            className="flex w-full items-center justify-between border-b border-border-faint px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-foreground hover:bg-elevated"
          >
            Copy link
            <span className="font-mono text-[9px] text-dim">{copied === "link" ? "COPIED ✓" : "URL"}</span>
          </button>
          <button
            role="menuitem" onClick={onCopyEmbed}
            className="flex w-full items-center justify-between border-b border-border-faint px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-foreground hover:bg-elevated"
          >
            Copy embed code
            <span className="font-mono text-[9px] text-dim">{copied === "embed" ? "COPIED ✓" : "IFRAME"}</span>
          </button>
          <a
            role="menuitem"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this view on WhatsApp"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-foreground hover:bg-elevated"
          >
            Share on WhatsApp
            <span className="font-mono text-[9px] text-dim">WHATSAPP</span>
          </a>
          <div className="border-t border-border-soft px-3.5 py-2 text-[10px] leading-snug text-dim">
            The link and embed carry this exact view — indicator, level, colours and drill.
          </div>
        </div>
      )}
    </div>
  );
}
