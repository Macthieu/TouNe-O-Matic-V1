#!/usr/bin/env sh
set -eu
export PATH="/usr/sbin:/usr/bin:/sbin:/bin"

SNAP_CONF="/etc/snapserver.conf"
AIR_CONF="/etc/shairport-sync.conf"
PY="/usr/bin/python3"
FIFO_DIR="/tmp/shairport-sync"
FIFO_PATH="/tmp/shairport-sync/airplayfifo"

if [ ! -f "$SNAP_CONF" ]; then
  echo "snapserver.conf not found: $SNAP_CONF" >&2
  exit 1
fi
if [ ! -f "$AIR_CONF" ]; then
  echo "shairport-sync.conf not found: $AIR_CONF" >&2
  exit 1
fi

[ -x /usr/bin/shairport-sync ] || { echo "shairport-sync not installed" >&2; exit 2; }

 /usr/bin/mkdir -p "$FIFO_DIR"
 /bin/chmod 777 "$FIFO_DIR" || true

tmp_air="${AIR_CONF}.tmp.toune"
tmp_snap="${SNAP_CONF}.tmp.toune"

OUT=$(AIR_CONF="$AIR_CONF" SNAP_CONF="$SNAP_CONF" TMP_AIR="$tmp_air" TMP_SNAP="$tmp_snap" FIFO_PATH="$FIFO_PATH" "$PY" - <<'PY'
import os, sys, re

air_conf = os.environ["AIR_CONF"]
snap_conf = os.environ["SNAP_CONF"]
tmp_air = os.environ["TMP_AIR"]
tmp_snap = os.environ["TMP_SNAP"]
fifo_path = os.environ["FIFO_PATH"]

changed = False

def edit_airplay(conf_path: str, out_path: str) -> bool:
    text = open(conf_path, "r", encoding="utf-8", errors="ignore").read().splitlines()
    out = list(text)
    in_general = False
    general_end = None
    set_output = False
    for i, ln in enumerate(out):
        s = ln.strip()
        if s.startswith("general") and "{" in s:
            in_general = True
        if in_general and "output_backend" in s and "=" in s:
            out[i] = '\toutput_backend = "pipe";'
            set_output = True
        if in_general and s == "};":
            general_end = i
            in_general = False
    if not set_output and general_end is not None:
        out.insert(general_end, '\toutput_backend = "pipe";')
        set_output = True

    in_pipe = False
    pipe_end = None
    set_pipe = False
    for i, ln in enumerate(out):
        s = ln.strip()
        if s.startswith("pipe") and "{" in s:
            in_pipe = True
        if in_pipe and s.startswith("name"):
            out[i] = f'\tname = "{fifo_path}";'
            set_pipe = True
        if in_pipe and s == "};":
            pipe_end = i
            in_pipe = False
    if not set_pipe and pipe_end is not None:
        out.insert(pipe_end, f'\tname = "{fifo_path}";')
        set_pipe = True

    if out != text:
        open(out_path, "w", encoding="utf-8").write("\n".join(out) + "\n")
        return True
    return False

def edit_snap(conf_path: str, out_path: str) -> bool:
    text = open(conf_path, "r", encoding="utf-8", errors="ignore").read().splitlines()
    out = list(text)
    wanted = f"source = pipe://{fifo_path}?name=airplay&sampleformat=44100:16:2&codec=flac"
    has = any(ln.strip() == wanted for ln in out)
    if has:
        return False
    stream_start = None
    stream_end = len(out)
    for i, ln in enumerate(out):
        s = ln.strip().lower()
        if s == "[stream]":
            stream_start = i
            continue
        if stream_start is not None and s.startswith("[") and s.endswith("]"):
            stream_end = i
            break
    insert_at = stream_end
    if stream_start is not None:
        insert_at = stream_end
    out.insert(insert_at, wanted)
    out.insert(insert_at, "# Toune-o-matic AirPlay (pipe)")
    open(out_path, "w", encoding="utf-8").write("\n".join(out) + "\n")
    return True

air_changed = edit_airplay(air_conf, tmp_air)
snap_changed = edit_snap(snap_conf, tmp_snap)
changed = air_changed or snap_changed
print("changed" if changed else "unchanged")
PY
)

if [ "$OUT" = "changed" ]; then
  timestamp=$(date +"%Y%m%d-%H%M%S")
  cp "$AIR_CONF" "${AIR_CONF}.bak.${timestamp}"
  cp "$SNAP_CONF" "${SNAP_CONF}.bak.${timestamp}"
  [ -f "$tmp_air" ] && mv "$tmp_air" "$AIR_CONF"
  [ -f "$tmp_snap" ] && mv "$tmp_snap" "$SNAP_CONF"
  systemctl enable --now shairport-sync
  systemctl restart snapserver
  echo "updated"
else
  echo "unchanged"
fi
