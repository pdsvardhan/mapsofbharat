"use client";

// Social card export dialog (iter-71, feat-social-export): live preview of
// the Instagram-ready card with preset (4:5 / 1:1), theme (ink / paper) and
// an editable headline. Download renders full-res (2x) via lib/social-export.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderSocialCard, presetSize, cardClassification, cardShowsTables,
  SocialCardSpec, SocialFeature, SocialPreset, SocialTheme,
} from "@/lib/social-export";
import { BreakMethod, METHOD_LABEL, PALETTES, PaletteId } from "@/lib/breaks";
import { PROVENANCE_CLASSES, PROVENANCE_COLOR, PROVENANCE_LABEL, type ProvenanceClass } from "@/lib/coverage";
import { track } from "@/lib/analytics";

type Props = {
  onClose: () => void;
  /** `sources` carries compact credits for any ADDITIONAL dataset the number is
   *  built from (item 850) — passed straight through to the card spec. */
  metric: { name: string; unit: string; year: number; source: string; decimals: number; sources?: string[] };
  level: "state" | "district";
  focusName: string | null;
  /** Carries `estimated` / `estimate_kind` so the card can disclose them — a PNG
   *  travels with no tooltip, rail or methodology to fall back on (item 643). */
  entries: { code: string; name: string; value: number; estimated?: number; estimate_kind?: string | null }[];
  features: SocialFeature[];
  codeOf: (f: SocialFeature) => string;
  /** The map's active palette + direction (item 830). The card starts from these so
   *  the export matches the screen, and its own COLOUR SCHEME selector re-colours the
   *  preview from here without disturbing the map. */
  palette: PaletteId;
  reverse: boolean;
  /** The map's active view — threaded so a coverage-mode card mirrors the map. */
  mode: "value" | "vs_avg" | "coverage";
  /** Coverage classes toggled off on the map, passed through to the card. */
  coverageHidden?: ProvenanceClass[];
  /** The explorer's live class edges — passed straight through so the exported
   *  card classes the data exactly as the map does (item 759). */
  breaks?: number[];
  /** The break method behind `breaks`, so the card can NAME the classification it
   *  paints with (item 827). */
  method: BreakMethod;
  fileBase: string;
};

export function SocialExportDialog({
  onClose, metric, level, focusName, entries, features, codeOf,
  palette, reverse, mode, coverageHidden, breaks, method, fileBase,
}: Props) {
  const [preset, setPreset] = useState<SocialPreset>("portrait");
  const [theme, setTheme] = useState<SocialTheme>("ink");
  const [headline, setHeadline] = useState(metric.name);
  const [rows, setRows] = useState<3 | 5 | 7 | 10>(5); // item 761: 5 is the default, was 7
  const [markers, setMarkers] = useState<"none" | "extremes" | "top3" | "table">("none");
  // The card owns a copy of the map's palette + direction so its COLOUR SCHEME
  // selector can recolour the preview without touching the map (item 830). Coverage
  // mode ignores the ramp — it uses the categorical provenance palette.
  const [pal, setPal] = useState<PaletteId>(palette);
  const [rev, setRev] = useState<boolean>(reverse);
  const coverage = mode === "coverage";
  const paletteFn = useMemo(
    () => (rev ? (t: number) => PALETTES[pal].fn(1 - t) : PALETTES[pal].fn),
    [pal, rev],
  );
  const dirtyColour = pal !== palette || rev !== reverse;
  // null → default (last word); explicit [] → no accent (iter-101 item 684)
  const [accentSel, setAccentSel] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const renderT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On-map rank MARKERS only exist on dense cards — a sparse (state) card labels
  // every region on the map instead, so there is nothing for a marker to add.
  const dense = level === "district" || entries.length > 40;
  // Rank TABLES are a different question, and asking it here is what broke:
  // this used to gate on `dense` too, which was true while the shipped layout
  // drew no tables on state cards, and quietly wrong from the moment v7 shipped
  // `atState: true`. The TABLE ROWS control then sat greyed and inert on state
  // cards that do have rank tables — including the card item 920 was filed
  // from. Ask the renderer instead, so the two cannot drift again.
  const showsTables = cardShowsTables(level, entries.length);
  const headWords = useMemo(() => headline.trim().split(/\s+/).filter(Boolean), [headline]);
  const accents = useMemo(
    () => accentSel ?? (headWords.length ? [headWords.length - 1] : []),
    [accentSel, headWords],
  );
  const toggleWord = (i: number) => {
    const cur = new Set(accents);
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    setAccentSel([...cur].sort((a, b) => a - b));
  };

  const spec = useCallback((): SocialCardSpec => ({
    preset, theme, headline, metric, level, focusName, entries, features, codeOf, paletteFn, breaks, method,
    mode, coverageHidden,
    tableN: rows, markerMode: markers, accentWords: accents,
  }), [preset, theme, headline, metric, level, focusName, entries, features, codeOf, paletteFn,
    breaks, method, mode, coverageHidden, rows, markers, accents]);

  // Describe the card's actual classification — one source of truth with the card
  // itself, so the control-panel copy can never say "jenks" while the card draws
  // something else (item 827).
  const cls = useMemo(
    () => cardClassification({ breaks, method, entries }),
    [breaks, method, entries],
  );

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
    // export: a social card PNG was rendered and downloaded (item 825). Identifies
    // the action (format/preset/theme) and the metric it depicts.
    track("export", { format: "png", preset, theme, metric: metric.name });
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
        <div className="flex w-[300px] flex-col gap-4 overflow-y-auto p-5">
          <div>
            <div className="text-[14px] font-bold text-bright">Social card</div>
            <div className="mt-1 text-[11px] leading-snug text-faint">
              {coverage
                ? "Regions shaded by data provenance — measured vs re-aggregated / inherited / projected — with a matching legend, source + brand block."
                : `High/low tables, island insets, ${cls.classes}-class ${METHOD_LABEL[cls.method].toLowerCase()} legend, source + brand block.`}
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-faint">FORMAT</div>
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
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-faint">THEME</div>
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

          {/* COLOUR SCHEME — the colour choice the popup was missing (item 830). It
              starts from the map's palette + direction and re-renders the preview on
              change; "Match map" resets it. Coverage mode uses the fixed provenance
              palette instead of a value ramp, so the ramp picker is replaced by a
              read-only key there. */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9.5px] tracking-[.1em] text-faint">COLOUR SCHEME</span>
              {!coverage && dirtyColour && (
                <button
                  onClick={() => { setPal(palette); setRev(reverse); }}
                  className="text-[10px] font-semibold text-faint hover:text-accent-text"
                >
                  Match map
                </button>
              )}
            </div>
            {coverage ? (
              <div>
                <div className="flex gap-1.5">
                  {PROVENANCE_CLASSES.map((c) => (
                    <div key={c} className="flex flex-1 flex-col items-center gap-1" title={PROVENANCE_LABEL[c]}>
                      <span className="h-[18px] w-full rounded-sm border border-border" style={{ background: PROVENANCE_COLOR[c] }} />
                      <span className="text-[8px] leading-none text-faint">{PROVENANCE_LABEL[c]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-[10px] leading-snug text-muted">Coverage cards use fixed, colour-blind-safe provenance colours.</div>
              </div>
            ) : (
              <>
                <div className="flex gap-1.5" role="group" aria-label="Card colour scheme">
                  {(Object.keys(PALETTES) as PaletteId[]).map((p) => (
                    <button
                      key={p} onClick={() => setPal(p)}
                      title={`${PALETTES[p].name} — ${PALETTES[p].note}`}
                      aria-label={`Colour scheme ${PALETTES[p].name}`} aria-pressed={pal === p}
                      data-card-palette={p}
                      className="h-[20px] flex-1 rounded-sm border transition-transform hover:-translate-y-0.5"
                      style={{
                        background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => PALETTES[p].fn(rev ? 1 - t : t)).join(",")})`,
                        borderColor: pal === p ? "#d1502f" : "#3b3626",
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setRev((r) => !r)} aria-pressed={rev} data-card-reverse
                  className="mt-2 w-full border border-border px-2.5 py-1.5 text-[10.5px] font-bold hover:text-foreground"
                  // Same control, same token as the legend's REVERSE and the ⚙ SCALE
                  // popover's DIRECTION row: --accent as an ON label measured 4.35:1
                  // (items 431/473).
                  style={{ color: rev ? "var(--accent-text)" : "#a49d8c" }}
                >
                  ↔ REVERSE {rev ? "ON" : "OFF"}
                </button>
                <div className="mt-1 text-[10px] text-faint">{PALETTES[pal].name}</div>
              </>
            )}
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-faint">TABLE ROWS</div>
            <div className={`flex overflow-hidden rounded-sm border border-border ${showsTables ? "" : "opacity-40"}`}
              title={showsTables ? undefined : "This layout labels the map directly instead of drawing rank tables"}>
              {([3, 5, 7, 10] as const).map((n) => (
                <button key={n} onClick={() => setRows(n)} aria-pressed={rows === n} disabled={!showsTables}
                  className="flex-1 px-2 py-2 text-[11.5px] font-semibold disabled:cursor-not-allowed" style={seg(rows === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-faint">MAP MARKERS</div>
            <div className={`flex overflow-hidden rounded-sm border border-border ${dense ? "" : "opacity-40"}`}
              title={dense ? undefined : "State cards label every state on the map already"}>
              {([["none", "None"], ["extremes", "#1s"], ["top3", "Top 3"], ["table", "Match"]] as const).map(([v, lab]) => (
                <button key={v} onClick={() => setMarkers(v)} aria-pressed={markers === v} disabled={!dense}
                  className="flex-1 px-1.5 py-2 text-[11px] font-semibold disabled:cursor-not-allowed" style={seg(markers === v)}>
                  {lab}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[.1em] text-faint">HEADLINE</div>
            <input
              value={headline}
              onChange={(e) => { setHeadline(e.target.value); setAccentSel(null); }}
              maxLength={90} aria-label="Card headline"
              className="w-full border border-border bg-elevated px-2.5 py-2 text-[12.5px] text-foreground"
            />
            {headWords.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Pick accent words">
                {headWords.map((w, i) => (
                  <button key={`${i}-${w}`} onClick={() => toggleWord(i)}
                    aria-pressed={accents.includes(i)}
                    className="rounded-sm border border-border px-1.5 py-0.5 text-[10.5px] font-semibold"
                    style={seg(accents.includes(i))}>
                    {w}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1 text-[10px] text-muted">Tap words to move the accent. None selected = no highlight.</div>
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
