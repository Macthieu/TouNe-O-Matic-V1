#!/usr/bin/env sh
set -eu

CONF="/etc/snapserver.conf"
PY="/usr/bin/python3"

if [ ! -f "$CONF" ]; then
  echo "snapserver.conf not found: $CONF" >&2
  exit 1
fi

have_airplay=0
have_librespot=0

[ -x /usr/bin/shairport-sync ] && have_airplay=1
[ -x /usr/local/bin/shairport-sync ] && have_airplay=1
[ -x /usr/bin/librespot ] && have_librespot=1
[ -x /usr/local/bin/librespot ] && have_librespot=1

if [ "$have_airplay" -eq 0 ] && [ "$have_librespot" -eq 0 ]; then
  echo "No sources available (shairport-sync/librespot not installed)." >&2
  exit 2
fi

tmp="${CONF}.tmp.toune"
OUT=$(CONF="$CONF" TMP="$tmp" HAVE_AIRPLAY="$have_airplay" HAVE_LIBRESPOT="$have_librespot" "$PY" - <<'PY'
import os, sys

conf = os.environ.get("CONF", "/etc/snapserver.conf")
tmp = os.environ.get("TMP", "/etc/snapserver.conf.tmp.toune")
have_airplay = os.environ.get("HAVE_AIRPLAY") == "1"
have_librespot = os.environ.get("HAVE_LIBRESPOT") == "1"

text = open(conf, "r", encoding="utf-8", errors="ignore").read()
lines = text.splitlines()

def has_source(token: str) -> bool:
    for ln in lines:
        s = ln.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("source") and token in s:
            return True
    return False

added = []
if have_airplay and not has_source("airplay://"):
    added.append("source = airplay:///usr/bin/shairport-sync?name=airplay&port=5000")
if have_librespot and not has_source("librespot://"):
    added.append("source = librespot:///usr/bin/librespot?name=spotify")

if not added:
    print("unchanged")
    sys.exit(0)

lines.append("")
lines.append("# Toune-o-matic sources (auto)")
lines.extend(added)
open(tmp, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("changed")
PY
)

if [ "$OUT" = "changed" ]; then
  if systemctl is-active --quiet shairport-sync; then
    systemctl stop shairport-sync || true
  fi
  timestamp=$(date +"%Y%m%d-%H%M%S")
  backup="${CONF}.bak.${timestamp}"
  cp "$CONF" "$backup"
  mv "$tmp" "$CONF"
  systemctl restart snapserver
  echo "updated"
else
  echo "unchanged"
fi
