#!/usr/bin/env bash
# Serialise builds behind one lock (#607).
#
# `next build` wipes .next before it writes anything. Two builds at once therefore
# do not merely race for the last word — the second one deletes the tree the first
# is still emitting into, and what survives is a mixture that belongs to neither.
# The visible symptom is a chunk that 404s at runtime from a build that reported
# success.
#
# The same lock is what scripts/lib/stage-run-tree.sh takes in SHARED mode while it
# copies a run tree out. Readers do not block each other; a build waits for them.
#
# It is `npm run build` that is wrapped, so nothing has to remember to use this.
# Uncontended, the cost is one open() and one flock() — call it a millisecond.
#
#   scripts/with-build-lock.sh next build --turbopack
#
# BUILD_LOCK_WAIT (seconds, default 1800) bounds the wait. Timing out is a failure,
# not a licence to build anyway: proceeding without the lock is precisely the thing
# this stops.
set -uo pipefail
cd "$(dirname "$0")/.."

LOCK="$PWD/.buildlock"

if ! exec 9>>"$LOCK"; then
  echo "with-build-lock: cannot open $LOCK — refusing to build unserialised." >&2
  exit 1
fi

if ! flock -x -w "${BUILD_LOCK_WAIT:-1800}" 9; then
  echo "with-build-lock: another build has held the lock for ${BUILD_LOCK_WAIT:-1800}s." >&2
  echo "  Not building. If that build is dead, its lock died with it — check for a" >&2
  echo "  wedged 'next build' rather than deleting $LOCK, which would only hide it." >&2
  exit 1
fi

# exec keeps fd 9 open in the replacing process, so the lock is held for exactly as
# long as the build runs and is released by the kernel however it ends.
exec "$@"
