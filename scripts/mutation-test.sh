#!/usr/bin/env bash
# Mutation harness (#557).
#
# WHY THIS EXISTS
#
# Three times a verdict here was drawn from a signal that did not measure the
# thing it was used to judge. The worst was a mutation run: `tail -4` cut
# Playwright's "N failed" line off the output, the absence of the line was read
# as "the tests did not catch this", and 6 mutations the suite HAD caught were
# reported as survivors. The suite was fine. The measurement was not.
#
# So this script never reads a verdict off human-readable text. It runs the
# suite with the JSON reporter and reads `stats.unexpected`. If the JSON is
# missing, empty, or unparseable it exits with an ERROR — it never degrades to
# "survived" or "killed", because a measurement that did not happen is not a
# result. That distinction is the entire point of the file.
#
# WHAT A MUTATION PROVES
#
# Break the code on purpose; the test that claims to cover it must go red.
#   test goes red  -> KILLED    (the test really does cover this)
#   test stays green -> SURVIVED (the test asserts nothing about this line)
#
# REBUILD AWARENESS
#
# Only specs that import from lib/ directly run node-side, where a source edit
# takes effect on the next run with no rebuild. As of 2026-08-22 that is:
#   tests/ip.spec.ts             -> lib/ip
#   tests/metric-families.spec.ts -> lib/metric-families
#   tests/symbol-maps.spec.ts    -> lib/symbols
# Mutating anything else only changes what the browser sees AFTER a rebuild.
# Running without one would show every mutation as SURVIVED — a false all-clear,
# the exact failure this script exists to stop. So a mutation to a file no
# node-side spec imports is refused unless --rebuilt says you already rebuilt.
#
# USAGE
#   scripts/mutation-test.sh --manifest planning/mutations-566.json
#   scripts/mutation-test.sh --file lib/symbols.ts --find 'X' --replace 'Y' \
#                            --tests tests/symbol-maps.spec.ts --name 'floor'
#
#   --rebuilt   assert you have rebuilt/redeployed; allows browser-side targets
#   --keep      leave the last mutation applied (debugging; prints a warning)
#
# MANIFEST FORMAT
#   { "tests": "tests/symbol-maps.spec.ts",
#     "mutations": [
#       {"name":"floor collapses", "file":"lib/symbols.ts",
#        "find":"literal string", "replace":"literal string"}
#     ] }
#
# EXIT CODES
#   0  every mutation KILLED
#   1  one or more SURVIVED (a real coverage gap)
#   2  ERROR — could not measure. Never treat as pass or fail.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

MANIFEST=""; M_FILE=""; M_FIND=""; M_REPL=""; M_TESTS=""; M_NAME=""
REBUILT=0; KEEP=0

die()  { echo "mutation-test: $*" >&2; exit 2; }
note() { echo "  $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --file)     M_FILE="${2:-}";   shift 2 ;;
    --find)     M_FIND="${2:-}";   shift 2 ;;
    --replace)  M_REPL="${2:-}";   shift 2 ;;
    --tests)    M_TESTS="${2:-}";  shift 2 ;;
    --name)     M_NAME="${2:-}";   shift 2 ;;
    --rebuilt)  REBUILT=1;         shift   ;;
    --keep)     KEEP=1;            shift   ;;
    -h|--help)  sed -n '2,50p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

command -v python3 >/dev/null || die "python3 not found"
command -v git     >/dev/null || die "git not found"
[ -f package.json ] || die "not at repo root (no package.json at $ROOT)"

# ---------------------------------------------------------------- build the plan
PLAN="$(mktemp)"
CURRENT_FILE=""
cleanup() {
  # Always restore. A harness that can leave the tree mutated is a hazard, and
  # an interrupted run is exactly when you would forget.
  #
  # This shouts when it fails rather than swallowing the error. First run against
  # a real target, the mutation was left applied on disk: the file was UNTRACKED,
  # `git checkout --` cannot restore an untracked file, and the failure went to
  # /dev/null. Broken source sat in the tree looking clean. A cleanup path that
  # can fail quietly is worse than none, because it is trusted.
  if [ -n "$CURRENT_FILE" ] && [ "$KEEP" -eq 0 ]; then
    if git checkout -- "$CURRENT_FILE" 2>/dev/null && git diff --quiet -- "$CURRENT_FILE"; then
      echo "mutation-test: restored $CURRENT_FILE" >&2
    else
      echo "mutation-test: *** COULD NOT RESTORE $CURRENT_FILE ***" >&2
      echo "    It may still hold a deliberately broken mutation. Restore it" >&2
      echo "    before doing anything else: git checkout -- $CURRENT_FILE" >&2
    fi
  fi
  rm -f "$PLAN" 2>/dev/null
}
trap cleanup EXIT INT TERM

if [ -n "$MANIFEST" ]; then
  [ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
  python3 - "$MANIFEST" > "$PLAN" <<'PY' || die "manifest is not valid JSON"
import json, sys
m = json.load(open(sys.argv[1]))
default_tests = m.get("tests", "")
muts = m.get("mutations") or []
if not muts:
    sys.exit("manifest has no mutations")
for i, x in enumerate(muts):
    for k in ("file", "find", "replace"):
        if k not in x:
            sys.exit(f"mutation {i} is missing required key '{k}'")
    name = x.get("name") or f"mutation {i+1}"
    tests = x.get("tests") or default_tests
    if not tests:
        sys.exit(f"mutation {i} has no tests and manifest has no default")
    if not x["find"]:
        sys.exit(f"mutation {i} has an empty 'find'")
    # Tab-separated; find/replace are base64 so any character survives the trip.
    # The "b64:" prefix is load-bearing: `replace` is legitimately empty for a
    # deletion mutation, bash treats tab as IFS-whitespace and COLLAPSES empty
    # fields, and every column after it then shifts by one. Keeping each field
    # non-empty is what stops that.
    import base64
    b = lambda s: "b64:" + base64.b64encode(s.encode()).decode()
    print("\t".join([name, x["file"], b(x["find"]), b(x["replace"]), tests]))
PY
else
  [ -n "$M_FILE" ] || die "need --manifest, or --file/--find/--replace/--tests"
  [ -n "$M_FIND" ] || die "--find is required"
  [ -n "$M_TESTS" ] || die "--tests is required"
  python3 - "$M_FILE" "$M_FIND" "$M_REPL" "$M_TESTS" "${M_NAME:-single}" > "$PLAN" <<'PY'
import base64, sys
f, find, repl, tests, name = sys.argv[1:6]
b = lambda s: "b64:" + base64.b64encode(s.encode()).decode()
print("\t".join([name, f, b(find), b(repl), tests]))
PY
fi

TOTAL=$(wc -l < "$PLAN" | tr -d ' ')
[ "$TOTAL" -gt 0 ] || die "no mutations to run"

# --------------------------------------------------- which specs run node-side
# Derived, not hardcoded: a spec that imports from lib/ is executed in the
# Playwright worker process, so editing that lib file changes the next run.
node_side_targets() {
  grep -rlE 'from "(@/)?lib/' tests/*.spec.ts 2>/dev/null | while read -r spec; do
    grep -ohE 'from "(@/)?lib/[a-zA-Z0-9_-]+"' "$spec" 2>/dev/null \
      | sed -E 's|.*lib/([a-zA-Z0-9_-]+)".*|lib/\1|'
  done | sort -u
}
NODE_SIDE="$(node_side_targets)"

is_node_side() {
  local f="${1%.ts}"; f="${f%.tsx}"
  echo "$NODE_SIDE" | grep -qx "$f"
}

# ------------------------------------------------------------- run the suite
# Returns via globals: RUN_PASSED RUN_FAILED. Exits 2 on an unmeasurable run.
run_suite() {
  local tests="$1" label="$2"
  local json; json="$(mktemp)"
  PLAYWRIGHT_JSON_OUTPUT_NAME="$json" \
    npx playwright test "$tests" --reporter=json >/dev/null 2>&1
  # Deliberately ignoring playwright's exit code: a non-zero exit is expected
  # when a mutation is killed. The counts are the measurement, not the code.
  if [ ! -s "$json" ]; then
    rm -f "$json"
    echo "mutation-test: ERROR — no JSON produced for $label." >&2
    echo "  The run could not be measured, so it is not a result." >&2
    echo "  Check the instance is up at \${BASE_URL:-http://localhost:8610}." >&2
    exit 2
  fi
  local parsed
  parsed="$(python3 - "$json" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    sys.exit(f"unparseable: {e}")
s = d.get("stats")
if not isinstance(s, dict):
    sys.exit("no stats block in reporter output")
for k in ("expected", "unexpected"):
    if k not in s:
        sys.exit(f"stats missing '{k}'")
print(s["expected"], s["unexpected"], s.get("flaky", 0), s.get("skipped", 0))
PY
)" || { rm -f "$json"; echo "mutation-test: ERROR — $label: $parsed" >&2; exit 2; }
  rm -f "$json"
  RUN_PASSED="$(echo "$parsed" | awk '{print $1}')"
  RUN_FAILED="$(echo "$parsed" | awk '{print $2}')"
  if [ "$RUN_PASSED" -eq 0 ] && [ "$RUN_FAILED" -eq 0 ]; then
    echo "mutation-test: ERROR — $label ran 0 tests. Wrong path or filter?" >&2
    exit 2
  fi
}

# ------------------------------------------------------------------- baseline
# Without this, a suite that is already red reports every mutation as KILLED
# and the run looks like a clean sweep. Same class of bug as the tail -4.
BASE_TESTS="$(cut -f5 "$PLAN" | sort -u | tr '\n' ' ')"
echo "mutation-test: baseline on ${BASE_TESTS}"
for t in $BASE_TESTS; do
  run_suite "$t" "baseline $t"
  if [ "$RUN_FAILED" -ne 0 ]; then
    die "baseline is RED ($RUN_FAILED failing in $t). Fix that first — mutation results are meaningless against a red suite."
  fi
  note "baseline $t: ${RUN_PASSED} passed, 0 failed"
done
echo

# ----------------------------------------------------------------- mutate loop
KILLED=0; SURVIVED=0; N=0
declare -a SURVIVOR_NAMES=()

while IFS=$'\t' read -r NAME FILE FIND_B64 REPL_B64 TESTS; do
  N=$((N + 1))
  echo "[$N/$TOTAL] $NAME"
  note "target: $FILE  tests: $TESTS"

  [ -f "$FILE" ] || die "$FILE does not exist"

  if ! is_node_side "$FILE"; then
    if [ "$REBUILT" -eq 0 ]; then
      echo >&2
      echo "mutation-test: REFUSING to mutate $FILE." >&2
      echo "  No spec imports it directly, so it only reaches the suite through" >&2
      echo "  the built app. Without a rebuild every mutation would show as" >&2
      echo "  SURVIVED and that false all-clear is the bug this tool prevents." >&2
      echo "  Rebuild and redeploy, then re-run with --rebuilt." >&2
      exit 2
    fi
    note "browser-side target; trusting --rebuilt"
  fi

  # Tracked FIRST. Every safety property below leans on git: the clean check is
  # `git diff`, which reports nothing for an untracked file, and the revert is
  # `git checkout --`, which cannot restore one. Run against an untracked target
  # and the harness sails through both blind and leaves the mutation on disk.
  git ls-files --error-unmatch "$FILE" >/dev/null 2>&1 \
    || die "$FILE is not tracked by git. Commit it first — revert depends on git, and an untracked target would be left mutated."
  git diff --quiet -- "$FILE" || die "$FILE has uncommitted changes; refusing (revert would destroy them)"

  # Apply. Literal replace, and the match must be unique — an ambiguous
  # mutation silently hitting the wrong line is untraceable.
  CURRENT_FILE="$FILE"
  python3 - "$FILE" "$FIND_B64" "$REPL_B64" <<'PY' || exit 2
import base64, sys
path, fb, rb = sys.argv[1], sys.argv[2], sys.argv[3]
for label, v in (("find", fb), ("replace", rb)):
    if not v.startswith("b64:"):
        sys.exit(f"mutation-test: {label} field lost its b64: prefix — "
                 "the plan line was mangled, refusing to edit source")
find = base64.b64decode(fb[4:]).decode()
repl = base64.b64decode(rb[4:]).decode()
src = open(path, encoding="utf-8").read()
n = src.count(find)
if n == 0:
    sys.exit(f"mutation-test: find-string not present in {path}")
if n > 1:
    sys.exit(f"mutation-test: find-string appears {n} times in {path}; make it unique")
open(path, "w", encoding="utf-8").write(src.replace(find, repl, 1))
PY

  # Prove the edit actually landed. Trusting the write is how you end up
  # measuring an unmutated file and calling the result a kill.
  if git diff --quiet -- "$FILE"; then
    die "applied a mutation to $FILE but the file is unchanged"
  fi

  run_suite "$TESTS" "$NAME"
  git checkout -- "$FILE" || die "could not restore $FILE"
  git diff --quiet -- "$FILE" || die "$FILE still differs after restore"
  CURRENT_FILE=""

  if [ "$RUN_FAILED" -gt 0 ]; then
    KILLED=$((KILLED + 1))
    note "KILLED — ${RUN_FAILED} failed, ${RUN_PASSED} passed"
  else
    SURVIVED=$((SURVIVED + 1))
    SURVIVOR_NAMES+=("$NAME  ($FILE)")
    note "SURVIVED — 0 failed, ${RUN_PASSED} passed. Nothing asserts this."
  fi
  echo
done < "$PLAN"

# ---------------------------------------------------------------------- report
echo "────────────────────────────────────────"
echo "killed ${KILLED}/${TOTAL}   survived ${SURVIVED}/${TOTAL}"
if [ "$SURVIVED" -gt 0 ]; then
  echo
  echo "survivors — the suite is green with these broken:"
  for s in "${SURVIVOR_NAMES[@]}"; do echo "  - $s"; done
  echo
  echo "Each is a real coverage gap: add an assertion, or narrow the claim the"
  echo "test is supposed to be backing."
  exit 1
fi
echo "every mutation was caught."
exit 0
