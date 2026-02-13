#!/usr/bin/env sh
set -eu

BASE_URL="${TOUNE_API_BASE:-http://127.0.0.1:11000/api}"
SUBDIR="${TOUNE_LIBRARY_SUBDIR:-}"
API_WAIT_SECS="${TOUNE_API_WAIT_SECS:-90}"

waited=0
while ! curl -fsS --max-time 2 "${BASE_URL}/health" >/dev/null 2>&1; do
  if [ "$waited" -ge "$API_WAIT_SECS" ]; then
    logger -t toune-library-sync "API not reachable after ${API_WAIT_SECS}s at ${BASE_URL}; sync aborted."
    echo "API not reachable after ${API_WAIT_SECS}s at ${BASE_URL}" >&2
    exit 7
  fi
  sleep 1
  waited=$((waited + 1))
done

if [ -n "$SUBDIR" ]; then
  payload=$(printf '{"dry":false,"subdir":"%s"}' "$SUBDIR")
else
  payload='{"dry":false}'
fi

resp=$(curl -fsS -X POST "${BASE_URL}/library/roots/sync" \
  -H "Content-Type: application/json" \
  -d "$payload")

read_stats=$(/usr/bin/python3 - <<'PY'
import json, sys
data = json.loads(sys.stdin.read() or "{}")
actions = (data.get("data") or {}).get("actions") or {}
created = int(actions.get("created") or 0)
updated = int(actions.get("updated") or 0)
removed = int(actions.get("removed") or 0)
print(f"{created} {updated} {removed}")
PY
<<EOF
$resp
EOF
)

set -- $read_stats
created="${1:-0}"
updated="${2:-0}"
removed="${3:-0}"
total=$((created + updated + removed))

if [ "$total" -gt 0 ]; then
  logger -t toune-library-sync "Links changed (created=$created updated=$updated removed=$removed); triggering library scan."
  curl -fsS -X POST "${BASE_URL}/library/scan" >/dev/null
else
  logger -t toune-library-sync "No link changes (created=$created updated=$updated removed=$removed); scan skipped."
fi
