import { test, expect } from "@playwright/test";
import {
  isControl, looksUnderlined, hasFramingBorder, hasControlPadding, hasFill,
  isContainerLaidOut, type StyleProbe,
} from "./lib/control-signal";

// #656 — the three ways back into the #635 opt-out, each given a shape on purpose.
//
// The rule this tests used to live inside a page.evaluate, where the only way to
// exercise it was to load a real route and hope a page happened to contain the shape
// you cared about. So every hole was found by READING and every fix was BELIEVED.
// These are the same three holes, measured.
//
// Each case asserts BOTH directions: the shape was exempt under the old rule (which
// is why it was a hole) and is caught under the new one. Asserting only the new
// verdict would pass just as well against a rule that never exempted anything, and
// that rule would demand underlines on the two real controls this exclusion exists
// for — so the last block pins those.

const base: StyleProbe = {
  display: "inline",
  backgroundImage: "none",
  backgroundColor: "rgba(0, 0, 0, 0)",
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  role: null,
};

const shape = (over: Partial<StyleProbe>): StyleProbe => ({ ...base, display: "inline-flex", ...over });

// The rule as it stood before #656, kept here as the CONTROL for each differential.
// If a case stopped being a hole under the old rule, the case has drifted away from
// what it claims to be testing, and the assertion pairs below go red saying so.
function wasControlBefore656(s: StyleProbe): boolean {
  if (!(s.display.includes("flex") || s.display.includes("grid"))) return false;
  const filled = s.backgroundImage !== "none"
    || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent");
  const bordered = s.borderTopWidth > 0 || s.borderBottomWidth > 0 || s.borderLeftWidth > 0;
  const padded = (s.paddingTop + s.paddingBottom) >= 6 || s.paddingLeft >= 8;
  return filled || bordered || padded || s.role === "button";
}

test.describe("hole 1 — py-1 alone bought an exemption", () => {
  // Tailwind py-1 is 4px top and 4px bottom: 8px total, over the 6px bar, and
  // nothing horizontal. Vertical padding on an inline element is nearly free.
  const py1 = shape({ paddingTop: 4, paddingBottom: 4 });

  test("it WAS exempt, which is what made it a hole", () => {
    expect(wasControlBefore656(py1)).toBe(true);
  });

  test("it is not a control now", () => {
    expect(hasControlPadding(py1)).toBe(false);
    expect(isControl(py1)).toBe(false);
  });

  test("padding on both axes still is", () => {
    const real = shape({ paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 10 });
    expect(hasControlPadding(real)).toBe(true);
    expect(isControl(real)).toBe(true);
  });
});

test.describe("hole 2 — a border on the right was invisible to the rule", () => {
  const rightOnly = shape({ borderRightWidth: 2 });

  test("it was NOT seen as bordered before, so it fell through", () => {
    expect(wasControlBefore656(rightOnly)).toBe(false);
  });

  test("it is seen now", () => {
    expect(hasFramingBorder(rightOnly)).toBe(true);
    expect(isControl(rightOnly)).toBe(true);
  });
});

test.describe("hole 3 — a drawn underline counted as a control surface", () => {
  // `border-b` on a link is what an underline looks like when you draw it yourself.
  const borderB = shape({ borderBottomWidth: 1 });

  test("it WAS exempt, so a link could opt out by drawing its own underline", () => {
    expect(wasControlBefore656(borderB)).toBe(true);
  });

  test("a bottom border is no longer a control surface", () => {
    expect(hasFramingBorder(borderB)).toBe(false);
    expect(isControl(borderB)).toBe(false);
  });

  test("but it IS credited as an underline, which is what a reader sees", () => {
    // Without this half, closing the hole would start demanding a text-decoration on
    // links that already look underlined — a fix that trades one false result for
    // another.
    expect(looksUnderlined("none", borderB)).toBe(true);
    expect(looksUnderlined("none", shape({}))).toBe(false);
    expect(looksUnderlined("underline", shape({}))).toBe(true);
  });

  test("a FULL border is still a control — closing the hole did not shut the door", () => {
    const framed = shape({
      borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1,
    });
    expect(hasFramingBorder(framed)).toBe(true);
    expect(isControl(framed)).toBe(true);
  });
});

test.describe("what the exclusion exists for is still excluded", () => {
  // "↓ Download raw source" and "Open in the interactive atlas →" on /metric/[slug]:
  // inline-flex with an accent fill. Underlining these would look like damage, and a
  // rule that caught them would be reverted within a day — at which point all three
  // holes come back with it.
  const accentButton = shape({
    backgroundColor: "rgb(209, 80, 47)", paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12,
  });

  test("an accent-filled inline-flex link is a control", () => {
    expect(hasFill(accentButton)).toBe(true);
    expect(isControl(accentButton)).toBe(true);
  });

  test("layout alone is still not enough — that was #635", () => {
    // inline-flex + no-underline on a genuine in-text link: accent-orange text,
    // mid-sentence, no underline. The rule must judge it like any other prose link.
    const bare = shape({});
    expect(isContainerLaidOut(bare)).toBe(true);
    expect(isControl(bare)).toBe(false);
  });

  test("an inline link is never a control, whatever surface it carries", () => {
    const inlineFilled: StyleProbe = { ...base, backgroundColor: "rgb(209, 80, 47)" };
    expect(isControl(inlineFilled)).toBe(false);
  });

  test("an explicit role=button says so outright", () => {
    expect(isControl(shape({ role: "button" }))).toBe(true);
    expect(isControl({ ...base, role: "button" })).toBe(false); // still needs the layout
  });
});
