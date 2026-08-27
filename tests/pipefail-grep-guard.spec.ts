import { test, expect } from "@playwright/test";

// The guard's pure half. NOT scripts/check-pipefail-grep.mjs: Playwright transforms
// an imported module to CommonJS and Node >= 20.19.5 loads a .mjs as ESM regardless,
// so importing the .mjs throws "exports is not defined in ES module scope" in CI
// while passing on the host's older Node (#610, iter-45).
import { findEarlyExitPipelines, stripComment } from "../scripts/lib/pipefail-grep.cjs";

// #609 — `cmd | grep -q` under pipefail.
//
// grep -q exits the moment it has its answer, the writer takes SIGPIPE, and pipefail
// reports the writer's 141. The pipeline therefore fails EXACTLY WHEN THE MATCH CAME
// QUICKLY. It bit restore-drill.sh, was fixed locally, and came back in
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
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (skip.has(e)) continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith(".sh")) files.push(p);
      }
    };
    walk(process.cwd());
    // A walk that found nothing has not passed; it has failed to run.
    expect(files.length, "no shell scripts found — the walk is broken, not clean").toBeGreaterThan(5);
    const offences = files.flatMap((f) =>
      findEarlyExitPipelines(readFileSync(f, "utf8")).map((h) => `${f}:${h.line}: ${h.text}`));
    expect(offences, offences.join("\n")).toEqual([]);
  });
});
