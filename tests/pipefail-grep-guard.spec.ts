import { test, expect } from "@playwright/test";

// The guard's pure half. NOT scripts/check-pipefail-grep.mjs: Playwright transforms
// an imported module to CommonJS and Node >= 20.19.5 loads a .mjs as ESM regardless,
// so importing the .mjs throws "exports is not defined in ES module scope" in CI
// while passing on the host's older Node (#610, iter-45).
import {
  findEarlyExitPipelines,
  sourcedUnderPipefail,
  stripComment,
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

  // ── the capture exemption, and the four ways out of it ────────────────────
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

  test("does not treat a case pattern's | as a pipe", () => {
    const src = `${PIPEFAIL}case "$mirrored" in\n  ''|0|*[!0-9]*) fail "unreadable" ;;\nesac\n`;
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
    // The library really is judged under pipefail, in the real tree and not only in
    // the synthetic pair above. If it ever stops being sourced this goes red, which
    // is the correct moment to ask why.
    expect([...inherited].some((p) => p.endsWith("stage-run-tree.sh")),
      "stage-run-tree.sh should inherit pipefail from the three scripts that source it").toBe(true);

    const hits = files.flatMap((f) =>
      findEarlyExitPipelines(f.source, { underPipefail: inherited.has(f.path) })
        .map((h) => ({ ...h, where: `${f.path}:${h.line}: ${h.text}` })));

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
});
