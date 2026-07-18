#!/usr/bin/env bash
# CI gate (to-do 245, iter-98 item 668): every adr-NNN token in the repo must
# resolve to a decision id in ottomate/decisions/index.yaml. Added after
# adr-020 was cited 6x before its decision existed, and adr-019 was accepted
# but never implemented — dangling ADR tokens are how those slip through.
set -euo pipefail
cd "$(dirname "$0")/.."

index=ottomate/decisions/index.yaml
[ -f "$index" ] || { echo "check-adr-refs: $index missing"; exit 1; }

valid=$(grep -oE 'id: adr-[0-9]{3}' "$index" | grep -oE '[0-9]{3}' | sort -u)
refs=$(git grep -hoE 'adr-[0-9]{3}' -- ':!ottomate/decisions' ':!scripts/check-adr-refs.sh' | grep -oE '[0-9]{3}' | sort -u)

missing=""
for n in $refs; do
  echo "$valid" | grep -qx "$n" || missing="$missing adr-$n"
done

if [ -n "$missing" ]; then
  echo "Unresolved ADR references:$missing"
  echo "Every adr-NNN token must have a decision body listed in $index."
  exit 1
fi
echo "adr-refs OK: $(echo "$refs" | wc -l) distinct ids referenced, all resolve"
