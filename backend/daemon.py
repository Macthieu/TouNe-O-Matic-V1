from __future__ import annotations

import json
import os
import shlex
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from mpd import MPDClient

MPD_HOST = os.environ.get("MPD_HOST", "127.0.0.1")
MPD_PORT = int(os.environ.get("MPD_PORT", "6600"))
STATE_DIR = Path(os.environ.get("TOUNE_STATE_DIR", "/srv/toune/state"))
CMD_PATH = STATE_DIR / "cmd.txt"
STATE_PATH = STATE_DIR / "state.json"


def _atomic_write(path: Path, payload: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def _read_cmds() -> List[str]:
    if not CMD_PATH.exists():
        return []
    claimed = CMD_PATH.with_name(f"cmd.{int(time.time() * 1000)}.txt")
    try:
        os.replace(CMD_PATH, claimed)
    except FileNotFoundError:
        return []
    except OSError:
        return []
    try:
        lines = claimed.read_text(encoding="utf-8", errors="ignore").splitlines()
    finally:
        try:
            claimed.unlink()
        except OSError:
            pass
    cmds = []
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        cmds.append(ln)
    return cmds


def _parse_cmd(line: str) -> Tuple[str, List[str]]:
    try:
        parts = shlex.split(line)
    except ValueError:
        parts = line.split()
    if not parts:
        return "", []
    return parts[0].lower(), parts[1:]


def _handle_cmd(client: MPDClient, line: str) -> Optional[str]:
    cmd, args = _parse_cmd(line)
    if not cmd:
        return None
    if cmd in ("play", "resume"):
        if args:
            path = " ".join(args)
            client.clear()
            client.add(path)
        if cmd == "resume":
            client.pause(0)
        else:
            client.play()
        return cmd
    if cmd == "pause":
        client.pause(1)
        return cmd
    if cmd == "stop":
        client.stop()
        return cmd
    if cmd == "next":
        client.next()
        return cmd
    if cmd == "prev":
        client.previous()
        return cmd
    if cmd == "clear":
        client.clear()
        return cmd
    if cmd == "volume" and args:
        client.setvol(int(args[0]))
        return cmd
    if cmd == "seek" and args:
        client.seekcur(int(float(args[0])))
        return cmd
    if cmd == "add" and args:
        path = " ".join(args)
        client.add(path)
        return cmd
    return f"ignored:{line}"


def _collect_state(client: MPDClient, last_cmd: str, last_error: str) -> Dict[str, Any]:
    try:
        status = client.status()
    except Exception:
        status = {}
    try:
        song = client.currentsong()
    except Exception:
        song = {}
    return {
        "ts": int(time.time()),
        "status": status,
        "song": song,
        "last_cmd": last_cmd,
        "last_error": last_error,
    }


def run_loop(poll_s: float = 0.5):
    last_cmd = ""
    last_error = ""
    while True:
        try:
            client = MPDClient()
            client.timeout = 10
            client.idletimeout = None
            client.connect(MPD_HOST, MPD_PORT)
            while True:
                cmds = _read_cmds()
                for line in cmds:
                    try:
                        last_cmd = _handle_cmd(client, line) or last_cmd
                        last_error = ""
                    except Exception as e:
                        last_error = str(e)
                state = _collect_state(client, last_cmd, last_error)
                _atomic_write(STATE_PATH, json.dumps(state, ensure_ascii=False))
                time.sleep(poll_s)
        except Exception as e:
            last_error = str(e)
            state = {
                "ts": int(time.time()),
                "status": {},
                "song": {},
                "last_cmd": last_cmd,
                "last_error": last_error,
            }
            _atomic_write(STATE_PATH, json.dumps(state, ensure_ascii=False))
            time.sleep(2)
        finally:
            try:
                client.close()
                client.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    run_loop()
