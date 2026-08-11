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
// It reads the SAME declaration the route reads — `lib/metric-raw-source.ts` —
// so the guard cannot drift from what is actually served.
//
//   node scripts/check-raw-assets.mjs
//   ALLOW_MISSING_RAW=1 node scripts/check-raw-assets.mjs   # warn, do not fail
//
// The escape hatch is for doc-only or UI work on a fresh clone, where fetching a
// gigabyte of government source data to fix a typo is absurd. It is deliberately
// an explicit env var: you can opt out, but not by accident.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decl = path.join(repo, 'lib', 'metric-raw-source.ts');

if (!existsSync(decl)) {
  console.error(`check-raw-assets: cannot find ${path.relative(repo, decl)} — has it moved?`);
  process.exit(1);
}

// Hosted raw files are declared as f("<repo-relative path>", "<filename>", MIME, ...).
// RawLink entries (L("reason")) have no local file and are correctly not matched.
const src = readFileSync(decl, 'utf8');
const declared = [...src.matchAll(/\bf\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
const paths = [...new Set(declared)];

// Guard the guard. A checker that finds nothing to check reports success and
// means nothing — exactly the failure mode that let the doc-lint pass every
// broken link for months. If the declaration shape changes, fail loudly here
// rather than quietly waving builds through.
if (paths.length === 0) {
  console.error(
    'check-raw-assets: parsed 0 raw paths out of lib/metric-raw-source.ts.\n' +
      '  The declaration shape has changed and this guard is no longer reading it.\n' +
      '  Fix the matcher — do NOT leave it passing vacuously.',
  );
  process.exit(1);
}

const missing = paths.filter((p) => !existsSync(path.join(repo, p)));

if (missing.length === 0) {
  console.log(`check-raw-assets: OK — ${paths.length} declared raw files, all present.`);
  process.exit(0);
}

const lenient = process.env.ALLOW_MISSING_RAW === '1';
const label = lenient ? 'WARNING' : 'ERROR';

console[lenient ? 'warn' : 'error'](
  `check-raw-assets: ${label} — ${missing.length} of ${paths.length} declared raw files are missing:\n` +
    missing.map((p) => `  - ${p}`).join('\n') +
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
