#!/usr/bin/env bash
# Snapshot the canonical SQLite store (risk no-backup / #55).
# The DB is fully regenerable from pipeline/ + raw sources, so this is a
# convenience snapshot (saves re-run time), not a critical backup.
#
# Cron example (daily 03:30, keep 14 days):
#   30 3 * * * /mnt/storage/websites/mapsofbharat/scripts/backup-db.sh >> /var/log/mob-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/data/mapsofbharat.db}"
DEST_DIR="${BACKUP_DIR:-$ROOT/data/backups}"
RETAIN="${RETAIN:-14}"

if [[ ! -f "$SRC" ]]; then
  echo "backup-db: source DB not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DEST_DIR/mapsofbharat-$STAMP.db"

# Consistent snapshot via sqlite3 .backup when available, else plain copy.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$SRC" ".backup '$DEST'"
else
  cp "$SRC" "$DEST"
fi
gzip -f "$DEST"

# Retention: keep the newest $RETAIN snapshots.
ls -1t "$DEST_DIR"/mapsofbharat-*.db.gz 2>/dev/null | tail -n +"$((RETAIN + 1))" | xargs -r rm -f

echo "backup-db: wrote $DEST.gz"
