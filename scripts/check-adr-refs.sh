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
# NOTE: git grep only sees TRACKED files — an untracked scratch file will not
# trip this check. Worth knowing before concluding the gate is broken.
refs=$(git grep -hoE 'adr-[0-9]{3}' -- ':!ottomate/decisions' ':!scripts/check-adr-refs.sh' | grep -oE '[0-9]{3}' | sort -u)

missing=""
for n in $refs; do
  # A here-string, not a pipe (#609): `echo "$valid" | grep -qx` dies on SIGPIPE
  # when the match is early in the list, and pipefail turns that into "not found" —
  # so a valid ADR gets reported as unresolved and the gate goes red for nothing.
  # -F as well as -x: these are literal ids, and `.` in a regex matches anything.
  grep -qxF -- "$n" <<<"$valid" || missing="$missing adr-$n"
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
#
# COUNTED BEFORE IT IS JUDGED, AND THE COUNT IS PART OF THE VERDICT (iter-46 item
# 1076). The OK branch used to read
#
#     echo "body-paths OK: $(grep -cE '…body_path:' "$index") entries, all resolve"
#
# and the number was computed inside a command substitution in the echo, where a
# failing grep cannot trip `set -e` because the shell only ever sees echo's status.
# So with zero body_path lines in the index, $dangling is the empty string, the OK
# branch is taken, and this gate — the FIRST step of the CI quality job — printed
#
#     body-paths OK: 0 entries, all resolve to files
#
# and exited 0 having measured nothing. Proven on a scratch index carrying an id and
# no body_path at all. That is the shape iter-43 found four times over in this repo's
# own guards: a check whose measurement had degraded to a no-op while it went on
# reporting success, indistinguishable from a real pass unless the count is asserted.
#
# The id count is compared too, and not merely the zero case. The awk below carries
# an id DOWN to the body_path line that follows it, so an entry with an id and no
# body_path emits nothing and is silently untested — the partial version of the same
# hole. Today the index declares 39 decisions and 39 body_paths.
body_paths=$(grep -cE '^[[:space:]]*body_path:' "$index") || body_paths=0
declared=$(grep -cE '^[[:space:]]*-[[:space:]]*id:' "$index") || declared=0

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
elif [ "$body_paths" -eq 0 ]; then
  echo "check-adr-refs: $index declares $declared decision(s) and NOT ONE body_path."
  echo "The body_path check did not pass — it had nothing to walk. Treat this as FAILED."
  fail=1
elif [ "$body_paths" -ne "$declared" ]; then
  echo "check-adr-refs: $index declares $declared decision(s) but carries $body_paths body_path line(s)."
  echo "An id with no body_path of its own is never tested — the awk pairs each id with"
  echo "the body_path that follows it, so an entry without one emits nothing at all."
  echo "Give every decision a body_path, or this gate is checking $body_paths of $declared."
  fail=1
else
  echo "body-paths OK: $body_paths entries, one per declared decision, all resolve to files"
fi

exit $fail
