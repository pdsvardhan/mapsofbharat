// ESLint rule: a hex colour written into a component must say which token it tracks.
// (to-do #523, the limit adr-033 states it left open.)
//
// WHY THIS EXISTS. `--accent-ink` was changed from #16110b to #0a0806 to clear a real
// WCAG failure — eight controls carrying 10-13px bold text on the accent fill, measured
// at 4.38:1 against a 4.5:1 floor. The token moved. Five hardcoded copies of the OLD
// value did not, because nothing connected them to the token: they were just strings.
// The same story produced #502 (one warning colour defined twice, in two files, free to
// drift apart) and #501. Every one of them was found BY HAND, by someone reading files.
// A palette that can only be kept consistent by remembering to grep is not a palette.
//
// WHAT IT ASKS FOR, which is not "never write a hex". Some literals genuinely cannot be
// a CSS variable, and pretending otherwise would just get the rule disabled:
//
//   - MapLibre paint expressions are parsed by the GL style spec, not the CSS engine;
//     `var(--accent)` there is an invalid colour, not an indirection.
//   - Satori (`opengraph-image.tsx`) and canvas (`lib/social-export.ts`) render outside
//     the document, so there is no computed style to read a variable from.
//   - `manifest.ts` / `themeColor` are consumed by the browser chrome as literal values.
//
// So the rule is: write the hex if you must, but ANNOTATE it, in a comment on the same
// line or above the nearest enclosing statement:
//
//   token: --accent          this literal is a copy of that token; move one, move both
//   no-token: <reason>       deliberately not a token, and here is why
//
// That turns the #501 class from "remember to grep" into "grep for `token: --accent-ink`
// and you have every copy" — which is a thirty-second job with a complete answer.
//
// A `no-token:` needs a real reason. An empty one is refused, because a rule that
// accepts `no-token:` as a magic word is a rule that gets pasted, not read.
//
// WHY 3-DIGIT HEX IS TREATED DIFFERENTLY. This codebase writes issue references as
// `#419`, `#916`, `#523` in prose. Those are three hex-looking digits. Comments are not
// scanned (the rule only visits string literals and template chunks), but a `#916` could
// still land inside a string, so a 3-digit hex is only flagged when the ENTIRE string is
// the colour — `"#fff"` is a colour, `"see #916"` is not. Six- and eight-digit forms are
// flagged wherever they appear, including inside a longer CSS string such as a gradient.

const SIX_OR_EIGHT = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/;
const EXACT_THREE = /^\s*#[0-9a-fA-F]{3}\s*$/;

// `token: --foo` or `no-token: some reason at least this long`
const ANNOTATION = /(?:^|[^\w-])(?:token:\s*(--[A-Za-z0-9_-]+)|no-token:\s*(\S[^*]*))/;

function annotationIn(text) {
  const m = text.match(ANNOTATION);
  if (!m) return null;
  if (m[1]) return { kind: "token", value: m[1] };
  const reason = (m[2] || "").trim();
  if (reason.length < 8) return { kind: "bad" };
  return { kind: "no-token", value: reason };
}

/** True when the string carries a hex colour we care about. */
function hasHex(raw) {
  if (typeof raw !== "string") return false;
  if (SIX_OR_EIGHT.test(raw)) return true;
  return EXACT_THREE.test(raw);
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Hex colour literals in components must name the design token they track, so a token change can find every copy.",
    },
    schema: [],
    messages: {
      unannotated:
        "Hex colour '{{hex}}' is written into the source with nothing connecting it to the palette. " +
        "Use var(--token) if this can be a CSS variable; if it cannot (MapLibre paint, Satori, canvas, manifest), " +
        "annotate it with `token: --name` — or `no-token: <reason>` if it deliberately is not one. " +
        "This is how --accent-ink moved and left five stale copies behind (#501, #523).",
      emptyReason:
        "`no-token:` needs an actual reason (8+ characters) saying why this colour is not a token.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Look for an annotation on the node's own line, or attached to any enclosing
     *  statement. Walking up the ancestor chain is what lets one comment cover a whole
     *  palette object (CAT_ACCENT's twenty entries) instead of demanding twenty
     *  identical comments — the point is a stated intent, not ceremony. */
    function findAnnotation(node) {
      const startLine = node.loc.start.line;

      for (const c of sourceCode.getAllComments()) {
        if (c.loc.end.line === startLine || c.loc.start.line === startLine) {
          const a = annotationIn(c.value);
          if (a) return a;
        }
      }

      let n = node;
      while (n) {
        const before = sourceCode.getCommentsBefore(n) || [];
        for (const c of before) {
          const a = annotationIn(c.value);
          if (a) return a;
        }
        n = n.parent;
      }
      return null;
    }

    function check(node, raw) {
      if (!hasHex(raw)) return;
      const a = findAnnotation(node);
      if (a && (a.kind === "token" || a.kind === "no-token")) return;
      if (a && a.kind === "bad") {
        context.report({ node, messageId: "emptyReason" });
        return;
      }
      const hex = (raw.match(SIX_OR_EIGHT) || [raw.trim()])[0];
      context.report({ node, messageId: "unannotated", data: { hex } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value?.raw ?? "");
      },
      JSXText(node) {
        // A colour typed as page copy is not a palette drift risk, but a `#0d0f14`
        // rendered as visible text almost always means a stray style got into markup.
        if (SIX_OR_EIGHT.test(node.value)) check(node, node.value);
      },
    };
  },
};

export default rule;
