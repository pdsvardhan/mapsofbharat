"use client";

// The keyboard half of a modal dialog (iter-44, item 1054).
//
// WHAT WAS MEASURED, 2026-08-26, on the live atlas. Opening BROWSE INDICATORS
// rendered `role="dialog"` and then did none of what that promises: `aria-modal`
// was absent, so assistive tech never hid the page behind it; focus stayed on the
// opener, so a keyboard user was left OUTSIDE the thing they had just opened; and
// thirty consecutive Tab presses walked focus straight out into the map behind.
// axe reported the atlas perfectly clean throughout — none of this is visible to
// automated rules, which is the whole argument for probing keyboard behaviour by
// hand.
//
// WHY A HOOK RATHER THAN THREE FIXES. This site has three modal overlays —
// chooser, search, social export — and hand-rolling a trap in each is how two of
// them end up subtly different and the third gets forgotten. `useDismiss` already
// exists for POPOVERS (outside-press + Escape) and is deliberately left alone: a
// popover should not trap focus, and conflating the two would put a trap on the
// share menu where it would be wrong.
//
// Escape is NOT handled here, on purpose. The three modals already close on
// Escape through india-map's window handler, and that handler is load-bearing in
// a way use-dismiss.ts documents at length — it guards on which overlay is open
// before clearing the map selection. Adding a second Escape listener here would
// either double-fire or start competing with it.

import { useEffect, useRef, type RefObject } from "react";

/** Tab stops, in DOM order, that are actually reachable right now. */
function focusable(root: HTMLElement): HTMLElement[] {
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  return [...root.querySelectorAll<HTMLElement>(sel)].filter(
    (el) =>
      el.getAttribute("aria-disabled") !== "true" &&
      // offsetParent is null for display:none and for anything inside it.
      // position:fixed elements report null too, hence the rect fallback.
      (el.offsetParent !== null || el.getBoundingClientRect().width > 0)
  );
}

/**
 * Move focus into `ref` when `open` becomes true, keep Tab inside it while open,
 * and hand focus back to whatever opened it on close.
 *
 * The container must carry `tabIndex={-1}` so there is somewhere to put focus
 * when the dialog has no focusable children yet — which is the real state of the
 * search modal for the first frame, before its input mounts.
 */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>): void {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    // Remember who opened this BEFORE moving focus, so it can be handed back.
    opener.current = document.activeElement as HTMLElement | null;

    // Focus the first real control, or the container itself. Deferred one frame:
    // the list inside the chooser renders from state that is not committed on the
    // first effect pass, and focusing before it exists lands on the container and
    // stays there.
    const raf = requestAnimationFrame(() => {
      const first = focusable(node)[0];
      (first ?? node).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const stops = focusable(node);
      if (stops.length === 0) {
        // Nothing to move to — keep focus on the container rather than letting it
        // escape to the page behind.
        e.preventDefault();
        node.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      // Focus outside the dialog entirely (a stray programmatic focus, or the
      // browser handing it to the document) is pulled back to the near edge.
      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // BOTH LISTENERS ARE LOAD-BEARING, and each was mutation-tested separately
    // because this project has been bitten by redundant guards hiding each other.
    // The measured division of labour:
    //
    //   keydown off, focusin on  -> a11y spec goes RED. The backstop alone is not
    //                               enough: it only acts AFTER focus has already
    //                               left, and the wrap it performs lands on the
    //                               first control rather than the last, so
    //                               Shift+Tab off the first element is still wrong.
    //   focusin off, keydown on  -> the isolated spec PASSES, and the FULL suite
    //                               fails under load. That is not a flake: the
    //                               keydown handler decides by comparing
    //                               document.activeElement against a snapshot of
    //                               the focusable set, and this dialog re-renders
    //                               while open (the topic list swaps as a category
    //                               is entered), so the element that was last when
    //                               the snapshot was taken need not be last when
    //                               the key fires. Under load the re-render lands
    //                               inside that window often enough to matter.
    //
    // So keydown PREVENTS the escape and focusin CATCHES the race keydown cannot
    // see. Removing either one loses real coverage; the isolated spec can only
    // observe the first.
    //
    // focusin fires after focus has moved, whatever moved it — Tab, Shift+Tab, a It decides by
    // comparing document.activeElement against a snapshot of the focusable set,
    // and this dialog re-renders while open — the topic list swaps as a category
    // is entered — so the element that was last when the snapshot was taken may
    // not be last when the key fires, and focus steps straight out. Caught by the
    // suite failing under load while passing in isolation: a race, not a flake.
    //
    // focusin fires after focus has moved, whatever moved it — Tab, Shift+Tab, a
    // stray programmatic focus, a click on the page behind — so pulling it back
    // here covers every route out, including ones no key handler sees.
    const onFocusIn = (e: FocusEvent) => {
      if (node.contains(e.target as Node)) return;
      const stops = focusable(node);
      (stops[0] ?? node).focus();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      // Removed BEFORE focus is handed back: the opener is outside the dialog by
      // definition, so a live backstop would immediately yank focus in again.
      document.removeEventListener("focusin", onFocusIn);
      // Give focus back. Guarded on still being in the document: the opener can
      // be unmounted by the very action that closed the dialog (picking a metric
      // re-renders the toolbar), and focusing a detached node silently moves
      // focus to <body>, which is worse than leaving it alone.
      const back = opener.current;
      opener.current = null;
      if (back && document.contains(back)) back.focus();
    };
  }, [open, ref]);
}
