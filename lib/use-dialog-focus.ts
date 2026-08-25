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

    // A SECOND GUARD, for the routes out that keydown cannot see.
    //
    // The Tab handler only fires on Tab, and it decides by comparing
    // document.activeElement against a snapshot of the focusable set. Focus can
    // leave by other means — a click on the page behind, a stray programmatic
    // focus, or a re-render moving the element that was snapshotted as last.
    // focusin fires after focus has moved, whatever moved it, so it catches all
    // of them.
    //
    // WHAT IS AND IS NOT MEASURED, corrected after verification. An earlier
    // version of this comment claimed the full suite reliably failed under load
    // without this listener, and presented that as measured fact. It is not
    // reproducible: the iter-44 code verifier ran the full suite three times with
    // the listener removed, once at triple parallelism, and got 420/0/0 every
    // time. What actually happened was a SINGLE observed failure — "Tab off the
    // LAST control left the dialog" — which is consistent with the re-render race
    // above but was seen once and never again. So: this listener is defensive,
    // its necessity is not established, and the honest claim is that it closes
    // routes the keydown handler provably does not cover.
    //
    // It is no longer untested, which was the real criticism: removing it used to
    // leave the entire suite green. tests/a11y.spec.ts now focuses an element
    // OUTSIDE an open dialog and asserts focus comes back, which fails without it.
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
