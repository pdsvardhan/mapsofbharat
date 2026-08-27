import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

import noHexLiterals from "./eslint-rules/no-hex-literals.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",

      // THE GENERATED TREES .gitignore ALREADY KNOWS ABOUT. Flat config does not skip
      // dot-directories, so anything not named here gets walked — which is why `.next`
      // is on the list above and why its absence below was a live bug.
      //
      // `.next-runs` is where scripts/test-isolated.sh stages a per-run hardlink copy
      // of the standalone build (#607). While any run is up, that tree carries ~360
      // more lintable files, so `node scripts/check-lint-baseline.mjs` measured 8962
      // problems instead of the tracked 42 — and when the run finished and released
      // the tree mid-lint, eslint died on a file that had just been unlinked:
      //   Error: ENOENT … .next-runs/tests-1787871804-1262742/tests/metric-families.spec.ts
      //   → check-lint-baseline: eslint produced no JSON output   EXIT=2
      // A ratchet whose answer depends on whether a test happens to be running is not
      // a ratchet. CI never saw it — a fresh checkout has no run trees — which is
      // exactly how it survived: it could only misfire on the box, which is the one
      // place the fix gets made.
      //
      // The rest are the same class, listed on principle rather than after the fact.
      // `.next.isolation-check` is where scripts/check-build-isolation.sh parks .next
      // for the length of its window: a whole .next under another name, and left
      // behind entirely if that run is killed. `test-results` is Playwright's artefact
      // directory. `coverage` is gitignored for the day we have it.
      ".next-runs/**",
      ".next.isolation-check/**",
      "test-results/**",
      "coverage/**",
      // The Python virtualenv. matplotlib ships browser JS for its web backends,
      // and linting a third-party package inside a venv is meaningless — we will
      // never fix it and it is not ours. It was 22 of the 64 problems the lint
      // baseline recorded, i.e. a third of the backlog was noise.
      //
      // It also made the count ENVIRONMENT-DEPENDENT, which is the reason this
      // exclusion is load-bearing rather than tidy: the venv exists on the server
      // and not in CI (pipeline/ is gitignored), so the same commit measured 64
      // problems on the box and 42 in CI. The ratchet caught that on its first
      // real run by refusing a phantom improvement.
      "pipeline/**",
    ],
  },

  // ── Palette discipline (to-do #523) ──────────────────────────────────────────
  // A hex colour in a component must say which token it tracks. The rule and the
  // reasoning live in eslint-rules/no-hex-literals.mjs.
  {
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    plugins: { mob: { rules: { "no-hex-literals": noHexLiterals } } },
    rules: { "mob/no-hex-literals": "error" },
  },
  {
    // Rendered OUTSIDE the document, where no CSS variable can be resolved: Satori
    // builds the OG images and node-canvas draws the social cards, both from a plain
    // colour string. `manifest.ts` and `themeColor` are read by the browser chrome,
    // also as literals. These are palette copies and they can drift — the mitigation
    // is that each file keeps its colours in ONE named block at the top, so the drift
    // is greppable, rather than scattered through the render code.
    // NOTE the globs: `app/metric/[slug]/…` would be read as a CHARACTER CLASS by
    // minimatch — `[slug]` matches one of s/l/u/g — so the literal Next.js dynamic
    // segment never matches and the ignore silently does nothing. Verified: the
    // bracketed form left all six opengraph-image violations reported. Use `**`.
    files: [
      "app/metric/**/opengraph-image.tsx",
      "app/manifest.ts",
      "lib/social-export.ts",
    ],
    rules: { "mob/no-hex-literals": "off" },
  },

  // ── CommonJS is the POINT of a .cjs (#610, iter-45) ──────────────────────────
  // scripts/lib/*.cjs holds logic that two different loaders have to agree on: plain
  // `node` importing it from a .mjs CLI, and Playwright's CommonJS transform importing
  // it from a spec. A .mjs there is what broke CI — from Node 20.19.5 the ESM loader
  // claims the file whatever Playwright compiled into it, and the run dies with
  // "exports is not defined in ES module scope" before any test executes.
  //
  // So `require()` in these files is the declared module system doing its job, not a
  // legacy import style. Scoped to this one directory so the rule keeps biting
  // everywhere else — the alternative, `check-lint-baseline.mjs --write`, would have
  // raised the ratchet for the whole repo to excuse two lines.
  {
    files: ["scripts/lib/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
