#!/usr/bin/env bash
# Guard: a running instance must survive .next disappearing underneath it (#607).
#
# WHAT WENT WRONG. A `npm run build` in another terminal wipes .next as its first
# act. Every instance serving out of .next/standalone loses server.js and its whole
# static tree at that instant, but keeps its PID and its socket — so it answers, and
# answers wrongly. A Playwright suite pointed at it reports twenty-second timeouts
# across every spec that needs the map to initialise, and that list reads exactly
# like a map regression. It is not one. Chasing it costs a session.
#
# WHAT THIS ASSERTS. Two servers, one difference.
#
#   PART A  an instance staged per-run (scripts/lib/stage-run-tree.sh) keeps serving
#           its pages and its chunks after .next is taken away.
#   PART B  an instance serving out of .next/standalone, the way both harnesses did
#           before this, does NOT.
#
# PART B IS NOT DECORATION. Without it, Part A passing proves nothing: an assertion
# that a chunk still loads is satisfied just as well by a check that never actually
# removed anything. B is the differential — the same assertion, run against the
# arrangement that is known to break, and required to go red. If B stays green, this
# script exits ERROR rather than PASS, because at that point it is measuring nothing.
# (iter-43 found four guards in this repo that had never executed while reporting
# success. A guard without its own control is one of those waiting to happen.)
#
# .next is MOVED aside and moved back, not deleted. The mechanism under test is that
# a path vanishes, and a rename delivers that exactly, without costing whoever runs
# this a nine-minute rebuild.
#
#   scripts/check-build-isolation.sh
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
export REPO
# shellcheck source=lib/stage-run-tree.sh
. "$REPO/scripts/lib/stage-run-tree.sh"

NEXT="$REPO/.next"
ASIDE="$REPO/.next.isolation-check"
TREE=""
PID_A=""
PID_B=""
FAILED=0

log()  { echo "check-build-isolation: $*"; }
fail() { echo "check-build-isolation: FAIL — $*" >&2; FAILED=1; }
err()  { echo "check-build-isolation: ERROR — $*" >&2; exit 3; }

stop() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.25; done
  kill -9 "$pid" 2>/dev/null
}

# THE MOVE WINDOW IS HELD UNDER THE BUILD LOCK (iter-46 item 1073).
#
# Taking .next away and putting it back is the same act `next build` performs as its
# first step, and the reason this script exists is that the two at once destroy a
# tree. Unlocked, `npm run check:isolation` during a build IS the collision it was
# written to prevent: the build wipes .next while ours is parked at
# .next.isolation-check, writes a fresh one, and restore_next then rm -rf's the
# build's output and moves the old tree back over it. The build reports success and
# ships chunks that 404 — #607 exactly, caused by its own guard.
#
# Same .buildlock scripts/with-build-lock.sh takes for a build and
# scripts/lib/stage-run-tree.sh takes SHARED for a copy; a second mechanism here
# would serialise against nothing. EXCLUSIVE, because for the length of the window
# there must be no build at all — not even another reader's staging copy, which
# would find .next gone.
#
# fd 8, not 9: stage_run_tree uses 9 and this script calls it.
BUILD_LOCK="$REPO/.buildlock"
lock_next() {
  exec 8>>"$BUILD_LOCK" || err "cannot open $BUILD_LOCK — refusing to move .next unserialised"
  flock -x -w "${ISOLATION_LOCK_WAIT:-1800}" 8 \
    || err "a build has held $BUILD_LOCK for ${ISOLATION_LOCK_WAIT:-1800}s; .next was not moved and nothing was tested"
}
unlock_next() { exec 8>&-; }

# .next must come back whatever happens here, including a Ctrl-C between the two mvs.
restore_next() {
  if [ -d "$ASIDE" ]; then
    [ -e "$NEXT" ] && rm -rf "$NEXT"
    mv "$ASIDE" "$NEXT" || echo "check-build-isolation: COULD NOT RESTORE $NEXT from $ASIDE" >&2
  fi
}

cleanup() {
  local code=$?
  stop "$PID_A"
  stop "$PID_B"
  restore_next
  release_run_tree "$TREE"
  exit "$code"
}
trap cleanup EXIT INT TERM

[ -f "$NEXT/standalone/server.js" ] || err "no standalone build — run 'npm run build' first"
[ -e "$ASIDE" ] && err "$ASIDE already exists — a previous run died mid-move; restore it by hand"

free_port() {
  local c
  for c in $(seq "$1" "$2"); do
    if [ "$(ss -lntH "sport = :$c" 2>/dev/null | wc -l)" -eq 0 ]; then printf '%s\n' "$c"; return 0; fi
  done
  return 1
}

start_server() {  # start_server <tree> <port> -> prints pid
  local tree="$1" port="$2"
  DB_PATH="$REPO/data/mapsofbharat.db" \
  CORRECTIONS_DB_PATH="/tmp/mob-isolation-$$-$port.db" \
  NODE_ENV=production \
  PORT="$port" HOSTNAME="127.0.0.1" \
    node "$tree/server.js" >"/tmp/mob-isolation-$$-$port.log" 2>&1 &
  printf '%s\n' "$!"
}

await_health() {  # await_health <pid> <port>
  local pid="$1" port="$2"
  for _ in $(seq 1 60); do
    kill -0 "$pid" 2>/dev/null || return 1
    curl -sf "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

# The chunk URL is read out of the page the server just rendered, so the asset under
# test is one this build actually references — not a path guessed from a manifest.
#
# `awk NR==1` and not `head -1`: head exits on its first line, the writer upstream
# takes SIGPIPE, and under `pipefail` that becomes a non-zero status for a pipeline
# that did exactly what was asked of it (#609). awk reads to EOF.
first_chunk() {  # first_chunk <port>
  curl -sf "http://127.0.0.1:$1/" 2>/dev/null \
    | grep -o '/_next/static/[^"'"'"']*\.js' \
    | awk 'NR==1'
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null; }

# ── PART A — the staged tree survives ────────────────────────────────────────
log "PART A — an instance staged under .next-runs/"
TREE="$(stage_run_tree isolation-check)" || err "staging failed; nothing was tested"
log "  staged at ${TREE#"$REPO"/}"

PORT_A="$(free_port 8760 8779)" || err "no free port in 8760-8779"
PID_A="$(start_server "$TREE" "$PORT_A")"
await_health "$PID_A" "$PORT_A" || err "the staged instance never became healthy; nothing was tested"

CHUNK_A="$(first_chunk "$PORT_A")"
[ -n "$CHUNK_A" ] || err "could not find a /_next/static chunk in the rendered page"
log "  healthy on :$PORT_A, testing against $CHUNK_A"

[ "$(http_code "http://127.0.0.1:$PORT_A$CHUNK_A")" = "200" ] \
  || err "the chunk did not serve BEFORE .next was moved; nothing was tested"

lock_next
mv "$NEXT" "$ASIDE" || err "could not move .next aside"
log "  .next moved aside — this is the moment a concurrent build creates"

code_health="$(http_code "http://127.0.0.1:$PORT_A/api/health")"
code_home="$(http_code "http://127.0.0.1:$PORT_A/")"
code_chunk="$(http_code "http://127.0.0.1:$PORT_A$CHUNK_A")"

[ "$code_health" = "200" ] || fail "A: /api/health returned $code_health after .next went away"
[ "$code_home"   = "200" ] || fail "A: / returned $code_home after .next went away"
[ "$code_chunk"  = "200" ] || fail "A: $CHUNK_A returned $code_chunk after .next went away"
[ "$FAILED" -eq 0 ] && log "  PASS — health $code_health, page $code_home, chunk $code_chunk"

restore_next
unlock_next
stop "$PID_A"; PID_A=""

# ── PART B — the control: in-place must break ────────────────────────────────
log "PART B — the control: an instance serving out of .next/standalone"

# Reproduce the old arrangement exactly: the Dockerfile and both harnesses copied
# .next/static into the standalone tree and served from there.
mkdir -p "$NEXT/standalone/.next"
rm -rf "$NEXT/standalone/.next/static"
cp -al "$NEXT/static" "$NEXT/standalone/.next/static" 2>/dev/null \
  || cp -a "$NEXT/static" "$NEXT/standalone/.next/static" \
  || err "could not stage static into the standalone tree for the control"

PORT_B="$(free_port 8780 8799)" || err "no free port in 8780-8799"
PID_B="$(start_server "$NEXT/standalone" "$PORT_B")"
await_health "$PID_B" "$PORT_B" || err "the in-place control never became healthy; the control did not run"

CHUNK_B="$(first_chunk "$PORT_B")"
[ -n "$CHUNK_B" ] || err "the control rendered no chunk reference; the control did not run"
[ "$(http_code "http://127.0.0.1:$PORT_B$CHUNK_B")" = "200" ] \
  || err "the control's chunk did not serve before the move; the control did not run"

lock_next
mv "$NEXT" "$ASIDE" || err "could not move .next aside for the control"
ctrl_chunk="$(http_code "http://127.0.0.1:$PORT_B$CHUNK_B")"
restore_next
unlock_next
stop "$PID_B"; PID_B=""

if [ "$ctrl_chunk" = "200" ]; then
  err "the control SURVIVED (chunk $ctrl_chunk). Serving in place is supposed to break here.
  Part A's pass therefore proves nothing — this script is no longer measuring #607.
  Fix the control before trusting the guard."
fi
log "  control broke as required — chunk $ctrl_chunk"

if [ "$FAILED" -ne 0 ]; then
  echo "check-build-isolation: FAILED" >&2
  exit 1
fi
echo "check-build-isolation: PASS — staged instance survived, in-place control did not"
