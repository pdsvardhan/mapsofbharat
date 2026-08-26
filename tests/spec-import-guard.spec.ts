import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The guard that keeps a spec from importing a .mjs (#610, iter-45) — tested here
// rather than trusted.
//
// WHY THIS FILE EXISTS. The guard's first version modelled three import shapes and
// missed two: a bare side-effect `import "x.mjs";` and a backtick
// `import(` + `...` + `)`. Both still die on Node >= 20.19.5, and both walked past a
// guard that printed OK. The verifier found them by writing probes; nothing would
// have re-written those probes next iteration.
//
// That is this repo's recurring failure in miniature — a check whose passing case was
// exercised and whose failing case never was — so the guard now has one case per form
// it claims to catch, one per form it must NOT catch, and one for the vacuous run.
//
// Each case builds a THROWAWAY repo root (scripts/ + tests/) and runs the real
// scripts/check-spec-imports.mjs inside it, because the guard resolves its scan
// directory from its own location. Nothing here touches the real tests/ tree.

const GUARD = join(__dirname, "..", "scripts", "check-spec-imports.mjs");

/** Build a temp root holding the real guard and the given spec files, run it, and
 *  return { code, out }. `files` maps a filename under tests/ to its contents. */
function runGuard(files: Record<string, string>): { code: number; out: string } {
  const root = mkdtempSync(join(tmpdir(), "mob-guard-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "tests"));
    cpSync(GUARD, join(root, "scripts", "check-spec-imports.mjs"));
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(root, "tests", name), body);
    }
    const r = spawnSync("node", [join(root, "scripts", "check-spec-imports.mjs")], {
      encoding: "utf-8",
    });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Assembled at runtime so this spec does not itself contain a literal the guard
// would flag — the file under test scans files exactly like this one.
const MJS = ["../scripts/check-centroids", "mjs"].join(".");

test.describe("#610 the .mjs import guard", () => {
  test("a clean spec passes, and the count proves it actually read the file", () => {
    const { code, out } = runGuard({ "clean.spec.ts": `import { join } from "node:path";\nexport const x = join;\n` });
    expect(out).toContain("none imports a .mjs");
    expect(out, "the guard must say how many files it read, or a zero-file run reads as a pass").toContain("1 files");
    expect(code).toBe(0);
  });

  test("named import — the form that actually broke CI", () => {
    const { code, out } = runGuard({ "a.spec.ts": `import { LAYERS } from "${MJS}";\n` });
    expect(code).toBe(1);
    expect(out).toContain("a.spec.ts:1");
  });

  test("bare side-effect import — the form the first version of the guard missed", () => {
    const { code, out } = runGuard({ "b.spec.ts": `import "${MJS}";\n` });
    expect(code, "a side-effect import loads the module just as surely as a named one").toBe(1);
    expect(out).toContain("b.spec.ts:1");
  });

  test("dynamic import with a template literal — the other form it missed", () => {
    const { code, out } = runGuard({ "c.spec.ts": "const m = await import(`" + MJS + "`);\nexport default m;\n" });
    expect(code).toBe(1);
    expect(out).toContain("c.spec.ts:1");
  });

  test("require() is caught too", () => {
    const { code } = runGuard({ "d.spec.ts": `const m = require("${MJS}");\n` });
    expect(code).toBe(1);
  });

  test("every offending line is named, not just the first", () => {
    const { code, out } = runGuard({
      "e.spec.ts": `import { A } from "${MJS}";\nimport "${MJS}";\n`,
    });
    expect(code).toBe(1);
    expect(out).toContain("e.spec.ts:1");
    expect(out, "a guard that stops at the first hit hides the rest of the work").toContain("e.spec.ts:2");
  });

  test("a .mjs named in prose or in an assertion message is NOT an import", () => {
    const { code, out } = runGuard({
      "f.spec.ts":
        `// See ${MJS} for the CLI — it is not imported here.\n` +
        `import { expect } from "@playwright/test";\n` +
        `expect(true, "run ${MJS}").toBe(true);\n`,
    });
    expect(code, "the real specs carry both of these shapes; flagging them would make the guard unusable").toBe(0);
    expect(out).toContain("none imports a .mjs");
  });

  test("a comment naming an import form is not an import", () => {
    const { code, out } = runGuard({
      "g.spec.ts":
        `// A bare side-effect import looks like: import "${MJS}";\n` +
        `/**\n * and the dynamic one like: import("${MJS}")\n */\n` +
        `export const x = 1;\n`,
    });
    expect(code, "the guard tripped over its own documentation once; this pins the fix").toBe(0);
    expect(out).toContain("none imports a .mjs");
  });

  test("an import inside an unprefixed block comment IS still reported — the safe direction", () => {
    const { code } = runGuard({
      "h.spec.ts": `/*\nimport "${MJS}";\n*/\nexport const x = 1;\n`,
    });
    // Deliberate, not an oversight: only whole comment LINES are skipped, because
    // stripping from `//` to end-of-line could swallow a real import that follows a
    // string containing `//`. A false positive stops the build and a human rewords a
    // comment; a false negative ships the crash. This pins the choice.
    expect(code).toBe(1);
  });

  test("a run that scans nothing FAILS rather than reporting OK", () => {
    const { code, out } = runGuard({});
    expect(code, "an empty walk prints the same OK as a real one unless it refuses").toBe(1);
    expect(out).toContain("not guarding anything");
  });
});
