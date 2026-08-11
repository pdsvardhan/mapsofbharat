#!/bin/sh
# Create the measurement plan's four funnels on the self-hosted Umami
# (planning/2026-08-05, MSR-04; iteration 148 item 939).
#
# Lives in the repo rather than being run once by hand because a funnel that
# exists only in a dashboard is a measurement no one can rebuild: if the Umami
# volume is ever restored from a backup, this is what puts the funnels back.
#
# Run on VAULT7A (the Umami API is bound to 127.0.0.1):
#   sh scripts/umami-funnels.sh
# Credentials are sourced from /opt/homeserver/umami/.env — never passed as
# arguments, never echoed.
#
# Idempotent by report NAME, compared with jq against parsed JSON. The first
# version of this script compared names by splitting the response on commas, and
# funnel 4's name contains a comma, so the check silently missed it and a re-run
# created a second identical funnel. Two identically-named funnels both look
# authoritative in the dashboard, which is exactly the ambiguity the measurement
# plan exists to remove. Hence: parse, never split.
set -eu

ENV_FILE=${UMAMI_ENV_FILE:-/opt/homeserver/umami/.env}
U=${UMAMI_URL:-http://127.0.0.1:8620}
[ -r "$ENV_FILE" ] || { echo "cannot read $ENV_FILE — run this on the box"; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${ADMIN_USER:?}" "${ADMIN_PASSWORD:?}" "${UMAMI_WEBSITE_ID:?}"
WID="$UMAMI_WEBSITE_ID"

TOKEN=$(curl -s -X POST "$U/api/auth/login" -H 'Content-Type: application/json' \
  --data-binary "$(printf '{"username":"%s","password":"%s"}' "$ADMIN_USER" "$ADMIN_PASSWORD")" \
  | jq -r '.token // empty')
[ -n "$TOKEN" ] || { echo "umami login failed"; exit 1; }

RANGE='"dateRange":{"value":"range","startDate":"2026-08-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z"}'

list() { curl -s "$U/api/reports?websiteId=$WID&page=1&pageSize=100" -H "Authorization: Bearer $TOKEN"; }

mk() { # mk <name> <description> <type> <parameters-body>
  if [ "$(list | jq --arg n "$1" '[.data[] | select(.name == $n)] | length')" != "0" ]; then
    echo "SKIP (exists): $1"; return
  fi
  jq -n --arg w "$WID" --arg n "$1" --arg d "$2" --arg t "$3" --argjson p "{$4}" \
    '{websiteId:$w, name:$n, description:$d, type:$t, parameters:$p}' > /tmp/umami-report.json
  if curl -s -X POST "$U/api/reports" -H "Authorization: Bearer $TOKEN" \
       -H 'Content-Type: application/json' --data-binary @/tmp/umami-report.json \
       | jq -e '.id' >/dev/null 2>&1; then
    echo "CREATED: $1"
  else
    echo "FAILED:  $1"; return 1
  fi
}

# 1 — activation. The gate everything else is conditioned on.
mk "1. Arrive to metric_selected" \
   "Activation: a visitor arrives and picks an indicator." \
   "funnel" \
   '"steps":[{"type":"url","value":"/"},{"type":"event","value":"metric_selected"}],"window":60,'"$RANGE"

# 2 — depth.
mk "2. metric_selected to drill_in" \
   "Depth: having picked an indicator, does the reader drill India to state to district?" \
   "funnel" \
   '"steps":[{"type":"event","value":"metric_selected"},{"type":"event","value":"drill_in"}],"window":60,'"$RANGE"

# 3 — output.
mk "3. metric_selected to card_exported" \
   "Output: having picked an indicator, does the reader export a shareable card?" \
   "funnel" \
   '"steps":[{"type":"event","value":"metric_selected"},{"type":"event","value":"card_exported"}],"window":60,'"$RANGE"

# 4 — return. The plan asks for "card_exported to return visit", but an Umami
# funnel step is a url or an event and a RETURN VISIT is neither. This is the
# closest expressible proxy and its NAME says so: the 7-day window (10080 min) is
# what makes it a return rather than a navigation, but a reader who exports and
# then loads / again in the same session also counts, so it over-reports. Read it
# against the retention report below, which is the unconditioned instrument.
mk "4. card_exported then a later visit (proxy, over-reports)" \
   "Return: exported a card, then loaded / again within 7 days. PROXY ONLY - a same-session return to / also counts, so read it alongside the retention report, not as a clean return rate." \
   "funnel" \
   '"steps":[{"type":"event","value":"card_exported"},{"type":"url","value":"/"}],"window":10080,'"$RANGE"

mk "Retention (site-wide return rate)" \
   "The denominator for funnel 4: how many visitors come back at all, independent of whether they exported a card." \
   "retention" \
   "$RANGE"

echo "--- reports now on the website ---"
list | jq -r '.data[] | "\(.type)\t\(.name)"' | sort
