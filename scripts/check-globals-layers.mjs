#!/usr/bin/env node
// Refuse an UNLAYERED bare selector in app/globals.css (to-do #524, closing the hole
// adr-034 states it left open).
//
//   node scripts/check-globals-layers.mjs
//   node scripts/check-globals-layers.mjs --list    # print every top-level rule + verdict
//
// WHY THIS EXISTS. Cascade layers beat specificity: an UNLAYERED declaration wins over
// a layered one no matter how specific the layered one is. Tailwind v4 emits every
// utility into `@layer utilities`. So one unlayered rule in this file outranks the
// whole utility system, app-wide, silently.
//
// That is not a hypothetical. `* { border-color: var(--border) }` sat unlayered here
// and beat every `border-<colour>` utility in the app: measured 2026-08-13, 52
// declarations across 18 files asked for --border-soft (31), --border-faint (16) or an
// accent (5), and all 52 painted --border. The entire intended border hierarchy was
// collapsed to one value while the class names read as if it were not. Nothing was
// misspelled, no utility was missing, and no test saw it — the cascade simply discarded
// them. adr-034 fixed that one rule and said plainly that nothing stopped the next one.
// This is that stop.
//
// WHAT COUNTS AS "BARE", and why it is not simply "everything outside @layer".
// A rule is dangerous when it can match an element that never opted in — so the test is
// whether the selector contains ANY class or id anchor:
//
//   *                       bare  → flagged
//   body                    bare  → flagged
//   :root :focus-visible    bare  → flagged (see the exemption below)
//   .rankbar                anchored → fine; it only applies where the class is used
//   .atl-scroll::-webkit-scrollbar   anchored → fine
//
// `:root` declaring ONLY custom properties is exempt automatically: custom properties
// are not utilities, nothing in Tailwind generates a competing `--foo` declaration, and
// the palette has to live somewhere. A `:root` block that declares a REAL property is
// flagged like any other bare rule — that is a palette block quietly growing teeth.
//
// THE EXEMPTION, and why one is required rather than nice to have. Layering is not
// always the right answer: `:root :focus-visible` in this file MUST stay unlayered,
// because the rule it has to beat — maplibre-gl.css's own unscoped `:focus-visible`
// box-shadow — is itself unlayered, and layered always loses to unlayered. Putting it
// in a layer would hand the focus ring to the vendor on `/` and `/embed`. A guard with
// no exemption path would have been deleted the first time it was right about the rule
// and wrong about the fix. So: a comment carrying
//
//   cascade-exempt: <reason>
//
// immediately before the rule (or before its enclosing at-rule) permits it. The reason
// is not decoration — an exemption with no stated reason is refused, because "someone
// wrote cascade-exempt" is not evidence that anyone thought about it.
//
// HOW IT READS THE FILE, and why not with a regex. A regex over CSS text cannot tell an
// `@layer base { * { … } }` from a top-level `* { … }` — they differ only in nesting —
// and matching `^\S+ *{` would have called the SECOND of those safe, which is precisely
// the defect. So it brace-matches into a small tree and asks each node its depth and
// its enclosing at-rules. Comments are blanked to equal-length whitespace first, so a
// brace inside a comment cannot shift the parse while byte offsets still line up for
// the exemption lookup.

import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const TARGET = resolve(REPO, "app/globals.css");

const list = process.argv.includes("--list");

const src = readFileSync(TARGET, "utf8");

/** Blank every /* … *​/ comment to spaces, preserving length and newlines so that both
 *  brace matching and byte offsets stay true to the original. */
function blankComments(s) {
  const out = s.split("");
  let i = 0;
  while (i < s.length - 1) {
    if (s[i] === "/" && s[i + 1] === "*") {
      let j = s.indexOf("*/", i + 2);
      if (j === -1) j = s.length - 2;
      for (let k = i; k < j + 2 && k < s.length; k++) if (out[k] !== "\n") out[k] = " ";
      i = j + 2;
      continue;
    }
    i++;
  }
  return out.join("");
}

const code = blankComments(src);

const lineOf = (off) => src.slice(0, off).split("\n").length;

/** At-rules whose bodies contain further RULES (so we must descend) versus bodies that
 *  contain declarations or keyframe steps (which we never treat as style rules). */
const CONTAINER_AT = new Set(["layer", "media", "supports", "container", "scope", "document"]);
const DECL_AT = new Set(["theme", "font-face", "property", "keyframes", "counter-style", "page", "charset"]);

const findings = [];
const rules = [];
const unknownAtRules = [];

/** Recursive descent over balanced braces. `chain` is the stack of enclosing at-rule
 *  names, which is what makes "is this inside @layer?" a fact rather than a guess. */
function walk(from, to, chain) {
  let i = from;
  let preludeStart = i;
  while (i < to) {
    const c = code[i];
    if (c === ";" && code[i - 1] !== "\\") {
      preludeStart = i + 1;
      i++;
      continue;
    }
    if (c === "{") {
      // balanced scan to the matching close
      let depth = 1;
      let j = i + 1;
      while (j < to && depth > 0) {
        if (code[j] === "{") depth++;
        else if (code[j] === "}") depth--;
        j++;
      }
      const bodyStart = i + 1;
      const bodyEnd = j - 1;
      const prelude = code.slice(preludeStart, i).trim();
      const preludeOffset = preludeStart + (code.slice(preludeStart, i).length - code.slice(preludeStart, i).trimStart().length);

      if (prelude.startsWith("@")) {
        const name = (prelude.slice(1).match(/^[a-zA-Z-]+/) || [""])[0].toLowerCase();
        if (CONTAINER_AT.has(name)) {
          walk(bodyStart, bodyEnd, [...chain, { name, prelude, offset: preludeOffset }]);
        } else if (!DECL_AT.has(name)) {
          // Neither a known container nor a known declaration block. Descending would
          // risk nonsense and skipping would risk a blind spot, so say so out loud —
          // a guard that silently ignores syntax it has not met is how the 30% blind
          // spot in check-raw-assets happened.
          unknownAtRules.push({ name, line: lineOf(preludeOffset) });
        }
      } else if (prelude) {
        rules.push({
          selector: prelude.replace(/\s+/g, " "),
          offset: preludeOffset,
          body: code.slice(bodyStart, bodyEnd),
          chain,
        });
      }
      preludeStart = j;
      i = j;
      continue;
    }
    i++;
  }
}

walk(0, code.length, []);

/** Does the selector anchor on a class or an id anywhere? Attribute selectors count as
 *  an anchor too — `[data-collapse-warn]` is as opt-in as a class. Parenthesised
 *  contents (`:is(...)`, `:not(...)`) are included in the search deliberately: a class
 *  inside `:is()` still means the author named something specific. */
function isAnchored(sel) {
  return /[.#[]/.test(sel);
}

/** Declarations that are custom properties only (a palette block). */
function onlyCustomProps(body) {
  const decls = body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  if (!decls.length) return true;
  return decls.every((d) => d.startsWith("--"));
}

/** An exemption comment must sit immediately before the rule, or immediately before one
 *  of its enclosing at-rules, with nothing but whitespace in between. "Immediately"
 *  matters: allowing a match anywhere earlier in the file would let one exemption
 *  silently cover every rule after it. */
function exemptionFor(node) {
  const candidates = [node.offset, ...node.chain.map((c) => c.offset)];
  for (const off of candidates) {
    const before = src.slice(0, off);
    const trimmed = before.replace(/\s+$/, "");
    if (!trimmed.endsWith("*/")) continue;
    const open = trimmed.lastIndexOf("/*");
    if (open === -1) continue;
    const comment = trimmed.slice(open);
    const m = comment.match(/cascade-exempt:\s*(.+?)(?:\*\/|$)/s);
    if (m) {
      const reason = m[1].replace(/\s+/g, " ").trim();
      if (reason.length >= 12) return reason;
      return { bad: true, reason };
    }
  }
  return null;
}

for (const node of rules) {
  const layered = node.chain.some((c) => c.name === "layer");
  const anchored = isAnchored(node.selector);
  let verdict = "ok";
  let why = "";

  if (layered) {
    verdict = "ok";
    why = "inside @layer";
  } else if (anchored) {
    verdict = "ok";
    why = "class/id/attribute-anchored";
  } else if (/^:root$/.test(node.selector) && onlyCustomProps(node.body)) {
    verdict = "ok";
    why = ":root custom properties only";
  } else {
    const ex = exemptionFor(node);
    if (ex && ex.bad) {
      verdict = "fail";
      why = `cascade-exempt present but its reason is too short to be one ("${ex.reason}")`;
    } else if (ex) {
      verdict = "ok";
      why = `exempt: ${ex.slice(0, 80)}`;
    } else {
      verdict = "fail";
      why = "unlayered bare selector — it outranks every Tailwind utility";
    }
  }

  if (verdict === "fail") findings.push({ node, why });
  if (list) {
    console.log(
      `${verdict === "ok" ? "  ok " : "FAIL "} ${String(lineOf(node.offset)).padStart(4)}  ${node.selector.slice(0, 46).padEnd(46)}  ${why}`
    );
  }
}

const rel = relative(REPO, TARGET).replace(/\\/g, "/");

if (findings.length) {
  console.error(`\ncheck-globals-layers: ${findings.length} unlayered bare selector(s) in ${rel}\n`);
  for (const f of findings) {
    console.error(`  ${rel}:${lineOf(f.node.offset)}  ${f.node.selector}`);
    console.error(`      ${f.why}`);
  }
  console.error(`
  An unlayered rule beats every layered one regardless of specificity, and Tailwind
  emits its utilities into @layer utilities — so this rule silently overrides the
  utility classes written throughout the app. That is what hid 52 dead border
  declarations across 18 files for months (adr-034).

  Fix it one of two ways:
    1. Move the rule inside @layer base { … }  — almost always the right answer.
    2. If it MUST stay unlayered (it has to beat an unlayered VENDOR rule, which a
       layered rule can never do), put a comment immediately above it:
         /* cascade-exempt: <why layering would break this> *${"/"}
`);
  process.exit(1);
}

if (unknownAtRules.length) {
  console.error(`\ncheck-globals-layers: unrecognised at-rule(s) in ${rel} — this guard has not been taught them:`);
  for (const u of unknownAtRules) console.error(`  ${rel}:${u.line}  @${u.name}`);
  console.error("  Add it to CONTAINER_AT (its body holds rules) or DECL_AT (declarations).");
  process.exit(1);
}

console.log(`check-globals-layers: OK — ${rules.length} rules in ${rel}, no unlayered bare selectors`);
