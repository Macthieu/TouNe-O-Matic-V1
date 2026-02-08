#!/usr/bin/env sh
set -eu

SINK="${1:-}"
CONF="/etc/default/snapclient-bluetooth"

if [ -z "$SINK" ]; then
  echo "missing sink name" >&2
  exit 1
fi

echo "$SINK" | grep -Eq '^[A-Za-z0-9._:-]+$' || { echo "invalid sink name" >&2; exit 1; }

SINK="$SINK" CONF="$CONF" /usr/bin/python3 - <<'PY'
import os
from pathlib import Path

sink = os.environ["SINK"]
conf = Path(os.environ["CONF"])

defaults = {
    "PULSE_SERVER": "unix:/var/run/pulse/native",
    "PULSE_SINK": sink,
    "SNAPCLIENT_BLUETOOTH_STREAM": "mpd",
    "SNAPCLIENT_BLUETOOTH_LATENCY": "0",
}

out = []
seen = set()
if conf.exists():
    raw = conf.read_text()
    # Normalize any literal "\n" sequences from bad writes.
    raw = raw.replace("\\n", "\n")
    for ln in raw.splitlines():
        if not ln or ln.lstrip().startswith("#"):
            continue
        key, sep, val = ln.partition("=")
        if not sep:
            continue
        key = key.strip()
        if key in defaults and key not in seen:
            seen.add(key)
            out.append(f"{key}={defaults[key]}")

for key, val in defaults.items():
    if key not in seen:
        out.append(f"{key}={val}")

conf.write_text("\n".join(out) + "\n")
PY

/usr/bin/systemctl restart snapclient-bluetooth
echo "updated"
