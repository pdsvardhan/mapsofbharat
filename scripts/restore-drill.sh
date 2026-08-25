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
#
# FETCHED TO A FILE, THEN GREPPED, and the two-step is the whole point.
# `curl -sf ... | grep -qi` reads as equivalent and is not: `grep -q` exits the
# instant it matches, curl loses its writer, dies with exit 23, and
# `set -o pipefail` promotes that to the pipeline's status. So the check FAILS
# precisely when the page is big enough that grep matches before curl finishes —
# i.e. it gets less reliable as the page gets healthier.
#
# It was harmless while `/` was a prerendered page and became deterministic when
# iter-43 (#580) made `/` dynamic: 3 of 3 clean runs failed with "the home page did
# not render from restored data" while the page rendered perfectly at 200.
#
# THE MECHANISM IS THE ENCODING, NOT THE SIZE, and the distinction matters to
# anyone tuning this later. A dynamic route is `Transfer-Encoding: chunked` with no
# Content-Length, so its writes are spread over time and land after `grep -q` has
# already exited; a prerendered page arrives in one burst that fits the pipe
# buffer. Measured back to back on the same construct: the chunked 17.3KB page
# gave exit 23 three times out of three, while a 13.6KB Content-Length page gave
# exit 0 three times out of three. 3.7KB does not explain a deterministic flip —
# streaming does. The fixed form handles a 131KB JSON body without trouble.
#
# Worse than a false red: this check sits BEFORE the raw-mirror verification
# below, so the drill aborted here and the mirror guard never ran at all.
page_html="$WORK/home.html"
curl -sf "http://127.0.0.1:$PORT/" -o "$page_html"   || fail "the home page did not respond from restored data"
grep -qi "<html" "$page_html"   || fail "the home page responded but rendered no HTML from restored data"
log "home page renders"

# -- 4. the raw tree, the asset git does not carry --------------------------
#
# Restored from the MIRROR rather than an archive. The mirror is current-state by
# design (see backup-offbox.sh), so the check is that it holds what the live tree
# holds -- not that it matches a snapshot taken at some past moment.
MIRROR="$( [ "$FROM_REMOTE" -eq 1 ] && echo "$REMOTE/raw-current" || echo "$STAGE/raw-current" )"
declared=0
[ -f "$SNAP/raw-file-count.txt" ] && declared="$(cat "$SNAP/raw-file-count.txt")"

if [ "$FROM_REMOTE" -eq 1 ]; then
  mirrored="$(rclone size "$MIRROR" --json 2>/dev/null | sed -n "s/.*[\"]count[\"]:\([0-9]*\).*/\1/p")"
else
  mirrored="$(find "$MIRROR" -type f 2>/dev/null | wc -l)"
fi

# FAIL CLOSED (#574, iter-43). The sed above had a literal 0x01 (SOH) control
# byte in place of the two characters backslash and 1 — the same escaping
# accident as scripts/backup-offbox.sh, fixed there and missed here, which is
# why the sweep matters more than the individual fix. Only `cat -A` renders it
# (as ^A); cat, grep and every editor show nothing.
#
# The consequence was specific and bad: on the --from-remote path `$mirrored`
# was ALWAYS that one unprintable byte, so `-z` was false and `= "0"` was false
# and this guard could never fire. A remote mirror that had lost 800 of its 905
# files would have been reported as a PASSED restore drill. The single-file
# probe below still caught a TOTALLY empty mirror, which is the only reason this
# was survivable; partial loss was undetectable.
#
# A non-numeric answer now FAILS rather than falling through. A drill that could
# not take its own measurement has not verified a backup, and saying so is the
# entire job of this script.
case "$mirrored" in
  ''|*[!0-9]*)
    fail "could not read the raw mirror file count at $MIRROR (got '$mirrored') - the mirror check did NOT run, treat this drill as FAILED" ;;
esac
if [ "$mirrored" = "0" ]; then
  fail "the raw mirror at $MIRROR is empty - the one asset git cannot rebuild is NOT backed up"
fi
# A count far below what the snapshot recorded is the partial-loss case the old
# guard could never see. Same 90% floor backup-offbox.sh uses.
# The asymmetry with $mirrored above is deliberate, and is stated rather than
# left to be rediscovered: an unreadable $mirrored means the check could not run
# and must fail, whereas an unreadable $declared means there is no BASELINE to
# compare against — a snapshot taken before raw-file-count.txt existed, say. That
# is a real and harmless case, so it proceeds. But it still SKIPS a check, and a
# silent skip is indistinguishable from a pass, so it says so out loud.
# `0` belongs in the SKIP branch, not the compare branch. $declared is
# pre-initialised to 0 above and only overwritten if raw-file-count.txt exists, so
# an ABSENT file — the exact case this comment names, and what
# `backup-offbox.sh --no-raw` produces — arrives here as a perfectly numeric 0.
# The first version of this guard sent it to the `*)` branch, where
# `[ "$declared" -gt 0 ]` skipped the check without saying so: the silent skip
# survived inside the very branch written to abolish it. With 0 handled here the
# `-gt 0` test is redundant and is gone.
case "$declared" in
  ''|0|*[!0-9]*)
    log "  NOTE: snapshot recorded no usable raw file count ('$declared') - partial-loss check SKIPPED, not passed" ;;
  *) if [ "$mirrored" -lt "$(( declared * 9 / 10 ))" ]; then
       fail "the raw mirror holds $mirrored files but the snapshot recorded $declared - treat this drill as FAILED"
     fi ;;
esac
log "raw mirror holds $mirrored files (backup recorded $declared at snapshot time)"

# Actually restore a file and read it, rather than trusting a count. A mirror of
# 903 zero-byte files would satisfy any count check.
if [ "$FROM_REMOTE" -eq 1 ]; then
  mkdir -p "$WORK/rawprobe"
  probe="$(rclone lsf "$MIRROR/pipeline/raw" --files-only 2>/dev/null | head -1)"
  [ -n "$probe" ] || fail "no files listed under the remote raw mirror"
  rclone copy "$MIRROR/pipeline/raw/$probe" "$WORK/rawprobe" 2>/dev/null \
    || fail "could not restore $probe from the remote mirror"
  sz="$(stat -c%s "$WORK/rawprobe/$probe" 2>/dev/null || echo 0)"
else
  probe="$(find "$MIRROR" -type f -size +1k | head -1)"
  [ -n "$probe" ] || fail "no non-trivial file found in the local raw mirror"
  sz="$(stat -c%s "$probe" 2>/dev/null || echo 0)"
fi
[ "$sz" -gt 1024 ] || fail "the restored raw probe is $sz bytes - a mirror of empty files is not a backup"
log "restored a raw source file and read it back ($sz bytes)"
ELAPSED=$(( $(date +%s) - START ))
echo
echo "──────────────────────────────────────────────────────────────"
echo " RESTORE DRILL PASSED"
echo "   snapshot        $SNAP"
echo "   source          $( [ "$FROM_REMOTE" -eq 1 ] && echo "off-box remote ($REMOTE)" || echo "local stage" )"
echo "   metrics served  $RESTORED_N$( [ -n "$PROD_N" ] && echo " (matches production)" )"
echo "   elapsed         ${ELAPSED}s"
echo "──────────────────────────────────────────────────────────────"
