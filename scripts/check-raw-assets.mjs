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
//   node scripts/check-raw-assets.mjs
//   ALLOW_MISSING_RAW=1 node scripts/check-raw-assets.mjs   # warn, do not fail
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

const js = ts.transpileModule(readFileSync(decl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// The module is self-contained (types and consts only, no imports), so it can be
// imported straight from memory without touching the filesystem.
const mod = await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
const RAW_SOURCES = mod.RAW_SOURCES;

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
// structural failure, and a sharp drop is treated as one too. FLOOR is a
// tripwire, not a target; raise it deliberately if the catalogue grows, and if a
// metric is genuinely retired, lower it in the same commit that retires it.
const FLOOR = 20; // 27 hosted files as of 2026-08-11
if (paths.length === 0) die(`walked RAW_SOURCES and found 0 hosted files. The declaration shape has changed and this guard is no longer reading it. Fix it — do NOT leave it passing vacuously.`);
if (paths.length < FLOOR) {
  die(
    `only ${paths.length} hosted raw files found, below the floor of ${FLOOR}.\n` +
      `  Either the declaration changed shape and this guard is half-blind, or metrics were\n` +
      `  retired. If the drop is intended, lower FLOOR in this file in the same commit.`,
  );
}

const missing = paths.filter((p) => !existsSync(path.join(repo, p)));

if (missing.length === 0) {
  console.log(`check-raw-assets: OK — ${paths.length} hosted raw files declared, all present.`);
  process.exit(0);
}

const lenient = process.env.ALLOW_MISSING_RAW === '1';

console[lenient ? 'warn' : 'error'](
  `check-raw-assets: ${lenient ? 'WARNING' : 'ERROR'} — ${missing.length} of ${paths.length} hosted raw files are missing:\n` +
    missing.map((p) => `  - ${p}   (serves: ${byPath.get(p).join(', ')})`).join('\n') +
    '\n\n' +
    '  These are untracked source data. A build without them yields an image that\n' +
    '  looks healthy and serves text/html 404 for /metric/<id>/raw.\n' +
    '  Build from /mnt/storage/websites/mapsofbharat (which has them), not from a\n' +
    '  bare git worktree or a fresh clone.\n' +
    (lenient
      ? '  Continuing anyway because ALLOW_MISSING_RAW=1. Do not ship this image.\n'
      : '  To build anyway for doc-only or UI work: ALLOW_MISSING_RAW=1 npm run build\n'),
);

process.exit(lenient ? 0 : 1);
