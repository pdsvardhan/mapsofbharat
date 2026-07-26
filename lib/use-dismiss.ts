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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, ignoreSelector]);
}
