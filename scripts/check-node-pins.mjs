#!/usr/bin/env node
// The Node version is written in five places, and they must agree (#659, #610).
//
// FIVE, AND THE ARITHMETIC IS SPELLED OUT BECAUSE THIS SENTENCE SAID FOUR WHILE THE
// LINE BELOW LISTED FIVE. `.nvmrc` (1) + the Dockerfile's FROMs (3) + package.json
// `engines` (1). Measured, not counted from memory:
//
//   $ git grep -n "20\.20\.2" -- .nvmrc Dockerfile package.json .gitea \
//       | grep -vE ':[0-9]+:[[:space:]]*#'
//   .nvmrc:1:20.20.2
//   Dockerfile:5:FROM node:20.20.2-slim AS deps
//   Dockerfile:11:FROM node:20.20.2-slim AS builder
//   Dockerfile:18:FROM node:20.20.2-slim AS runner
//   package.json:5:    "node": "20.20.2"
//
// The live count is the guard's own, printed on the OK line of every run — that one is
// measured and cannot go stale. This one is here to be read, and it has been checked
// against its list, which is the step the version of it that shipped in c4d455f
// skipped, and the same step the ci.yml paragraph it was copied from skipped twice.
//
// WHAT WAS MISSING. scripts/check-node-version.mjs compares the RUNNING Node to
// .nvmrc. That is one half of the pin. The other half — that every place naming the
// version names the SAME version — was documented and unguarded. The literal 20.20.2
// appears in .nvmrc, in three Dockerfile FROMs and in package.json `engines`, and
// nothing compared them to each other.
//
// MEASURED, NOT SUSPECTED (iter-46 item 1084). A verifier changed .nvmrc to 20.19.2
// and nothing noticed: the Dockerfile still built node:20.20.2-slim three times,
// `engines` still said 20.20.2, check-node-version passed (the host happened to be
// running 20.19.2, so it agreed with the file it reads), and every other check script
// exited 0. The ci.yml comment above the setup-node step said moving Node was "a
// one-line change to .nvmrc" — and a one-line change to .nvmrc moved nothing.
//
// THIS IS #659 WEARING A NEW HAT. `node:20-slim` and `node-version: 20` drifted apart
// because two places named the version and only luck kept them equal. Pinning both to
// 20.20.2 removed the FLOAT and left the DUPLICATION, which is a pin that is true on
// the day it is written. Four copies of a literal — the three FROMs and `engines`,
// .nvmrc being the original rather than a copy — with no comparison between them drift
// the same way, just more slowly and with nothing floating to blame.
//
// It matters at patch level, which is the part that reads like pedantry and is not:
// node:20.19.4-slim LISTS this repo's tests and node:20.19.5-slim THROWS. A one-patch
// disagreement between the Dockerfile and .nvmrc is enough for CI and this box to
// tell different stories for weeks, which is exactly what #610 was.
//
// .nvmrc IS THE AUTHORITY. Everything else is a copy. Disagreements are always
// reported against .nvmrc, never the other way round, so there is one answer to
// "which one is right" and it is the same answer every time.
//
//   node scripts/check-node-pins.mjs        (npm run check:pins)
//
// EXIT CODES HAVE THE SAME SHAPE AS check-node-version.mjs: 1 is a real disagreement,
// 2 is "this guard could not measure". They are kept distinct because a checkout with
// no Dockerfile and a checkout whose Dockerfile agrees must never print the same
// thing — the zero-measurement pass is the failure this codebase keeps finding in its
// own guards, twice in this iteration alone.
//
// WHY IT IS NOT IN `prebuild`. Same reason as check-spec-imports.mjs: it fails when
// it finds nothing to measure, which is right for a repo checkout and wrong for a
// build context that may legitimately not carry .gitea/. It runs in CI's `quality`
// job, which needs nothing but the repo.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NVMRC = join(ROOT, ".nvmrc");
const DOCKERFILE = join(ROOT, "Dockerfile");
const PACKAGE_JSON = join(ROOT, "package.json");
const WORKFLOWS = join(ROOT, ".gitea", "workflows");

const FULL_VERSION = /^\d+\.\d+\.\d+$/;

/** Exit 2: the guard could not measure. Never exit 0 from here — a guard that found
 *  nothing to check has not checked anything, and saying OK would be a lie that reads
 *  exactly like the truth. */
function cannotMeasure(headline, ...detail) {
  console.error(`check-node-pins: ${headline}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(2);
}

/** The version a string names, when it names one EXACTLY.
 *    "20.20.2" -> "20.20.2"    "20" -> "20" (exact, but not full — see says())
 *    "^20.20.2" / ">=20" / "20.x" / "lts" -> null
 *  A range comes back as null because it names a SET, and a set neither matches nor
 *  contradicts a pin. A bare major comes back as "20" rather than null on purpose:
 *  it is a real answer that is not the pinned one, and `node:20-slim` floating away
 *  from 20.20.2 is the original bug (#659) — it has to read as a disagreement, not
 *  as an unparseable tag. */
function exactVersion(s) {
  const m = /^v?(\d+(?:\.\d+){0,2})$/.exec(String(s).trim());
  return m ? m[1] : null;
}

/** The version a docker tag names: the part before the first `-`, which is where the
 *  variant lives. `20.20.2-slim` -> "20.20.2", `20-slim` -> "20", `lts-slim` -> null,
 *  a missing tag (`FROM node`, i.e. latest) -> null. */
function versionFromTag(tag) {
  if (!tag) return null;
  return exactVersion(tag.split("-", 1)[0]);
}

/** Take a docker reference apart: `[registry[:port]/]name[:tag][@digest]`.
 *
 *  THE DIGEST COMES OFF FIRST, AND THAT IS THE WHOLE OF THIS FUNCTION (iter-46 item
 *  1084, third sweep). This used to split on the first colon after the last slash —
 *  which in `node@sha256:aaaa` is the one inside the digest — so the image name came
 *  out as `node@sha256`, failed the `node` test, and the FROM was SKIPPED IN SILENCE.
 *  Measured: a Dockerfile with two digest-pinned FROMs and one tagged one printed
 *
 *      OK — .nvmrc says 20.20.2, and so does everywhere else (1 Dockerfile FROM(s), …)
 *
 *  Two thirds of the Dockerfile had stopped being compared and the guard still said
 *  "everywhere else". It was internally inconsistent as well: `node:lts-slim` names no
 *  version either and IS reported. Digest pinning is a routine hardening change — a
 *  bot proposes it — so this is the shape most likely to arrive unannounced. */
function parseImageRef(ref) {
  const at = ref.indexOf("@");
  const named = at === -1 ? ref : ref.slice(0, at);
  const slash = named.lastIndexOf("/");
  const colon = named.indexOf(":", slash + 1);
  return {
    image: colon === -1 ? named : named.slice(0, colon),
    tag: colon === -1 ? null : named.slice(colon + 1),
    digest: at === -1 ? null : ref.slice(at + 1),
  };
}

/** The image this guard compares. `FROM deps AS builder` names a previous stage. */
const IS_NODE_IMAGE = /^(?:.*\/)?node$/i;

/** A reference that mentions `node` where an image NAME goes — whether or not
 *  parseImageRef managed to read it.
 *
 *  Deliberately cruder, and deliberately NOT written in terms of the parser: it is a
 *  second, independent measurement whose only job is to catch the first one dropping
 *  something. That is exactly what went wrong — the parser quietly stopped recognising
 *  a node image and nothing anywhere disagreed with it. No Dockerfile can make these
 *  two differ today; the mutation that breaks parseImageRef can, which is the case
 *  this exists for and the only way to kill it. */
const MENTIONS_NODE = /(?:^|\/)node(?=$|[:@])/i;

/** How one declaration's version reads in the failure list. The sites word it the same
 *  way, so a range in `engines` and a codename tag in the Dockerfile do not look like
 *  different kinds of problem. */
function says(d) {
  // A digest pins the BYTES, which is a good thing to do and not a version. The remedy
  // is a tag ALONGSIDE it (`node:20.20.2-slim@sha256:…`), not removing it, so this one
  // gets its own sentence rather than the generic "names no exact version".
  if (d.digestOnly) return "pins a digest and names no version — keep it, and add the tag";
  if (d.version === null) return "names no exact version";
  if (!FULL_VERSION.test(d.version)) return `names ${d.version}, which is not a full version`;
  return `names ${d.version}`;
}

/** YAML comments, removed before matching — and the reason is specific rather than
 *  tidy. The ci.yml paragraph this guard was written to make TRUE spells the old
 *  literal out in prose, because that literal is the incident it records. Matching
 *  prose would make the guard red on its own documentation, and the cheapest way back
 *  to green would be deleting the history that explains the pin. A `#` at the start of
 *  a line or after whitespace begins a comment in YAML — that is the language, not a
 *  heuristic — and a version behind one configures nothing.
 *
 *  Note what is NOT done here: no comment stripping in the Dockerfile. Its comments
 *  mention `node:20-slim` too, but a FROM must begin the line, so prose cannot look
 *  like a declaration there and nothing needs to be blanked. Blanking lines you do not
 *  have to blank is how scripts/check-spec-imports.mjs acquired a blind spot. */
function stripYamlComments(src) {
  return src
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

function relativeToRoot(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

// ── The authority ────────────────────────────────────────────────────────────────
let want;
try {
  want = readFileSync(NVMRC, "utf8").trim().replace(/^v/, "");
} catch {
  cannotMeasure(
    ".nvmrc is missing.",
    "It is the version every other declaration is compared against, so without it",
    "there is nothing to compare them to. An unchecked version is what cost weeks on",
    "#610 — this is a failure, not a skip."
  );
}

if (!FULL_VERSION.test(want)) {
  cannotMeasure(
    `.nvmrc says "${want}", which is not a full version.`,
    "A bare major or a range floats, and a float cannot be compared to a pinned tag:",
    "`node:20.20.2-slim` neither matches nor contradicts `20`. Name all three parts."
  );
}

// ── What every other place says ──────────────────────────────────────────────────
/** One declaration of the Node version outside .nvmrc.
 *  `version` is what it actually names, or null when it names no exact version at
 *  all — a floating tag (`node:lts-slim`) or a range (`"^20.20.2"`, `">=20"`).
 *  Anything not literally equal to .nvmrc is a disagreement; the distinction only
 *  changes the sentence printed beside it. */
const declarations = [];
/** Things wrong with HOW a version is declared, rather than with the version. */
const problems = [];

// The Dockerfile — three node FROMs today. That number is hardcoded nowhere and is not
// meant to be: a fourth stage is a normal change. What IS enforced is that the two
// measurements of it agree (see nodeishFroms below), because the way this went wrong
// was not the count changing — it was the count DROPPING, silently, while the OK line
// said everything had been compared.
if (!existsSync(DOCKERFILE)) {
  cannotMeasure(
    "Dockerfile is missing.",
    "It is the declaration that matters most — it is what production actually runs —",
    "so its absence is not something to check around."
  );
}

let dockerFroms = 0;
let nodeishFroms = 0;
readFileSync(DOCKERFILE, "utf8")
  .split("\n")
  .forEach((text, i) => {
    // `FROM --platform=… node:20.20.2-slim AS deps` — flags optional, stage optional.
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)/i.exec(text);
    if (!m) return;
    const ref = m[1];
    const where = `Dockerfile:${i + 1}`;
    if (MENTIONS_NODE.test(ref)) nodeishFroms += 1;

    // A reference this guard cannot resolve to a literal image name. `FROM ${BASE}`
    // may well BE the node base image — measured, it was, and the guard walked past it
    // and reported "2 Dockerfile FROM(s)" for a three-stage build. It cannot expand the
    // ARG, so it says which line it could not read instead of quietly reading fewer.
    if (ref.includes("$")) {
      problems.push(`${where} FROM ${ref} — this guard cannot resolve an expanded base image`);
      return;
    }

    const { image, tag, digest } = parseImageRef(ref);
    // `FROM deps AS builder` names a previous stage, not an image. Only the node base
    // images declare a version.
    if (!IS_NODE_IMAGE.test(image)) return;
    dockerFroms += 1;
    declarations.push({
      where,
      text: `FROM ${ref}`,
      // `node:20.20.2-slim@sha256:…` pins the bytes AND names the version, and the tag
      // is what gets compared. Digest alone names nothing, exactly as `lts-slim` does.
      version: versionFromTag(tag),
      digestOnly: tag === null && digest !== null,
    });
  });

// THE PARSER AND THE CRUDE TEST MUST AGREE ON HOW MANY. A node FROM that
// parseImageRef stops recognising does not become an error; it becomes one fewer
// comparison, and the OK line goes on saying "everywhere else" about a Dockerfile it
// has stopped reading. Two measurements of the same count is the cheapest way to make
// that loud, and it is the failure that actually happened.
if (nodeishFroms !== dockerFroms) {
  problems.push(
    `${nodeishFroms} Dockerfile FROM(s) name a node image and this guard parsed ${dockerFroms} — ` +
      "the rest were skipped without being compared to anything"
  );
}

if (dockerFroms === 0) {
  cannotMeasure(
    "the Dockerfile declares no node base image.",
    "Every FROM was a stage name or some other image, so this guard compared nothing",
    "against .nvmrc and would otherwise have printed OK. If the base image genuinely",
    "moved, this check moves with it — it does not get satisfied by an absence.",
    // Anything already noticed about the Dockerfile belongs here rather than being
    // thrown away with the run: "no node base image" and "there was one and I could
    // not read it" are different findings and must not print the same thing.
    ...problems
  );
}

// package.json engines — the declaration npm itself reads.
let pkg;
try {
  pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
} catch (e) {
  cannotMeasure(`package.json could not be read: ${e.message}`);
}

const engines = pkg.engines?.node;
if (typeof engines !== "string" || engines.trim() === "") {
  cannotMeasure(
    "package.json has no engines.node.",
    "It is one of the copies this guard exists to compare. Removing it is a decision",
    "somebody can make in the open — and remove this expectation in the same commit —",
    "but it must not be the reason the guard quietly has less to say."
  );
}

declarations.push({
  where: "package.json engines.node",
  text: `"node": "${engines}"`,
  // Exact or nothing. `^20.20.2`, `>=20` and `20.x` all ALLOW the pinned version and
  // all permit something else, which is the definition of not pinning it.
  version: exactVersion(engines),
});

// The workflows — where a literal `node-version:` is the historical bug itself.
if (!existsSync(WORKFLOWS)) {
  cannotMeasure(
    `${relativeToRoot(WORKFLOWS)} is missing.`,
    "CI is where the pin is enforced on every push. If the workflows have moved, this",
    "guard is reading the wrong place and no longer checks the thing it says it does."
  );
}

const workflowFiles = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();
if (workflowFiles.length === 0) {
  cannotMeasure(`${relativeToRoot(WORKFLOWS)} holds no workflow files.`);
}

let setupNodeSteps = 0;
let nvmrcReaders = 0;
let workflowLiterals = 0;
for (const file of workflowFiles) {
  const src = stripYamlComments(readFileSync(join(WORKFLOWS, file), "utf8"));
  src.split("\n").forEach((text, i) => {
    const where = `.gitea/workflows/${file}:${i + 1}`;
    if (/uses:\s*\S*actions\/setup-node/.test(text)) setupNodeSteps += 1;

    // `with: { node-version-file: .nvmrc, cache: npm }` — a DERIVATION, not a copy.
    // It cannot disagree, which is why it is the form CI uses; it is counted so the
    // OK line can say the derivation is still in place.
    const derived = /node-version-file:\s*([^\s,}]+)/.exec(text);
    if (derived) {
      nvmrcReaders += 1;
      if (derived[1] !== ".nvmrc") {
        problems.push(
          `${where} reads node-version-file: ${derived[1]} — CI must take its Node from .nvmrc`
        );
      }
    }

    // A literal. THIS IS THE ORIGINAL BUG: the step used to read `node-version: 20`,
    // which floated for months while the Dockerfile floated separately.
    const literal = /node-version:\s*['"]?([^\s,}'"]+)/.exec(text);
    if (literal) {
      workflowLiterals += 1;
      declarations.push({
        where,
        text: `node-version: ${literal[1]}`,
        version: exactVersion(literal[1]),
      });
    }
  });
}

if (setupNodeSteps === 0) {
  cannotMeasure(
    "no workflow sets up Node at all.",
    "Either CI stopped installing one — in which case it runs on whatever the runner",
    "ships and the pin is decorative — or these files are not the workflows any more.",
    "Both are worth stopping for."
  );
}

if (nvmrcReaders + workflowLiterals < setupNodeSteps) {
  problems.push(
    `${setupNodeSteps} setup-node step(s), but only ${nvmrcReaders + workflowLiterals} name a ` +
      "version — the rest take whatever Node the runner ships"
  );
}

// ── The comparison ───────────────────────────────────────────────────────────────
const disagreements = declarations.filter((d) => d.version !== want);

if (disagreements.length || problems.length) {
  if (disagreements.length) {
    console.error(
      `\ncheck-node-pins: ${disagreements.length} of ${declarations.length} declaration(s) disagree with .nvmrc (${want}):\n`
    );
    // EVERY disagreeing location, not the first one. Moving Node edits five lines
    // across three files, four of which this guard compares; one that stopped at the
    // first would turn a single edit into four red runs.
    const where = Math.max(...disagreements.map((d) => d.where.length));
    const text = Math.max(...disagreements.map((d) => d.text.length));
    for (const d of disagreements) {
      console.error(`  ${d.where.padEnd(where)}  ${d.text.padEnd(text)}  ${says(d)}`);
    }
  }
  if (problems.length) {
    console.error(disagreements.length ? "" : "\ncheck-node-pins: the Node pin is not being applied:\n");
    for (const p of problems) console.error(`  ${p}`);
  }
  console.error("");
  console.error("  .nvmrc is the authority; every line above is a copy of it that has drifted.");
  console.error("  Moving Node means moving ALL of them in the same commit — that is the whole");
  console.error("  point of the pin. #610 turned on a PATCH: node:20.19.4-slim lists this repo's");
  console.error("  tests and node:20.19.5-slim throws, so one number apart is enough for CI and");
  console.error("  this box to tell different stories for weeks.");
  console.error("");
  process.exit(1);
}

const measured = [
  `${dockerFroms} Dockerfile FROM(s)`,
  "package.json engines.node",
  workflowLiterals ? `${workflowLiterals} workflow literal(s)` : null,
  nvmrcReaders ? `${nvmrcReaders} workflow step(s) reading .nvmrc` : null,
]
  .filter(Boolean)
  .join(", ");
console.log(`check-node-pins: OK — .nvmrc says ${want}, and so does everywhere else (${measured})`);
