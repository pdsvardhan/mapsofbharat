"use client";

// Unified Share menu (iter-51 item 394): Copy link · Copy embed code.
// PNG export sits beside it as the toolbar's primary action. All three are
// real — no stubs. CSV and Locate retired (items 395/396, adr-015).

import { useEffect, useRef, useState } from "react";

export function ShareMenu({
  disabled, onCopyLink, onCopyEmbed, copied,
}: {
  disabled: boolean;
  onCopyLink: () => void; onCopyEmbed: () => void;
  copied: string | null;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-foreground hover:bg-elevated"
          >
            Copy embed code
            <span className="font-mono text-[9px] text-dim">{copied === "embed" ? "COPIED ✓" : "IFRAME"}</span>
          </button>
          <div className="border-t border-border-soft px-3.5 py-2 text-[10px] leading-snug text-dim">
            The link and embed carry this exact view — indicator, level, colours and drill.
          </div>
        </div>
      )}
    </div>
  );
}
