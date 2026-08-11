#!/usr/bin/env bash
# CI gate (to-do 245, iter-98 item 668): every adr-NNN token in the repo must
# resolve to a decision id in ottomate/decisions/index.yaml. Added after
# adr-020 was cited 6x before its decision existed, and adr-019 was accepted
# but never implemented — dangling ADR tokens are how those slip through.
#
# Second gate (2026-08-11): every body_path in the index must point at a file
# that exists. The id check above passes happily while body_path rots, which is
# how DECISIONS.md reached 25 dead links — 16 bodies renamed to dated filenames
# without the index following, and 9 that were never written at all.
set -euo pipefail
cd "$(dirname "$0")/.."

index=ottomate/decisions/index.yaml
[ -f "$index" ] || { echo "check-adr-refs: $index missing"; exit 1; }

fail=0

# 1. every adr-NNN token in the repo resolves to an id in the index
valid=$(grep -oE 'id: adr-[0-9]{3}' "$index" | grep -oE '[0-9]{3}' | sort -u)
refs=$(git grep -hoE 'adr-[0-9]{3}' -- ':!ottomate/decisions' ':!scripts/check-adr-refs.sh' | grep -oE '[0-9]{3}' | sort -u)

missing=""
for n in $refs; do
  echo "$valid" | grep -qx "$n" || missing="$missing adr-$n"
done

if [ -n "$missing" ]; then
  echo "Unresolved ADR references:$missing"
  echo "Every adr-NNN token must have a decision body listed in $index."
  fail=1
else
  echo "adr-refs OK: $(echo "$refs" | wc -l) distinct ids referenced, all resolve"
fi

# 2. every body_path in the index points at a file that exists. body_path is
# the last field of each entry, so carry the id down to name the offender.
dangling=$(awk '
  /^[[:space:]]*-[[:space:]]*id:[[:space:]]*/ {
    id = $0; sub(/^[[:space:]]*-[[:space:]]*id:[[:space:]]*/, "", id); next
  }
  /^[[:space:]]*body_path:[[:space:]]*/ {
    p = $0; sub(/^[[:space:]]*body_path:[[:space:]]*/, "", p); print id "\t" p
  }
' "$index" | while IFS=$'\t' read -r id path; do
  [ -f "$path" ] || printf '  %s -> %s\n' "$id" "$path"
done)

if [ -n "$dangling" ]; then
  echo "Decisions whose body_path does not exist:"
  echo "$dangling"
  echo "Repoint body_path in $index, or write the body. A rotted body_path is invisible to check 1."
  fail=1
else
  echo "body-paths OK: $(grep -cE '^[[:space:]]*body_path:' "$index") entries, all resolve to files"
fi

exit $fail
