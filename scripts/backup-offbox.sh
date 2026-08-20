#!/usr/bin/env bash
# Nightly OFF-BOX backup of everything this project cannot rebuild (405-A).
#
#   scripts/backup-offbox.sh              # snapshot, verify, push, apply retention
#   scripts/backup-offbox.sh --local-only # snapshot + verify, skip the push (drills)
#   scripts/backup-offbox.sh --no-raw     # skip the 825MB raw tree (fast path)
#
#   MOB_BACKUP_REMOTE   rclone target, e.g. "b2:vault7a-mob" or "drive:backups/mob".
#                       REQUIRED unless --local-only. There is no default: a backup
#                       that silently stays on the box is worse than none, because
#                       you believe you are covered.
#
# WHY THIS EXISTS, and why "we already have backup-db.sh" is not an answer.
# scripts/backup-db.sh writes to data/backups — the same disk, the same machine, the
# same filesystem as the thing it protects. So does every other backup on this host:
# backup-appdata.sh, stateofus-backup.sh, ingest-backup.sh and cointrail-backup.sh all
# land in /mnt/storage/backups, which is /dev/sda1, which is where the data is. That
# covers exactly one failure mode — "I deleted a row" — and none of the ones that lose
# the project: a failed array, a stolen or bricked box, a fire, ransomware, or an
# `rm -rf` with a wrong variable.
#
# WHAT IS ACTUALLY IRREPLACEABLE, which is not what you would guess.
#   1. pipeline/raw-new + pipeline/raw (~825MB) — UNTRACKED by git, and the sources are
#      government portals that rot, move behind logins, or bot-wall (RBI, ECI, UDISE,
#      CPCB have all done at least one of those to this project). Several files here
#      cannot be re-downloaded at all today. This is the crown jewel.
#   2. data-rw/corrections.db — reader error reports. Genuinely unique; nobody will
#      send them again.
#   3. data/mapsofbharat.db — regenerable from (1) via the pipeline, but that is hours
#      of work, so it is worth a snapshot.
# Note the ordering: the DB that looks like "the data" is the LEAST irreplaceable
# thing here, and the untracked directory nobody thinks about is the most.
#
# EVERY SNAPSHOT IS VERIFIED BEFORE IT COUNTS. An unverified backup is a belief, not a
# backup — and SQLite in WAL mode will happily hand you a torn copy if you just `cp`
# it, which is how a backup that restores to a corrupt database gets made every night
# for a year without anyone noticing. So the DBs are snapshotted through the SQLite
# backup API (WAL-aware, safe against a live writer), then reopened and asked
# PRAGMA integrity_check, then row-counted against the source.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

LOCAL_ONLY=0
WITH_RAW=1
for arg in "$@"; do
  case "$arg" in
    --local-only) LOCAL_ONLY=1 ;;
    --no-raw)     WITH_RAW=0 ;;
    *) echo "backup-offbox: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

STAGE="${MOB_BACKUP_STAGE:-/mnt/storage/backups/mapsofbharat}"
REMOTE="${MOB_BACKUP_REMOTE:-}"
DAILY_KEEP=7
WEEKLY_KEEP=4
STAMP="$(date +%F)"
DOW="$(date +%u)"   # 1=Mon .. 7=Sun

log() { echo "[$(date -Iseconds)] $*"; }
fail() { echo "[$(date -Iseconds)] ERROR: $*" >&2; exit 1; }

if [ "$LOCAL_ONLY" -eq 0 ] && [ -z "$REMOTE" ]; then
  cat >&2 <<'MSG'
backup-offbox: MOB_BACKUP_REMOTE is not set, so this would produce a same-box copy
  and report success — the precise failure this script exists to prevent.

  One-time setup (interactive, needs your cloud credentials):
      rclone config                      # create a remote, e.g. named "mobbackup"
      rclone lsd mobbackup:              # confirm it works
  Then either export MOB_BACKUP_REMOTE=mobbackup:mapsofbharat in the cron entry,
  or re-run with --local-only if you are deliberately exercising a drill.
MSG
  exit 3
fi

mkdir -p "$STAGE/daily" "$STAGE/weekly" || fail "cannot create $STAGE"
OUT="$STAGE/daily/$STAMP"
rm -rf "$OUT"; mkdir -p "$OUT" || fail "cannot create $OUT"

# ── SQLite snapshots, WAL-safe, then verified ────────────────────────────────
snapshot_db() {
  local src="$1" dst="$2" label="$3"
  [ -f "$src" ] || { log "skip $label — not present at $src"; return 0; }
  python3 - "$src" "$dst" <<'PY' || fail "$label: snapshot failed"
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
d = sqlite3.connect(dst)
with d:
    s.backup(d)
d.close(); s.close()
PY

  # Verify the COPY, not the original. Reopen it as a stranger would.
  local verdict
  verdict="$(sqlite3 "$dst" 'PRAGMA integrity_check;' 2>&1 | head -1)"
  [ "$verdict" = "ok" ] || fail "$label: snapshot failed integrity_check ($verdict)"

  # Row-count parity on every table, so a snapshot that is structurally valid but
  # empty — the shape a silent failure usually takes — is still caught.
  local mismatch=0
  while read -r tbl; do
    local a b
    a="$(sqlite3 "$src" "SELECT COUNT(*) FROM \"$tbl\";" 2>/dev/null)"
    b="$(sqlite3 "$dst" "SELECT COUNT(*) FROM \"$tbl\";" 2>/dev/null)"
    if [ "$a" != "$b" ]; then
      log "  $label: table $tbl source=$a snapshot=$b"
      mismatch=1
    fi
  done < <(sqlite3 "$src" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
  [ "$mismatch" -eq 0 ] || fail "$label: row counts differ between source and snapshot"

  gzip -f "$dst"
  log "  $label ok — $(du -h "$dst.gz" | cut -f1)"
}

log "backup-offbox: staging $OUT"
snapshot_db "$REPO/data/mapsofbharat.db"   "$OUT/mapsofbharat.db"  "canonical atlas DB"
snapshot_db "$REPO/data-rw/corrections.db" "$OUT/corrections.db"   "reader corrections DB"

# ── The raw tree ─────────────────────────────────────────────────────────────
if [ "$WITH_RAW" -eq 1 ]; then
  if [ -d "$REPO/pipeline/raw-new" ] || [ -d "$REPO/pipeline/raw" ]; then
    log "  raw tree: archiving (this is the slow part)"
    tar czf "$OUT/pipeline-raw.tar.gz" -C "$REPO" \
      $( [ -d "$REPO/pipeline/raw-new" ] && echo pipeline/raw-new ) \
      $( [ -d "$REPO/pipeline/raw" ] && echo pipeline/raw ) 2>/dev/null \
      || fail "raw tree: tar failed"
    # Verify the archive is readable and non-trivial, rather than trusting tar's exit.
    local_count="$(tar tzf "$OUT/pipeline-raw.tar.gz" 2>/dev/null | wc -l)"
    [ "$local_count" -gt 100 ] || fail "raw tree: archive lists only $local_count entries — refusing to call that a backup"
    log "  raw tree ok — $(du -h "$OUT/pipeline-raw.tar.gz" | cut -f1), $local_count entries"
  else
    log "  raw tree: neither pipeline/raw-new nor pipeline/raw exists — skipping"
  fi
fi

# A manifest, so a restorer can tell what they are holding without unpacking it.
{
  echo "created_at: $(date -Iseconds)"
  echo "host: $(hostname)"
  echo "repo_commit: $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "repo_dirty: $(git -C "$REPO" diff --quiet 2>/dev/null && echo no || echo yes)"
  echo "files:"
  ( cd "$OUT" && for f in *; do echo "  - $f ($(du -h "$f" | cut -f1), sha256 $(sha256sum "$f" | cut -c1-16))"; done )
} > "$OUT/MANIFEST.txt"
log "  manifest written"

# ── Weekly promotion ─────────────────────────────────────────────────────────
if [ "$DOW" = "7" ]; then
  rm -rf "$STAGE/weekly/$STAMP"
  cp -a "$OUT" "$STAGE/weekly/$STAMP" && log "  promoted to weekly"
fi

# ── Push off the box ─────────────────────────────────────────────────────────
if [ "$LOCAL_ONLY" -eq 1 ]; then
  log "backup-offbox: --local-only, NOT pushed off the box (this is not a backup yet)"
else
  command -v rclone >/dev/null 2>&1 || fail "rclone not installed"
  log "backup-offbox: pushing to $REMOTE"
  rclone sync "$STAGE/daily"  "$REMOTE/daily"  --transfers 2 --retries 3 \
    || fail "rclone sync of daily failed — the copy is STILL only on this box"
  rclone sync "$STAGE/weekly" "$REMOTE/weekly" --transfers 2 --retries 3 \
    || fail "rclone sync of weekly failed"

  # Confirm the remote actually holds tonight's set, rather than trusting exit 0.
  remote_files="$(rclone lsf "$REMOTE/daily/$STAMP" 2>/dev/null | wc -l)"
  local_files="$(ls -1 "$OUT" | wc -l)"
  [ "$remote_files" -eq "$local_files" ] \
    || fail "remote holds $remote_files of $local_files files for $STAMP — treat tonight as FAILED"
  log "  verified $remote_files files present on the remote"
fi

# ── Retention, applied last so a failed run never deletes the previous good one ──
ls -1d "$STAGE"/daily/*/  2>/dev/null | sort | head -n -"$DAILY_KEEP"  | xargs -r rm -rf
ls -1d "$STAGE"/weekly/*/ 2>/dev/null | sort | head -n -"$WEEKLY_KEEP" | xargs -r rm -rf
log "backup-offbox: retention applied ($DAILY_KEEP daily, $WEEKLY_KEEP weekly)"

if [ "$LOCAL_ONLY" -eq 0 ]; then
  rclone sync "$STAGE/daily"  "$REMOTE/daily"  --transfers 2 >/dev/null 2>&1
  rclone sync "$STAGE/weekly" "$REMOTE/weekly" --transfers 2 >/dev/null 2>&1
fi
log "backup-offbox: done"
