#!/usr/bin/env node
// Refuse to build an image that would serve 404s for its raw downloads (to-do #498).
//
// WHY THIS EXISTS. `pipeline/raw-new` (825MB, 860 files) and `pipeline/raw` are
// NOT tracked in git, but `app/metric/[slug]/raw/route.ts` reads them at runtime
// and Next traces them into `.next/standalone` at BUILD time. So a build from a
// context that lacks them produces an image that starts, passes its healthcheck,
// and silently serves the HTML 404 page as `text/html` for every raw download.
// Measured 2026-08-11: an image built from a clean `git worktree` had 0 entries
// under /app/pipeline/raw-new against production's 27, and only two E2E tests
// caught it. The failure deserves to be loud and early instead.
//
//   node scripts/check-raw-assets.mjs             # the SOURCE tree, before the build
//   node scripts/check-raw-assets.mjs --output    # the BUILD OUTPUT, after it
//   ALLOW_MISSING_RAW=1 node scripts/check-raw-assets.mjs   # warn, do not fail
//
// TWO CHECKS, BECAUSE SOURCE-PRESENT DOES NOT MEAN OUTPUT-PRESENT (to-do #555).
// Next traces pipeline/raw* into .next/standalone at build time. On 2026-08-20 CI
// showed the gap: there those paths are SYMLINKS to read-only mounts, the tracer does
// not follow them, and the standalone tree came out without them. The source check
// passed — the symlinks resolve — while /metric/<id>/raw served a 307 to
// censusindia.gov.in with `x-raw-source: fallback-official-link`. That is exactly the
// #498 failure with the inputs looking fine, which is why the guard has to assert the
// artefact that actually ships, not only what went into it.
//
// `--output` runs as `postbuild`, so `npm run build` is gated at both ends.
//
// The escape hatch is for doc-only or UI work on a fresh clone, where fetching a
// gigabyte of government source data to fix a typo is absurd. It is deliberately
// an explicit env var: you can opt out, but not by accident.
//
// HOW IT READS THE DECLARATION, and why not with a regex. The first version of
// this guard scraped `f("…")` string literals out of the source text. An
// independent verifier hid a file the running image serves and watched the guard
// print `OK — 19 declared raw files, all present` and let the build proceed: two
// helpers (`rbiFiscal`, `rbiBank`) build their path with a TEMPLATE LITERAL,
// `f(`pipeline/raw-new/economy/${file}`, …)`, and are called nine times, so eight
// real files were invisible to it. 19 of 27 — a guard with a 30% blind spot,
// which is the exact failure mode it was written to stop.
//
// So it no longer reads the text. It transpiles the module and imports it, then
// walks the same `RAW_SOURCES` object the route walks. A path that is computed at
// the call site is therefore just a value, and drift is structurally impossible
// rather than regex-dependent.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const declRel = 'lib/metric-raw-source.ts';
const decl = path.join(repo, declRel);

// Which tree the declared paths are resolved against. The runtime reads
// `path.join(process.cwd(), raw.path)` and in the container cwd IS the standalone
// root, so checking `.next/standalone/<path>` asks the same question the running
// image will.
const checkOutput = process.argv.includes('--output');
const root = checkOutput ? path.join(repo, '.next', 'standalone') : repo;
const rootLabel = checkOutput ? '.next/standalone' : 'the source tree';

const die = (msg) => {
  console.error(`check-raw-assets: ${msg}`);
  process.exit(1);
};

if (!existsSync(decl)) die(`cannot find ${declRel} — has it moved?`);

// `typescript` is a devDependency and is present in the Docker builder stage,
// which runs `npm ci` (dev deps included) before `npm run build`.
let ts;
try {
  ts = createRequire(import.meta.url)('typescript');
} catch {
  die('cannot load the typescript compiler, which is needed to read the declaration.\n  Run npm ci (including devDependencies) before building.');
}

// The module is self-contained (types and consts only, no imports), so it can be
// transpiled and imported straight from memory without touching the filesystem.
// Wrapped so a syntax error or a newly-added relative import fails with a branded,
// actionable message instead of a bare stack trace — it still fails closed either
// way, but the reader should not have to guess which file broke.
let RAW_SOURCES;
try {
  const js = ts.transpileModule(readFileSync(decl, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
  RAW_SOURCES = mod.RAW_SOURCES;
} catch (err) {
  die(
    `could not read ${declRel}: ${err?.message ?? err}\n` +
      '  If a relative import was just added to that file, this guard cannot import it\n' +
      '  from memory any more and needs adjusting — it must not be left passing.',
  );
}

if (!RAW_SOURCES || typeof RAW_SOURCES !== 'object') {
  die(`${declRel} no longer exports RAW_SOURCES as an object — this guard is not reading it.`);
}

// kind: "file" is a hosted copy that must exist on disk. kind: "link" points at
// the official source and correctly has nothing local to check.
const byPath = new Map();
for (const [id, lineage] of Object.entries(RAW_SOURCES)) {
  const raw = lineage?.raw;
  if (raw?.kind !== 'file') continue;
  if (typeof raw.path !== 'string' || !raw.path) die(`metric '${id}' declares a hosted raw file with no path.`);
  if (!byPath.has(raw.path)) byPath.set(raw.path, []);
  byPath.get(raw.path).push(id);
}
const paths = [...byPath.keys()];

// Guard the guard, twice over.
//
// A checker that finds nothing to check reports success and means nothing — that
// is how the doc-lint passed every broken link for months, and how the first
// version of THIS script passed a build it should have stopped. So: zero is a
// structural failure, and any drop below the known count is treated as one too.
//
// FLOOR is set to the EXACT current count, not a slack margin. A floor of 20
// against a true 27 would silently tolerate losing seven files — a smaller
// version of the bug this rewrite just fixed. Because the count now comes from
// walking the object rather than a fragile regex, any change to it is deliberate
// by definition: adding metrics still passes (28 >= 27), and retiring one forces
// a one-line edit here in the same commit that retires it. Note it counts unique
// PATHS, so consolidating several metrics onto one shared file also lowers it.
const FLOOR = 27; // hosted files as of 2026-08-11
if (paths.length === 0) die(`walked RAW_SOURCES and found 0 hosted files. The declaration shape has changed and this guard is no longer reading it. Fix it — do NOT leave it passing vacuously.`);
if (paths.length < FLOOR) {
  die(
    `only ${paths.length} hosted raw files found, below the floor of ${FLOOR}.\n` +
      `  Either the declaration changed shape and this guard is half-blind, or metrics were\n` +
      `  retired. If the drop is intended, lower FLOOR in this file in the same commit.`,
  );
}

// A --output run against a tree that was never built is not a pass, it is a
// question nobody asked. Fail loudly rather than reporting OK on an absent artefact.
if (checkOutput && !existsSync(root)) {
  die(
    'no .next/standalone to check. `output: "standalone"` must be set in next.config\n' +
      '  and the build must have run before this. Refusing to report OK on a tree that\n' +
      '  does not exist.',
  );
}

const missing = paths.filter((p) => !existsSync(path.join(root, p)));

if (missing.length === 0) {
  console.log(
    `check-raw-assets: OK — ${paths.length} hosted raw files declared, all present in ${rootLabel}.`,
  );
  process.exit(0);
}

const lenient = process.env.ALLOW_MISSING_RAW === '1';

console[lenient ? 'warn' : 'error'](
  `check-raw-assets: ${lenient ? 'WARNING' : 'ERROR'} — ${missing.length} of ${paths.length} hosted raw files are missing from ${rootLabel}:\n` +
    missing.map((p) => `  - ${p}   (serves: ${byPath.get(p).join(', ')})`).join('\n') +
    '\n\n' +
    (checkOutput
      ? '  The source tree has these but the BUILT OUTPUT does not, so the shipped app\n' +
        '  will serve a 307 to the official source (x-raw-source: fallback-official-link)\n' +
        '  instead of the hosted file. The usual cause is that pipeline/raw* are SYMLINKS:\n' +
        "  Next's tracer does not follow them into .next/standalone. Stage them as real\n" +
        '  directories, or link them INTO .next/standalone after the build and re-run this.\n'
      : '  These are untracked source data. A build without them yields an image that\n' +
        '  looks healthy and serves text/html 404 for /metric/<id>/raw.\n' +
        '  Build from /mnt/storage/websites/mapsofbharat (which has them), not from a\n' +
        '  bare git worktree or a fresh clone.\n') +
    (lenient
      ? '  Continuing anyway because ALLOW_MISSING_RAW=1. Do not ship this image.\n'
      : '  To build anyway for doc-only or UI work: ALLOW_MISSING_RAW=1 npm run build\n'),
);

process.exit(lenient ? 0 : 1);
