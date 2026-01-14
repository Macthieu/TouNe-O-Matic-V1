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
QUEUE_PATH = STATE_DIR / "queue.json"
CMD_LOG_PATH = STATE_DIR / "cmd.log"
QUEUE_RESTORE = os.environ.get("TOUNE_QUEUE_RESTORE", "1") not in ("0", "false", "False")


def _atomic_write(path: Path, payload: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def _append_cmd_log(entry: Dict[str, Any], max_lines: int = 500):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False)
    with CMD_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:
        if CMD_LOG_PATH.stat().st_size > 200_000:
            lines = CMD_LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
            if len(lines) > max_lines:
                tail = lines[-max_lines:]
                CMD_LOG_PATH.write_text("\n".join(tail) + "\n", encoding="utf-8")
    except Exception:
        pass


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


def _collect_state(client: MPDClient, last_cmd: str, last_cmd_line: str, last_cmd_ts: int, last_error: str) -> Dict[str, Any]:
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
        "last_cmd_line": last_cmd_line,
        "last_cmd_ts": last_cmd_ts,
        "last_error": last_error,
    }


def _restore_queue_if_empty(client: MPDClient) -> bool:
    if not QUEUE_RESTORE:
        return False
    if not QUEUE_PATH.exists():
        return False
    try:
        existing = client.playlistinfo()
        if existing:
            return False
        data = json.loads(QUEUE_PATH.read_text(encoding="utf-8", errors="ignore"))
        if not isinstance(data, list) or not data:
            return False
        client.clear()
        for p in data:
            if p:
                client.add(p)
        return True
    except Exception:
        return False


def run_loop(poll_s: float = 0.5):
    last_cmd = ""
    last_cmd_line = ""
    last_cmd_ts = 0
    last_error = ""
    while True:
        try:
            client = MPDClient()
            client.timeout = 10
            client.idletimeout = None
            client.connect(MPD_HOST, MPD_PORT)
            _restore_queue_if_empty(client)
            while True:
                cmds = _read_cmds()
                for line in cmds:
                    try:
                        last_cmd = _handle_cmd(client, line) or last_cmd
                        last_cmd_line = line
                        last_cmd_ts = int(time.time())
                        last_error = ""
                        _append_cmd_log({
                            "ts": last_cmd_ts,
                            "line": line,
                            "result": "ok",
                            "cmd": last_cmd,
                        })
                    except Exception as e:
                        last_error = str(e)
                        _append_cmd_log({
                            "ts": int(time.time()),
                            "line": line,
                            "result": "error",
                            "error": last_error,
                        })
                state = _collect_state(client, last_cmd, last_cmd_line, last_cmd_ts, last_error)
                _atomic_write(STATE_PATH, json.dumps(state, ensure_ascii=False))
                time.sleep(poll_s)
        except Exception as e:
            last_error = str(e)
            state = {
                "ts": int(time.time()),
                "status": {},
                "song": {},
                "last_cmd": last_cmd,
                "last_cmd_line": last_cmd_line,
                "last_cmd_ts": last_cmd_ts,
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
