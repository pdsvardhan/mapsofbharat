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
// WHAT IS NOT WRONG
//
// `grep -q PATTERN file` reads a file. There is no pipe, no SIGPIPE and nothing for
// pipefail to report. Those are left alone, and the guard must not flag them, or it
// becomes noise that people learn to ignore — which is how a guard stops working
// without anyone deciding that it should.
//
// A mention in a comment is prose. Three files in this repo explain this exact
// construct in their headers, and flagging them would make the guard unable to
// coexist with its own documentation.
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

// A consumer that stops reading before its input is done. `grep -q` in any flag
// clustering (-q, -qx, -qi, -sq), and the long form.
const EARLY_EXIT = /\|\s*grep\s+(?:-[A-Za-z]*q[A-Za-z]*|--quiet|--silent)\b/;

/**
 * @param {string} source  the script's text
 * @returns {{line:number, text:string}[]} offending lines, empty if clean
 */
function findEarlyExitPipelines(source) {
  if (!usesPipefail(source)) return [];
  const out = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw);
    if (!line.trim()) return;
    if (EARLY_EXIT.test(line)) out.push({ line: i + 1, text: raw.trim() });
  });
  return out;
}

module.exports = { findEarlyExitPipelines, usesPipefail, stripComment, EARLY_EXIT };
