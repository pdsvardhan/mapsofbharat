#!/usr/bin/env bash
# Cron wrapper: re-validate the canonical store and notify on drift (#50).
#
# Cron example (daily 04:00):
#   0 4 * * * /mnt/storage/websites/mapsofbharat/scripts/validate-and-notify.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NOTIFY_URL="${NOTIFY_URL:-http://localhost:8601/api/log}"

OUT="$(cd "$ROOT" && python3 pipeline/validate_drift.py 2>&1)"
CODE=$?

if [[ $CODE -ne 0 ]]; then
  echo "$OUT" >&2
  # Best-effort notification into the self-hosted error sink.
  curl -fsS -X POST "$NOTIFY_URL" \
    -H 'content-type: application/json' \
    -d "$(printf '{"level":"error","message":"data-drift validation failed","stack":%s}' \
            "$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
    >/dev/null 2>&1 || true
  exit "$CODE"
fi

echo "$OUT"
