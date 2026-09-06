#!/usr/bin/env node
// Generate the Ottomate tool's task file FROM THE TRACKER (to-do #522 / EXECUTION Q0).
//
//   node scripts/generate-ottomate-tasks.mjs --out ../Ottomate/TASKS.md
//   node scripts/generate-ottomate-tasks.mjs --out <path> --check   # CI: fail on drift
//
//   OTTOMATE_API    base URL. Default http://127.0.0.1:8110 (server-side).
//                   From a workstation use https://ottomate.vault7a.xyz.
//   OTTOMATE_TOKEN  optional; only needed if the read endpoint is ever gated.
//   OTTOMATE_TASKS_OUT  default --out path.
//
// WHY THIS EXISTS. The tracker is the source of truth for Ottomate's to-dos, and
// `../Ottomate/TASKS.md` was a SECOND copy kept by hand. Its own header admitted the
// problem — "it *will* drift, because a second hand-kept copy always does" — which is
// exactly the R-DOC-1 violation (no entity described in two hand-authored places).
// The fix is not to reconcile it more carefully; it is to stop it being authored.
//
// WHAT IS DELIBERATELY LOST, because pretending otherwise would be the dishonest part.
// The hand-written file grouped tasks into narrative sections ("Do first — security",
// "The tool is running stale and drifted") and ordered them by judgement rather than by
// id. A tracker to-do is a single title string, so generation CANNOT reproduce that
// grouping, and this file does not fake one. What survives is what the tracker actually
// holds, and the task-style convention already puts the why and the pointer INTO the
// title. If a task needs prose, the place for it is the title or a doc the title points
// at — not a parallel file that drifts.
//
// The one ordering signal the tracker does carry is `sort_order`, which is honoured
// (lower first, then id), so the owner can still promote a task and have it stay
// promoted. Anything finer belongs in the tracker, not here.
//
// --check exists because a generated file that is never verified is just a stale file
// with a confident header (R-DOC-9). It regenerates in memory and compares, so CI can
// fail on a hand-edit or on drift without needing write access.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const API = (process.env.OTTOMATE_API || "http://127.0.0.1:8110").replace(/\/+$/, "");
const SLUG = "ottomate";

const args = process.argv.slice(2);
const check = args.includes("--check");
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
const OUT = resolve(REPO, outArg || process.env.OTTOMATE_TASKS_OUT || "../Ottomate/TASKS.md");

/** Tags the project already writes into titles, e.g. "[ops]" / "[H, iter-40]". Pulled
 *  out for display so the title reads as a sentence rather than as a prefix soup. */
function splitTags(title) {
  const tags = [];
  let rest = title;
  for (;;) {
    const m = rest.match(/^\s*\[([^\]]{1,60})\]\s*/);
    if (!m) break;
    tags.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { tags, text: rest.trim() || title.trim() };
}

function esc(s) {
  // The titles are free text and land inside a markdown table cell in the done
  // summary; an unescaped pipe silently eats the rest of the row.
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function render(todos, meta) {
  // 2026-09-07 (ottomate #774/#530): the tracker now carries state / kind / priority / blocked_on / origin /
  // blocked_by / body, so this file groups rows by what they ARE instead of faking narrative sections.
  // Tolerant of rows written before the model (state falls back to done/open).
  const st = (t) => t.state ?? (t.done ? "done" : "open");
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
  const prio = { P0: 0, P1: 1, P2: 2 };
  const byPrio = (a, b) => (prio[a.priority] ?? 3) - (prio[b.priority] ?? 3) || bySort(a, b);
  const live = todos.filter((t) => !["done", "parked"].includes(st(t)));
  const parked = todos.filter((t) => st(t) === "parked").sort(bySort);
  const done = todos.filter((t) => st(t) === "done");
  done.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || b.id - a.id);
  const groups = [
    ["Waiting on the owner", live.filter((t) => st(t) === "blocked" && t.blocked_on === "owner")],
    ["In progress", live.filter((t) => st(t) === "in-progress")],
    ["Built — needs verification", live.filter((t) => st(t) === "built")],
    ["Ready to build", live.filter((t) => st(t) === "ready")],
    ["Blocked (dependency / external / other)", live.filter((t) => st(t) === "blocked" && t.blocked_on !== "owner")],
    ["Open — not yet looked at", live.filter((t) => st(t) === "open")],
  ];
  const miscOpen = live.filter((t) => (t.kind ?? "misc") === "misc").length;
  const chips = (t) => [t.priority, t.kind ?? "misc", st(t), t.blocked_on ? `on:${t.blocked_on}` : null]
    .filter(Boolean).map((x) => "`" + x + "`").join(" ");

  const L = [];
  L.push(`<!-- generated from the Ottomate tracker (project "${SLUG}") @ ${meta.count} to-dos on ${meta.date} — DO NOT EDIT; edit via the tracker API -->`);
  L.push("");
  L.push("# Ottomate — task list");
  L.push("");
  L.push(`_Generated ${meta.date} from the tracker at ${API.replace(/^https?:\/\/127\.0\.0\.1:\d+$/, "http://127.0.0.1:8110")}._ ` +
    `**${live.length} open · ${parked.length} parked · ${done.length} done.**` +
    (miscOpen ? ` ${miscOpen} open item(s) still have kind=misc — name them at pack-up.` : ""));
  L.push("");
  L.push("This file is generated. Editing it changes nothing that lasts — the next run overwrites it, " +
    "and `--check` fails CI in the meantime. To change a task, change it in the tracker " +
    "(`PATCH /api/todos/<id>`); to add one, `POST /api/projects/ottomate/todos`.");
  L.push("");
  L.push("Scope: the Ottomate **tool** — the skill, the app, the design pipeline, the plugin scripts. " +
    "Work on a *website built with* Ottomate belongs on that website's own list.");
  L.push("");
  L.push("---");
  L.push("");
  if (!live.length) { L.push("_Nothing open._"); L.push(""); }
  for (const [name, items] of groups) {
    if (!items.length) continue;
    items.sort(byPrio);
    L.push(`## ${name} — ${items.length}`);
    L.push("");
    for (const t of items) {
      const { tags, text } = splitTags(t.title);
      L.push(`### #${t.id} ${chips(t)}${tags.length ? " " + tags.map((x) => "`" + x + "`").join(" ") : ""}`);
      L.push("");
      L.push(text);
      if (t.body) { L.push(""); L.push(String(t.body).trim()); }
      const meta2 = [t.origin ? `origin: ${t.origin}` : null, t.blocked_by?.length ? `blocked by: ${t.blocked_by.map((i) => "#" + i).join(", ")}` : null,
        t.last_verified_at ? `last verified: ${String(t.last_verified_at).slice(0, 10)}` : null].filter(Boolean);
      if (meta2.length) { L.push(""); L.push(`_${meta2.join(" · ")}_`); }
      L.push("");
    }
  }
  if (parked.length) {
    L.push("---"); L.push("");
    L.push(`## Parked — ${parked.length}`); L.push("");
    L.push("Deliberately deferred; the reason lives in the body. Not forgotten, not open."); L.push("");
    for (const t of parked) {
      const { text } = splitTags(t.title);
      L.push(`- **#${t.id}** ${chips(t)} ${text}${t.body ? " — " + String(t.body).trim().split("\n")[0] : ""}`);
    }
    L.push("");
  }
  L.push("---");
  L.push("");
  L.push(`## Done — ${done.length}`);
  L.push("");
  L.push("Newest first. Kept because a closed task is the record of why something is the way it is.");
  L.push("");
  L.push("| # | Closed | Task |");
  L.push("|---|---|---|");
  for (const t of done) {
    const when = String(t.updated_at || "").slice(0, 10) || "—";
    L.push(`| ${t.id} | ${when} | ${esc(splitTags(t.title).text)} |`);
  }
  L.push("");
  return L.join("\n");
}

async function main() {
  const headers = {};
  if (process.env.OTTOMATE_TOKEN) headers.authorization = `Bearer ${process.env.OTTOMATE_TOKEN}`;

  const url = `${API}/api/projects/${SLUG}/todos`;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    console.error(`generate-ottomate-tasks: cannot reach ${url} — ${e.message}`);
    console.error("  server-side use http://127.0.0.1:8110; from a workstation set");
    console.error("  OTTOMATE_API=https://ottomate.vault7a.xyz");
    process.exit(3);
  }
  if (!res.ok) {
    console.error(`generate-ottomate-tasks: ${url} returned ${res.status}`);
    process.exit(3);
  }

  const body = await res.json();
  const todos = body.todos;
  if (!Array.isArray(todos)) {
    console.error("generate-ottomate-tasks: response has no todos array");
    process.exit(3);
  }
  // A tracker that answers 200 with an empty list would silently blank the file and
  // read as "all done". Refuse: an empty result is far more likely a wrong slug or a
  // pointed-at-the-wrong-instance mistake than genuine completion.
  if (todos.length === 0) {
    console.error(`generate-ottomate-tasks: 0 to-dos for project "${SLUG}" — refusing to write an empty file.`);
    console.error("  Check OTTOMATE_API points at the right instance.");
    process.exit(3);
  }

  const out = render(todos, { count: todos.length, date: new Date().toISOString().slice(0, 10) });

  if (check) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      console.error(`generate-ottomate-tasks --check: ${OUT} does not exist. Run without --check.`);
      process.exit(1);
    }
    // The provenance line carries today's date, so a same-content file regenerated on a
    // later day would "differ". Compare everything BELOW the header instead — content
    // drift is the thing worth failing on, a date is not.
    const strip = (s) => s.replace(/^<!-- generated from the Ottomate tracker[^\n]*-->\n/, "").replace(/^_Generated [^\n]*\n/m, "");
    if (strip(current).trim() !== strip(out).trim()) {
      console.error(`generate-ottomate-tasks --check: ${OUT} is out of date or hand-edited.`);
      console.error("  Regenerate: node scripts/generate-ottomate-tasks.mjs --out <path>");
      process.exit(1);
    }
    console.log(`generate-ottomate-tasks --check: OK — ${OUT} matches the tracker (${todos.length} to-dos)`);
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out, "utf8");
  const open = todos.filter((t) => !t.done).length;
  console.log(`generate-ottomate-tasks: wrote ${OUT} — ${todos.length} to-dos (${open} open)`);
}

main();
