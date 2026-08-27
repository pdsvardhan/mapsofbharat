import { test, expect } from "@playwright/test";

// The guard's pure half. NOT scripts/check-pipefail-grep.mjs: Playwright transforms
// an imported module to CommonJS and Node >= 20.19.5 loads a .mjs as ESM regardless,
// so importing the .mjs throws "exports is not defined in ES module scope" in CI
// while passing on the host's older Node (#610, iter-45).
import {
  findEarlyExitPipelines,
  sourcedUnderPipefail,
  sourcedUnderErrexit,
  stripComment,
  scanLine,
  insideString,
  logicalLines,
  maskCaseAlternations,
  newCaseState,
} from "../scripts/lib/pipefail-grep.cjs";

// #609 — an early-exit pipeline under pipefail.
//
// A consumer that stops reading before its input is done — `grep -q`, `grep -m N`,
// `head -N`, `read` — kills the writer with SIGPIPE, and pipefail reports the
// writer's 141. The pipeline therefore fails EXACTLY WHEN THE ANSWER CAME QUICKLY.
// It bit restore-drill.sh, was fixed locally, and came back in
// setup-backup-remote.sh — which is why the rule is mechanical now.
//
// THE MUST-NOT-FLAG CASES ARE THE POINT OF THIS FILE. A detector that flags every
// occurrence of the four characters `-q` would pass a test written only from the
// positive cases, and would then flag `grep -q PATTERN file` (no pipe, nothing to
// go wrong), and every comment in this repo that explains the construct. A guard
// people learn to ignore has stopped guarding without anyone deciding it should.
//
// AND A MUST-NOT-FLAG CASE HAS TO BE ABLE TO FAIL. The `case` test below shipped in
// a shape whose assertion held with or without the code it was written for; the
// comment on it is the record of how that happened, because it is the mistake this
// whole file exists to make impossible and it got in anyway.

const PIPEFAIL = "#!/usr/bin/env bash\nset -uo pipefail\n";

test.describe("early-exit pipelines under pipefail (#609)", () => {
  test("recognises every set-flag form in this repo — the bug that shipped", () => {
    // MEASURED 2026-08-27. The first detector modelled the flag cluster:
    //   /set\s+[-a-zA-Z]*\s*-o\s+pipefail/
    // which cannot match `set -uo pipefail`, because the cluster and the `-o` are
    // the same two characters and the pattern wants them twice. Every script in
    // this repo uses `-uo` or `-euo`, so the detector answered "no pipefail here"
    // for all fourteen, and the CLI printed
    //     OK — 14 shell script(s) scanned, no early-exit pipelines under pipefail
    // with four known offences sitting in the tree it had just walked.
    //
    // This case is the reason that cannot happen again, and it is the reason the
    // must-not-flag cases below matter as much as the must-flag ones.
    for (const set of ["set -o pipefail", "set -uo pipefail", "set -euo pipefail"]) {
      const src = `#!/usr/bin/env bash\n${set}\nx | grep -q y\n`;
      expect(findEarlyExitPipelines(src), `${set} should be recognised`).toHaveLength(1);
    }
  });

  test("flags the plain form", () => {
    const hits = findEarlyExitPipelines(`${PIPEFAIL}if ss -lntH | grep -q .; then echo busy; fi\n`);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });

  test("flags clustered flags — -qx, -qi, -sq", () => {
    for (const flag of ["-qx", "-qi", "-sq", "-qF"]) {
      const hits = findEarlyExitPipelines(`${PIPEFAIL}echo "$list" | grep ${flag} "$n"\n`);
      expect(hits, `grep ${flag} should be flagged`).toHaveLength(1);
    }
  });

  test("flags the long forms", () => {
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd | grep --quiet x\n`)).toHaveLength(1);
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd | grep --silent x\n`)).toHaveLength(1);
  });

  test("flags it with spacing either side of the pipe", () => {
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd|grep -q x\n`)).toHaveLength(1);
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd   |   grep   -q   x\n`)).toHaveLength(1);
  });

  // ── the seven shapes the first detector could not see (iter-46 item 1075) ──
  //
  // Each of these was PROVEN past the old detector by pasting it into a real repo
  // script and watching `node scripts/check-pipefail-grep.mjs` exit 0. They are
  // grouped together because they are one finding: a guard built out of one regex
  // per line models the shapes its author happened to picture, and the shapes it
  // does not picture are exactly the ones that come back.

  test("(a) a sourced library inherits pipefail from whatever sources it", () => {
    // scripts/lib/stage-run-tree.sh sets no shell options — it is sourced, never
    // executed, so it has nothing to set them for. test-isolated.sh,
    // restore-drill.sh and check-build-isolation.sh all set `-uo pipefail` and all
    // source it, so its lines run under pipefail every time they run at all. Judged
    // per file it was permanently exempt, and a `| grep -q` pasted into it was
    // invisible: the guard exited 0.
    const lib = {
      path: "/repo/scripts/lib/stage-run-tree.sh",
      source: "# shellcheck shell=bash\nstage() { ss -lntH | grep -q . ; }\n",
    };
    const parent = {
      path: "/repo/scripts/test-isolated.sh",
      source: `${PIPEFAIL}. "$REPO/scripts/lib/stage-run-tree.sh"\n`,
    };

    expect(findEarlyExitPipelines(lib.source), "on its own the library sets no flags")
      .toHaveLength(0);
    expect(sourcedUnderPipefail([lib, parent]).has(lib.path)).toBe(true);
    expect(findEarlyExitPipelines(lib.source, { underPipefail: true })).toHaveLength(1);

    // Only from a pipefail parent. A sourcer that sets nothing confers nothing.
    const plain = { path: "/repo/scripts/plain.sh", source: "#!/bin/sh\n. ./scripts/lib/stage-run-tree.sh\n" };
    expect(sourcedUnderPipefail([lib, plain]).has(lib.path)).toBe(false);
  });

  test("(b) a pipeline broken across lines at a trailing |", () => {
    // Neither half is an offence on its own — the first line has a pipe and no
    // consumer, the second a consumer and no pipe — so per-physical-line matching
    // cannot see it at all.
    expect(findEarlyExitPipelines(`${PIPEFAIL}curl -sf "$url" |\n  grep -q '<html'\n`))
      .toHaveLength(1);
    expect(findEarlyExitPipelines(`${PIPEFAIL}curl -sf "$url" |\\\n  grep -q x\n`))
      .toHaveLength(1);
    // The leading-pipe style was caught by accident. Keep it caught on purpose.
    expect(findEarlyExitPipelines(`${PIPEFAIL}curl -sf "$url" \\\n  | grep -q x\n`))
      .toHaveLength(1);
    // Joining must not invent a pipeline out of a logical OR.
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd ||\n  grep -q x file\n`)).toHaveLength(0);
  });

  test("(c) the quiet flag anywhere in grep's arguments, not only first", () => {
    for (const args of ["-E -q 'x'", "-i -q x", "-e foo -q", "--extended-regexp --quiet x"]) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}cmd | grep ${args}\n`), `grep ${args}`)
        .toHaveLength(1);
    }
  });

  test("(d) a cluster with a glued numeric argument — grep -qm1", () => {
    // The old pattern ended on `\b`, which cannot hold between `m` and `1`.
    //
    // THE KIND IS ASSERTED, NOT ONLY THE COUNT, and the first version of this test
    // was weaker for want of it: `-qm1` is a max-count flag as well, so a detector
    // that had lost the digit boundary still flagged the line — as `grep -m`, by the
    // other rule, having never seen the -q. Restoring the old boundary left this
    // test green, which is a test agreeing with a bug. `-qA2` (quiet, plus two lines
    // of after-context) has no second rule to fall back on and is here for that.
    const qm1 = findEarlyExitPipelines(`${PIPEFAIL}cmd | grep -qm1 x\n`);
    expect(qm1).toHaveLength(1);
    expect(qm1[0].kind).toBe("grep -q");
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd | grep -qm 1 x\n`)).toHaveLength(1);
    expect(findEarlyExitPipelines(`${PIPEFAIL}cmd | grep -qA2 x\n`)).toHaveLength(1);
  });

  test("(e) head, grep -m and read are the same bug with a different consumer", () => {
    for (const cmd of [
      "cmd | head -1 > /tmp/x",
      "cmd | head > /tmp/x",
      "cmd | head -n 1 > /tmp/x",
      "cmd | grep -m 1 x > /tmp/x",
      "cmd | grep --max-count=1 x > /tmp/x",
      "cmd | read -r line",
    ]) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${cmd}\n`), cmd).toHaveLength(1);
    }
  });

  test("(e) but only the consumers that actually stop reading", () => {
    // `head -n -N` withholds the LAST N lines, so it cannot answer until EOF —
    // backup-offbox.sh prunes its snapshot directories exactly that way, and
    // flagging it would be the guard inventing work.
    const notOffences = [
      'ls -1d "$STAGE"/daily/*/ | sort | head -n -"$DAILY_KEEP" | xargs -r rm -rf',
      'TOKEN="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d \' \')"',  // head is the WRITER
      "cmd | tail -1 > /tmp/x",
      "cmd | awk 'NR==1' > /tmp/x",
      "cmd | while read -r a; do echo \"$a\"; done",
      "cmd | grep -c x > /tmp/x",
    ];
    for (const cmd of notOffences) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${cmd}\n`), cmd).toHaveLength(0);
    }
  });

  // ── the three the FIX brought with it (iter-46 item 1075, second sweep) ────
  //
  // The rewrite above closed all seven and opened three of its own, each measured by
  // an independent verifier pasting it into a real repo script. (f) and (g) are false
  // positives — the CI gate failing on correct shell — and (h) is the other half of a
  // hole (a) only half closed.

  test("(h) errexit is inherited through `source`, exactly as pipefail is", () => {
    // (a) taught pipefail to inherit and left errexit judged per file. errexit is the
    // clause that decides whether a capture is LATENT or live, so a capture inside a
    // sourced library stayed exempt even when the parent that sourced it set `set -e`.
    // Demonstrated by putting `set -euo pipefail` on test-isolated.sh and watching
    // stage-run-tree.sh's capture stay in the latent list: exit 0, nothing to see.
    const lib = {
      path: "/repo/scripts/lib/stage-run-tree.sh",
      source: "# shellcheck shell=bash\nstage() {\n  local x\n  x=\"$(cmd | head -1)\"\n}\n",
    };
    const strict = {
      path: "/repo/scripts/test-isolated.sh",
      source: "#!/usr/bin/env bash\nset -euo pipefail\n. \"$REPO/scripts/lib/stage-run-tree.sh\"\n",
    };
    const lax = {
      path: "/repo/scripts/restore-drill.sh",
      source: `${PIPEFAIL}. "$REPO/scripts/lib/stage-run-tree.sh"\n`,
    };

    expect(sourcedUnderErrexit([lib, strict]).has(lib.path),
      "a `set -e` parent confers errexit on what it sources").toBe(true);
    expect(sourcedUnderErrexit([lib, lax]).has(lib.path),
      "a parent without -e confers nothing").toBe(false);

    // And the verdict has to move with it, or inheriting the flag changes nothing.
    const latent = findEarlyExitPipelines(lib.source, { underPipefail: true });
    expect(latent).toHaveLength(1);
    expect(latent[0].latent, "no -e anywhere: the 141 is discarded unread").toBe(true);

    const live = findEarlyExitPipelines(lib.source, { underPipefail: true, underErrexit: true });
    expect(live).toHaveLength(1);
    expect(live[0].latent, "-e inherited from the sourcing parent: the 141 kills the script")
      .toBe(false);
  });

  test("(f) does not treat a case pattern's | as a pipe", () => {
    // MEASURED 2026-08-28 — AND THE FIRST VERSION OF THIS TEST COULD NOT FAIL.
    //
    // It asserted on `case "$mirrored" in ''|0|*[!0-9]*)`, whose alternatives cannot
    // name a consumer, so the assertion held whether or not the tokenizer knew what
    // `case` was. Side by side, that line stayed clean while `write|read)` was
    // reported as a pipeline into `read` and `tail|head)` as one into `head` — in
    // the commit whose own message claimed case patterns were "accounted for".
    //
    // Four scripts here write case alternations (kill-port.sh, mutation-test.sh,
    // restore-drill.sh, backup-offbox.sh), so this was the CI gate about to fail on
    // ordinary correct shell — the "guard people learn to ignore" failure the
    // library header warns about, arriving inside the fix that quotes it.
    //
    // Every shape below therefore names a CONSUMER on purpose. Delete the case
    // handling and this test goes red; that is the whole requirement it exists for.
    const patterns = [
      'case "$mode" in\n  write|read) echo io ;;\nesac\n',
      'case "$1" in\n  tail|head) shift ;;\nesac\n',
      'case "$verb" in\n  get|head|read) echo ok ;;\nesac\n',
      'case "$a" in x|read) :;; esac\n',                            // the one-liner form
      'case "$a" in\n  (write|read) echo io ;;\nesac\n',            // bash allows a leading (
      'case "$a" in\n  write|read) echo io ;&\n  *) : ;;\nesac\n',  // ;& falls through
      'case "$a" in\n  write|read) echo io ;;&\n  *) : ;;\nesac\n', // ;;& retests
      'case "$a" in\n  "write"|\'read\') echo io ;;\nesac\n',       // quoted alternatives
      'case "$a" in\n  docker-proxy|containerd-shim*|read) : ;;\nesac\n',  // kill-port.sh's shape
      // The shape the old test used. Kept, because it is what restore-drill.sh and
      // backup-offbox.sh actually write — but it can no longer be the only one.
      "case \"$mirrored\" in\n  ''|0|*[!0-9]*) fail \"unreadable\" ;;\nesac\n",
    ];
    for (const p of patterns) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${p}`), p).toHaveLength(0);
    }
  });

  test("(f) but a real pipeline in a case ARM'S BODY is still an offence", () => {
    // The risk in teaching the tokenizer about `case` is that the cure blinds it to
    // the arms, which is where the actual commands live — a far worse outcome than
    // the false positive it was curing. Only the alternation BAR is blanked, never
    // the body, and this is the test that says so out loud. Exactly one hit each:
    // two would mean the pattern is being counted as well.
    const shapes = [
      'case "$a" in\n  x) cmd | grep -q y ;;\nesac\n',
      'case "$a" in\n  x)\n    cmd | grep -q y\n    ;;\nesac\n',
      'case "$a" in\n  write|read) cmd | head -1 > /tmp/x ;;\nesac\n',
      'case "$a" in x|read) cmd | grep -q y ;; esac\n',
      // Each of the three arm shapes that end a pattern or an arm has to be right,
      // or the parser stays in the wrong mode and the body after it is masked too.
      'case "$a" in\n  (write|read) cmd | grep -q y ;;\nesac\n',       // leading (
      'case "$a" in\n  x) : ;&\n  tail|head) cmd | grep -q y ;;\nesac\n',   // ;&
      'case "$a" in\n  x) : ;;&\n  tail|head) cmd | grep -q y ;;\nesac\n',  // ;;&
      // mutation-test.sh nests one case inside another's arm; the stack has to
      // unwind to the OUTER arm's body, not to the top.
      'case "$a" in\n  x)\n    case "$b" in\n      write|read) cmd | grep -q y ;;\n    esac\n    ;;\nesac\n',
      // and the block has to END, or everything after it becomes a blind spot
      'case "$a" in\n  write|read) : ;;\nesac\ncmd | grep -q y\n',
      // `;;&` is `;;` with a trailing `&`. Consuming all three leaves the next token
      // in pattern position, which is where `esac` may legally sit; consuming only
      // the first two leaves the `&` there instead, the block never closes, and
      // everything after `esac` is masked as though it were still a glob.
      'case "$a" in\n  x) : ;;&\nesac\ncmd | grep -q y\n',
    ];
    for (const s of shapes) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${s}`), s).toHaveLength(1);
    }

    // A last arm may omit its `;;`, which puts `esac` in the arm's BODY rather than
    // where a pattern would go. Recognising it from there keeps the block closed;
    // without it the state leaks into everything after the block. Nothing in this
    // repo writes that shape, so nothing else in this file would notice — a clause
    // no test can kill is either dead or a bug waiting, and this one is neither now.
    const noSemis = `${PIPEFAIL}case "$a" in\n  x) echo hi\nesac\n`;
    const state = newCaseState();
    for (const ll of logicalLines(noSemis)) maskCaseAlternations(ll.text, state);
    expect(state.stack, "an arm without `;;` must still let esac close the block")
      .toEqual([]);
  });

  test("(f) a case inside $( ) is masked too — the splitter goes in there", () => {
    // The splitter descends into `$( )`, into backticks, and into `$( )` nested in a
    // double-quoted string, because that is where every capture in this repo hides
    // its pipeline. Anywhere it descends and the case masker does not, the two
    // disagree about what the text is — and two halves of one tokenizer disagreeing
    // is precisely what (f) and (g) both were. Symmetry is cheap here and expensive
    // to rediscover.
    for (const src of [
      'x=$(case "$m" in write|read) echo io ;; esac)\n',
      'x="$(case "$m" in tail|head) echo io ;; esac)"\n',
      'x=`case "$m" in get|head) echo io ;; esac`\n',
    ]) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${src}`), src).toHaveLength(0);
    }
    // …and a real pipeline in there is still an offence.
    expect(findEarlyExitPipelines(`${PIPEFAIL}x=$(case "$m" in a) cmd | grep -q y ;; esac)\n`))
      .toHaveLength(1);
  });

  test("(g) a quoted string that spans physical lines is text, not a pipeline", () => {
    // MEASURED 2026-08-28. The library header used to promise that this shape
    // "fail[s] towards MISSING an offence, never towards inventing one". It did the
    // opposite: a usage() block and a multi-line SQL statement each produced a
    // FALSE POSITIVE on their second line, because matching restarted there as if
    // the string had closed.
    const inventedOffences = [
      'usage() {\n  echo "run it, then\n  pipe it | head off"\n}\n',
      "usage() {\n  echo 'run it, then\n  pipe it | head off'\n}\n",
      'sqlite3 db "SELECT a\n  FROM t WHERE b | head"\n',
    ];
    for (const src of inventedOffences) {
      expect(findEarlyExitPipelines(`${PIPEFAIL}${src}`), src).toHaveLength(0);
    }

    // The string has to CLOSE, though. Carrying quote state is the direction that
    // SWALLOWS offences when it goes wrong, so an offence after one is asserted.
    expect(findEarlyExitPipelines(`${PIPEFAIL}echo "one\ntwo"\ncmd | grep -q x\n`))
      .toHaveLength(1);
    expect(findEarlyExitPipelines(`${PIPEFAIL}echo 'one\ntwo'\ncmd | head -1 > /tmp/x\n`))
      .toHaveLength(1);
  });

  test("(g) quoting nests through $( ), so a string cannot swallow the file", () => {
    // The obvious version of (g) — one open quote CHARACTER, carried forward — was
    // measured wrong on test-isolated.sh:151, where the inner quotes live inside a
    // `$( )` inside the outer ones. It came out of the second line believing a
    // single quote was still open and would have read the next two lines as string.
    // That HIDES offences, which is strictly worse than the false positive being
    // fixed, so the state is a stack of contexts instead of one character.
    const src = [
      PIPEFAIL.trimEnd(),
      'reported="$(curl -sf -H "authorization: Bearer $T" "$url" \\',
      "  | sed -n 's/.*\"db_path\":\"\\([^\"]*\\)\".*/\\1/p')\"",
      "cmd | grep -q x",
      "",
    ].join("\n");
    const hits = findEarlyExitPipelines(src);
    expect(hits.map((h) => h.text), "the line after the capture must still be seen")
      .toEqual(["cmd | grep -q x"]);
  });

  // ── the capture exemption, and the five ways out of it ────────────────────
  //
  // `x="$(cmd | head -1)"` is latent rather than live: head prints its line before
  // SIGPIPE reaches the writer, so the VALUE is right, and the assignment leaves the
  // pipeline's 141 in $? where nothing reads it. Five of these exist in the repo.
  // Rewriting them into something worse to silence a guard would be the guard
  // failing. But the exemption is narrow, and every clause below is load-bearing —
  // widen any one of them and this test says so.
  test("a bare capture is latent, and the CLI still prints it", () => {
    const hits = findEarlyExitPipelines(
      `${PIPEFAIL}verdict="$(sqlite3 db 'PRAGMA integrity_check;' 2>&1 | head -1)"\n`);
    expect(hits, "latent is still a HIT — exempt from failing, not from being seen")
      .toHaveLength(1);
    expect(hits[0].latent).toBe(true);
  });

  test("the exemption lapses the day someone adds set -e", () => {
    const src = "#!/usr/bin/env bash\nset -euo pipefail\nx=\"$(cmd | head -1)\"\n";
    expect(findEarlyExitPipelines(src)[0].latent).toBe(false);
  });

  test("the exemption does not survive the status being consulted", () => {
    for (const line of [
      'x="$(cmd | head -1)" || fail "no"',
      'if x="$(cmd | head -1)"; then :; fi',
      '[ -n "$(cmd | head -1)" ] || fail "no"',
    ]) {
      const hits = findEarlyExitPipelines(`${PIPEFAIL}${line}\n`);
      expect(hits, line).toHaveLength(1);
      expect(hits[0].latent, line).toBe(false);
    }
  });

  test("nor the status being consulted on the NEXT line", () => {
    // "Not consulted" was modelled as "the whole LINE is a bare capture", which reads
    // `x=$(…) || fail` correctly and `x=$(…)` then `[ $? -eq 0 ]` exactly wrong: the
    // status is consulted just as plainly, one line later. Nothing in this repo does
    // it today, which is why it costs nothing to close now instead of afterwards.
    const consulted = findEarlyExitPipelines(
      `${PIPEFAIL}x="$(cmd | head -1)"\n[ $? -eq 0 ] || fail "no"\n`);
    expect(consulted).toHaveLength(1);
    expect(consulted[0].latent).toBe(false);

    // …and an ordinary next line leaves it latent, or the clause is just noise.
    const ignored = findEarlyExitPipelines(`${PIPEFAIL}x="$(cmd | head -1)"\necho "$x"\n`);
    expect(ignored).toHaveLength(1);
    expect(ignored[0].latent).toBe(true);
  });

  test("grep -q is never latent — a capture of it exists only for its status", () => {
    const hits = findEarlyExitPipelines(`${PIPEFAIL}x="$(cmd | grep -q y)"\n`);
    expect(hits).toHaveLength(1);
    expect(hits[0].latent).toBe(false);
  });

  // ── must NOT flag ─────────────────────────────────────────────────────────
  test("does not flag grep -q reading a FILE — there is no pipe", () => {
    expect(findEarlyExitPipelines(`${PIPEFAIL}grep -qi "<html" "$page_html" || fail "no HTML"\n`))
      .toHaveLength(0);
  });

  test("does not flag a whole-line comment that explains the construct", () => {
    const src = `${PIPEFAIL}# \`cmd | grep -q\` under pipefail fails when grep matches EARLY.\n`;
    expect(findEarlyExitPipelines(src)).toHaveLength(0);
  });

  test("does not flag a trailing comment", () => {
    const src = `${PIPEFAIL}ss -lntH >/dev/null   # was: | grep -q .\n`;
    expect(findEarlyExitPipelines(src)).toHaveLength(0);
  });

  test("does not flag a script that never sets pipefail", () => {
    const src = "#!/usr/bin/env bash\nset -u\nif ss -lntH | grep -q .; then echo busy; fi\n";
    expect(findEarlyExitPipelines(src)).toHaveLength(0);
  });

  test("does not flag a heredoc body — the python this repo pipes in is data", () => {
    const src = `${PIPEFAIL}python3 - "$src" <<'PY' || fail "snapshot failed"\nx = a | head\nPY\nlog "done"\n`;
    expect(findEarlyExitPipelines(src)).toHaveLength(0);
  });

  test("does not treat a # inside quotes as a comment", () => {
    // If it did, everything after the quoted # would be discarded and a real
    // offence hiding behind one would go unseen.
    expect(stripComment('echo "a # b" | grep -q x')).toContain("grep -q x");
    expect(findEarlyExitPipelines(`${PIPEFAIL}echo "a # b" | grep -q x\n`)).toHaveLength(1);
  });

  test("does not treat ${x#y} or $# as a comment", () => {
    expect(stripComment("echo ${STANDALONE#$REPO/} | grep -q x")).toContain("grep -q x");
    expect(findEarlyExitPipelines(`${PIPEFAIL}echo "$#" | grep -q 2\n`)).toHaveLength(1);
  });

  test("reports every offence in a file, not just the first", () => {
    const src = `${PIPEFAIL}a | grep -q x\nb | grep -q y\nc | grep -q z\n`;
    expect(findEarlyExitPipelines(src)).toHaveLength(3);
  });

  // ── the repo itself ───────────────────────────────────────────────────────
  test("the repo's own shell scripts are clean", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const skip = new Set(["node_modules", ".git", ".next", ".next-runs", "out",
      "coverage", ".venv", "__pycache__", "test-results", "pipeline"]);
    const paths: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (skip.has(e)) continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith(".sh")) paths.push(p);
      }
    };
    walk(process.cwd());
    // A walk that found nothing has not passed; it has failed to run.
    expect(paths.length, "no shell scripts found — the walk is broken, not clean").toBeGreaterThan(5);

    const files = paths.map((path) => ({ path, source: readFileSync(path, "utf8") }));
    const inherited = sourcedUnderPipefail(files);
    const inheritedE = sourcedUnderErrexit(files);
    // The library really is judged under pipefail, in the real tree and not only in
    // the synthetic pair above. If it ever stops being sourced this goes red, which
    // is the correct moment to ask why.
    expect([...inherited].some((p) => p.endsWith("stage-run-tree.sh")),
      "stage-run-tree.sh should inherit pipefail from the three scripts that source it").toBe(true);

    const hits = files.flatMap((f) =>
      findEarlyExitPipelines(f.source, {
        underPipefail: inherited.has(f.path),
        underErrexit: inheritedE.has(f.path),
      }).map((h) => ({ ...h, where: `${f.path}:${h.line}: ${h.text}` })));

    const live = hits.filter((h) => !h.latent).map((h) => h.where);
    expect(live, live.join("\n")).toEqual([]);

    // The exempt ones are allowed to exist and are NOT allowed to drift into
    // something else. Every one must be a bare `name=$(…)` capture of a consumer
    // that is there for its bytes — never of `grep -q`, which prints none.
    for (const h of hits) {
      expect(h.text, h.where).toMatch(/^[A-Za-z_][A-Za-z0-9_]*=.*\)"?$/);
      expect(h.kind, h.where).not.toBe("grep -q");
    }
  });

  test("the repo's own case blocks and multi-line strings all close", async () => {
    // The two state machines added for (f) and (g) carry across lines, so a shape
    // they cannot parse does not merely misread ONE line — it misreads everything
    // after it, silently, in the swallowing direction. This asserts on the real tree
    // that neither one is left holding state at EOF. It is the check that would have
    // caught the flat-quote version of (g) on test-isolated.sh before it shipped.
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const skip = new Set(["node_modules", ".git", ".next", ".next-runs", "out",
      "coverage", ".venv", "__pycache__", "test-results", "pipeline"]);
    const paths: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (skip.has(e)) continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith(".sh")) paths.push(p);
      }
    };
    walk(process.cwd());
    expect(paths.length, "no shell scripts found — the walk is broken").toBeGreaterThan(5);

    for (const p of paths) {
      const source = readFileSync(p, "utf8");
      const caseState = newCaseState();
      for (const ll of logicalLines(source)) maskCaseAlternations(ll.text, caseState);
      expect(caseState.stack, `${p}: a case block never reached its esac`).toEqual([]);
      expect(caseState.awaitingIn, `${p}: a \`case\` never found its \`in\``).toBe(false);

      let stack = [];
      for (const raw of source.split(/\r?\n/)) stack = scanLine(raw, stack).stack;
      expect(insideString(stack), `${p}: a quoted string never closed`).toBe(false);
    }
  });
});
