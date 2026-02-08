from __future__ import annotations

import json
import os
import shlex
import time
import fcntl
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from mpd import MPDClient

MPD_HOST = os.environ.get("MPD_HOST", "127.0.0.1")
MPD_PORT = int(os.environ.get("MPD_PORT", "6600"))
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STATE_DIR = PROJECT_ROOT / ".state"
STATE_DIR = Path(os.environ.get("TOUNE_STATE_DIR", str(DEFAULT_STATE_DIR)))
CMD_PATH = STATE_DIR / "cmd.txt"
STATE_PATH = STATE_DIR / "state.json"
QUEUE_PATH = STATE_DIR / "queue.json"
CMD_LOG_PATH = STATE_DIR / "cmd.log"
CMD_LOCK_PATH = STATE_DIR / "cmd.lock"
QUEUE_DIR = STATE_DIR / "queue"
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


@contextmanager
def _cmd_lock():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with CMD_LOCK_PATH.open("a+", encoding="utf-8") as lockf:
        fcntl.flock(lockf.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lockf.fileno(), fcntl.LOCK_UN)


def _read_cmds() -> List[str]:
    claimed = CMD_PATH.with_name(f"cmd.{int(time.time() * 1000)}.txt")
    try:
        with _cmd_lock():
            if not CMD_PATH.exists():
                return []
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


def _parse_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    try:
        return int(str(value))
    except Exception:
        return default


def _clear_queue_cache():
    try:
        _atomic_write(QUEUE_PATH, "[]")
    except Exception:
        pass
    try:
        if not QUEUE_DIR.exists():
            return
        for p in QUEUE_DIR.iterdir():
            if p.is_symlink() or p.is_file():
                try:
                    p.unlink()
                except Exception:
                    pass
    except Exception:
        pass


def _handle_cmd(client: MPDClient, line: str) -> Optional[str]:
    cmd, args = _parse_cmd(line)
    if not cmd:
        return None
    if cmd == "play":
        if args:
            idx = _parse_int(args[0]) if len(args) == 1 else None
            if idx is not None:
                client.play(idx)
                return cmd
            path = " ".join(args)
            client.clear()
            client.add(path)
            client.play()
            return cmd
        client.play()
        return cmd
    if cmd == "resume":
        if args:
            path = " ".join(args)
            client.clear()
            client.add(path)
            client.play()
            return cmd
        try:
            status = client.status()
            state = (status.get("state") or "").lower()
        except Exception:
            state = ""
        if state == "stop":
            client.play()
        else:
            client.pause(0)
        return cmd
    if cmd == "pause":
        try:
            status = client.status()
            state = (status.get("state") or "").lower()
        except Exception:
            state = ""
        if state != "stop":
            client.pause(1)
        return cmd
    if cmd == "stop":
        client.stop()
        return cmd
    if cmd == "next":
        status = client.status()
        total = _parse_int(status.get("playlistlength"), 0) or 0
        cur = _parse_int(status.get("song"), -1)
        state = (status.get("state") or "").lower()
        if total <= 0:
            return "next-empty"
        if state == "stop":
            nxt = 0 if cur < 0 else min(cur + 1, total - 1)
            client.play(nxt)
            return "next-play"
        if cur >= total - 1:
            client.stop()
            return "next-end"
        client.next()
        return cmd
    if cmd == "prev":
        status = client.status()
        total = _parse_int(status.get("playlistlength"), 0) or 0
        cur = _parse_int(status.get("song"), -1)
        state = (status.get("state") or "").lower()
        if total <= 0:
            return "prev-empty"
        if state == "stop":
            prv = 0 if cur <= 0 else cur - 1
            client.play(prv)
            return "prev-play"
        if cur <= 0:
            client.play(0)
            return "prev-start"
        client.previous()
        return cmd
    if cmd == "clear":
        client.clear()
        _clear_queue_cache()
        return cmd
    if cmd == "volume" and args:
        vol = max(0, min(100, int(float(args[0]))))
        client.setvol(vol)
        return cmd
    if cmd == "seek" and args:
        pos = max(0, int(float(args[0])))
        client.seekcur(pos)
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
