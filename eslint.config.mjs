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
