#!/usr/bin/env bash
# Kill whatever is LISTENING on a TCP port — by PID, never by command-line pattern.
#
#   scripts/kill-port.sh 8621
#   scripts/kill-port.sh 8621 --dry-run     # show what would die, kill nothing
#   scripts/kill-port.sh 8610 --force       # required to touch a container-owned port
#
# WHY THIS EXISTS (to-do #482). Tearing down a scratch `next start -p NNNN` was
# hand-rolled five times in one week, and `pkill -f` is the wrong tool for it twice
# over:
#
#   1. It MISSES. Next renames its own process once it is serving: the command line
#      you launched (`next start -p 8621`) becomes `next-server (v15.5.19)`. A
#      pattern matching the launch command matches nothing, so the script reports
#      success and the port stays bound — and the next `next start` silently picks a
#      different port, which is how a test run ends up pointed at a stale server.
#
#   2. It KILLS THE WRONG THING. `pkill -f 8621` matches every command line
#      CONTAINING that string, and over SSH the remote command line
#      (`ssh … "… kill-port 8621 …"`) contains it. The pattern matches the session
#      running the pattern; the session dies mid-command with exit 255. That is not
#      a hypothetical — it happened, and it looks like a network fault rather than a
#      self-inflicted kill, which is why it cost so much time.
#
# So this resolves the PID from the kernel's socket table (`ss -lntp`) and kills
# THAT. A pattern is never matched against a command line, so neither failure is
# reachable: ssh does not listen on the port, so ssh can never be selected.
#
# THE PRODUCTION GUARD, which the port-kill idea does not come with for free. On
# this host the app's own port is 8610 and it is bound by docker-proxy for the LIVE
# container. `kill-port.sh 8610` with no guard is "take the public site down", and
# the difference between 8610 and a scratch 8621 is one keystroke. So a port whose
# listener belongs to Docker is REFUSED unless --force is passed explicitly. The
# scratch-instance workflow never needs --force; if you find yourself typing it,
# stop and re-read the port number.
set -euo pipefail

port="${1:-}"
shift || true

dry_run=0
force=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --force)   force=1 ;;
    *) echo "kill-port: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

if [ -z "$port" ] || ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "usage: scripts/kill-port.sh <port> [--dry-run] [--force]" >&2
  exit 2
fi

command -v ss >/dev/null 2>&1 || { echo "kill-port: 'ss' not found (iproute2 required)" >&2; exit 3; }

# -H drops the header so an empty result is genuinely empty. The filter is applied
# by ss itself rather than grepped out of the full table, so a port number that is a
# substring of another port (861 vs 8610) cannot collide.
rows="$(ss -lntpH "sport = :$port" 2>/dev/null || true)"

if [ -z "$rows" ]; then
  echo "kill-port: nothing is listening on :$port"
  exit 0
fi

# users:(("next-server (v1",pid=12345,fd=23))  ->  12345
pids="$(printf '%s\n' "$rows" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)"

if [ -z "$pids" ]; then
  # ss shows the socket but not its owner: the process belongs to another user.
  echo "kill-port: :$port is bound but its owner is not visible to $(id -un)." >&2
  echo "           Re-run as the owning user; do NOT reach for sudo on a shared box." >&2
  exit 4
fi

self=$$
for pid in $pids; do
  comm="$(cat "/proc/$pid/comm" 2>/dev/null || echo '?')"
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo '?')"

  # Never kill this script, its shell, or an ancestor of it. Cheap, and it makes the
  # class of bug in the header structurally unreachable rather than merely unlikely.
  anc="$self"
  while [ -n "$anc" ] && [ "$anc" != "0" ] && [ "$anc" != "1" ]; do
    if [ "$anc" = "$pid" ]; then
      echo "kill-port: refusing to kill pid $pid — it is this session or an ancestor of it." >&2
      exit 5
    fi
    anc="$(awk '{print $4}' "/proc/$anc/stat" 2>/dev/null || echo 0)"
  done

  case "$comm" in
    docker-proxy|containerd-shim*|dockerd)
      if [ "$force" -ne 1 ]; then
        echo "kill-port: :$port is held by '$comm' (pid $pid) — a CONTAINER, very likely production." >&2
        echo "           Refusing. Stop it with 'docker compose stop', or pass --force if you truly mean it." >&2
        exit 6
      fi
      echo "kill-port: --force given; killing container listener '$comm' (pid $pid) on :$port" >&2
      ;;
  esac

  if [ "$dry_run" -eq 1 ]; then
    echo "would kill pid $pid ($comm) on :$port — $cmdline"
    continue
  fi

  echo "kill-port: killing pid $pid ($comm) on :$port"
  kill "$pid" 2>/dev/null || true

  # TERM, then verify, then KILL. Next does not always drop its listener on TERM
  # when it is mid-request, and "the script said it killed it" while the port stays
  # bound is the exact failure this file exists to end.
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "kill-port: pid $pid ignored SIGTERM after 5s; sending SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi
done

[ "$dry_run" -eq 1 ] && exit 0

# Assert the outcome instead of assuming it. Exiting 0 with the port still bound is
# how the pkill version lied for a week.
if [ -n "$(ss -lntpH "sport = :$port" 2>/dev/null || true)" ]; then
  echo "kill-port: :$port is STILL bound after the kill — investigate, do not retry blindly." >&2
  exit 7
fi
echo "kill-port: :$port is free"
