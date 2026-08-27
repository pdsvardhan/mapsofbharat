// Is this link a CONTROL, or is it a link in a sentence? (#635, #656)
//
// WHY THE DECISION LEFT THE BROWSER. It used to live inside a page.evaluate, where
// nothing could reach it: the only way to exercise it was to load a real route and
// hope a page happened to contain the shape you wanted to test. So each hole in it
// was found by reading, not by measuring, and the fix for each was believed rather
// than proved. The browser still does the measuring — computed styles only exist
// there — and the judging happens here, where it can be given a shape on purpose.
//
// WHAT THIS EXCLUSION IS FOR. A prose link must be underlined; colour alone fails
// WCAG 1.4.1. But an in-text link is inline by definition, and a link laid out as a
// button is a control — "↓ Download raw source" and "Open in the interactive atlas →"
// on /metric/[slug] are inline-flex with an accent fill, and underlining them would
// look like damage. Those two are the entire reason this exists.
//
// AND ITS HISTORY IS AN OPT-OUT COMING BACK IN NEW CLOTHES.
//
//   First it was a class, and a link could simply wear it.
//   Then (#635) it was display alone — `inline-flex` plus `no-underline` on a genuine
//   in-text link produced accent-orange text, mid-sentence, no underline, skipped
//   here and invisible to axe for its own reason. Fixed by requiring a SURFACE as
//   well as a layout: a fill, a border, real padding, or an explicit role.
//   Then (#656) three ways through the surface test itself, closed below.
//
// So the bar is: it is laid out as a container AND it has a surface a reader would
// read as a control.

export type StyleProbe = {
  display: string;
  backgroundImage: string;
  backgroundColor: string;
  borderTopWidth: number;
  borderRightWidth: number;
  borderBottomWidth: number;
  borderLeftWidth: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  role: string | null;
};

/** Laid out as a container rather than as text. Necessary, never sufficient (#635). */
export function isContainerLaidOut(s: StyleProbe): boolean {
  return s.display.includes("flex") || s.display.includes("grid");
}

/** A fill. `none` and fully transparent are not surfaces. */
export function hasFill(s: StyleProbe): boolean {
  return s.backgroundImage !== "none"
    || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent");
}

/**
 * A border that frames, rather than one that underlines.
 *
 * BOTTOM IS EXCLUDED ON PURPOSE (#656). `border-b` on a link is what an underline
 * looks like when you draw it yourself, so counting it as a control signal let a link
 * opt out of underlining by drawing one and calling it furniture. A real control
 * keeps its exemption — a full border still has a top, a left and a right — and a
 * bottom border is credited as an underline instead, which is what a reader sees.
 *
 * RIGHT IS INCLUDED (#656): it was simply missing, so an element bordered on that
 * side alone read as unbordered.
 */
export function hasFramingBorder(s: StyleProbe): boolean {
  return s.borderTopWidth > 0 || s.borderLeftWidth > 0 || s.borderRightWidth > 0;
}

/**
 * Padding on BOTH axes, not either (#656).
 *
 * This was an OR, and `py-1` alone — 4px top, 4px bottom, 8px total, nothing
 * horizontal — cleared the 6px bar and exempted the link. Vertical padding on an
 * inline element is nearly free; what makes a control look like one is a surface
 * extending around the text. Both real cases clear both bars comfortably.
 */
export function hasControlPadding(s: StyleProbe): boolean {
  return (s.paddingTop + s.paddingBottom) >= 6
    && (s.paddingLeft + s.paddingRight) >= 8;
}

/** Said outright. */
export function hasControlRole(s: StyleProbe): boolean {
  return s.role === "button";
}

/** The whole rule: laid out as a container AND carrying a control's surface. */
export function isControl(s: StyleProbe): boolean {
  if (!isContainerLaidOut(s)) return false;
  return hasFill(s) || hasFramingBorder(s) || hasControlPadding(s) || hasControlRole(s);
}

/**
 * A reader sees an underline whether it came from text-decoration or from a border
 * drawn along the bottom. Both count (#656) — otherwise closing the border-bottom
 * hole would start demanding a text-decoration on links that already look underlined.
 */
export function looksUnderlined(deco: string, s: StyleProbe): boolean {
  return deco.includes("underline") || s.borderBottomWidth > 0;
}
