#!/usr/bin/env bash
# Actually perform a restore, end to end, and time it (405-A).
#
#   scripts/restore-drill.sh                    # newest daily snapshot
#   scripts/restore-drill.sh 2026-08-20         # a specific one
#   scripts/restore-drill.sh --from-remote      # pull from the off-box copy first
#
# WHY THIS IS A SCRIPT AND NOT A CHECKLIST. "We have backups" is a claim about a
# script that ran; "we can restore" is a claim about an outcome nobody has observed.
# The gap between them is where backup programmes die — the tar is fine, and the one
# file the app needs at runtime was never in it. The 405-A wording is deliberate:
# done when the drill has been PERFORMED, not when the script exists. So this stands
# the real application up against restored bytes and asks it questions.
#
# WHAT IT PROVES, in order of how likely each is to be the thing that is broken:
#   1. The snapshot opens and passes integrity_check.
#   2. The app SERVES from it — a Next instance pointed at the restored file.
#   3. The catalogue matches production: same metric count, same ids, not merely
#      "a database exists". A restored DB that serves 0 metrics passes every check
#      that only asks whether the file is valid SQLite.
#   4. The raw archive unpacks and holds the files the /raw download route needs —
#      the asset git does not have (#498).
#   5. How long all of that took, because a recovery time nobody has measured is
#      not a recovery time.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

STAGE="${MOB_BACKUP_STAGE:-/mnt/storage/backups/mapsofbharat}"
REMOTE="${MOB_BACKUP_REMOTE:-}"
PROD_URL="${PROD_URL:-http://127.0.0.1:8610}"

FROM_REMOTE=0
WHICH=""
for arg in "$@"; do
  case "$arg" in
    --from-remote) FROM_REMOTE=1 ;;
    *) WHICH="$arg" ;;
  esac
done

START=$(date +%s)
log() { echo "[$(( $(date +%s) - START ))s] $*"; }
fail() { echo "RESTORE DRILL FAILED: $*" >&2; exit 1; }

WORK="$(mktemp -d /tmp/mob-restore-drill.XXXXXX)"
SERVER_PID=""
cleanup() {
  local code=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT INT TERM

if [ "$FROM_REMOTE" -eq 1 ]; then
  [ -n "$REMOTE" ] || fail "--from-remote needs MOB_BACKUP_REMOTE"
  log "pulling from $REMOTE (this is the path that matters — the box is assumed gone)"
  mkdir -p "$WORK/pulled"
  rclone copy "$REMOTE/daily" "$WORK/pulled" --transfers 2 || fail "rclone pull failed"
  SRC_ROOT="$WORK/pulled"
else
  SRC_ROOT="$STAGE/daily"
fi

if [ -n "$WHICH" ]; then
  SNAP="$SRC_ROOT/$WHICH"
else
  SNAP="$(ls -1d "$SRC_ROOT"/*/ 2>/dev/null | sort | tail -1)"
fi
[ -n "$SNAP" ] && [ -d "$SNAP" ] || fail "no snapshot found under $SRC_ROOT"
SNAP="${SNAP%/}"
log "restoring from $SNAP"
[ -f "$SNAP/MANIFEST.txt" ] && sed 's/^/    /' "$SNAP/MANIFEST.txt"

# ── 1. the canonical DB opens and is intact ──────────────────────────────────
[ -f "$SNAP/mapsofbharat.db.gz" ] || fail "snapshot has no mapsofbharat.db.gz"
gunzip -c "$SNAP/mapsofbharat.db.gz" > "$WORK/mapsofbharat.db" || fail "gunzip failed"
verdict="$(sqlite3 "$WORK/mapsofbharat.db" 'PRAGMA integrity_check;' 2>&1 | head -1)"
[ "$verdict" = "ok" ] || fail "restored DB fails integrity_check: $verdict"
R_METRICS="$(sqlite3 "$WORK/mapsofbharat.db" 'SELECT COUNT(*) FROM metrics;')"
R_VALUES="$(sqlite3 "$WORK/mapsofbharat.db" 'SELECT COUNT(*) FROM metric_values;')"
log "restored DB intact — $R_METRICS metrics, $R_VALUES values"
[ "$R_METRICS" -gt 0 ] || fail "restored DB has zero metrics"

# ── 2 + 3. the app serves from it, and the catalogue matches production ──────
[ -d "$REPO/.next" ] || fail "no .next build — run 'npm run build' before drilling"

# Serve the STANDALONE build, as production does. `next start` is unsupported with
# output:"standalone" and comes up without a client bundle — a drill run that way
# would report a healthy restore from a server no user could actually use.
STANDALONE="$REPO/.next/standalone"
[ -f "$STANDALONE/server.js" ] || fail "$STANDALONE/server.js missing — rebuild"
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -a "$REPO/.next/static" "$STANDALONE/.next/static" || fail "could not stage .next/static"
[ -d "$STANDALONE/public" ] || cp -a "$REPO/public" "$STANDALONE/public"

PORT=""
for c in $(seq 8700 8760); do
  if ! ss -lntH "sport = :$c" 2>/dev/null | grep -q .; then PORT="$c"; break; fi
done
[ -n "$PORT" ] || fail "no free port"

log "standing the app up against the restored DB on :$PORT"
DB_PATH="$WORK/mapsofbharat.db" \
CORRECTIONS_DB_PATH="$WORK/corrections-restored.db" \
LOG_PATH="$WORK/app.log" \
NODE_ENV=production \
PORT="$PORT" HOSTNAME="127.0.0.1" \
  node "$STANDALONE/server.js" > "$WORK/server.log" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  kill -0 "$SERVER_PID" 2>/dev/null || { tail -20 "$WORK/server.log" >&2; fail "server exited during startup"; }
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && { ready=1; break; }
  sleep 0.5
done
[ "$ready" -eq 1 ] || { tail -20 "$WORK/server.log" >&2; fail "restored instance never became healthy"; }
log "restored instance is serving"

count_metrics() { curl -sf "$1/api/metrics" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["metrics"]))' 2>/dev/null; }
ids() { curl -sf "$1/api/metrics" | python3 -c 'import json,sys; print(",".join(sorted(m["id"] for m in json.load(sys.stdin)["metrics"])))' 2>/dev/null; }

RESTORED_N="$(count_metrics "http://127.0.0.1:$PORT")"
[ -n "$RESTORED_N" ] || fail "restored instance did not answer /api/metrics"
log "restored instance serves $RESTORED_N metrics"

PROD_N="$(count_metrics "$PROD_URL")"
if [ -n "$PROD_N" ]; then
  if [ "$RESTORED_N" != "$PROD_N" ]; then
    fail "catalogue mismatch — restored $RESTORED_N vs production $PROD_N"
  fi
  if [ "$(ids "http://127.0.0.1:$PORT")" != "$(ids "$PROD_URL")" ]; then
    fail "same metric COUNT but different metric IDS — the snapshot is not this catalogue"
  fi
  log "catalogue matches production exactly ($PROD_N metrics, identical ids)"
else
  log "WARNING: production at $PROD_URL not reachable; compared against the snapshot only"
fi

# A page, not just an API — the thing a human would look at.
curl -sf "http://127.0.0.1:$PORT/" | grep -qi "<html" || fail "the home page did not render from restored data"
log "home page renders"

# ── 4. the raw tree, the asset git does not carry ────────────────────────────
if [ -f "$SNAP/pipeline-raw.tar.gz" ]; then
  n="$(tar tzf "$SNAP/pipeline-raw.tar.gz" | wc -l)"
  [ "$n" -gt 100 ] || fail "raw archive lists only $n entries"
  mkdir -p "$WORK/raw" && tar xzf "$SNAP/pipeline-raw.tar.gz" -C "$WORK/raw" || fail "raw archive failed to extract"
  live="$(find "$REPO/pipeline/raw-new" -type f 2>/dev/null | wc -l)"
  back="$(find "$WORK/raw/pipeline/raw-new" -type f 2>/dev/null | wc -l)"
  log "raw tree restored — $n archived entries, raw-new: live $live vs restored $back"
  [ "$back" -ge "$live" ] || echo "  NOTE: restored raw-new has fewer files than live; the snapshot predates recent additions" >&2
else
  log "WARNING: this snapshot carries no raw tree (taken with --no-raw?)"
fi

ELAPSED=$(( $(date +%s) - START ))
echo
echo "──────────────────────────────────────────────────────────────"
echo " RESTORE DRILL PASSED"
echo "   snapshot        $SNAP"
echo "   source          $( [ "$FROM_REMOTE" -eq 1 ] && echo "off-box remote ($REMOTE)" || echo "local stage" )"
echo "   metrics served  $RESTORED_N$( [ -n "$PROD_N" ] && echo " (matches production)" )"
echo "   elapsed         ${ELAPSED}s"
echo "──────────────────────────────────────────────────────────────"
