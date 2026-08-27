# shellcheck shell=bash
# Per-run staging of the standalone build (#607). Sourced, never executed.
#
# WHY THIS EXISTS
#
# `next build` begins by wiping .next. Anything serving out of .next/standalone at
# that moment loses server.js and every chunk beneath it. The process keeps its PID
# and keeps accepting connections, so nothing announces itself as broken: the suite
# running against it simply reports a page of 20-second timeouts that read as map
# regressions. They are not regressions. They are a build that ran in another
# terminal. That false failure list has been produced more than once, and the two
# scripts that stand an instance up — scripts/test-isolated.sh and
# scripts/restore-drill.sh — both used the shared path, so both could produce it.
#
# So a run never serves out of .next. It serves out of .next-runs/<tag>-<stamp>/.
#
# WHY A HARDLINK COPY
#
# The standalone tree is 1.3 GB, because `output: "standalone"` traces node_modules
# into it. A per-run `cp -a` of that is neither instant nor free, and a harness that
# is expensive to run is a harness people skip. `cp -al` links instead of copying:
# the run tree costs directory entries and nothing else.
#
# It is also exactly the right semantics for this problem. Unlinking a name does not
# free an inode another name still holds, so `rm -rf .next` — the first thing a build
# does — takes away .next's names and leaves every byte the running instance is
# reading still on disk under ours. The instance does not notice the build at all.
#
# WHY A LOCK AS WELL
#
# The copy is not atomic. A build that wipes .next halfway through `cp -al` yields a
# tree that is present but incomplete, which is the same false-failure list wearing a
# different hat. So staging takes a SHARED lock on .buildlock and `npm run build`
# takes an EXCLUSIVE one (scripts/with-build-lock.sh). Two runs may stage at once;
# a build waits for staging to finish rather than pulling the tree out mid-copy.
#
# WHY IT NEVER FALLS BACK
#
# If staging cannot be done, this returns non-zero and the caller stops. It does not
# quietly serve out of .next instead. A fallback to the broken path would turn the
# fix into a thing that works until the day it matters — the same shape as the four
# guards found in iter-43 that reported success while their measurement had degraded
# to a no-op.
#
# USAGE
#   REPO="$PWD"
#   . scripts/lib/stage-run-tree.sh
#   TREE="$(stage_run_tree tests)" || exit 2
#   node "$TREE/server.js"
#   # in your cleanup trap:
#   release_run_tree "$TREE"

# Remove run trees left behind by a killed run. Bounded by age, not by count, so a
# concurrently running instance is never swept out from under itself.
prune_run_trees() {
  local runs="${REPO:-$PWD}/.next-runs"
  [ -d "$runs" ] || return 0
  find "$runs" -mindepth 1 -maxdepth 1 -type d -mmin +720 -exec rm -rf {} + 2>/dev/null
  return 0
}

# stage_run_tree <tag> -> prints the path of a tree ready for `node <tree>/server.js`
stage_run_tree() {
  local tag="${1:-run}"
  local repo="${REPO:-$PWD}"
  local runs="$repo/.next-runs"
  local tree="$runs/$tag-$(date +%s)-$$"

  if [ ! -f "$repo/.next/standalone/server.js" ]; then
    echo "stage-run-tree: $repo/.next/standalone/server.js missing — run 'npm run build' first." >&2
    return 2
  fi

  mkdir -p "$runs" || return 2
  prune_run_trees

  # Shared lock for the duration of the copy only. Released before the caller starts
  # serving, because once the tree is staged a build is no longer any of our business.
  local lock="$repo/.buildlock"
  if ! exec 9>>"$lock"; then
    echo "stage-run-tree: cannot open $lock." >&2
    return 2
  fi
  if ! flock -s -w "${STAGE_LOCK_WAIT:-600}" 9; then
    echo "stage-run-tree: a build has held the lock for ${STAGE_LOCK_WAIT:-600}s. Not staging." >&2
    exec 9>&-
    return 2
  fi

  local ok=1
  mkdir -p "$tree" || ok=0
  [ "$ok" -eq 1 ] && { cp -al "$repo/.next/standalone/." "$tree/" || ok=0; }
  [ "$ok" -eq 1 ] && { mkdir -p "$tree/.next" || ok=0; }
  # .next/static is NOT traced into the standalone tree by the build — the Dockerfile
  # copies it in, and so must we. Whatever the build may have left nested in there is
  # replaced rather than merged, so a stale chunk cannot outlive its build.
  [ "$ok" -eq 1 ] && { rm -rf "$tree/.next/static" || ok=0; }
  [ "$ok" -eq 1 ] && { cp -al "$repo/.next/static" "$tree/.next/static" || ok=0; }
  [ "$ok" -eq 1 ] && [ ! -d "$tree/public" ] && { cp -al "$repo/public" "$tree/public" || ok=0; }

  flock -u 9
  exec 9>&-

  if [ "$ok" -ne 1 ] || [ ! -f "$tree/server.js" ] || [ ! -d "$tree/.next/static" ]; then
    echo "stage-run-tree: could not stage a complete run tree at $tree." >&2
    echo "  Refusing to fall back to serving out of .next — a concurrent build would" >&2
    echo "  void that instance mid-run and the failures would look like code (#607)." >&2
    rm -rf "$tree"
    return 2
  fi

  printf '%s\n' "$tree"
}

# release_run_tree <tree> — safe to call with an empty or unset argument.
release_run_tree() {
  local tree="${1:-}"
  [ -n "$tree" ] || return 0
  case "$tree" in
    */.next-runs/*) rm -rf "$tree" ;;
    *)
      echo "release-run-tree: refusing to remove '$tree' — it is not under .next-runs." >&2
      return 1
      ;;
  esac
}
