"use client";

// Social card export dialog (iter-71, feat-social-export): live preview of
// the Instagram-ready card with preset (4:5 / 1:1), theme (ink / paper) and
// an editable headline. Download renders full-res (2x) via lib/social-export.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  renderSocialCard, presetSize, SocialCardSpec, SocialFeature, SocialPreset, SocialTheme,
} from "@/lib/social-export";

type Props = {
  onClose: () => void;
  metric: { name: string; unit: string; year: number; source: string; decimals: number };
  level: "state" | "district";
  focusName: string | null;
  /** Carries `estimated` / `estimate_kind` so the card can disclose them — a PNG
   *  travels with no tooltip, rail or methodology to fall back on (item 643). */
  entries: { code: string; name: string; value: number; estimated?: number; estimate_kind?: string | null }[];
  features: SocialFeature[];
  codeOf: (f: SocialFeature) => string;
  paletteFn: (t: number) => string;
  fileBase: string;
};

export function SocialExportDialog({
  onClose, metric, level, focusName, entries, features, codeOf, paletteFn, fileBase,
}: Props) {
  const [preset, setPreset] = useState<SocialPreset>("portrait");
  const [theme, setTheme] = useState<SocialTheme>("ink");
  const [headline, setHeadline] = useState(metric.name);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const renderT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spec = useCallback((): SocialCardSpec => ({
    preset, theme, headline, metric, level, focusName, entries, features, codeOf, paletteFn,
  }), [preset, theme, headline, metric, level, focusName, entries, features, codeOf, paletteFn]);

  // debounced live preview
  useEffect(() => {
    if (renderT.current) clearTimeout(renderT.current);
    renderT.current = setTimeout(async () => {
      const full = await renderSocialCard(spec());
      const cv = previewRef.current;
      if (!cv) return;
      const { w, h } = presetSize(preset);
      // viewport-responsive preview (iter-72 item 569): as large as fits
      // beside the 300px control column, capped by 84% viewport height
      const maxW = Math.min(760, Math.max(380, window.innerWidth - 440));
      const maxH = Math.round(window.innerHeight * 0.84);
      const pw = Math.min(maxW, Math.round((maxH * w) / h));
      const ph = Math.round((pw * h) / w);
      cv.width = pw * 2; cv.height = ph * 2;
      cv.style.width = `${pw}px`; cv.style.height = `${ph}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(full, 0, 0, cv.width, cv.height);
    }, 200);
    return () => { if (renderT.current) clearTimeout(renderT.current); };
  }, [spec, preset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async () => {
    setBusy(true);
    try {
      const canvas = await renderSocialCard(spec());
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileBase}-card-${preset}-${theme}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const seg = (on: boolean) => ({
    background: on ? "#d1502f" : "transparent",
    color: on ? "#16110b" : "#d8ccbe",
  });

  return (
    <div
      className="atl-fade fixed inset-0 z-[60] grid place-items-center"
      style={{ background: "rgba(8,9,7,.72)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Export social media card"
    >
      <div className="atl-pop flex max-h-[92dvh] gap-0 overflow-hidden border border-border bg-panel-solid" style={{ boxShadow: "0 18px 52px rgba(0,0,0,.6)" }}>
        {/* preview */}
        <div className="grid place-items-center border-r border-border-soft p-5" style={{ background: "#0a0b08" }}>
          <canvas ref={previewRef} aria-label="Card preview" />
        </div>

        {/* controls */}
        <div className="flex w-[300px] flex-col gap-4 p-5">
          <div>
            <div className="text-[14px] font-bold text-bright">Social card</div>
            <div className="mt-1 text-[11px] leading-snug text-faint">
              Mainland + island insets, value labels, 5-class jenks legend, source + brand block.
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-dim">FORMAT</div>
            <div className="flex overflow-hidden rounded-sm border border-border">
              <button onClick={() => setPreset("portrait")} aria-pressed={preset === "portrait"}
                className="flex-1 px-3 py-2 text-[11.5px] font-semibold" style={seg(preset === "portrait")}>
                4:5 · 1080×1350
              </button>
              <button onClick={() => setPreset("square")} aria-pressed={preset === "square"}
                className="flex-1 px-3 py-2 text-[11.5px] font-semibold" style={seg(preset === "square")}>
                1:1 · 1080×1080
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-dim">THEME</div>
            <div className="flex overflow-hidden rounded-sm border border-border">
              <button onClick={() => setTheme("ink")} aria-pressed={theme === "ink"}
                className="flex-1 px-3 py-2 text-[11.5px] font-semibold" style={seg(theme === "ink")}>
                Dark ink
              </button>
              <button onClick={() => setTheme("paper")} aria-pressed={theme === "paper"}
                className="flex-1 px-3 py-2 text-[11.5px] font-semibold" style={seg(theme === "paper")}>
                Paper
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-dim">HEADLINE</div>
            <input
              value={headline} onChange={(e) => setHeadline(e.target.value)}
              maxLength={90} aria-label="Card headline"
              className="w-full border border-border bg-elevated px-2.5 py-2 text-[12.5px] text-foreground"
            />
            <div className="mt-1 text-[10px] text-dim">Last word gets the accent highlight.</div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={download} disabled={busy || entries.length === 0}
              className="w-full bg-accent px-4 py-2.5 text-[12px] font-bold tracking-[.05em] text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "RENDERING…" : "DOWNLOAD PNG"}
            </button>
            <button onClick={onClose} className="w-full border border-border px-4 py-2 text-[11.5px] font-semibold text-muted hover:bg-elevated">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
