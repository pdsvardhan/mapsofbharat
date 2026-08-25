"use client";

// Share / embed actions for a canonical metric page (iter-131 item 829). Two real
// copy actions — the page's own permanent URL and a ready-to-paste iframe snippet
// pointing at /embed — mirroring the atlas Share menu (item 828). Snippet and URL
// are built on the server and passed in, so this stays a tiny clipboard shim.

import { useState } from "react";

export function MetricShare({
  pageUrl,
  embedSnippet,
  atlasUrl,
}: {
  pageUrl: string;
  embedSnippet: string;
  atlasUrl: string;
}) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const copy = async (text: string, tag: "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
    } catch {
      /* clipboard blocked (insecure origin / permissions) — the text is also
         selectable in the snippet box below, so the action still degrades usefully */
    }
  };

  const btn =
    "inline-flex items-center gap-2 border border-border px-3 py-2 text-[12px] font-semibold text-foreground no-underline hover:bg-elevated";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => copy(pageUrl, "link")} className={btn}>
          Copy link
          <span className="font-mono text-[9px] text-faint">{copied === "link" ? "COPIED ✓" : "URL"}</span>
        </button>
        <button type="button" onClick={() => copy(embedSnippet, "embed")} className={btn}>
          Copy embed code
          <span className="font-mono text-[9px] text-faint">{copied === "embed" ? "COPIED ✓" : "IFRAME"}</span>
        </button>
        <a href={atlasUrl} className={btn}>
          Open in the interactive atlas →
        </a>
      </div>
      {/* tabIndex + a name, because this scrolls (iter-44, axe
          scrollable-region-focusable). `overflow-x-auto` on a long single line
          means a mouse user can drag to read the rest of the snippet and a
          keyboard user had no way to move it at all — the content past the right
          edge was simply unreachable. A focusable scroll container is the remedy
          the rule names; `role="region"` plus the label is what stops it being an
          unlabelled tab stop once it is focusable. */}
      <code
        tabIndex={0}
        role="region"
        aria-label="Embed code snippet, scrollable"
        className="atl-scroll block overflow-x-auto whitespace-pre border border-border-soft bg-panel-solid px-3 py-2 font-mono text-[10.5px] leading-relaxed text-muted"
      >
        {embedSnippet}
      </code>
    </div>
  );
}
