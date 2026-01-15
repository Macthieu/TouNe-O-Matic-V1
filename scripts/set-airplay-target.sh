#!/usr/bin/env sh
set -eu

SINK="${1:-}"
CONF="/etc/default/snapclient-airplay"

if [ -z "$SINK" ]; then
  echo "missing sink name" >&2
  exit 1
fi

echo "$SINK" | grep -Eq '^[A-Za-z0-9._:-]+$' || { echo "invalid sink name" >&2; exit 1; }

if [ ! -f "$CONF" ]; then
  cat >"$CONF" <<EOF
PULSE_SERVER=unix:/var/run/pulse/native
PULSE_SINK=$SINK
SNAPCLIENT_AIRPLAY_STREAM=mpd
EOF
else
  SINK="$SINK" CONF="$CONF" /usr/bin/python3 - <<'PY'
import os
from pathlib import Path

sink = os.environ["SINK"]
conf = Path(os.environ["CONF"])
lines = conf.read_text().splitlines()
out = []
found = False
for ln in lines:
    if ln.startswith("PULSE_SINK="):
        out.append(f"PULSE_SINK={sink}")
        found = True
    else:
        out.append(ln)
if not found:
    out.append(f"PULSE_SINK={sink}")
conf.write_text("\n".join(out) + "\n")
PY
fi

/usr/bin/systemctl restart snapclient-airplay
echo "updated"
