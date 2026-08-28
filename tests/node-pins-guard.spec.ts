import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The guard that keeps the four declarations of the Node version equal (#659, #610) —
// tested here rather than trusted.
//
// WHY THIS FILE EXISTS. The claim "moving Node is a one-line change to .nvmrc" sat in
// ci.yml for an iteration while it was false: a verifier changed .nvmrc alone and
// nothing anywhere noticed — the Dockerfile still built 20.20.2 three times, engines
// still said 20.20.2, and all six check scripts exited 0. scripts/check-node-pins.mjs
// is the comparison that was missing, and a guard whose failing case is never executed
// is the recurring defect in this repo, not a hypothetical one: check-spec-imports
// modelled three import shapes and missed two, and two guards this iteration reported
// success on zero measurements.
//
// So every branch has a case: each site disagreeing, each way of disagreeing that is
// not a plain mismatch (a bare major, a range), each way the guard could end up
// measuring nothing, and the two things it must NOT flag — a stage name that is not an
// image, and the ci.yml prose that spells out the old `node-version: 20` because that
// literal is the incident being recorded.
//
// Each case builds a THROWAWAY repo root and runs the real guard inside it, because
// the guard resolves every path from its own location. Nothing here reads the real
// .nvmrc, Dockerfile, package.json or workflows.

const GUARD = join(__dirname, "..", "scripts", "check-node-pins.mjs");

const NVMRC = "20.20.2\n";

// A comment naming a floating tag, a stage-name FROM, and three real node FROMs on
// lines 3, 6 and 9 — close enough to the real Dockerfile to be worth trusting.
const DOCKERFILE = [
  "# Pinned, not floating (#659). `node:20-slim` moved under us once already.",
  "# This version and .nvmrc are pinned to each other; move them together.",
  "FROM node:20.20.2-slim AS deps",
  "WORKDIR /app",
  "",
  "FROM node:20.20.2-slim AS builder",
  "COPY --from=deps /app/node_modules ./node_modules",
  "",
  "FROM node:20.20.2-slim AS runner",
  "CMD [\"node\", \"server.js\"]",
  "",
  "FROM builder AS unused",
].join("\n");

const PKG = JSON.stringify({ name: "fixture", engines: { node: "20.20.2" } }, null, 2) + "\n";

const WORKFLOW = [
  "jobs:",
  "  quality:",
  "    steps:",
  "      - uses: actions/setup-node@v4",
  "        with: { node-version-file: .nvmrc, cache: npm }",
].join("\n");

/** `undefined` keeps the fixture default; `null` leaves the file (or the whole
 *  .gitea/workflows directory) out entirely. */
type Fixture = {
  nvmrc?: string | null;
  dockerfile?: string | null;
  pkg?: string | null;
  workflow?: string | null;
};

function runGuard(f: Fixture = {}): { code: number; out: string } {
  const root = mkdtempSync(join(tmpdir(), "mob-pins-"));
  try {
    mkdirSync(join(root, "scripts"));
    cpSync(GUARD, join(root, "scripts", "check-node-pins.mjs"));

    const write = (name: string, given: string | null | undefined, fallback: string) => {
      const body = given === undefined ? fallback : given;
      if (body !== null) writeFileSync(join(root, name), body);
    };
    write(".nvmrc", f.nvmrc, NVMRC);
    write("Dockerfile", f.dockerfile, DOCKERFILE);
    write("package.json", f.pkg, PKG);

    if (f.workflow !== null) {
      mkdirSync(join(root, ".gitea", "workflows"), { recursive: true });
      writeFileSync(join(root, ".gitea", "workflows", "ci.yml"), f.workflow ?? WORKFLOW);
    }

    const r = spawnSync("node", [join(root, "scripts", "check-node-pins.mjs")], {
      encoding: "utf-8",
    });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test.describe("#659 the Node pin cross-check", () => {
  test("everything agrees — and the OK line proves it measured, rather than found nothing", () => {
    const { code, out } = runGuard();
    expect(code).toBe(0);
    expect(out).toContain("20.20.2");
    expect(out, "a guard that walked an empty Dockerfile must not print the same OK").toContain(
      "3 Dockerfile FROM(s)"
    );
    expect(out).toContain("package.json engines.node");
    expect(out).toContain("1 workflow step(s) reading .nvmrc");
  });

  test("a stage-name FROM is not a declaration", () => {
    // `FROM builder AS unused` is in the fixture. Counting it would have given four.
    const { out } = runGuard();
    expect(out).toContain("3 Dockerfile FROM(s)");
  });

  test("moving .nvmrc alone names EVERY place left behind, not just the first", () => {
    const { code, out } = runGuard({ nvmrc: "20.19.2\n" });
    expect(code).toBe(1);
    expect(out).toContain("4 of 4 declaration(s) disagree with .nvmrc (20.19.2)");
    for (const line of ["Dockerfile:3", "Dockerfile:6", "Dockerfile:9", "package.json engines.node"]) {
      expect(out, `${line} must appear — this is the whole failure, and it has four parts`).toContain(line);
    }
  });

  test("one Dockerfile FROM out of step is caught, and only that one is named", () => {
    const { code, out } = runGuard({
      dockerfile: DOCKERFILE.replace("FROM node:20.20.2-slim AS builder", "FROM node:20.19.2-slim AS builder"),
    });
    expect(code).toBe(1);
    expect(out).toContain("1 of 4 declaration(s) disagree");
    expect(out).toContain("Dockerfile:6");
    expect(out).not.toContain("Dockerfile:3");
  });

  test("a bare major in a tag is a disagreement, not a match — it floats", () => {
    const { code, out } = runGuard({
      dockerfile: DOCKERFILE.replace("FROM node:20.20.2-slim AS deps", "FROM node:20-slim AS deps"),
    });
    expect(code).toBe(1);
    expect(out).toContain("Dockerfile:3");
    expect(out).toContain("not a full version");
  });

  test("a codename tag names no version at all", () => {
    const { code, out } = runGuard({
      dockerfile: DOCKERFILE.replace("FROM node:20.20.2-slim AS deps", "FROM node:lts-slim AS deps"),
    });
    expect(code).toBe(1);
    expect(out).toContain("names no exact version");
  });

  test("a RANGE in engines is not a pin", () => {
    const { code, out } = runGuard({
      pkg: JSON.stringify({ name: "fixture", engines: { node: "^20.20.2" } }, null, 2),
    });
    expect(code).toBe(1);
    expect(out).toContain("package.json engines.node");
    expect(out).toContain("names no exact version");
  });

  test("a literal node-version in a workflow must equal .nvmrc", () => {
    const { code, out } = runGuard({
      workflow: WORKFLOW.replace("node-version-file: .nvmrc", "node-version: 20"),
    });
    expect(code).toBe(1);
    expect(out).toContain("ci.yml:5");
  });

  test("prose is not configuration — the guard must not flag the history that explains it", () => {
    // ci.yml records the original bug by name. If a comment counted, the cheapest way
    // to green would be deleting the incident that justifies the pin.
    const { code, out } = runGuard({
      workflow: ["      # THIS USED TO READ `node-version: 20`, AND THE WORD \"20\" WAS THE BUG.", WORKFLOW].join("\n"),
    });
    expect(code, out).toBe(0);
  });

  test("a setup-node step that names no version at all is reported", () => {
    const { code, out } = runGuard({
      workflow: WORKFLOW.replace("        with: { node-version-file: .nvmrc, cache: npm }", "        with: { cache: npm }"),
    });
    expect(code).toBe(1);
    expect(out).toContain("whatever Node the runner ships");
  });

  test("node-version-file pointing somewhere other than .nvmrc is reported", () => {
    const { code, out } = runGuard({
      workflow: WORKFLOW.replace("node-version-file: .nvmrc", "node-version-file: .node-version"),
    });
    expect(code).toBe(1);
    expect(out).toContain("must take its Node from .nvmrc");
  });

  // ── A FROM the guard reads WRONG is worse than one it fails on, because it does not
  // subtract from the OK line — it subtracts from what the OK line is about.

  test("a digest-pinned FROM is compared, not skipped in silence", () => {
    // MEASURED 2026-08-28, THIRD SWEEP. `node@sha256:aaaa` was split on the first colon
    // after the last slash — the one inside the digest — so the image name came out as
    // `node@sha256`, failed the `node` test, and the FROM was skipped without a word.
    // Two thirds of a Dockerfile stopped being compared and the guard printed
    //     OK — .nvmrc says 20.20.2, and so does everywhere else (1 Dockerfile FROM(s), …)
    // Internally inconsistent, too: `node:lts-slim` names no version either and has
    // always been reported. Digest pinning is a routine hardening change and arrives
    // by bot, which makes it the likeliest way for this to happen unwatched.
    const { code, out } = runGuard({
      dockerfile: [
        "FROM node@sha256:aaaa AS deps",
        "FROM node@sha256:bbbb AS builder",
        "FROM node:20.20.2-slim AS runner",
      ].join("\n"),
    });
    expect(code, out).toBe(1);
    expect(out, "all three FROMs must be counted, not one").toContain("2 of 4 declaration(s)");
    expect(out).toContain("Dockerfile:1");
    expect(out).toContain("Dockerfile:2");
    expect(out).toContain("pins a digest and names no version");
  });

  test("a tag ALONGSIDE the digest is the pin, and passes", () => {
    // The remedy the failure above suggests has to actually work, or the guard is
    // telling people to do something it will fail them for.
    const { code, out } = runGuard({
      dockerfile: DOCKERFILE.replace(
        "FROM node:20.20.2-slim AS deps",
        "FROM node:20.20.2-slim@sha256:aaaa AS deps"
      ),
    });
    expect(code, out).toBe(0);
    expect(out).toContain("3 Dockerfile FROM(s)");
  });

  test("a base image behind an ARG is reported, not walked past", () => {
    // The other way a node FROM disappears without an error. Measured before the fix:
    // "2 Dockerfile FROM(s)" for a three-stage build, exit 0. The guard cannot expand
    // the ARG and does not have to — it has to refuse to pretend the line was not there.
    const { code, out } = runGuard({
      dockerfile: ["ARG BASE=node:20.20.2-slim", "FROM ${BASE} AS deps", DOCKERFILE].join("\n"),
    });
    expect(code, out).toBe(1);
    expect(out).toContain("cannot resolve an expanded base image");
  });

  // ── The zero-measurement cases. Each of these once had to be a PASS for the guard
  // to be useless, which is why each is a distinct exit 2 rather than an exit 1.
  test("a Dockerfile with no node base image fails rather than passing on nothing", () => {
    const { code, out } = runGuard({
      dockerfile: "FROM debian:bookworm-slim AS deps\nFROM debian:bookworm-slim AS runner\n",
    });
    expect(code, "nothing was compared, so OK would be a lie that reads like the truth").toBe(2);
    expect(out).toContain("no node base image");
  });

  test("a missing Dockerfile fails", () => {
    const { code, out } = runGuard({ dockerfile: null });
    expect(code).toBe(2);
    expect(out).toContain("Dockerfile is missing");
  });

  test("package.json without engines.node fails", () => {
    const { code, out } = runGuard({ pkg: JSON.stringify({ name: "fixture" }, null, 2) });
    expect(code).toBe(2);
    expect(out).toContain("no engines.node");
  });

  test("no workflows at all fails", () => {
    const { code, out } = runGuard({ workflow: null });
    expect(code).toBe(2);
    expect(out).toContain("missing");
  });

  test("workflows that never set up Node fail", () => {
    const { code, out } = runGuard({ workflow: "jobs:\n  quality:\n    steps:\n      - run: echo hi\n" });
    expect(code).toBe(2);
    expect(out).toContain("no workflow sets up Node");
  });

  test("a missing .nvmrc fails — there is nothing to be the authority", () => {
    const { code, out } = runGuard({ nvmrc: null });
    expect(code).toBe(2);
    expect(out).toContain(".nvmrc is missing");
  });

  test("a floating .nvmrc fails — a major cannot be compared to a pinned tag", () => {
    const { code, out } = runGuard({ nvmrc: "20\n" });
    expect(code).toBe(2);
    expect(out).toContain("not a full version");
  });
});
