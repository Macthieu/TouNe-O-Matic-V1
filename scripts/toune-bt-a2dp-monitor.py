#!/usr/bin/python3 -u
from __future__ import absolute_import, print_function, unicode_literals

import os
from pathlib import Path
from subprocess import Popen

from gi.repository import GLib as glib
import dbus
import dbus.mainloop.glib
import subprocess
import time

CONFIG_FILE = os.environ.get("TOUNE_BT_DEVICES", "/etc/toune/bt-devices")
CONF_ENV = os.environ.get("TOUNE_BT_CONF", "/etc/default/snapclient-bluetooth")
DEVNULL = open(os.devnull, 'w')

players = {}
last_attempt = {}
in_progress_until = {}

def _read_conf():
    data = {}
    try:
        raw = Path(CONF_ENV).read_text().replace("\\n", "\n")
    except Exception:
        return data
    for line in raw.splitlines():
        if not line or line.lstrip().startswith("#"):
            continue
        key, sep, val = line.partition("=")
        if not sep:
            continue
        data[key.strip()] = val.strip()
    return data


def _read_devices():
    mapping = {}
    try:
        with open(CONFIG_FILE) as f:
            for line in f:
                parts = line.strip().split("=", 1)
                if len(parts) == 2 and parts[0] and parts[1]:
                    mapping[parts[0].strip()] = parts[1].strip()
    except Exception:
        pass
    return mapping


def connected(hci, dev, name):
    key = dev.replace(':', '_')
    if key in players:
        return
    conf = _read_conf()
    stream = conf.get("SNAPCLIENT_BLUETOOTH_STREAM", "mpd")
    latency = conf.get("SNAPCLIENT_BLUETOOTH_LATENCY", "0")
    cmd = [
        "/usr/bin/snapclient",
        "--logsink", "system",
        "--loglevel", "info",
        "--player", "alsa",
        "--soundcard", f"bluealsa:DEV={dev},PROFILE=a2dp",
        "--host", "127.0.0.1",
        "--stream", stream,
        "--latency", str(latency),
        "--mixer", "none",
    ]
    print("BT connected", name, dev, "cmd:", " ".join(cmd))
    players[key] = Popen(cmd, stdout=DEVNULL, stderr=DEVNULL, shell=False)


def disconnected(dev, name):
    key = dev.replace(':', '_')
    if key not in players:
        return
    print("BT disconnected", name, dev)
    try:
        players[key].kill()
        os.waitpid(players[key].pid, 0)
    except Exception:
        pass
    players.pop(key, None)


def get_name(dev):
    mapping = _read_devices()
    return mapping.get(dev)


def _parse_bluez_path(path):
    if not path:
        return None, None
    parts = path.split('/')
    if len(parts) < 5:
        return None, None
    hci = parts[3]
    dev = ":".join(parts[4].split('_')[1:])
    return hci, dev


def _parse_pcm_path(path):
    # /org/bluealsa/hci0/dev_XX_XX_XX_XX_XX_XX/a2dp_source
    parts = path.split('/')
    if len(parts) < 5:
        return None, None
    hci = parts[3]
    dev = ":".join(parts[4].split('_')[1:])
    return hci, dev


def _bluealsa_handler(path, *args, **kwargs):
    member = kwargs.get("member")
    if member not in {"PCMAdded", "PCMRemoved"}:
        return
    hci, dev = _parse_pcm_path(path or "")
    if not hci or not dev:
        return
    name = get_name(dev)
    if not name:
        return
    if member == "PCMAdded":
        connected(hci, dev, name)
    elif member == "PCMRemoved":
        disconnected(dev, name)


def _bt_status(dev):
    try:
        res = subprocess.run(
            ["/usr/bin/bluetoothctl", "info", dev],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return {"connected": False}
    if res.returncode != 0:
        return {"connected": False}
    out = {"connected": False, "paired": False, "trusted": False}
    for line in (res.stdout or "").splitlines():
        s = line.strip().lower()
        if s.startswith("connected:"):
            out["connected"] = s.split(":", 1)[1].strip() == "yes"
        elif s.startswith("paired:"):
            out["paired"] = s.split(":", 1)[1].strip() == "yes"
        elif s.startswith("trusted:"):
            out["trusted"] = s.split(":", 1)[1].strip() == "yes"
    return out


def _poll():
    mapping = _read_devices()
    for dev, name in mapping.items():
        status = _bt_status(dev)
        is_conn = status.get("connected")
        if is_conn:
            # assume hci0 for now
            connected("hci0", dev, name)
        else:
            disconnected(dev, name)
            # try auto-connect if paired/trusted
            if status.get("paired") or status.get("trusted"):
                last = last_attempt.get(dev, 0.0)
                now = time.monotonic()
                hold = in_progress_until.get(dev, 0.0)
                if now < hold:
                    continue
                if now - last >= 15.0:
                    last_attempt[dev] = now
                    print("BT reconnect attempt", name, dev)
                    try:
                        res = subprocess.run(
                            ["/usr/bin/bluetoothctl", "connect", dev],
                            capture_output=True,
                            text=True,
                            timeout=10,
                        )
                        out = (res.stderr or res.stdout or "").strip()
                        if out:
                            print("BT reconnect result", name, dev, out.replace("\\n", " | "))
                            if "inprogress" in out.lower() or "busy" in out.lower():
                                in_progress_until[dev] = now + 30.0
                    except Exception as e:
                        print("BT reconnect error", name, dev, str(e))
    return True


if __name__ == '__main__':
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    bus.add_signal_receiver(
        _bluealsa_handler,
        dbus_interface="org.bluealsa.Manager1",
        interface_keyword="dbus_interface",
        member_keyword="member",
    )
    mainloop = glib.MainLoop()
    glib.timeout_add_seconds(2, _poll)
    mainloop.run()
