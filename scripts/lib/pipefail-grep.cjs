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
// NOR IS `case write|read)` A PIPELINE. That `|` separates glob alternatives, and
// `case "$mode" in write|read)` is ordinary shell that four scripts in this repo
// write. See "THE SECOND SWEEP" below: flagging it is the same failure as flagging
// the comments, one step further along.
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
// THE SECOND SWEEP, AND WHY THE FIX NEEDED ITS OWN FIX (iter-46 item 1075, again)
//
// The rewrite above closed all seven, and opened three of its own. An independent
// verifier measured each by pasting it into a real repo script:
//
//   f  `case "$mode" in write|read)` was read as a PIPELINE INTO `read`, and
//      `tail|head)` as one into `head`. Both are ordinary shell — kill-port.sh,
//      mutation-test.sh, restore-drill.sh and backup-offbox.sh all write case
//      alternations — so the CI gate would have gone red on correct code. That is
//      the "guard people learn to ignore" failure named twenty lines above, arriving
//      in the commit that quoted it. The tokenizer now knows what `case` is: the
//      alternation bars in a PATTERN are blanked before the line is split, and
//      nothing else about the arm is touched, so a genuine pipeline in an arm's BODY
//      is still an offence.
//   g  a quoted string spanning physical lines — a usage() heredoc-substitute, a SQL
//      statement — was parsed as if it did not, so `pipe it | head off"` on its
//      second line became an offence. The header used to promise this "fail[ed]
//      towards MISSING an offence, never towards inventing one". It did the
//      opposite. Quote state is now carried across physical lines as a STACK of
//      contexts, because the obvious one-open-quote-character version was measured
//      wrong on test-isolated.sh:151 and would have swallowed two real lines whole —
//      the details are on scanLine, and they are the reason this fix took two goes.
//   h  errexit was still judged per file after (a) taught pipefail not to be. A
//      capture inside a sourced library stayed exempt even when the sourcing parent
//      set `set -e`. No such capture exists today; it is fixed anyway, because the
//      hole (a) closed and the hole (h) left open are the same hole.
//
// THE THIRD SWEEP (iter-46 item 1075, and this is the third time). (f), (g) and (h)
// stayed closed. A third verifier measured three more, two of them holes:
//
//   i  the capture exemption's "the WHOLE line must be the assignment" clause lived
//      in the comment and not in the code. CAPTURE_ONLY's greedy `.*` before the
//      anchor let ANY trailing command through provided the line's last character was
//      a `)`, so `x=$(ls | head -1) || die $(msg)` came out LATENT while
//      `x=$(ls | head -1) || fail` came out an offence — the difference being the
//      shape of the last word rather than anything about the shell. It is a parse
//      now: the substitution is read with the same reader the splitter uses, and
//      nothing may follow it.
//   j  a PHANTOM HEREDOC swallowed the rest of the file. The heredoc scan read the
//      comment-stripped line with no regard for quoting WITHIN it, so
//      `echo "run cat <<EOF here"` and `v=$(( 1 << shift ))` each registered a
//      heredoc and then dropped every line until a delimiter that never came. That is
//      the SWALLOWING direction — the one (g) named as strictly worse than a false
//      positive — arriving inside the fix for (g). scanLine hands back a MASKED copy
//      of the line, quoted runs and `$(( ))` bodies blanked, and the scan reads that.
//   k  an unterminated `case` left the masker in pattern state and blanked every `|`
//      through to EOF. Invalid shell, so nothing here writes it — but "nothing here
//      writes it" was true of (j) as well, and it is not a reason to stay blind.
//
// (j) and (k) are one failure underneath: THREE cross-line state machines, and only
// two of them could be looked at. The spec's hygiene test checked the case stack and
// the quote stack and said "neither one is left holding state at EOF" — a count
// contradicted by its own subject, and the machine it omitted was the one with the
// hole. All three are inspectable now, unclosedState() reports them together, and the
// CLI calls a file it could not finish parsing a MEASUREMENT FAILURE rather than a
// clean scan.
//
// WHAT IS STILL NOT MODELLED, said out loud rather than left to be rediscovered:
// `sed '1q'` and `sed -n '1p;q'` are early-exit readers this does not know about,
// and it fails towards MISSING them rather than inventing an offence. The old
// version of this paragraph made that same promise about multi-line quoted strings
// and was simply wrong — see (g) — so it is worth saying that the promise is now a
// property of the code and not a hope about it: everything the splitter recurses
// into ($(…), `…`, and $( ) inside double quotes), the case masker recurses into
// too. A construct the two disagreed about is exactly what (f) and (g) were.
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

/** Scan one PHYSICAL line: drop a trailing comment, hand back a MASKED copy of what
 *  is left, and hand back the quoting contexts still open at its end so the next line
 *  can be read as a continuation.
 *
 *  (j) IS WHY THE MASK EXISTS. `masked` is `code` with every character that is
 *  literal string content — and every `$(( … ))` body — replaced by a space, same
 *  length, same offsets. Only the heredoc scan reads it: `<<WORD` inside a quoted run
 *  is text and the `<<` in `1 << shift` is a left shift, and each of those used to
 *  register a heredoc whose delimiter never arrived, dropping the rest of the file.
 *  A `$( )` body is NOT masked, because a heredoc in one is real — mutation-test.sh
 *  feeds python to a capture exactly that way.
 *
 *  (g) IS WHY THE STATE COMES BACK OUT. A `#` inside a quoted string is not a
 *  comment, which this always knew — but a quote that never closes on its own line
 *  is not a mistake either, and reading the next line as fresh shell turns
 *
 *      echo "usage: foo
 *        pipe it | head off"
 *
 *  into a pipeline that ends in `head`. Measured, twice, in exactly that shape.
 *
 *  AND IT IS A STACK, NOT A FLAG, BECAUSE THE FLAG VERSION WAS MEASURED WRONG. The
 *  first attempt tracked one open quote character. test-isolated.sh:151 has
 *
 *      reported="$(curl -sf -H "authorization: Bearer $TOKEN" "$url" \
 *        | sed -n 's|…"db_path":"\([^"]…\)"…|\1|p')"
 *
 *  (the real line uses `/` delimiters and a `.` glob; they are drawn as `|` and `…`
 *  here only because the literal text would close this comment)
 *
 *  where the inner `"` live inside a `$( )` inside the outer `"` — quoting NESTS
 *  through a command substitution and restarts there. A flat flag came out of the
 *  second line believing a single quote was open, and would have swallowed the next
 *  two lines into a string. That is the direction that HIDES offences, which is
 *  strictly worse than the false positive being fixed, so it is not good enough.
 *  Contexts: `sq` and `dq` are literal text; `sub` is a `$( )` or backtick body,
 *  which is ordinary command text again and where a fresh quote may open.
 *
 *  A backslash escapes inside double quotes and OUTSIDE quotes. It does NOT escape
 *  inside single quotes, and this used to think it did: `awk -F'\t'` survived only
 *  because skipping the `t` happened to land on the closing quote anyway. `tr -d '\'`
 *  would not have, and a phantom open quote is the swallowing direction again.
 *
 *  @param {string} line
 *  @param {{t:string,d?:number}[]} stack  what the previous physical line left open
 *  @returns {{code:string, masked:string, stack:{t:string,d?:number}[]}} */
function scanLine(line, stack = []) {
  const st = stack.map((f) => ({ ...f }));
  const mask = line.split("");
  const top = () => st[st.length - 1];
  const hide = (k) => { if (k < mask.length) mask[k] = " "; };
  const done = (end) => ({
    code: line.slice(0, end),
    masked: mask.slice(0, end).join(""),
    stack: st,
  });

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const ctx = top();
    // Literal contexts: text, not shell. `sub` and `bt` are command lists and are
    // left alone — a heredoc introducer inside one is a real heredoc.
    const literal = ctx !== undefined && (ctx.t === "sq" || ctx.t === "dq" || ctx.t === "arith");
    if (literal) hide(i);

    if (ctx && ctx.t === "sq") { if (c === "'") st.pop(); continue; }
    if (c === "\\") { if (literal) hide(i + 1); i += 1; continue; }
    if (ctx && ctx.t === "dq") {
      if (c === '"') { st.pop(); continue; }
      // `$(( … ))` first: `$(` alone would read its opening `((` as a substitution
      // holding a subshell, which closes in the same place but is not text, so the
      // `<<` in `1 << shift` would come back out unmasked.
      if (c === "$" && line[i + 1] === "(" && line[i + 2] === "(") {
        st.push({ t: "arith", d: 0 }); hide(i + 1); i += 1; continue;
      }
      if (c === "$" && line[i + 1] === "(") { st.push({ t: "sub", d: 0 }); i += 1; }
      continue;
    }
    if (ctx && ctx.t === "arith") {
      // Parens nest — `$(( $(date +%s) - START ))` is real and appears here twice —
      // and the whole body is masked whatever it holds.
      if (c === "(") { ctx.d += 1; continue; }
      if (c === ")") { if (ctx.d > 0) ctx.d -= 1; else st.pop(); continue; }
      continue;
    }

    // Top level, a `$( … )` body or a backtick body: all ordinary command text.
    if (c === "$" && line[i + 1] === "(" && line[i + 2] === "(") {
      st.push({ t: "arith", d: 0 }); hide(i); hide(i + 1); i += 1; continue;
    }
    if (c === "'") { st.push({ t: "sq" }); hide(i); continue; }
    if (c === '"') { st.push({ t: "dq" }); hide(i); continue; }
    if (c === "$" && line[i + 1] === "(") { st.push({ t: "sub", d: 0 }); i += 1; continue; }
    if (c === "`") { if (ctx && ctx.t === "bt") st.pop(); else st.push({ t: "bt" }); continue; }
    if (ctx && ctx.t === "sub") {
      // `$( (a; b) )` nests parens the closing one must survive.
      if (c === "(") { ctx.d += 1; continue; }
      if (c === ")") { if (ctx.d > 0) ctx.d -= 1; else st.pop(); continue; }
    }
    if (c === "#") {
      // A `#` that opens a comment is at the start of a word, not mid-token
      // (`$#`, `${x#y}` and `a#b` are not comments).
      if (i === 0 || /\s/.test(line[i - 1])) return done(i);
    }
  }
  return done(line.length);
}

/** Is the innermost open context a literal string? Only that makes the next physical
 *  line a continuation of THIS one; an open `$( )` is a command list, where a newline
 *  separates rather than continues. */
function insideString(stack) {
  const ctx = stack[stack.length - 1];
  return ctx !== undefined && (ctx.t === "sq" || ctx.t === "dq");
}

/** Strip a trailing comment, respecting quotes. Returns "" for a whole-line comment.
 *  `stack` is what a previous physical line left open, if anything. */
function stripComment(line, stack = []) {
  return scanLine(line, stack).code;
}

// A heredoc introducer, but not a here-string: `<<<"$list"` is one expression on one
// line and has no body to skip. The delimiter may be quoted (`<<'PY'`), which is how
// every heredoc in this repo is written.
const HEREDOC = /(?<!<)<<(?!<)-?[ \t]*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/g;

/** The script as LOGICAL lines: comments stripped, heredoc bodies dropped, and a
 *  line joined to the one after it when it ends mid-command — a trailing `|`, a
 *  trailing `\`, or an unclosed quote.
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
 *  (g) IS WHY THE QUOTE JOINS TOO. The same argument runs backwards: half of a
 *  string is not shell, and reading it as shell invented offences in two real
 *  scripts' usage text.
 *
 *  @param {string} source
 *  @param {{pendingHeredocs?: string[]}} [state]  MUTATED. On return it carries the
 *         heredoc delimiters still being waited for when the source ran out — the
 *         third cross-line state machine in this file, and the one (j) hid in
 *         because nothing could see it. unclosedState() is what reads it.
 *  @returns {{line:number, text:string}[]} `line` is the FIRST physical line. */
function logicalLines(source, state = {}) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let buf = "";
  let start = 0;
  let pending = [];
  let stack = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (pending.length > 0) {
      const body = lines[i].trim();
      if (body === pending[0]) pending.shift();
      continue;
    }

    const scanned = scanLine(lines[i], stack);
    stack = scanned.stack;
    const code = scanned.code.trim();
    if (buf === "") start = i + 1;

    // (j) THE MASK DECIDES WHETHER THE `<<` IS SHELL; THE CODE SUPPLIES THE NAME.
    // `<<'PY'` inside a string is text; inside a `$( )` it is a real heredoc, which is
    // how mutation-test.sh feeds python to a capture. This used to suppress the scan
    // for a line that STARTED inside a string, which cannot see a quote that opens and
    // closes on one line — `echo "run cat <<EOF here"` registered a heredoc and every
    // line after it was dropped looking for an EOF that was never coming, and so did
    // the `<<` in `$(( 1 << shift ))`.
    //
    // The two strings are read TOGETHER rather than the mask alone, and that is not
    // fussiness: every heredoc in this repo quotes its delimiter (`<<'PY'`), and the
    // mask blanks quoted runs, so matching the mask found the `<<` and then lost the
    // PY. Offsets are identical by construction, so the mask can gate a position in
    // the code without standing in for it.
    HEREDOC.lastIndex = 0;
    for (let m = HEREDOC.exec(scanned.code); m; m = HEREDOC.exec(scanned.code)) {
      if (scanned.masked.startsWith("<<", m.index)) pending.push(m[2]);
    }

    // A trailing backslash is a continuation and is not part of the command; a
    // trailing single `|` is both. `||` is a logical OR and ends the pipeline.
    const continues = insideString(stack) || /\\$/.test(code) || /(?:^|[^|])\|$/.test(code);
    const piece = code.replace(/\\$/, "");
    buf = buf === "" ? piece : `${buf} ${piece}`;
    if (continues) continue;

    if (buf !== "") out.push({ line: start, text: buf });
    buf = "";
  }
  if (buf !== "") out.push({ line: start, text: buf });
  state.pendingHeredocs = pending;
  return out;
}

/** Read a `$(…)` body starting just past the `(`, tracking nesting. Single quotes are
 *  opaque so a `)` inside one cannot close the substitution early.
 *
 *  The body it returns is the same LENGTH as the slice it came from, which the case
 *  masker relies on to write its blanks back at the right offsets.
 *
 *  `closed` says whether the `)` was actually found. Only isCaptureOnly consults it,
 *  and it must: "everything up to the end of the text" and "everything up to the
 *  closing paren" are the same string when there is no closing paren, and the
 *  difference between them is the difference between a capture and a truncated line. */
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
      if (depth === 0) return { body, next: i + 1, closed: true };
      body += c; i += 1; continue;
    }
    body += c; i += 1;
  }
  return { body, next: i, closed: false };
}

// ── case, which is the one place a bare `|` is not a pipe ───────────────────────

/** The state a `case` block carries from one logical line to the next.
 *
 *  `stack` holds one entry per open `case`, each either "pattern" (we are reading
 *  glob alternatives, up to the `)`) or "body" (we are reading commands, up to the
 *  `;;`). It is a stack because mutation-test.sh nests one case inside another's
 *  arm, and popping the inner `esac` must land back in the outer arm's body. */
function newCaseState() {
  return { stack: [], awaitingIn: false, depth: 0, atPatternStart: true };
}

/** After a keyword, the next word starts a command. `if x; then case $y in` is real
 *  shell in this repo and the `case` in it has to be recognised. */
const CMD_KEYWORDS = new Set(["if", "then", "else", "elif", "while", "until", "do", "time"]);

const isWordChar = (c) => /[A-Za-z0-9_]/.test(c);

function readWord(text, from) {
  let j = from;
  while (j < text.length && isWordChar(text[j])) j += 1;
  return text.slice(from, j);
}

/** Blank the `|` characters that separate CASE PATTERN alternatives, and nothing
 *  else, so the splitter below never mistakes one for a pipe.
 *
 *  (f), THE FALSE POSITIVE THAT WOULD HAVE FAILED CI ON CORRECT SHELL. `case "$mode"
 *  in write|read)` was reported as a pipeline into `read`, and `tail|head)` as one
 *  into `head`. Four scripts here write case alternations. A gate that fails on them
 *  is a gate someone disables, and then the four real offences it exists to catch
 *  come back with it.
 *
 *  WHY BLANK ONLY THE BAR, AND NOT THE WHOLE PATTERN. The arm's BODY is real shell
 *  and `x) cmd | grep -q y ;;` must still be an offence — that is the entire point of
 *  the guard, and a case fix that turned every arm into a blind spot would be worse
 *  than the false positive it cured. Replacing one character with one space is the
 *  smallest edit that separates the two, and it keeps every offset intact, so the
 *  reported text is still the line the author wrote.
 *
 *  It recurses into `$( )` and backticks with a FRESH state, because the splitter
 *  recurses there too and the two disagreeing is how (f) and (g) both happened. A
 *  command substitution is a complete command list, so its cases cannot straddle
 *  its own parentheses.
 *
 *  `case … in` split over physical lines survives, because `case` is a reserved word
 *  — you cannot run a command called that without quoting it — so a `case` at a
 *  command position is always the keyword and waiting for its `in` is safe.
 *
 *  @param {string} text  one logical line
 *  @param {ReturnType<newCaseState>} state  carried across lines; MUTATED
 *  @returns {string} the same text, same length, pattern bars replaced by spaces */
function maskCaseAlternations(text, state, out = text.split(""), offset = 0) {
  let i = 0;
  let cmdStart = true;
  const inPattern = () => state.stack[state.stack.length - 1] === "pattern";
  const opaque = (next) => {
    i = next;
    cmdStart = false;
    if (inPattern()) state.atPatternStart = false;
  };

  while (i < text.length) {
    const c = text[i];

    // ── runs that are not shell operators, whatever they contain ──
    if (c === "\\") { opaque(i + 2); continue; }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      opaque(end === -1 ? text.length : end + 1);
      continue;
    }
    if (c === '"') {
      // `$( )` inside double quotes is live shell — the splitter descends into it,
      // so this must as well.
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === '"') { j += 1; break; }
        if (text[j] === "$" && text[j + 1] === "(") {
          const sub = readSubstitution(text, j + 2);
          maskCaseAlternations(sub.body, newCaseState(), out, offset + j + 2);
          j = sub.next;
          continue;
        }
        j += 1;
      }
      opaque(j);
      continue;
    }
    if (c === "$" && text[i + 1] === "(") {
      const sub = readSubstitution(text, i + 2);
      maskCaseAlternations(sub.body, newCaseState(), out, offset + i + 2);
      opaque(sub.next);
      continue;
    }
    if (c === "$" && text[i + 1] === "{") {
      // `${x}` is one word. Skipping it keeps `${case}` from reading as a keyword.
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      opaque(j);
      continue;
    }
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end === -1 ? text.length : end;
      maskCaseAlternations(text.slice(i + 1, stop), newCaseState(), out, offset + i + 1);
      opaque(stop + 1);
      continue;
    }

    if (/\s/.test(c)) { i += 1; continue; }

    // ── a case PATTERN: glob text up to the `)`, where every bar is alternation ──
    if (inPattern()) {
      if (state.atPatternStart) {
        // `case x in esac` is an empty but legal block, and so is the `esac` that
        // follows the last arm's `;;`.
        if (readWord(text, i) === "esac") { state.stack.pop(); i += 4; cmdStart = false; continue; }
        // bash allows `(pat)` as well as `pat)`; that leading `(` opens nothing.
        state.atPatternStart = false;
        if (c === "(") { i += 1; continue; }
      }
      if (c === "(") { state.depth += 1; i += 1; continue; }
      if (c === ")") {
        if (state.depth === 0) {
          state.stack[state.stack.length - 1] = "body";
          state.atPatternStart = true;
          cmdStart = true;
        } else {
          state.depth -= 1;
        }
        i += 1;
        continue;
      }
      // Depth is not consulted: inside a pattern an extglob `@(a|b)` bar is
      // alternation too, so every bar here is one.
      if (c === "|") { out[offset + i] = " "; i += 1; continue; }
      i += 1;
      continue;
    }

    // ── ordinary command text: an arm's body, or anywhere outside a case ──
    if (c === ";") {
      const term = text.startsWith(";;&", i) ? 3
        : text.startsWith(";;", i) || text.startsWith(";&", i) ? 2 : 1;
      if (term > 1 && state.stack.length > 0) {
        state.stack[state.stack.length - 1] = "pattern";
        state.atPatternStart = true;
        state.depth = 0;
      }
      i += term;
      cmdStart = true;
      continue;
    }
    if (isWordChar(c)) {
      const w = readWord(text, i);
      if (state.awaitingIn) {
        if (w === "in") {
          state.awaitingIn = false;
          state.stack.push("pattern");
          state.atPatternStart = true;
          state.depth = 0;
        }
      } else if (cmdStart && w === "case") {
        state.awaitingIn = true;
      } else if (cmdStart && w === "esac" && state.stack.length > 0) {
        state.stack.pop();
      }
      i += w.length;
      cmdStart = CMD_KEYWORDS.has(w);
      continue;
    }
    if (c === "|" || c === "&" || c === "(" || c === ")" || c === "{" || c === "}" || c === "!") {
      cmdStart = true;
      i += 1;
      continue;
    }
    i += 1;
    cmdStart = false;
  }

  return out.join("");
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

/** The head of a capture: an optional declaration keyword, a name, `=`, an optional
 *  opening quote, and the `$(` itself. Where the substitution ENDS is a parse, not a
 *  pattern — see isCaptureOnly. */
const CAPTURE_HEAD =
  /^(?:(?:local|declare|typeset|export|readonly)[ \t]+(?:-[A-Za-z]+[ \t]+)?)?[A-Za-z_][A-Za-z0-9_]*=("?)\$\(/;

/** The one shape whose exit status genuinely cannot be consulted: a whole line that
 *  is nothing but `name=$(pipeline)`. The assignment leaves the pipeline's status in
 *  $?, and $? is then overwritten by the next command without anyone having read it.
 *
 *  (i) THE CLAUSE USED TO BE PROSE. This was one regex ending `…(?:"\$\(.*\)"|\$\(.*\))$`,
 *  whose greedy `.*` ate any trailing command, so the anchor asked only that the line
 *  END in `)`. Measured, on the guard's own library:
 *
 *      x=$(ls | head -1) || die $(msg)        LATENT    ← the status IS consulted
 *      x=$(ls | head -1) && rm -f $(cat list) LATENT
 *      x=$(ls | head -1); notify $(hostname)  LATENT
 *      x=$(ls | head -1) || fail              offence   ← only because `fail` ends in l
 *
 *  The comment above it promised "the WHOLE line must be the assignment"; what was
 *  enforced was the shape of the last word. So the substitution is READ now, with the
 *  same reader the splitter and the case masker use, and nothing at all may follow it.
 *
 *  A trailing `; cmd` is refused too, deliberately, though `;` does not itself consult
 *  the status: `x=$(… | head -1); [ $? -eq 0 ]` consults it exactly as plainly as
 *  `|| fail` does, on the same line, where the next-LINE `$?` clause below cannot see
 *  it. Telling that apart from `; echo done` would be a taxonomy of trailing operators
 *  this shape has not earned, and nothing in the tree writes either — so the strict
 *  reading costs nothing today and errs towards naming a capture rather than exempting
 *  one, which is the direction an exemption should always fail in. */
function isCaptureOnly(text) {
  const m = CAPTURE_HEAD.exec(text);
  if (!m) return false;
  const sub = readSubstitution(text, m[0].length);
  if (!sub.closed) return false;
  return text.slice(sub.next) === (m[1] === '"' ? '"' : "");
}

/**
 * @param {string} source  the script's text
 * @param {{underPipefail?: boolean, underErrexit?: boolean}} [opts]  each forces the
 *        corresponding verdict on, for a file that is SOURCED into a script that sets
 *        it — see sourcedUnderPipefail / sourcedUnderErrexit.
 * @returns {{line:number, text:string, kind:string, latent:boolean}[]}
 */
function findEarlyExitPipelines(source, opts = {}) {
  if (!usesPipefail(source) && !opts.underPipefail) return [];
  const errexit = usesErrexit(source) || Boolean(opts.underErrexit);
  const out = [];

  const lines = logicalLines(source);
  const caseState = newCaseState();

  for (let idx = 0; idx < lines.length; idx += 1) {
    const { line, text } = lines[idx];
    // The masker runs on EVERY line, offence or not: it is a state machine, and a
    // line it never sees is a `case` or an `esac` it never counted.
    const shell = maskCaseAlternations(text, caseState);
    const kinds = simpleCommands(shell)
      .filter((c) => c.piped)
      .map((c) => earlyExitReader(c.text))
      .filter(Boolean);
    if (kinds.length === 0) continue;

    // (e) THE EXEMPTION, AND ITS LIMITS. `x="$(sqlite3 … | head -1)"` is not a live
    // bug: head has already printed the line before SIGPIPE reaches sqlite3, so the
    // VALUE is right, and the pipeline's status is dropped on the floor. A handful of
    // these exist in this repo and rewriting them into something worse to silence a
    // guard would be the guard failing, not the code.
    //
    // HOW MANY IS NOT WRITTEN HERE, AND THAT IS THE POINT. This paragraph said "five"
    // for two generations of fix while the CLI printed two — the first fix had already
    // rewritten three of them to `awk 'NR==1'` (restore-drill.sh) and nobody came back
    // to the prose. The count is MEASURED, once, by the tool: check-pipefail-grep.mjs
    // lists every latent capture with a total on every single run. A number a guard
    // prints cannot drift; a number a comment asserts is only true on the day it is
    // typed, and this file's whole subject is counts that stopped matching their lists.
    //
    // It is not a licence, and each clause is load-bearing:
    //   · the WHOLE line must be the assignment — ENFORCED since (i), not merely
    //     claimed. `if x=$(… | head -1); then` reads the status, `x=$(…) || fail`
    //     reads the status, and so do `x=$(…) && cmd` and `x=$(…); cmd`, which the old
    //     regex waved through because they happened to end in `)`. All are offences.
    //   · errexit must be off. Under `set -e` a 141 ends the script, so adding `-e` to
    //     a file holding one of these makes this guard fire on it that same day — and
    //     since (h), adding it to a script that SOURCES one does too.
    //   · `grep -q` is never exempt. It prints NOTHING, so a capture of it exists
    //     only for its exit status — the exact thing the exemption assumes nobody
    //     wants. `head` and `grep -m` are there for their bytes.
    //   · the next line must not read `$?`. `x=$(… | head -1)` followed by
    //     `[ $? -eq 0 ]` consults the status as plainly as `|| fail` does; the only
    //     reason the old wording missed it is that it modelled "consulted" as "on
    //     the same line". Nothing in this repo does this today, which is the point
    //     of adding it now rather than after something does.
    //
    // WHAT THE EXEMPTION STILL LETS THROUGH, because this file cannot see the caller
    // and guessing would put the CI gate back to failing on correct shell:
    //   · a capture that is a function's LAST statement. The pipeline's 141 becomes
    //     the function's return status, and whether that is consulted depends on
    //     whether the CALLER wrote `f || fail`. Neither answer is knowable here, and
    //     guessing "consulted" would flag every helper whose result nobody checks.
    //   · `local row` on one line and `row="$(…)"` on the next, inside a function
    //     whose caller writes `if ! peek`. Same reason: the consumer is a frame away.
    // Both are PRINTED by the CLI, every run, so they are visible rather than
    // silent — which is the property that matters when a limit cannot be closed.
    const next = lines[idx + 1];
    const statusRead = next !== undefined && /\$\?/.test(next.text);
    const latent = !errexit
      && isCaptureOnly(text)
      && !kinds.includes("grep -q")
      && !statusRead;
    for (const kind of kinds) out.push({ line, text, kind, latent });
  }
  return out;
}

/** What the THREE cross-line state machines in this file are still holding when the
 *  source runs out. Empty means the whole file was read.
 *
 *  (j) AND (k) ARE THE SAME FAILURE, AND THIS IS THE ANSWER TO BOTH. Each machine —
 *  the heredoc `pending` list, the `case` stack, the quote stack — carries state from
 *  one line to the next, so a shape it cannot parse does not misread ONE line. It
 *  misreads every line after it, in the direction that HIDES offences: a phantom
 *  heredoc drops the rest of the file, and an unterminated `case` blanks every `|` to
 *  EOF so the splitter finds no pipelines at all. Both are silent. Both print the
 *  same OK as a clean scan, which is the failure this whole codebase keeps finding in
 *  its own guards.
 *
 *  The hygiene test that was supposed to cover this checked two of the three and said
 *  "neither one is left holding state at EOF" — and the one it did not name was the
 *  one with the hole in it. So all three answer here, in one place, and the CLI treats
 *  any of them being open as a MEASUREMENT FAILURE rather than a pass. Nothing in this
 *  repo trips it today; that is exactly what makes now the cheap time to say so.
 *
 *  @returns {string[]} one sentence per machine left mid-parse. */
function unclosedState(source) {
  const out = [];

  const heredocs = {};
  const caseState = newCaseState();
  for (const ll of logicalLines(source, heredocs)) maskCaseAlternations(ll.text, caseState);

  if (heredocs.pendingHeredocs.length > 0) {
    out.push(`a heredoc body ran to EOF looking for ${heredocs.pendingHeredocs.join(", ")}`);
  }
  if (caseState.stack.length > 0) {
    out.push(`${caseState.stack.length} \`case\` block(s) never reached an \`esac\``);
  }
  if (caseState.awaitingIn) out.push("a `case` never found its `in`");

  let stack = [];
  for (const raw of source.split(/\r?\n/)) stack = scanLine(raw, stack).stack;
  if (insideString(stack)) out.push("a quoted string never closed");

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

/** (a) A SHELL OPTION IS INHERITED, AND JUDGING IT PER FILE MADE A HOLE.
 *
 *  scripts/lib/stage-run-tree.sh sets no shell options of its own — it is sourced,
 *  never executed, so it has nothing to set them for. Three scripts that DO set
 *  `-uo pipefail` source it: test-isolated.sh, restore-drill.sh and
 *  check-build-isolation.sh. Its lines therefore run under pipefail every single
 *  time they run, and the per-file test answered "no pipefail here" for all of them.
 *  A `| grep -q` pasted into that library was invisible to this guard: proven, exit 0.
 *
 *  So a file is under an option if it sets it, or if anything that sources it is. The
 *  loop runs to a fixpoint because a sourced library may source another.
 *
 *  @param {{path:string, source:string}[]} files
 *  @param {(source:string) => boolean} sets  usesPipefail or usesErrexit
 *  @returns {Set<string>} the paths that inherit the option from a sourcing parent */
function sourcedUnder(files, sets) {
  const under = new Set();
  const norm = (p) => p.replace(/\\/g, "/");
  for (let changed = true; changed;) {
    changed = false;
    for (const f of files) {
      if (!sets(f.source) && !under.has(f.path)) continue;
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

/** Which files run under pipefail because something that sources them sets it. */
function sourcedUnderPipefail(files) {
  return sourcedUnder(files, usesPipefail);
}

/** (h) The same, for errexit, which (a) left behind.
 *
 *  errexit is what turns a latent capture into a live one, and it was still judged
 *  per file after pipefail stopped being. A `x=$(… | head -1)` inside a sourced
 *  library stayed exempt even when the parent that sourced it set `set -e` — proven
 *  by putting `set -euo pipefail` on test-isolated.sh and watching
 *  stage-run-tree.sh's capture stay in the LATENT list. No such capture exists
 *  today, so this changes no output; it closes the hole before the capture arrives,
 *  which is the only order in which closing it is cheap. */
function sourcedUnderErrexit(files) {
  return sourcedUnder(files, usesErrexit);
}

module.exports = {
  findEarlyExitPipelines,
  sourcedUnderPipefail,
  sourcedUnderErrexit,
  usesPipefail,
  usesErrexit,
  stripComment,
  scanLine,
  insideString,
  logicalLines,
  maskCaseAlternations,
  newCaseState,
  simpleCommands,
  earlyExitReader,
  isCaptureOnly,
  unclosedState,
};
