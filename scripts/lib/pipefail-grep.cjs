// The pure half of the early-exit-pipeline guard (#609).
//
// WHAT IS WRONG WITH `cmd | grep -q PATTERN`
//
// grep -q exits the moment it has its answer. The writer upstream then takes
// SIGPIPE and dies with 141. Under `set -o pipefail` the pipeline reports the
// writer's status, not grep's — so the pipeline fails EXACTLY WHEN THE MATCH CAME
// QUICKLY, and succeeds when the match came late or not at all. It is a test whose
// answer inverts under load, which is the worst kind to own.
//
// It has bitten this repo twice. restore-drill.sh was the first, and the fix was
// local. setup-backup-remote.sh was the second, and that fix was local too. The
// construct came back both times because nothing stopped it coming back, so the
// rule is mechanical now rather than remembered.
//
// AND `grep -q` IS ONLY THE FACE OF IT. `| head -1`, `| grep -m 1` and `| read`
// are the same bug with a different consumer: each has its answer before its input
// is done, each kills the writer, and pipefail reports the corpse. The guard modelled
// only the one that had already bitten, which is the same mistake as modelling only
// the `set` flag forms someone happened to think of (below). The consumer set is now
// named as a set.
//
// WHAT IS NOT WRONG
//
// `grep -q PATTERN file` reads a file. There is no pipe, no SIGPIPE and nothing for
// pipefail to report. Those are left alone, and the guard must not flag them, or it
// becomes noise that people learn to ignore — which is how a guard stops working
// without anyone deciding that it should. Nor is `head -n -5`, which must read to
// EOF to know which lines to withhold, or `tail`, or `awk`.
//
// A mention in a comment is prose. Three files in this repo explain this exact
// construct in their headers, and flagging them would make the guard unable to
// coexist with its own documentation. A heredoc body is not shell either — the
// python this repo pipes into `python3 -` is data, whatever `|` means inside it.
//
// WHY THIS PARSES INSTEAD OF GREPPING (iter-46 item 1075)
//
// The first version was one regex per line. An independent sweep put seven real
// shapes past it, each PROVEN by pasting it into a real script and watching the
// guard exit 0:
//
//   a  a library that sets no flags of its own but is SOURCED into three pipefail
//      scripts was permanently exempt — pipefail was judged per file
//   b  `cmd |` + newline + `grep -q x`, because matching was per PHYSICAL line
//   c  `grep -E -q`, `grep -i -q`, `grep -e foo -q` — the q had to come first
//   d  `grep -qm1` — the pattern's trailing \b cannot hold before a digit
//   e  `| head -N`, `| grep -m N`, `| read` were not modelled at all
//
// (a) and (b) are structural and (c)–(e) are about the shape of one command, so the
// line is now split into simple commands with quoting, command substitution and
// heredocs accounted for, and each command that reads from a pipe is classified by
// what it is rather than by what it looks like.
//
// WHAT IS STILL NOT MODELLED, said out loud rather than left to be rediscovered: a
// quoted string that spans physical lines (an awk program, say) is parsed as if it
// did not, and `sed '1q'` and `sed -n 1p;q` are early-exit readers this does not
// know about. Both fail towards MISSING an offence, never towards inventing one.
//
// This lives in a .cjs and not the .mjs CLI so a spec can import it. Playwright
// transforms an imported module to CommonJS while Node >= 20.19.5 loads a .mjs as
// ESM regardless, and the collision threw "exports is not defined in ES module
// scope" in CI while passing on the host's older Node (#610).

/** Does this script opt into pipefail at all? Without it, a dying writer is ignored
 *  and the construct is merely ugly rather than wrong.
 *
 *  THIS WAS WRONG ONCE AND THE WAY IT WAS WRONG IS THE WHOLE LESSON. The first
 *  version modelled the flag cluster: `set\s+[-a-zA-Z]*\s*-o\s+pipefail`. That
 *  cannot match `set -uo pipefail`, because the cluster and the `-o` are the same
 *  two characters and the pattern wants them twice. Every script in this repo uses
 *  `set -uo pipefail` or `set -euo pipefail`, so the detector answered "no pipefail
 *  here" for all fourteen of them, and the CLI printed
 *
 *      check-pipefail-grep: OK — 14 shell script(s) scanned, no early-exit pipelines
 *
 *  while four known offences sat in the tree it had just walked. A guard that models
 *  the forms you happened to think of passes because it did not look, and that pass
 *  is indistinguishable from a real one.
 *
 *  So: any `set` line that mentions pipefail at all. `set +o pipefail` turns it back
 *  OFF and is not modelled — no script here does that, and a file that both enables
 *  and disables it wants a human reading it, not a regex. */
function usesPipefail(source) {
  return /^[ \t]*set[ \t]+[^\n#]*\bpipefail\b/m.test(source);
}

/** Does this script opt into errexit? Only the capture exemption below cares, and it
 *  cares a great deal: under `set -e` a failing `x=$(...)` ends the script, so the
 *  pipeline's status is very much consulted and there is nothing latent about it. */
function usesErrexit(source) {
  return /^[ \t]*set[ \t]+-[a-zA-Z]*e[a-zA-Z]*(?=[ \t]|$)/m.test(source)
    || /^[ \t]*set[ \t]+[^\n#]*-o[ \t]+errexit\b/m.test(source);
}

/** Strip a trailing comment, respecting quotes crudely but well enough: a `#` inside
 *  a quoted string is not a comment. Returns "" for a whole-line comment. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "#") {
      // A `#` that opens a comment is at the start of a word, not mid-token
      // (`$#`, `${x#y}` and `a#b` are not comments).
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

// A heredoc introducer, but not a here-string: `<<<"$list"` is one expression on one
// line and has no body to skip. The delimiter may be quoted (`<<'PY'`), which is how
// every heredoc in this repo is written.
const HEREDOC = /(?<!<)<<(?!<)-?[ \t]*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/g;

/** The script as LOGICAL lines: comments stripped, heredoc bodies dropped, and a
 *  line whose last significant character is `|` or `\` joined to the one after it.
 *
 *  (b) IS WHY THIS EXISTS. Matching per physical line cannot see
 *
 *      curl -sf "$url" |
 *        grep -q '<html'
 *
 *  because neither half is an offence on its own: the first has a pipe and no
 *  consumer, the second a consumer and no pipe. The leading-pipe style (`\` then
 *  `| grep -q`) happened to be caught by accident; this makes both deliberate.
 *
 *  @returns {{line:number, text:string}[]} `line` is the FIRST physical line. */
function logicalLines(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let buf = "";
  let start = 0;
  let pending = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (pending.length > 0) {
      const body = lines[i].trim();
      if (body === pending[0]) pending.shift();
      continue;
    }

    const code = stripComment(lines[i]).trim();
    if (buf === "") start = i + 1;

    HEREDOC.lastIndex = 0;
    for (let m = HEREDOC.exec(code); m; m = HEREDOC.exec(code)) pending.push(m[2]);

    // A trailing backslash is a continuation and is not part of the command; a
    // trailing single `|` is both. `||` is a logical OR and ends the pipeline.
    const continues = /\\$/.test(code) || /(?:^|[^|])\|$/.test(code);
    const piece = code.replace(/\\$/, "");
    buf = buf === "" ? piece : `${buf} ${piece}`;
    if (continues) continue;

    if (buf !== "") out.push({ line: start, text: buf });
    buf = "";
  }
  if (buf !== "") out.push({ line: start, text: buf });
  return out;
}

/** Read a `$(…)` body starting just past the `(`, tracking nesting. Single quotes are
 *  opaque so a `)` inside one cannot close the substitution early. */
function readSubstitution(text, from) {
  let depth = 1;
  let body = "";
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") { body += text.slice(i, i + 2); i += 2; continue; }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      body += text.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    if (c === "(") { depth += 1; body += c; i += 1; continue; }
    if (c === ")") {
      depth -= 1;
      if (depth === 0) return { body, next: i + 1 };
      body += c; i += 1; continue;
    }
    body += c; i += 1;
  }
  return { body, next: i };
}

/** Split a logical line into simple commands, recording which ones read from a pipe.
 *
 *  Quoting is respected, with the one exception that matters: `$( … )` inside a
 *  double-quoted string is live shell, not text. Every one of the latent captures
 *  this guard now sees — `x="$(cmd | head -1)"` — hides its pipeline in exactly
 *  there, so a splitter that treated `"…"` as opaque would find nothing at all.
 *
 *  @returns {{piped:boolean, text:string}[]} */
function simpleCommands(text, out = []) {
  let cur = "";
  let piped = false;
  const flush = () => {
    if (cur.trim() !== "") out.push({ piped, text: cur.trim() });
    cur = "";
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") { cur += text.slice(i, i + 2); i += 2; continue; }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      cur += text.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      cur += '"';
      while (j < text.length) {
        const d = text[j];
        if (d === "\\") { cur += text.slice(j, j + 2); j += 2; continue; }
        if (d === '"') { cur += d; j += 1; break; }
        if (d === "$" && text[j + 1] === "(") {
          const sub = readSubstitution(text, j + 2);
          simpleCommands(sub.body, out);
          cur += " ";
          j = sub.next;
          continue;
        }
        cur += d; j += 1;
      }
      i = j;
      continue;
    }
    if (c === "$" && text[i + 1] === "(") {
      const sub = readSubstitution(text, i + 2);
      simpleCommands(sub.body, out);
      cur += " ";
      i = sub.next;
      continue;
    }
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end === -1 ? text.length : end;
      simpleCommands(text.slice(i + 1, stop), out);
      cur += " ";
      i = stop + 1;
      continue;
    }
    if (c === "|") {
      if (text[i + 1] === "|") { flush(); piped = false; i += 2; continue; }
      flush();
      piped = true;
      i += text[i + 1] === "&" ? 2 : 1;   // `|&` pipes stderr as well
      continue;
    }
    if (c === ";") { flush(); piped = false; i += 1; continue; }
    if (c === "&") {
      // `2>&1` and `>&2` are redirections, not separators.
      if (/[<>][ \t]*$/.test(cur)) { cur += c; i += 1; continue; }
      flush();
      piped = false;
      i += text[i + 1] === "&" ? 2 : 1;
      continue;
    }
    // Grouping only changes precedence, and a pipeline inside a group is still a
    // pipeline: `( a | grep -q b )` must read the same as `a | grep -q b`.
    if (c === "(" || c === ")" || c === "{" || c === "}") { cur += " "; i += 1; continue; }
    cur += c;
    i += 1;
  }
  flush();
  return out;
}

/** Whitespace-split a simple command, keeping quoted runs whole. */
function words(command) {
  const out = [];
  let cur = "";
  let i = 0;
  const push = () => { if (cur !== "") { out.push(cur); cur = ""; } };
  while (i < command.length) {
    const c = command[i];
    if (/\s/.test(c)) { push(); i += 1; continue; }
    if (c === "\\") { cur += command.slice(i, i + 2); i += 2; continue; }
    if (c === "'" || c === '"') {
      const end = command.indexOf(c, i + 1);
      const stop = end === -1 ? command.length : end;
      cur += command.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    cur += c; i += 1;
  }
  push();
  return out;
}

const unquote = (w) => w.replace(/^["']/, "").replace(/["']$/, "");

/** (c) and (d). The quiet flag may sit ANYWHERE in grep's arguments — `grep -E -q`,
 *  `grep -e foo -q` — and a short cluster may carry a glued numeric argument after
 *  it, as `-qm1` does. The old pattern demanded q immediately after the dash and
 *  ended on `\b`, which cannot hold between `m` and `1`; both shapes walked past. */
function isQuietFlag(word) {
  const w = unquote(word);
  if (w === "--quiet" || w === "--silent") return true;
  return /^-[A-Za-z0-9]*q[A-Za-z0-9]*$/.test(w);
}

/** `grep -m N` stops after N matches, which is `grep -q` with a bigger N. */
function isMaxCountFlag(word) {
  const w = unquote(word);
  return /^--max-count(=|$)/.test(w) || /^-[A-Za-z]*m([0-9]+)?$/.test(w);
}

/** `head -n -5` withholds the LAST five lines, so it cannot answer until EOF and is
 *  not an early-exit reader. backup-offbox.sh prunes its snapshot dirs that way. */
function headStopsEarly(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = unquote(args[i]);
    if (/^--(lines|bytes)=-/.test(a)) return false;
    if (/^-[nc]-/.test(a)) return false;
    if (/^-[nc]$/.test(a) && /^-/.test(unquote(args[i + 1] || ""))) return false;
  }
  return true;
}

/** What kind of early-exit reader is this simple command, if any?
 *  @returns {string|null} a short name for the offence, or null. */
function earlyExitReader(command) {
  const all = words(command);
  let k = 0;
  // `VAR=value cmd` and a leading redirection are not the command word.
  while (k < all.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(all[k]) || /^[0-9]*[<>]/.test(all[k]))) k += 1;
  if (k >= all.length) return null;

  const word = unquote(all[k]).replace(/^.*\//, "");
  const args = all.slice(k + 1);

  if (word === "grep" || word === "egrep" || word === "fgrep" || word === "rg") {
    if (args.some(isQuietFlag)) return "grep -q";
    if (args.some(isMaxCountFlag)) return "grep -m";
    return null;
  }
  if (word === "head") return headStopsEarly(args) ? "head" : null;
  // The `read` BUILTIN, not `while read`, whose command word is `while` and which
  // runs to EOF like any other loop.
  if (word === "read") return "read";
  return null;
}

/** The one shape whose exit status genuinely cannot be consulted: a whole line that
 *  is nothing but `name=$(pipeline)`. The assignment leaves the pipeline's status in
 *  $?, and $? is then overwritten by the next command without anyone having read it. */
const CAPTURE_ONLY =
  /^(?:(?:local|declare|typeset|export|readonly)[ \t]+(?:-[A-Za-z]+[ \t]+)?)?[A-Za-z_][A-Za-z0-9_]*=(?:"\$\(.*\)"|\$\(.*\))$/;

/**
 * @param {string} source  the script's text
 * @param {{underPipefail?: boolean}} [opts]  underPipefail forces the pipefail
 *        verdict on, for a file that is SOURCED into one — see sourcedUnderPipefail.
 * @returns {{line:number, text:string, kind:string, latent:boolean}[]}
 */
function findEarlyExitPipelines(source, opts = {}) {
  if (!usesPipefail(source) && !opts.underPipefail) return [];
  const errexit = usesErrexit(source);
  const out = [];

  for (const { line, text } of logicalLines(source)) {
    const kinds = simpleCommands(text)
      .filter((c) => c.piped)
      .map((c) => earlyExitReader(c.text))
      .filter(Boolean);
    if (kinds.length === 0) continue;

    // (e) THE EXEMPTION, AND ITS LIMITS. `x="$(sqlite3 … | head -1)"` is not a live
    // bug: head has already printed the line before SIGPIPE reaches sqlite3, so the
    // VALUE is right, and the pipeline's status is dropped on the floor. Five such
    // captures exist in this repo and rewriting them into something worse to silence
    // a guard would be the guard failing, not the code.
    //
    // It is not a licence, and each clause is load-bearing:
    //   · the WHOLE line must be the assignment. `if x=$(… | head -1); then` reads
    //     the status, `x=$(…) || fail` reads the status, and both stay offences.
    //   · errexit must be off. Under `set -e` a 141 ends the script, so adding `-e`
    //     to any of these five files makes this guard fire on them that same day.
    //   · `grep -q` is never exempt. It prints NOTHING, so a capture of it exists
    //     only for its exit status — the exact thing the exemption assumes nobody
    //     wants. `head` and `grep -m` are there for their bytes.
    // The CLI reports these rather than swallowing them: a silent skip and a pass
    // must never print the same thing.
    const latent = !errexit && CAPTURE_ONLY.test(text) && !kinds.includes("grep -q");
    for (const kind of kinds) out.push({ line, text, kind, latent });
  }
  return out;
}

/** The literal tail of every `.` / `source` target, e.g. `scripts/lib/x.sh` out of
 *  `. "$REPO/scripts/lib/x.sh"`. The leading segments are expansions we do not
 *  evaluate; the tail is enough to name the file inside a walk already in hand.
 *  Only `.sh` targets count — umami-funnels.sh sources a .env, which is not code. */
function sourcedPathTails(source) {
  const out = [];
  for (const raw of source.split(/\r?\n/)) {
    const m = /^[ \t]*(?:\.|source)[ \t]+(\S+)/.exec(stripComment(raw));
    if (!m) continue;
    const arg = m[1].replace(/["']/g, "");
    if (!arg.endsWith(".sh")) continue;
    const segs = arg.split("/");
    let start = 0;
    while (start < segs.length - 1
      && (segs[start] === "" || segs[start] === "." || segs[start] === ".." || segs[start].includes("$"))) {
      start += 1;
    }
    out.push(segs.slice(start).join("/"));
  }
  return out;
}

/** (a) PIPEFAIL IS INHERITED, AND JUDGING IT PER FILE MADE A HOLE.
 *
 *  scripts/lib/stage-run-tree.sh sets no shell options of its own — it is sourced,
 *  never executed, so it has nothing to set them for. Three scripts that DO set
 *  `-uo pipefail` source it: test-isolated.sh, restore-drill.sh and
 *  check-build-isolation.sh. Its lines therefore run under pipefail every single
 *  time they run, and the per-file test answered "no pipefail here" for all of them.
 *  A `| grep -q` pasted into that library was invisible to this guard: proven, exit 0.
 *
 *  So a file is under pipefail if it sets it, or if anything that sources it is. The
 *  loop runs to a fixpoint because a sourced library may source another.
 *
 *  @param {{path:string, source:string}[]} files
 *  @returns {Set<string>} the paths that inherit pipefail from a sourcing parent */
function sourcedUnderPipefail(files) {
  const under = new Set();
  const norm = (p) => p.replace(/\\/g, "/");
  for (let changed = true; changed;) {
    changed = false;
    for (const f of files) {
      if (!usesPipefail(f.source) && !under.has(f.path)) continue;
      for (const tail of sourcedPathTails(f.source)) {
        for (const g of files) {
          if (g.path === f.path || under.has(g.path)) continue;
          if (norm(g.path) === tail || norm(g.path).endsWith(`/${tail}`)) {
            under.add(g.path);
            changed = true;
          }
        }
      }
    }
  }
  return under;
}

module.exports = {
  findEarlyExitPipelines,
  sourcedUnderPipefail,
  usesPipefail,
  usesErrexit,
  stripComment,
  logicalLines,
  simpleCommands,
  earlyExitReader,
};
