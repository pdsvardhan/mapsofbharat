#!/usr/bin/env bash
# 405-G — the migration trigger: is a home server still the right host for this?
#
# WHAT THE ROADMAP ASKED FOR, AND WHY THIS IS NOT EXACTLY THAT.
# 405-G was specified as "cache-hit < 90% -> consider moving off the home server".
# That ratio lives in Cloudflare Analytics and needs an API token this box does not
# have (#544 needs the same one). More importantly, the site is PRE-LAUNCH: measured
# 2026-08-21 the container sat at 0.00% CPU and 53MiB of its 2GiB limit. A threshold
# calibrated against zero traffic is a number someone made up, and it would either
# cry wolf or never fire — the same reason #433 defers its analytics thresholds until
# a real baseline exists.
#
# So this collects the evidence now and refuses to invent the traffic-relative part:
#
#   COLLECTED  origin latency (p50/p95 over N probes), container CPU and memory
#              against the compose limits, and whether /api/health is honest.
#   ALERTED    only on ABSOLUTE failure conditions - ones that are wrong at any
#              traffic level, so no calibration is needed to justify them.
#   DEFERRED   the cache-hit ratio and any "requests per hour" trigger, until there
#              is traffic to measure and a token to read it with. Recorded, not
#              silently dropped.
#
# Usage:  capacity-watch.sh            # sample, append, alert if warranted
#         capacity-watch.sh --report   # print the trend from what has been collected
#
# Cron (hourly):
#   17 * * * * /mnt/storage/websites/mapsofbharat/scripts/capacity-watch.sh >> /opt/homeserver/logs/mapsofbharat-capacity.log 2>&1
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${MOB_CAPACITY_LOG:-/opt/homeserver/logs/mapsofbharat-capacity.tsv}"
URL="${MOB_CAPACITY_URL:-http://127.0.0.1:8610}"
CONTAINER="mapsofbharat"
PROBES=10

# Absolute conditions. Each is wrong at ANY traffic level, which is what lets them be
# thresholds today rather than guesses about tomorrow.
MEM_PCT_ALERT=80      # of the 2GiB compose limit
P95_MS_ALERT=2000     # a page this simple should never take 2s from inside the box
CPU_PCT_ALERT=300     # of 400% (4 cpus); sustained means it has outgrown its cap

NOTIFY_URL="${NOTIFY_URL:-http://localhost:8601/api/log}"

notify() {
  echo "capacity-watch: ALERT — $1" >&2
  curl -fsS -X POST "$NOTIFY_URL" -H 'content-type: application/json' \
    -d "$(printf '{"level":"error","message":"mapsofbharat capacity: %s"}' "$1")" \
    >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--report" ]; then
  [ -f "$DATA" ] || { echo "no samples yet at $DATA"; exit 0; }
  echo "samples: $(( $(wc -l < "$DATA") - 1 ))   since: $(sed -n 2p "$DATA" | cut -f1)"
  echo
  awk -F'\t' 'NR>1 {n++; p50+=$2; p95+=$3; cpu+=$4; mem+=$5;
      if($3>mx){mx=$3; mxt=$1}}
    END {if(n) printf "  mean p50 %.0fms   mean p95 %.0fms   mean cpu %.1f%%   mean mem %.1f%%\n  worst p95 %.0fms at %s\n", p50/n, p95/n, cpu/n, mem/n, mx, mxt}' "$DATA"
  echo
  echo "  last 5 samples:"; tail -n +2 "$DATA" | tail -5 | awk -F'\t' '{printf "    %s  p50=%sms p95=%sms cpu=%s%% mem=%s%% health=%s\n",$1,$2,$3,$4,$5,$6}'
  exit 0
fi

# ── probe latency from inside the box, so this measures the ORIGIN, not the CDN ──
times=()
health_ok=1
for _ in $(seq 1 "$PROBES"); do
  t=$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "$URL/" 2>/dev/null || echo 10)
  times+=("$(awk -v t="$t" 'BEGIN{printf "%.0f", t*1000}')")
done
curl -sf --max-time 10 "$URL/api/health" >/dev/null 2>&1 || health_ok=0

sorted=$(printf '%s\n' "${times[@]}" | sort -n)
p50=$(printf '%s\n' "$sorted" | awk 'NR==int((NR_TOTAL+1)/2)' NR_TOTAL="$PROBES" | head -1)
[ -z "$p50" ] && p50=$(printf '%s\n' "$sorted" | sed -n "$(( (PROBES+1)/2 ))p")
p95=$(printf '%s\n' "$sorted" | sed -n "$(( PROBES*95/100 ))p")
[ -z "$p95" ] && p95=$(printf '%s\n' "$sorted" | tail -1)

# ── container headroom against its declared limits ──────────────────────────
stats=$(docker stats --no-stream --format '{{.CPUPerc}}\t{{.MemPerc}}' "$CONTAINER" 2>/dev/null || echo "0%	0%")
cpu=$(printf '%s' "$stats" | cut -f1 | tr -d '%')
mem=$(printf '%s' "$stats" | cut -f2 | tr -d '%')

[ -f "$DATA" ] || { mkdir -p "$(dirname "$DATA")"; printf 'ts\tp50_ms\tp95_ms\tcpu_pct\tmem_pct\thealth_ok\n' > "$DATA"; }
printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -Iseconds)" "$p50" "$p95" "$cpu" "$mem" "$health_ok" >> "$DATA"
echo "capacity-watch: p50=${p50}ms p95=${p95}ms cpu=${cpu}% mem=${mem}% health_ok=${health_ok}"

# ── alert only on the absolute conditions ───────────────────────────────────
[ "$health_ok" -eq 0 ] && notify "/api/health is not answering OK"
awk -v v="$mem" -v t="$MEM_PCT_ALERT" 'BEGIN{exit !(v+0 > t)}' && notify "memory at ${mem}% of the 2GiB limit"
awk -v v="$p95" -v t="$P95_MS_ALERT" 'BEGIN{exit !(v+0 > t)}' && notify "origin p95 ${p95}ms — the box is struggling to serve its own pages"
awk -v v="$cpu" -v t="$CPU_PCT_ALERT" 'BEGIN{exit !(v+0 > t)}' && notify "CPU at ${cpu}% of the 400% cap"

exit 0
