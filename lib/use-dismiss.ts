"use client";

// Shared popover dismissal — outside press + Escape (iter-26 item 764).
// The cohort dropdown and the scale popover both shipped without either, so a
// click anywhere else left them hanging open over the map. Share-menu already
// had the outside-press half; folding all three onto one hook means the next
// popover gets Escape for free.

import { useEffect, useRef, type RefObject } from "react";

export function useDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
  /** Selector for a trigger that lives OUTSIDE `ref` (the scale popover's
   *  ⚙ SCALE button sits in the legend card). Without this the outside-press
   *  closes on mousedown and the trigger's click re-opens it — a dead toggle. */
  ignoreSelector?: string,
): void {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t as Node)) return;
      if (ignoreSelector && t?.closest?.(ignoreSelector)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape dismisses the TOPMOST layer only. india-map registers its own
      // Escape handler on window, which clears the map selection; document
      // precedes window in the bubble path, so without this the popover closes
      // AND the user's selected region is silently discarded behind it. The
      // chooser and search modals already honour this contract.
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, ignoreSelector]);
}
