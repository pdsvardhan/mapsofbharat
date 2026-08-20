#!/usr/bin/env bash
# Run the Playwright suite against a THROWAWAY server instance (to-do #481).
#
#   scripts/test-isolated.sh                          # whole suite
#   scripts/test-isolated.sh tests/corrections.spec.ts
#   scripts/test-isolated.sh --grep "dedup"
#
# WHY. `BASE_URL` defaults to http://localhost:8610, which is the PRODUCTION
# container. Any spec that writes therefore writes to production by default: on
# 2026-08-10 the corrections spec put seven real reader reports into the live store,
# and they had to be removed with `docker exec` because the file is owned by uid
# 1001. The suite had no way to know — it asked the server to store something and
# the server did.
#
# So this stands up a separate `next start` with:
#   * the canonical atlas DB mounted READ-ONLY (lib/db.ts opens it `readonly` anyway,
#     so the real data is what is under test, but it cannot be altered);
#   * a THROWAWAY corrections DB under /tmp, deleted on exit;
#   * a per-run random admin token;
#   * CORRECTIONS_SCRATCH_DB exported so the spec can verify the server's reported
#     db_path matches, and refuse to write if it does not.
#
# Production is never contacted. The port is chosen from the ephemeral range and
# checked free, so this can run while the real container is up.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

if [ ! -d .next ]; then
  echo "test-isolated: no .next build found. Run 'npm run build' first." >&2
  echo "  (Deliberately not built here — a multi-minute build hidden inside a test" >&2
  echo "   command is how you end up unsure what you just tested.)" >&2
  exit 2
fi

# Run the STANDALONE server, the way production does, not `next start`.
#
# next.config.ts sets `output: "standalone"`, and with that set `next start` is not a
# supported way to serve the build — Next prints a warning and serves something that
# is not what ships. The first version of this harness used `next start` and the
# result was quietly wrong rather than broken: pages returned HTML, the API answered
# correctly, and 200 of 214 tests passed, but the client bundle never came up, so
# every test that needed the map to actually initialise failed on a 20s timeout. Four
# spec files went red and looked like a code regression. They were not — the same
# specs passed against production throughout. A harness that is subtly wrong is worse
# than one that does not start, because it produces a plausible-looking failure list
# and sends you hunting in the wrong file.
#
# The Dockerfile is the reference: copy `.next/static` and `public` into the
# standalone tree, then `node server.js`. `public` is already traced into standalone
# by the build; `.next/static` is not, and that is exactly what was missing.
STANDALONE=".next/standalone"
[ -f "$STANDALONE/server.js" ] || { echo "test-isolated: $STANDALONE/server.js missing — rebuild." >&2; exit 2; }
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -a .next/static "$STANDALONE/.next/static" || { echo "test-isolated: could not stage .next/static" >&2; exit 2; }
[ -d "$STANDALONE/public" ] || cp -a public "$STANDALONE/public"

# A free port, verified rather than assumed.
PORT=""
for candidate in $(seq 8630 8699); do
  if ! ss -lntH "sport = :$candidate" 2>/dev/null | grep -q .; then PORT="$candidate"; break; fi
done
[ -n "$PORT" ] || { echo "test-isolated: no free port in 8630-8699" >&2; exit 3; }

STAMP="$(date +%s)-$$"
SCRATCH_DB="/tmp/mob-scratch-corrections-$STAMP.db"
SCRATCH_LOG="/tmp/mob-scratch-$STAMP.log"
TOKEN="scratch-$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"

SERVER_PID=""
cleanup() {
  local code=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    # Kill by PID. `next start` renames itself to `next-server (vX)` once serving, so
    # a pkill on the launch command misses it — and a pkill pattern containing the
    # port matches this script's own ssh command line and kills the session (#482).
    kill "$SERVER_PID" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" 2>/dev/null
  fi
  rm -f "$SCRATCH_DB" "$SCRATCH_DB-wal" "$SCRATCH_DB-shm"
  if [ "$code" -ne 0 ] && [ -f "$SCRATCH_LOG" ]; then
    echo "--- scratch server log (last 25 lines) ---" >&2
    tail -25 "$SCRATCH_LOG" >&2
  fi
  rm -f "$SCRATCH_LOG"
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "test-isolated: starting a scratch instance on :$PORT"
echo "  atlas DB      $REPO/data/mapsofbharat.db (read-only)"
echo "  corrections   $SCRATCH_DB (throwaway)"

DB_PATH="$REPO/data/mapsofbharat.db" \
CORRECTIONS_DB_PATH="$SCRATCH_DB" \
CORRECTIONS_ADMIN_TOKEN="$TOKEN" \
LOG_PATH="/tmp/mob-scratch-app-$STAMP.log" \
NODE_ENV=production \
PORT="$PORT" HOSTNAME="127.0.0.1" \
  node "$STANDALONE/server.js" >"$SCRATCH_LOG" 2>&1 &
SERVER_PID=$!

# Wait for readiness by asking the app, not by sleeping.
ready=0
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "test-isolated: the scratch server exited during startup" >&2
    exit 4
  fi
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
[ "$ready" -eq 1 ] || { echo "test-isolated: server did not become healthy in 30s" >&2; exit 4; }

# Prove the instance is the scratch one BEFORE handing it to the suite. If this is
# ever wrong, nothing has been written yet.
reported="$(curl -sf -H "authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/corrections" \
  | sed -n 's/.*"db_path":"\([^"]*\)".*/\1/p')"
if [ "$reported" != "$SCRATCH_DB" ]; then
  echo "test-isolated: the instance reports db_path='$reported', expected '$SCRATCH_DB'." >&2
  echo "  Refusing to run writing tests against it." >&2
  exit 5
fi
echo "test-isolated: verified the instance writes to the scratch store"
echo

BASE_URL="http://127.0.0.1:$PORT" \
CORRECTIONS_ADMIN_TOKEN="$TOKEN" \
CORRECTIONS_SCRATCH_DB="$SCRATCH_DB" \
  npx playwright test "$@"
