from __future__ import annotations

import os
from contextlib import contextmanager
import hashlib
import shutil
import io
import json
import random
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Iterable
import re
import unicodedata
import subprocess
from urllib.parse import urlparse

from flask import Flask, jsonify, request, send_file, make_response
from PIL import Image
from flask_cors import CORS
from mpd import MPDClient, CommandError, ConnectionError as MPDConnectionError
import requests


MPD_HOST = os.environ.get("MPD_HOST", "127.0.0.1")
MPD_PORT = int(os.environ.get("MPD_PORT", "6600"))
PLAYLISTS_DIR = Path(os.environ.get("TOUNE_PLAYLISTS_DIR", "/mnt/libraries/playlists"))
MUSIC_ROOT = Path(os.environ.get("TOUNE_MUSIC_ROOT", "/mnt/libraries/music"))
MEDIA_ROOT = Path(os.environ.get("TOUNE_MEDIA_ROOT", "/mnt/media"))
LIB_LINK_ROOT = Path(os.environ.get("TOUNE_LIBRARY_LINK_ROOT", str(MUSIC_ROOT)))
DOCS_ROOT = Path(os.environ.get("TOUNE_DOCS_ROOT", "/mnt/libraries/docs"))
DB_PATH = Path(os.environ.get("TOUNE_DB_PATH", "/srv/toune/data/toune.db"))
CACHE_DIR = Path(os.environ.get("TOUNE_CACHE_DIR", "/srv/toune/data/cache"))
STATE_DIR = Path(os.environ.get("TOUNE_STATE_DIR", "/srv/toune/state"))
QUEUE_DIR = STATE_DIR / "queue"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY", "")
DISCOGS_TOKEN = os.environ.get("DISCOGS_TOKEN", "")
GOOGLE_CSE_API_KEY = os.environ.get("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_CX = os.environ.get("GOOGLE_CSE_CX", "")
PHOTO_SOURCES_FILE = DOCS_ROOT / "Photos d'artiste" / "_sources.json"
SNAPCAST_RPC_URL = os.environ.get("SNAPCAST_RPC_URL", "http://127.0.0.1:1780/jsonrpc")
SNAPCAST_STATE_FILE = Path(os.environ.get("SNAPCAST_STATE_FILE", "/srv/toune/data/snapcast.json"))
RADIO_BROWSER_URL = os.environ.get("RADIO_BROWSER_URL", "https://de1.api.radio-browser.info")
AIRPLAY_ART_DIR = Path(os.environ.get("TOUNE_AIRPLAY_ART_DIR", "/tmp/shairport-sync/.cache/coverart"))
AIRPLAY_DBUS_NAME = os.environ.get("TOUNE_AIRPLAY_DBUS_NAME", "org.mpris.MediaPlayer2.ShairportSync")
AIRPLAY_DBUS_PATH = os.environ.get("TOUNE_AIRPLAY_DBUS_PATH", "/org/mpris/MediaPlayer2")
AIRPLAY_PULSE_SERVER = os.environ.get("TOUNE_AIRPLAY_PULSE_SERVER", "unix:/var/run/pulse/native")
AIRPLAY_SNAPCLIENT_CONF = Path(os.environ.get("TOUNE_AIRPLAY_SNAPCLIENT_CONF", "/etc/default/snapclient-airplay"))
AIRPLAY_SNAPCLIENT_SERVICE = os.environ.get("TOUNE_AIRPLAY_SNAPCLIENT_SERVICE", "snapclient-airplay")
BT_PULSE_SERVER = os.environ.get("TOUNE_BT_PULSE_SERVER", "unix:/var/run/pulse/native")
BT_SNAPCLIENT_CONF = Path(os.environ.get("TOUNE_BT_SNAPCLIENT_CONF", "/etc/default/snapclient-bluetooth"))
BT_SNAPCLIENT_SERVICE = os.environ.get("TOUNE_BT_SNAPCLIENT_SERVICE", "snapclient-bluetooth")
PLAYLIST_PREFIXES = [
    "/mnt/libraries/music/",
    "/mnt/media/wd/Musique/",
    "/mnt/librairies/music/",  # typo seen in imported playlists
]

SCAN_STATE = {
    "running": False,
    "phase": "idle",
    "total": 0,
    "done": 0,
    "added": 0,
    "updated": 0,
    "removed": 0,
    "errors": 0,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "log": [],
}

DOCS_STATE = {
    "running": False,
    "phase": "idle",
    "total_artists": 0,
    "done_artists": 0,
    "total_albums": 0,
    "done_albums": 0,
    "errors": 0,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "log": [],
}

app = Flask(__name__)
CORS(app)


@contextmanager
def mpd_client():
    c = MPDClient()
    c.timeout = 10
    c.idletimeout = None
    try:
        c.connect(MPD_HOST, MPD_PORT)
        yield c
    finally:
        try:
            c.close()
            c.disconnect()
        except Exception:
            pass


def ok(data: Any = None, **extra):
    payload = {"ok": True, "data": data}
    payload.update(extra)
    return jsonify(payload)


def err(message: str, code: int = 400, **extra):
    payload = {"ok": False, "error": message}
    payload.update(extra)
    return jsonify(payload), code


def _db_connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: Dict[str, str]):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for col, coltype in columns.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")


def _init_db():
    schema = """
    CREATE TABLE IF NOT EXISTS track (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      albumartist TEXT,
      track_no INTEGER,
      disc_no INTEGER,
      duration REAL,
      genre TEXT,
      year INTEGER,
      mtime INTEGER
    );
    CREATE TABLE IF NOT EXISTS favourite (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      title TEXT,
      subtitle TEXT,
      artist TEXT,
      album TEXT,
      path TEXT,
      playlist TEXT,
      created_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS track_fts
    USING fts5(title, artist, album, path, content='track', content_rowid='id');
    CREATE TRIGGER IF NOT EXISTS track_ai AFTER INSERT ON track BEGIN
      INSERT INTO track_fts(rowid, title, artist, album, path)
      VALUES (new.id, new.title, new.artist, new.album, new.path);
    END;
    CREATE TRIGGER IF NOT EXISTS track_ad AFTER DELETE ON track BEGIN
      INSERT INTO track_fts(track_fts, rowid, title, artist, album, path)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.path);
    END;
    CREATE TRIGGER IF NOT EXISTS track_au AFTER UPDATE ON track BEGIN
      INSERT INTO track_fts(track_fts, rowid, title, artist, album, path)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.path);
      INSERT INTO track_fts(rowid, title, artist, album, path)
      VALUES (new.id, new.title, new.artist, new.album, new.path);
    END;
    """
    with _db_connect() as conn:
        conn.executescript(schema)
        _ensure_columns(conn, "track", {
            "composer": "TEXT",
            "work": "TEXT",
        })
        _ensure_columns(conn, "favourite", {
            "subtitle": "TEXT",
            "artist": "TEXT",
            "album": "TEXT",
            "path": "TEXT",
            "playlist": "TEXT",
            "created_at": "INTEGER",
        })


_init_db()


def _parse_track_no(val: Optional[str]) -> Optional[int]:
    if not val:
        return None
    if isinstance(val, (list, tuple)):
        val = val[0] if val else None
        if not val:
            return None
    try:
        return int(str(val).split("/")[0])
    except Exception:
        return None


def _parse_year(val: Optional[str]) -> Optional[int]:
    if not val:
        return None
    if isinstance(val, (list, tuple)):
        val = val[0] if val else None
        if not val:
            return None
    try:
        return int(str(val)[:4])
    except Exception:
        return None


def _make_id(*parts: str) -> str:
    raw = "||".join([p or "" for p in parts])
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


def _normalize_tag(val: Any, joiner: str = " / ") -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, (list, tuple)):
        items = [str(v).strip() for v in val if v]
        return joiner.join(items) if items else None
    return str(val).strip() or None


def _split_multi(value: Optional[str]) -> List[str]:
    if not value:
        return []
    parts: List[str] = []
    for chunk in re.split(r"[;/,]", value):
        item = chunk.strip()
        if item:
            parts.append(item)
    return parts


def _tag(item: Dict[str, Any], *keys: str) -> Optional[Any]:
    for k in keys:
        if k in item and item[k] is not None:
            return item[k]
    return None


def _log_event(state: Dict[str, Any], level: str, message: str, **data):
    entry = {
        "ts": int(time.time()),
        "level": level,
        "message": message,
        "data": data or {},
    }
    state.setdefault("log", []).append(entry)
    if len(state["log"]) > 500:
        state["log"] = state["log"][-500:]


def _radio_api_get(path: str, params: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    base = RADIO_BROWSER_URL.rstrip("/")
    url = f"{base}{path}"
    try:
        res = requests.get(url, params=params or {}, timeout=10)
        if res.status_code != 200:
            return None
        return res.json()
    except Exception:
        return None


def _radio_station_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "uuid": item.get("stationuuid") or "",
        "name": item.get("name") or "",
        "url": item.get("url_resolved") or item.get("url") or "",
        "favicon": item.get("favicon") or "",
        "country": item.get("country") or "",
        "state": item.get("state") or "",
        "language": item.get("language") or "",
        "tags": item.get("tags") or "",
        "codec": item.get("codec") or "",
        "bitrate": item.get("bitrate") or 0,
        "homepage": item.get("homepage") or "",
    }


def _normalize_playlist_path(raw: str) -> Tuple[Optional[str], str]:
    if not raw:
        return None, "empty"
    raw = raw.strip().lstrip("\ufeff")
    if raw.startswith("file://"):
        raw = raw[7:]
    raw = raw.replace("\\", "/")
    if raw.startswith("/mnt/librairies/music/"):
        raw = raw.replace("/mnt/librairies/music/", "/mnt/libraries/music/", 1)
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw, "url"
    if raw.startswith("/"):
        for pref in PLAYLIST_PREFIXES:
            if raw.startswith(pref):
                return raw[len(pref):], "absolute"
        return None, "outside"
    return raw, "relative"


def _strip_bom(line: str) -> str:
    return line.lstrip("\ufeff") if line else line


def _atomic_write_file(path: Path, payload: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def _read_state_file() -> Dict[str, Any]:
    p = STATE_DIR / "state.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return {}


def _write_cmd_file(lines: List[str]) -> None:
    if not lines:
        raise ValueError("empty commands")
    payload = "\n".join(lines).rstrip() + "\n"
    _atomic_write_file(STATE_DIR / "cmd.txt", payload)


def _normalize_queue_path(path: str) -> Optional[Path]:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return None
    p = Path(path)
    if p.is_absolute():
        return p
    return MUSIC_ROOT / p


def _write_queue_symlinks(paths: List[str]) -> Dict[str, int]:
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    removed = 0
    for p in QUEUE_DIR.iterdir():
        try:
            if p.is_symlink() or p.is_file():
                p.unlink()
                removed += 1
        except Exception:
            pass
    created = 0
    skipped = 0
    for idx, raw in enumerate(paths, start=1):
        abs_path = _normalize_queue_path(raw)
        if not abs_path or not abs_path.exists():
            skipped += 1
            continue
        name = f"{idx:06d} - {abs_path.name}"
        link = QUEUE_DIR / name
        try:
            link.symlink_to(abs_path)
            created += 1
        except Exception:
            skipped += 1
    return {"created": created, "removed": removed, "skipped": skipped}


def _read_queue_file() -> List[str]:
    p = STATE_DIR / "queue.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8", errors="ignore"))
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass
    return []


def _queue_sync_status() -> Dict[str, Any]:
    state = {
        "queue_len": 0,
        "mpd_len": 0,
        "match": False,
        "diff": 0,
    }
    try:
        queue = _read_queue_file()
        state["queue_len"] = len(queue)
        with mpd_client() as c:
            pl = c.playlistinfo()
        mpd_paths = [item.get("file") for item in pl if item.get("file")]
        state["mpd_len"] = len(mpd_paths)
        state["match"] = queue == mpd_paths
        state["diff"] = abs(len(queue) - len(mpd_paths))
    except Exception:
        pass
    return state


def _write_queue_file(paths: List[str]) -> None:
    payload = json.dumps(paths, ensure_ascii=False)
    _atomic_write_file(STATE_DIR / "queue.json", payload)


def _apply_queue_to_mpd(paths: List[str]) -> None:
    with mpd_client() as c:
        try:
            status = c.status()
        except Exception:
            status = {}
        try:
            current = c.currentsong()
        except Exception:
            current = {}
        cur_file = current.get("file") if isinstance(current, dict) else None
        state = (status.get("state") or "").lower()

        c.clear()
        for p in paths:
            if p:
                c.add(p)

        if not paths:
            return

        if cur_file and cur_file in paths:
            idx = paths.index(cur_file)
        else:
            idx = 0

        if state == "play":
            c.play(idx)
        elif state == "pause":
            c.play(idx)
            c.pause(1)
        elif state == "stop":
            c.stop()
        else:
            c.play(idx)


def _sync_queue_from_mpd(c: MPDClient) -> Dict[str, int]:
    pl = c.playlistinfo()
    paths = [item.get("file") for item in pl if item.get("file")]
    _write_queue_file(paths)
    return _write_queue_symlinks(paths)


def _normalize_text_key(value: str) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'").replace("´", "'")
    text = text.replace("–", "-").replace("—", "-").replace("‐", "-")
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _normalize_title_key(value: str) -> str:
    if not value:
        return ""
    text = _normalize_text_key(value)
    text = re.sub(r"^\d+\s*[-._]\s*", "", text)
    text = re.sub(r"^\d+\s+", "", text)
    text = re.sub(r"\s*\(\d+\)$", "", text)
    return text


def _parse_extinf(line: str) -> Tuple[str, str]:
    if not line.startswith("#EXTINF"):
        return "", ""
    if "," not in line:
        return "", ""
    payload = line.split(",", 1)[1].strip()
    if " - " in payload:
        artist, _, title = payload.partition(" - ")
        return artist.strip(), title.strip()
    return "", payload.strip()


def _add_unique(mapping: Dict[str, Optional[str]], key: str, value: str):
    if not key:
        return
    if key not in mapping:
        mapping[key] = value
        return
    if mapping[key] == value:
        return
    mapping[key] = None


def _build_album_stem_lookup(album_dir: Path) -> Dict[str, Optional[str]]:
    mapping: Dict[str, Optional[str]] = {}
    try:
        for p in album_dir.iterdir():
            if not p.is_file():
                continue
            stem = _normalize_title_key(p.stem)
            if not stem:
                continue
            _add_unique(mapping, stem, str(p))
    except Exception:
        pass
    return mapping


def _build_track_lookup() -> Dict[str, Dict[str, Optional[str]]]:
    with _db_connect() as conn:
        rows = conn.execute("SELECT path, artist, title FROM track").fetchall()
    artist_title: Dict[str, Optional[str]] = {}
    title_only: Dict[str, Optional[str]] = {}
    stem_only: Dict[str, Optional[str]] = {}
    for r in rows:
        path = r["path"]
        artist = _normalize_text_key(r["artist"] or "")
        title = _normalize_title_key(r["title"] or "")
        if artist and title:
            _add_unique(artist_title, f"{artist}||{title}", path)
        if title:
            _add_unique(title_only, title, path)
        stem = _normalize_title_key(Path(path).stem)
        if stem:
            _add_unique(stem_only, stem, path)
    return {
        "artist_title": artist_title,
        "title": title_only,
        "stem": stem_only,
    }


def _import_playlist_content(name: str, content: str) -> Dict[str, Any]:
    if not name.strip():
        raise ValueError("missing playlist name")
    if not content or not content.strip():
        raise ValueError("missing content")
    PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
    p = _playlist_path(name)
    lines = content.splitlines()
    out: List[str] = []
    if not lines or not lines[0].strip().startswith("#EXTM3U"):
        out.append("#EXTM3U")
    total_tracks = 0
    normalized = 0
    skipped = 0
    remapped_meta = 0
    remapped_title = 0
    remapped_stem = 0
    last_extinf_artist = ""
    last_extinf_title = ""
    lookup: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    album_cache: Dict[str, Dict[str, Optional[str]]] = {}
    for ln in lines:
        ln = _strip_bom(ln.rstrip("\n"))
        if not ln:
            continue
        if ln.startswith("#"):
            artist, title = _parse_extinf(ln)
            if artist or title:
                last_extinf_artist = artist
                last_extinf_title = title
            out.append(ln)
            continue
        total_tracks += 1
        mapped, reason = _normalize_playlist_path(ln)
        if not mapped:
            out.append(ln)
            skipped += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        if mapped.startswith("http://") or mapped.startswith("https://"):
            out.append(mapped)
            normalized += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        abs_path = MUSIC_ROOT / mapped
        if abs_path.exists():
            out.append(mapped)
            normalized += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        album_dir = abs_path.parent
        if album_dir.exists():
            cache_key = str(album_dir)
            if cache_key not in album_cache:
                album_cache[cache_key] = _build_album_stem_lookup(album_dir)
            album_map = album_cache[cache_key]
            title_key = _normalize_title_key(last_extinf_title) if last_extinf_title else ""
            if title_key:
                candidate = album_map.get(title_key)
                if candidate:
                    rel = str(Path(candidate).relative_to(MUSIC_ROOT))
                    out.append(rel)
                    remapped_meta += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
            stem_key = _normalize_title_key(Path(mapped).stem)
            if stem_key:
                candidate = album_map.get(stem_key)
                if candidate:
                    rel = str(Path(candidate).relative_to(MUSIC_ROOT))
                    out.append(rel)
                    remapped_stem += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
        if last_extinf_artist or last_extinf_title:
            if lookup is None:
                lookup = _build_track_lookup()
            artist_key = _normalize_text_key(last_extinf_artist)
            title_key = _normalize_title_key(last_extinf_title)
            candidate: Optional[str] = None
            if artist_key and title_key:
                candidate = lookup["artist_title"].get(f"{artist_key}||{title_key}")
                if candidate:
                    out.append(candidate)
                    remapped_meta += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
            if title_key:
                candidate = lookup["title"].get(title_key)
                if candidate:
                    out.append(candidate)
                    remapped_title += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
        stem_key = _normalize_title_key(Path(mapped).stem)
        if stem_key:
            if lookup is None:
                lookup = _build_track_lookup()
            candidate = lookup["stem"].get(stem_key)
            if candidate:
                out.append(candidate)
                remapped_stem += 1
                last_extinf_artist = ""
                last_extinf_title = ""
                continue
        out.append(mapped)
        skipped += 1
        last_extinf_artist = ""
        last_extinf_title = ""
    p.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
    return {
        "name": p.name,
        "tracks_in_file": total_tracks,
        "normalized": normalized,
        "remapped_by_meta": remapped_meta,
        "remapped_by_title": remapped_title,
        "remapped_by_filename": remapped_stem,
        "skipped": skipped,
    }


def _repair_playlist_lines(lines: List[str]) -> Tuple[List[str], Dict[str, Any]]:
    out: List[str] = []
    total_tracks = 0
    unchanged = 0
    updated = 0
    normalized = 0
    remapped_meta = 0
    remapped_title = 0
    remapped_stem = 0
    skipped = 0
    last_extinf_artist = ""
    last_extinf_title = ""
    lookup: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    album_cache: Dict[str, Dict[str, Optional[str]]] = {}
    for ln in lines:
        raw = _strip_bom(ln.rstrip("\n"))
        if not raw:
            continue
        if raw.startswith("#"):
            artist, title = _parse_extinf(raw)
            if artist or title:
                last_extinf_artist = artist
                last_extinf_title = title
            out.append(raw)
            continue
        total_tracks += 1
        mapped, _ = _normalize_playlist_path(raw)
        if not mapped:
            out.append(raw)
            skipped += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        if mapped.startswith("http://") or mapped.startswith("https://"):
            out.append(mapped)
            normalized += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        abs_path = MUSIC_ROOT / mapped
        if abs_path.exists():
            out.append(mapped)
            normalized += 1
            if mapped != raw:
                updated += 1
            else:
                unchanged += 1
            last_extinf_artist = ""
            last_extinf_title = ""
            continue
        album_dir = abs_path.parent
        if album_dir.exists():
            cache_key = str(album_dir)
            if cache_key not in album_cache:
                album_cache[cache_key] = _build_album_stem_lookup(album_dir)
            album_map = album_cache[cache_key]
            title_key = _normalize_title_key(last_extinf_title) if last_extinf_title else ""
            if title_key:
                candidate = album_map.get(title_key)
                if candidate:
                    rel = str(Path(candidate).relative_to(MUSIC_ROOT))
                    out.append(rel)
                    updated += 1
                    remapped_meta += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
            stem_key = _normalize_title_key(Path(mapped).stem)
            if stem_key:
                candidate = album_map.get(stem_key)
                if candidate:
                    rel = str(Path(candidate).relative_to(MUSIC_ROOT))
                    out.append(rel)
                    updated += 1
                    remapped_stem += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
        if last_extinf_artist or last_extinf_title:
            if lookup is None:
                lookup = _build_track_lookup()
            artist_key = _normalize_text_key(last_extinf_artist)
            title_key = _normalize_title_key(last_extinf_title)
            candidate: Optional[str] = None
            if artist_key and title_key:
                candidate = lookup["artist_title"].get(f"{artist_key}||{title_key}")
                if candidate:
                    out.append(candidate)
                    updated += 1
                    remapped_meta += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
            if title_key:
                candidate = lookup["title"].get(title_key)
                if candidate:
                    out.append(candidate)
                    updated += 1
                    remapped_title += 1
                    last_extinf_artist = ""
                    last_extinf_title = ""
                    continue
        stem_key = _normalize_title_key(Path(mapped).stem)
        if stem_key:
            if lookup is None:
                lookup = _build_track_lookup()
            candidate = lookup["stem"].get(stem_key)
            if candidate:
                out.append(candidate)
                updated += 1
                remapped_stem += 1
                last_extinf_artist = ""
                last_extinf_title = ""
                continue
        out.append(mapped)
        skipped += 1
        last_extinf_artist = ""
        last_extinf_title = ""
    stats = {
        "tracks_in_file": total_tracks,
        "normalized": normalized,
        "updated": updated,
        "unchanged": unchanged,
        "remapped_by_meta": remapped_meta,
        "remapped_by_title": remapped_title,
        "remapped_by_filename": remapped_stem,
        "skipped": skipped,
    }
    return out, stats

def _playlist_entry_info(raw_path: str) -> Dict[str, Any]:
    mapped, reason = _normalize_playlist_path(raw_path)
    if not mapped:
        return {
            "path": raw_path,
            "raw": raw_path,
            "available": False,
            "reason": "chemin hors bibliothèque",
        }
    if mapped.startswith("http://") or mapped.startswith("https://"):
        return {
            "path": mapped,
            "raw": raw_path,
            "available": True,
            "reason": None,
        }
    abs_path = MUSIC_ROOT / mapped
    if not abs_path.exists():
        return {
            "path": mapped,
            "raw": raw_path,
            "available": False,
            "reason": "fichier manquant",
        }
    return {
        "path": mapped,
        "raw": raw_path,
        "available": True,
        "reason": None,
    }


def _snapcast_rpc(method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = {"id": 1, "jsonrpc": "2.0", "method": method}
    if params:
        payload["params"] = params
    res = requests.post(SNAPCAST_RPC_URL, json=payload, timeout=3)
    res.raise_for_status()
    body = res.json()
    if "error" in body:
        raise RuntimeError(body["error"])
    return body.get("result", {})


def _snapcast_clients() -> Tuple[List[str], Dict[str, Any]]:
    result = _snapcast_rpc("Server.GetStatus")
    server = result.get("server", {})
    ids: List[str] = []
    clients: Dict[str, Any] = {}
    for group in server.get("groups", []) or []:
        for c in group.get("clients", []) or []:
            cid = c.get("id")
            if not cid:
                continue
            if cid not in ids:
                ids.append(cid)
            clients[cid] = c
    if not ids:
        ids = list(clients.keys())
    return ids, clients


def _snapcast_status() -> Dict[str, Any]:
    result = _snapcast_rpc("Server.GetStatus")
    server = result.get("server", {})
    groups = []
    all_clients: Dict[str, Any] = {}
    for group in server.get("groups", []) or []:
        clients = []
        for c in group.get("clients", []) or []:
            cfg = c.get("config") or {}
            host = c.get("host") or {}
            name = (cfg.get("name") or host.get("name") or c.get("id") or "").strip()
            client = {
                "id": c.get("id"),
                "name": name,
                "connected": bool(c.get("connected")),
                "latency": cfg.get("latency"),
                "volume": (cfg.get("volume") or {}).get("percent"),
                "muted": (cfg.get("volume") or {}).get("muted"),
                "host": {
                    "name": host.get("name"),
                    "ip": host.get("ip"),
                    "os": host.get("os"),
                    "arch": host.get("arch"),
                    "mac": host.get("mac"),
                },
                "last_seen": c.get("lastSeen"),
            }
            clients.append(client)
            if client.get("id"):
                all_clients[client["id"]] = client
        groups.append({
            "id": group.get("id"),
            "name": group.get("name") or "Groupe",
            "stream_id": group.get("stream_id"),
            "clients": clients,
        })
    streams = result.get("server", {}).get("streams", []) or []
    return {"groups": groups, "clients": list(all_clients.values()), "streams": streams}


def _service_status(name: str) -> Dict[str, Any]:
    status = {"name": name, "installed": False, "active": False, "enabled": False}
    try:
        res = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True, timeout=2)
        out = (res.stdout or "").strip()
        if out == "unknown":
            return status
        status["installed"] = True
        status["active"] = out == "active"
    except Exception:
        return status
    try:
        res = subprocess.run(["systemctl", "is-enabled", name], capture_output=True, text=True, timeout=2)
        status["enabled"] = (res.stdout or "").strip() == "enabled"
    except Exception:
        pass
    return status


def _service_action(name: str, action: str) -> Dict[str, Any]:
    if action not in ("start", "stop", "restart"):
        raise ValueError("invalid action")
    status = _service_status(name)
    if not status.get("installed"):
        raise FileNotFoundError("service not installed")
    subprocess.run(["systemctl", action, name], check=True)
    return _service_status(name)


def _snapcast_load_state() -> Dict[str, Any]:
    try:
        if SNAPCAST_STATE_FILE.exists():
            return json.loads(SNAPCAST_STATE_FILE.read_text())
    except Exception:
        pass
    return {}


def _read_cmd_logs(limit: int = 200) -> List[Dict[str, Any]]:
    p = STATE_DIR / "cmd.log"
    if not p.exists():
        return []
    try:
        lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
        tail = lines[-limit:] if limit else lines
        out = []
        for ln in tail:
            try:
                out.append(json.loads(ln))
            except Exception:
                out.append({"raw": ln})
        return out
    except Exception:
        return []


def _library_roots_state_path() -> Path:
    return STATE_DIR / "library_roots.json"


def _detect_library_roots(subdir: Optional[str] = None) -> List[Dict[str, str]]:
    roots: List[Dict[str, str]] = []
    if not MEDIA_ROOT.exists():
        return roots
    for mount in sorted([p for p in MEDIA_ROOT.iterdir() if p.is_dir()]):
        candidates = []
        if subdir:
            candidates.append(mount / subdir)
        candidates += [
            mount / "Musique",
            mount / "music",
            mount / "Music",
        ]
        picked = next((c for c in candidates if c.exists() and c.is_dir()), None)
        if picked:
            roots.append({"name": mount.name, "path": str(picked)})
    return roots


def _load_library_roots_state() -> Dict[str, Any]:
    p = _library_roots_state_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return {}


def _save_library_roots_state(data: Dict[str, Any]) -> None:
    _atomic_write_file(_library_roots_state_path(), json.dumps(data, ensure_ascii=False))


def _sync_library_links(dry: bool = False, subdir: Optional[str] = None) -> Dict[str, Any]:
    detected = _detect_library_roots(subdir=subdir)
    state = _load_library_roots_state()
    prev_links = {item["link"]: item for item in state.get("links", []) if isinstance(item, dict) and item.get("link")}
    actions = {"created": 0, "updated": 0, "removed": 0, "kept": 0}
    detail = {"created": [], "updated": [], "removed": [], "kept": []}
    links: List[Dict[str, str]] = []

    LIB_LINK_ROOT.mkdir(parents=True, exist_ok=True)

    for root in detected:
        name = root["name"]
        path = root["path"]
        link = str(LIB_LINK_ROOT / name)
        links.append({"name": name, "path": path, "link": link})
        if os.path.islink(link) or Path(link).exists():
            if os.path.islink(link) and os.readlink(link) == path:
                actions["kept"] += 1
                detail["kept"].append({"link": link, "path": path})
                continue
            actions["updated"] += 1
            detail["updated"].append({"link": link, "path": path})
            if not dry:
                try:
                    Path(link).unlink()
                except Exception:
                    pass
        else:
            actions["created"] += 1
            detail["created"].append({"link": link, "path": path})
        if not dry:
            try:
                Path(link).symlink_to(path)
            except Exception:
                pass

    for link, item in prev_links.items():
        if any(l["link"] == link for l in links):
            continue
        if os.path.islink(link):
            actions["removed"] += 1
            detail["removed"].append({"link": link, "path": item.get("path") or ""})
            if not dry:
                try:
                    Path(link).unlink()
                except Exception:
                    pass

    if not dry:
        _save_library_roots_state({"links": links})

    return {"roots": links, "actions": actions, "detail": detail, "subdir": subdir or ""}


def _snapcast_save_state(data: Dict[str, Any]) -> None:
    try:
        SNAPCAST_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        SNAPCAST_STATE_FILE.write_text(json.dumps(data, indent=2))
    except Exception:
        pass


def _safe_name(name: str) -> str:
    return name.replace("/", " - ").replace("\\", " - ").strip()


def _simplify_artist_name(name: str) -> str:
    lowered = name.lower()
    for token in [" feat.", " featuring ", " ft.", " & ", " / ", " x "]:
        if token in lowered:
            return name.split(token, 1)[0].strip()
    return name


def _playlist_path(name: str) -> Path:
    if not name.endswith(".m3u"):
        name = f"{name}.m3u"
    return PLAYLISTS_DIR / name


def _serve_image(path: Path, size: Optional[int] = None):
    if not path.exists():
        return err("image not found", 404)
    if not size:
        resp = make_response(send_file(path))
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.md5(str(path).encode("utf-8")).hexdigest()[:10]
    cache_name = f"{path.stem}_{key}_{size}.jpg"
    cached = CACHE_DIR / cache_name
    if not cached.exists() or cached.stat().st_mtime < path.stat().st_mtime:
        with Image.open(path) as img:
            img = img.convert("RGB")
            img.thumbnail((size, size))
            img.save(cached, "JPEG", quality=85, optimize=True)
    resp = make_response(send_file(cached, mimetype="image/jpeg"))
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


def _scan_library_worker():
    SCAN_STATE.update({
        "running": True,
        "phase": "mpd_update",
        "total": 0,
        "done": 0,
        "added": 0,
        "updated": 0,
        "removed": 0,
        "errors": 0,
        "started_at": time.time(),
        "finished_at": None,
        "last_error": None,
    })
    SCAN_STATE["log"] = []
    _log_event(SCAN_STATE, "info", "Scan démarré")
    try:
        with mpd_client() as c:
            try:
                c.update()
                _log_event(SCAN_STATE, "info", "MPD update lancé")
            except Exception:
                pass
            _wait_mpd_update(c, timeout_s=300)
            SCAN_STATE["phase"] = "indexing"
            items = c.listallinfo()
        files = [i for i in items if "file" in i]
        SCAN_STATE["total"] = len(files)

        with _db_connect() as conn:
            cur = conn.execute("SELECT path, mtime FROM track")
            existing = {row["path"]: row["mtime"] for row in cur.fetchall()}
            seen = set()

            for item in files:
                rel_path = item.get("file")
                if not rel_path:
                    continue
                seen.add(rel_path)
                full_path = MUSIC_ROOT / rel_path
                if not full_path.exists():
                    continue
                try:
                    mtime = int(full_path.stat().st_mtime)
                except Exception:
                    mtime = None

                if mtime is not None and existing.get(rel_path) == mtime:
                    SCAN_STATE["done"] += 1
                    continue

                title = _normalize_tag(_tag(item, "title", "Title"))
                artist = _normalize_tag(_tag(item, "artist", "Artist"))
                album = _normalize_tag(_tag(item, "album", "Album"))
                albumartist = _normalize_tag(_tag(item, "albumartist", "AlbumArtist"))
                track_no = _parse_track_no(_tag(item, "track", "Track"))
                disc_no = _parse_track_no(_tag(item, "disc", "Disc"))
                duration = float(_tag(item, "time", "Time") or 0) or None
                genre = _normalize_tag(_tag(item, "genre", "Genre"), joiner="; ")
                year = _parse_year(_tag(item, "date", "Date"))
                composer = _normalize_tag(_tag(item, "composer", "Composer"))
                work = _normalize_tag(_tag(item, "work", "Work", "grouping", "Grouping"))

                conn.execute(
                    """
                    INSERT INTO track(path, title, artist, album, albumartist, track_no, disc_no, duration, genre, year, mtime, composer, work)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                      title=excluded.title,
                      artist=excluded.artist,
                      album=excluded.album,
                      albumartist=excluded.albumartist,
                      track_no=excluded.track_no,
                      disc_no=excluded.disc_no,
                      duration=excluded.duration,
                      genre=excluded.genre,
                      year=excluded.year,
                      mtime=excluded.mtime,
                      composer=excluded.composer,
                      work=excluded.work
                    """,
                    (
                        rel_path,
                        title,
                        artist,
                        album,
                        albumartist,
                        track_no,
                        disc_no,
                        duration,
                        genre,
                        year,
                        mtime,
                        composer,
                        work,
                    ),
                )
                if rel_path in existing:
                    SCAN_STATE["updated"] += 1
                else:
                    SCAN_STATE["added"] += 1
                SCAN_STATE["done"] += 1

            # cleanup removed files
            to_remove = [p for p in existing.keys() if p not in seen]
            if to_remove:
                conn.executemany("DELETE FROM track WHERE path = ?", [(p,) for p in to_remove])
                SCAN_STATE["removed"] = len(to_remove)
        _log_event(SCAN_STATE, "info", "Scan terminé", total=SCAN_STATE["total"], added=SCAN_STATE["added"], updated=SCAN_STATE["updated"], removed=SCAN_STATE["removed"])
    except Exception as e:
        SCAN_STATE["errors"] += 1
        SCAN_STATE["last_error"] = str(e)
        _log_event(SCAN_STATE, "error", "Erreur scan", error=str(e))
    finally:
        SCAN_STATE["running"] = False
        SCAN_STATE["phase"] = "idle"
        SCAN_STATE["finished_at"] = time.time()


@app.get("/api/health")
def health():
    return ok({
        "service": "toune-backend",
        "mpd": f"{MPD_HOST}:{MPD_PORT}",
        "db": str(DB_PATH),
        "music_root": str(MUSIC_ROOT),
        "docs_root": str(DOCS_ROOT),
    })


@app.get("/api/mpd/status")
def mpd_status():
    try:
        with mpd_client() as c:
            status = c.status()
            cur = c.currentsong()
            return ok({"status": status, "current": cur})
    except (MPDConnectionError, OSError) as e:
        return err("MPD unreachable", 503, detail=str(e))
    except CommandError as e:
        return err("MPD command error", 500, detail=str(e))


@app.post("/api/mpd/play")
def mpd_play():
    pos = request.args.get("pos")
    try:
        with mpd_client() as c:
            if pos is not None:
                c.play(int(pos))
            else:
                c.play()
            return ok()
    except Exception as e:
        return err("play failed", 500, detail=str(e))


@app.post("/api/mpd/pause")
def mpd_pause():
    val = request.args.get("value", "1")
    try:
        with mpd_client() as c:
            c.pause(1 if val not in ("0", "false", "False") else 0)
            return ok()
    except Exception as e:
        return err("pause failed", 500, detail=str(e))


@app.post("/api/mpd/seek")
def mpd_seek():
    pos = request.args.get("pos")
    if pos is None:
        return err("missing ?pos=")
    try:
        with mpd_client() as c:
            c.seekcur(float(pos))
            return ok()
    except Exception as e:
        return err("seek failed", 500, detail=str(e))


@app.post("/api/mpd/volume")
def mpd_volume():
    val = request.args.get("value")
    if val is None:
        return err("missing ?value=")
    try:
        vol = max(0, min(100, int(float(val))))
        with mpd_client() as c:
            c.setvol(vol)
            return ok()
    except Exception as e:
        return err("volume failed", 500, detail=str(e))


@app.post("/api/mpd/random")
def mpd_random():
    val = request.args.get("value", "0")
    try:
        with mpd_client() as c:
            c.random(1 if val not in ("0", "false", "False") else 0)
            return ok()
    except Exception as e:
        return err("random failed", 500, detail=str(e))


@app.post("/api/mpd/repeat")
def mpd_repeat():
    mode = (request.args.get("mode") or "").lower()
    if not mode:
        return err("missing ?mode=")
    if mode in ("off", "0", "false"):
        repeat = 0
        single = 0
    elif mode in ("all", "1", "true"):
        repeat = 1
        single = 0
    elif mode in ("one", "single"):
        repeat = 1
        single = 1
    else:
        return err("invalid mode (off|all|one)")
    try:
        with mpd_client() as c:
            c.repeat(repeat)
            c.single(single)
            return ok()
    except Exception as e:
        return err("repeat failed", 500, detail=str(e))


@app.post("/api/mpd/stop")
def mpd_stop():
    try:
        with mpd_client() as c:
            c.stop()
            return ok()
    except Exception as e:
        return err("stop failed", 500, detail=str(e))


@app.post("/api/mpd/next")
def mpd_next():
    try:
        with mpd_client() as c:
            c.next()
            return ok()
    except Exception as e:
        return err("next failed", 500, detail=str(e))


@app.post("/api/mpd/prev")
def mpd_prev():
    try:
        with mpd_client() as c:
            c.previous()
            return ok()
    except Exception as e:
        return err("prev failed", 500, detail=str(e))


@app.post("/api/mpd/clear")
def mpd_clear():
    try:
        with mpd_client() as c:
            c.clear()
            _write_queue_file([])
            _write_queue_symlinks([])
            return ok()
    except Exception as e:
        return err("clear failed", 500, detail=str(e))


@app.post("/api/mpd/move")
def mpd_move():
    frm = request.args.get("from")
    to = request.args.get("to")
    if frm is None or to is None:
        return err("missing ?from=&to=")
    try:
        with mpd_client() as c:
            c.move(int(frm), int(to))
            stats = _sync_queue_from_mpd(c)
            return ok()
    except Exception as e:
        return err("move failed", 500, detail=str(e))


@app.post("/api/mpd/delete")
def mpd_delete():
    pos = request.args.get("pos")
    if pos is None:
        return err("missing ?pos=")
    try:
        with mpd_client() as c:
            c.delete(int(pos))
            stats = _sync_queue_from_mpd(c)
            return ok()
    except Exception as e:
        return err("delete failed", 500, detail=str(e))


@app.post("/api/mpd/add")
def mpd_add():
    # expect ?path=Artist/Album/Track.flac (path MPD relatif au music_directory)
    p = request.args.get("path", "")
    if not p:
        return err("missing ?path=")
    try:
        with mpd_client() as c:
            c.add(p)
            stats = _sync_queue_from_mpd(c)
            return ok()
    except Exception as e:
        return err("add failed", 500, detail=str(e))


@app.post("/api/mpd/add-many")
def mpd_add_many():
    data = request.get_json(silent=True) or {}
    paths = data.get("paths") or []
    clear = bool(data.get("clear"))
    play = bool(data.get("play"))
    if not paths:
        return err("missing paths")
    try:
        with mpd_client() as c:
            if clear:
                c.clear()
            for p in paths:
                if p:
                    c.add(p)
            if play:
                c.play()
            stats = _sync_queue_from_mpd(c)
        return ok({"added": len(paths), "cleared": clear, "played": play})
    except Exception as e:
        return err("add-many failed", 500, detail=str(e))


@app.get("/api/mpd/queue")
def mpd_queue():
    try:
        with mpd_client() as c:
            pl = c.playlistinfo()
            return ok(pl)
    except Exception as e:
        return err("queue failed", 500, detail=str(e))


@app.get("/api/state")
def state_read():
    with_queue = (request.args.get("with_queue") or "").strip().lower() in ("1", "true", "yes")
    with_status = (request.args.get("with_status") or "").strip().lower() in ("1", "true", "yes")
    payload: Dict[str, Any] = {"state": _read_state_file()}
    if with_queue:
        payload["queue"] = _read_queue_file()
    if with_status:
        payload["queue_status"] = _queue_sync_status()
    return ok(payload)


@app.post("/api/cmd")
def cmd_write():
    data = request.get_json(silent=True) or {}
    cmds = data.get("cmds") or []
    cmd = (data.get("cmd") or "").strip()
    if cmd:
        cmds = [cmd]
    if not cmds:
        return err("missing cmd")
    try:
        lines = [str(c).strip() for c in cmds if str(c).strip()]
        if not lines:
            return err("missing cmd")
        _write_cmd_file(lines)
        return ok({"written": len(lines)})
    except Exception as e:
        return err("write cmd failed", 500, detail=str(e))


@app.get("/api/queue")
def queue_get():
    return ok(_read_queue_file())


@app.post("/api/queue")
def queue_set():
    data = request.get_json(silent=True) or {}
    paths = data.get("paths") or []
    apply = bool(data.get("apply"))
    if not isinstance(paths, list):
        return err("paths must be a list")
    try:
        path_list = [str(p) for p in paths]
        if apply:
            _apply_queue_to_mpd(path_list)
            with mpd_client() as c:
                stats = _sync_queue_from_mpd(c)
        else:
            _write_queue_file(path_list)
            stats = _write_queue_symlinks(path_list)
        return ok({"count": len(path_list), "applied": apply, **stats})
    except Exception as e:
        return err("queue update failed", 500, detail=str(e))


@app.post("/api/queue/sync")
def queue_sync():
    try:
        with mpd_client() as c:
            stats = _sync_queue_from_mpd(c)
            pl = c.playlistinfo()
        return ok({"count": len(pl), **stats, "sync": _queue_sync_status()})
    except Exception as e:
        return err("queue sync failed", 500, detail=str(e))


@app.get("/api/queue/status")
def queue_status():
    return ok(_queue_sync_status())


@app.post("/api/queue/persist")
def queue_persist():
    try:
        with mpd_client() as c:
            stats = _sync_queue_from_mpd(c)
            pl = c.playlistinfo()
        return ok({"count": len(pl), **stats})
    except Exception as e:
        return err("queue persist failed", 500, detail=str(e))


@app.get("/api/cmd/status")
def cmd_status():
    state = _read_state_file()
    payload = {
        "last_cmd": state.get("last_cmd", ""),
        "last_cmd_line": state.get("last_cmd_line", ""),
        "last_cmd_ts": state.get("last_cmd_ts", 0),
        "last_error": state.get("last_error", ""),
    }
    return ok(payload)


@app.get("/api/cmd/logs")
def cmd_logs():
    try:
        limit = int(request.args.get("limit", "200"))
    except Exception:
        limit = 200
    limit = max(1, min(limit, 1000))
    return ok(_read_cmd_logs(limit))


@app.get("/api/services/status")
def services_status():
    names = request.args.get("names") or ""
    if names:
        wanted = [n.strip() for n in names.split(",") if n.strip()]
    else:
        wanted = ["shairport-sync.service", "librespot.service", "raspotify.service", "snapclient.service"]
    data = [_service_status(n) for n in wanted]
    return ok(data)


@app.post("/api/services/action")
def services_action():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    action = (data.get("action") or "").strip().lower()
    if not name or not action:
        return err("missing name/action")
    try:
        status = _service_action(name, action)
        return ok(status)
    except FileNotFoundError:
        return err("service not installed", 404)
    except ValueError:
        return err("invalid action", 400)
    except Exception as e:
        return err("service action failed", 500, detail=str(e))


@app.get("/api/library/roots")
def library_roots():
    subdir = (request.args.get("subdir") or "").strip() or None
    detected = _detect_library_roots(subdir=subdir)
    state = _load_library_roots_state()
    links = {item["name"]: item for item in state.get("links", []) if isinstance(item, dict)}
    out = []
    for root in detected:
        name = root["name"]
        entry = {"name": name, "path": root["path"], "linked": False, "link": ""}
        if name in links:
            entry["linked"] = True
            entry["link"] = links[name].get("link") or ""
        out.append(entry)
    return ok({"detected": out, "link_root": str(LIB_LINK_ROOT), "subdir": subdir or ""})


@app.post("/api/library/roots/sync")
def library_roots_sync():
    data = request.get_json(silent=True) or {}
    dry = bool(data.get("dry"))
    subdir = (data.get("subdir") or "").strip() or None
    try:
        result = _sync_library_links(dry=dry, subdir=subdir)
        result["dry"] = dry
        return ok(result)
    except Exception as e:
        return err("roots sync failed", 500, detail=str(e))


@app.get("/api/radio/tags")
def radio_tags():
    limit = int(request.args.get("limit", "50"))
    data = _radio_api_get("/json/tags", {
        "order": "stationcount",
        "reverse": "true",
        "limit": max(1, min(limit, 200)),
    })
    if data is None:
        return err("radio tags unavailable", 502)
    tags = [{"name": r.get("name") or "", "count": r.get("stationcount") or 0} for r in data]
    return ok(tags)


@app.get("/api/radio/countries")
def radio_countries():
    limit = int(request.args.get("limit", "80"))
    data = _radio_api_get("/json/countries", {
        "order": "stationcount",
        "reverse": "true",
        "limit": max(1, min(limit, 250)),
    })
    if data is None:
        return err("radio countries unavailable", 502)
    countries = [{
        "name": r.get("name") or "",
        "code": r.get("iso_3166_1") or "",
        "count": r.get("stationcount") or 0,
    } for r in data]
    return ok(countries)


@app.get("/api/radio/top")
def radio_top():
    limit = int(request.args.get("limit", "50"))
    by = (request.args.get("by") or "click").lower()
    if by not in ("click", "vote"):
        return err("invalid ?by= (click|vote)")
    path = "/json/stations/topclick" if by == "click" else "/json/stations/topvote"
    data = _radio_api_get(path, {"limit": max(1, min(limit, 200)), "hidebroken": "true"})
    if data is None:
        return err("radio top unavailable", 502)
    return ok([_radio_station_payload(r) for r in data])


@app.get("/api/radio/search")
def radio_search():
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    country = (request.args.get("country") or "").strip()
    city = (request.args.get("city") or "").strip()
    state = (request.args.get("state") or "").strip()
    limit = int(request.args.get("limit", "50"))
    if not q and not tag and not country and not city and not state:
        return err("missing ?q= or ?tag= or ?country= or ?city= or ?state=")
    params: Dict[str, Any] = {
        "limit": max(1, min(limit, 200)),
        "hidebroken": "true",
        "order": "clickcount",
        "reverse": "true",
    }
    if q:
        params["name"] = q
    if tag:
        params["tag"] = tag
    if country:
        params["country"] = country
    if city:
        params["city"] = city
    if state:
        params["state"] = state
    data = _radio_api_get("/json/stations/search", params)
    if data is None:
        return err("radio search unavailable", 502)
    return ok([_radio_station_payload(r) for r in data])


@app.post("/api/radio/play")
def radio_play():
    data = request.get_json(silent=True) or {}
    url = data.get("url") or request.args.get("url")
    if not url:
        return err("missing url")
    replace = data.get("replace")
    play = data.get("play")
    replace = True if replace is None else bool(replace)
    play = True if play is None else bool(play)
    try:
        with mpd_client() as c:
            if replace:
                c.clear()
            c.add(url)
            if play:
                c.play()
        return ok({"url": url, "replace": replace, "play": play})
    except Exception as e:
        return err("radio play failed", 500, detail=str(e))


@app.get("/api/library/search")
def library_search():
    # ?q=blind melon&limit=50
    q = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit", "50"))
    if not q:
        return err("missing ?q=")
    tokens = [t for t in q.replace('"', " ").split() if t]
    if not tokens:
        return err("invalid query")
    fts_query = " ".join([f'{t}*' for t in tokens])
    try:
        with _db_connect() as conn:
            cur = conn.execute(
                """
                SELECT track.*
                FROM track_fts
                JOIN track ON track_fts.rowid = track.id
                WHERE track_fts MATCH ?
                LIMIT ?
                """,
                (fts_query, limit),
            )
            rows = [dict(r) for r in cur.fetchall()]
        return ok(rows, count=len(rows))
    except Exception as e:
        return err("search failed", 500, detail=str(e))


@app.get("/api/snapcast/latency")
def snapcast_latency_get():
    try:
        ids, clients = _snapcast_clients()
        latency = None
        for cid in ids:
            cfg = clients.get(cid, {}).get("config") or {}
            if "latency" in cfg:
                latency = cfg["latency"]
                break
        if latency is None:
            latency = _snapcast_load_state().get("latency_ms")
        return ok({"latency_ms": latency, "clients": len(ids)})
    except Exception as e:
        return err("snapcast status failed", 500, detail=str(e))


@app.post("/api/snapcast/latency")
def snapcast_latency_set():
    body = request.get_json(silent=True) or {}
    try:
        latency = int(body.get("latency_ms", 0))
    except Exception:
        return err("invalid latency_ms", 400)
    latency = max(50, min(5000, latency))
    try:
        ids, _ = _snapcast_clients()
        if not ids:
            return err("no snapcast clients connected", 404)
        for cid in ids:
            _snapcast_rpc("Client.SetConfig", {"id": cid, "config": {"latency": latency}})
        _snapcast_save_state({"latency_ms": latency})
        return ok({"latency_ms": latency, "clients": len(ids)})
    except Exception as e:
        return err("snapcast update failed", 500, detail=str(e))


@app.get("/api/snapcast/status")
def snapcast_status():
    try:
        data = _snapcast_status()
        return ok(data)
    except Exception as e:
        return err("snapcast status failed", 500, detail=str(e))


@app.post("/api/snapcast/stream")
def snapcast_stream_set():
    data = request.get_json(silent=True) or {}
    group_id = (data.get("group_id") or "").strip()
    stream_id = (data.get("stream_id") or "").strip()
    if not group_id or not stream_id:
        return err("missing group_id/stream_id")
    try:
        _snapcast_rpc("Group.SetStream", {"id": group_id, "stream_id": stream_id})
        return ok({"group_id": group_id, "stream_id": stream_id})
    except Exception as e:
        return err("snapcast set stream failed", 500, detail=str(e))


@app.post("/api/snapcast/sources/enable")
def snapcast_sources_enable():
    script = Path("/srv/toune/repo/toune-o-matic/scripts/enable-airplay-snapcast.sh")
    if not script.exists():
        return err("enable script not found", 404)
    try:
        res = subprocess.run(
            ["/usr/bin/sudo", "-n", "/bin/sh", str(script)],
            capture_output=True,
            text=True,
            timeout=20,
            env=dict(os.environ, PATH="/usr/sbin:/usr/bin:/sbin:/bin"),
        )
        if res.returncode != 0:
            return err("enable sources failed", 500, detail=(res.stderr or res.stdout).strip())
        return ok({"result": (res.stdout or "").strip()})
    except Exception as e:
        return err("enable sources failed", 500, detail=str(e))


def _busctl_json(args: List[str]) -> Dict[str, Any]:
    res = subprocess.run(
        ["/usr/bin/busctl", "--system", "--json=short"] + args,
        capture_output=True,
        text=True,
        timeout=2,
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "").strip())
    return json.loads(res.stdout or "{}")


def _airplay_get_property(prop: str) -> Dict[str, Any]:
    return _busctl_json(
        [
            "get-property",
            AIRPLAY_DBUS_NAME,
            AIRPLAY_DBUS_PATH,
            "org.mpris.MediaPlayer2.Player",
            prop,
        ]
    )


def _airplay_parse_value(val: Any) -> Optional[str]:
    if not isinstance(val, dict):
        return None
    data = val.get("data")
    if data is None:
        return None
    if val.get("type") == "as" and isinstance(data, list):
        return ", ".join([str(x) for x in data if x is not None])
    return str(data)


def _airplay_art_url(raw_url: Optional[str]) -> str:
    if not raw_url:
        return ""
    if raw_url.startswith("file://"):
        path = Path(urlparse(raw_url).path)
        try:
            path = path.resolve()
        except Exception:
            return ""
        if AIRPLAY_ART_DIR in path.parents and path.is_file():
            return f"/api/airplay/art?name={path.name}"
        return ""
    return raw_url


@app.get("/api/airplay/status")
def airplay_status():
    try:
        status_payload = _airplay_get_property("PlaybackStatus")
        meta_payload = _airplay_get_property("Metadata")
        status = str(status_payload.get("data") or "Stopped")
        raw_meta = meta_payload.get("data") or {}
        title = _airplay_parse_value(raw_meta.get("xesam:title"))
        artist = _airplay_parse_value(raw_meta.get("xesam:artist"))
        album = _airplay_parse_value(raw_meta.get("xesam:album"))
        art_raw = _airplay_parse_value(raw_meta.get("mpris:artUrl"))
        art = _airplay_art_url(art_raw)
        return ok(
            {
                "active": status != "Stopped",
                "status": status,
                "title": title or "",
                "artist": artist or "",
                "album": album or "",
                "art": art,
                "art_raw": art_raw or "",
                "source": "airplay",
            }
        )
    except Exception as e:
        return ok({"active": False, "status": "Unavailable", "error": str(e)})


@app.get("/api/airplay/art")
def airplay_art():
    name = (request.args.get("name") or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name:
        return err("invalid art name", 400)
    path = (AIRPLAY_ART_DIR / name).resolve()
    if AIRPLAY_ART_DIR not in path.parents or not path.exists():
        return err("art not found", 404)
    return send_file(path)


def _pactl(args: List[str]) -> str:
    res = subprocess.run(
        ["/usr/bin/pactl", "-s", AIRPLAY_PULSE_SERVER] + args,
        capture_output=True,
        text=True,
        timeout=3,
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "").strip())
    return res.stdout or ""


def _pactl_bt(args: List[str]) -> str:
    res = subprocess.run(
        ["/usr/bin/pactl", "-s", BT_PULSE_SERVER] + args,
        capture_output=True,
        text=True,
        timeout=3,
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "").strip())
    return res.stdout or ""


def _pactl_sink_descriptions() -> Dict[str, str]:
    desc: Dict[str, str] = {}
    current = None
    try:
        raw = _pactl(["list", "sinks"])
    except Exception:
        return desc
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("Name:"):
            current = s.split(":", 1)[1].strip()
            continue
        if s.startswith("Description:") and current:
            desc[current] = s.split(":", 1)[1].strip()
    return desc


def _pactl_list_sinks() -> List[Dict[str, str]]:
    desc = _pactl_sink_descriptions()
    out: List[Dict[str, str]] = []
    raw = _pactl(["list", "short", "sinks"])
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name = parts[1].strip()
        if not name.startswith("raop_output."):
            continue
        out.append({"name": name, "description": desc.get(name, name)})
    return out


def _pactl_bt_sink_descriptions() -> Dict[str, str]:
    desc: Dict[str, str] = {}
    current = None
    try:
        raw = _pactl_bt(["list", "sinks"])
    except Exception:
        return desc
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("Name:"):
            current = s.split(":", 1)[1].strip()
            continue
        if s.startswith("Description:") and current:
            desc[current] = s.split(":", 1)[1].strip()
    return desc


def _pactl_list_bt_sinks() -> List[Dict[str, str]]:
    desc = _pactl_bt_sink_descriptions()
    out: List[Dict[str, str]] = []
    raw = _pactl_bt(["list", "short", "sinks"])
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name = parts[1].strip()
        if not name.startswith("bluez_sink."):
            continue
        out.append({"name": name, "description": desc.get(name, name)})
    return out


def _read_bt_sink() -> str:
    if not BT_SNAPCLIENT_CONF.exists():
        return ""
    for line in BT_SNAPCLIENT_CONF.read_text().splitlines():
        if line.startswith("PULSE_SINK="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _read_airplay_sink() -> str:
    if not AIRPLAY_SNAPCLIENT_CONF.exists():
        return ""
    for line in AIRPLAY_SNAPCLIENT_CONF.read_text().splitlines():
        if line.startswith("PULSE_SINK="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _service_active(name: str) -> bool:
    res = subprocess.run(
        ["/usr/bin/systemctl", "is-active", name],
        capture_output=True,
        text=True,
        timeout=2,
    )
    return (res.stdout or "").strip() == "active"


@app.get("/api/airplay/targets")
def airplay_targets():
    try:
        sinks = _pactl_list_sinks()
        current = _read_airplay_sink()
        return ok({"sinks": sinks, "current": current, "active": _service_active(AIRPLAY_SNAPCLIENT_SERVICE)})
    except Exception as e:
        return err("airplay targets failed", 500, detail=str(e))


@app.post("/api/airplay/target")
def airplay_target_set():
    data = request.get_json(silent=True) or {}
    sink = (data.get("sink") or "").strip()
    if not sink:
        return err("missing sink")
    script = Path("/srv/toune/repo/toune-o-matic/scripts/set-airplay-target.sh")
    if not script.exists():
        return err("set target script not found", 404)
    try:
        res = subprocess.run(
            ["/usr/bin/sudo", "-n", "/bin/sh", str(script), sink],
            capture_output=True,
            text=True,
            timeout=10,
            env=dict(os.environ, PATH="/usr/sbin:/usr/bin:/sbin:/bin"),
        )
        if res.returncode != 0:
            return err("airplay target update failed", 500, detail=(res.stderr or res.stdout).strip())
        return ok({"sink": sink})
    except Exception as e:
        return err("airplay target update failed", 500, detail=str(e))


@app.post("/api/airplay/send")
def airplay_send_toggle():
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    action = "start" if enabled else "stop"
    try:
        res = subprocess.run(
            ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", action, AIRPLAY_SNAPCLIENT_SERVICE],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode != 0:
            return err("airplay send update failed", 500, detail=(res.stderr or res.stdout).strip())
        return ok({"active": _service_active(AIRPLAY_SNAPCLIENT_SERVICE)})
    except Exception as e:
        return err("airplay send update failed", 500, detail=str(e))


def _btctl(args: List[str], timeout_s: int = 10) -> str:
    res = subprocess.run(
        ["/usr/bin/sudo", "-n", "/usr/bin/bluetoothctl"] + args,
        capture_output=True,
        text=True,
        timeout=timeout_s,
    )
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "").strip())
    return res.stdout or ""


def _bt_ready():
    subprocess.run(
        ["/usr/bin/sudo", "-n", "/usr/sbin/rfkill", "unblock", "bluetooth"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    _btctl(["power", "on"], timeout_s=5)
    try:
        _btctl(["agent", "on"], timeout_s=5)
        _btctl(["default-agent"], timeout_s=5)
    except Exception:
        pass
    try:
        _btctl(["pairable", "on"], timeout_s=5)
        _btctl(["discoverable", "on"], timeout_s=5)
    except Exception:
        pass


def _parse_bt_devices(raw: str) -> List[Dict[str, str]]:
    devices = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("Device "):
            continue
        parts = line.split(" ", 2)
        if len(parts) < 3:
            continue
        devices.append({"mac": parts[1], "name": parts[2]})
    return devices


def _bt_info(mac: str) -> Dict[str, Any]:
    info = {"paired": False, "trusted": False, "connected": False}
    raw = _btctl(["info", mac], timeout_s=5)
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("Paired:"):
            info["paired"] = s.split(":", 1)[1].strip().lower() == "yes"
        elif s.startswith("Trusted:"):
            info["trusted"] = s.split(":", 1)[1].strip().lower() == "yes"
        elif s.startswith("Connected:"):
            info["connected"] = s.split(":", 1)[1].strip().lower() == "yes"
        elif s.startswith("Name:"):
            info["name"] = s.split(":", 1)[1].strip()
    return info


@app.post("/api/bluetooth/scan")
def bluetooth_scan():
    try:
        _bt_ready()
        subprocess.run(
            ["/usr/bin/sudo", "-n", "/usr/bin/bluetoothctl", "--timeout", "8", "scan", "on"],
            capture_output=True,
            text=True,
            timeout=12,
        )
        return ok({"scanned": True})
    except Exception as e:
        return err("bluetooth scan failed", 500, detail=str(e))


@app.get("/api/bluetooth/devices")
def bluetooth_devices():
    try:
        raw = _btctl(["devices"], timeout_s=5)
        devices = _parse_bt_devices(raw)
        out = []
        for d in devices:
            info = _bt_info(d["mac"])
            out.append({
                "mac": d["mac"],
                "name": info.get("name") or d.get("name") or d["mac"],
                "paired": info.get("paired", False),
                "trusted": info.get("trusted", False),
                "connected": info.get("connected", False),
            })
        return ok(out)
    except Exception as e:
        return err("bluetooth devices failed", 500, detail=str(e))


@app.post("/api/bluetooth/connect")
def bluetooth_connect():
    data = request.get_json(silent=True) or {}
    mac = (data.get("mac") or "").strip()
    if not mac:
        return err("missing mac")
    try:
        _bt_ready()
        try:
            _btctl(["scan", "off"], timeout_s=5)
        except Exception:
            pass
        try:
            _btctl(["remove", mac], timeout_s=5)
            time.sleep(1)
        except Exception:
            pass
        _btctl(["pair", mac], timeout_s=15)
        _btctl(["trust", mac], timeout_s=5)
        _btctl(["connect", mac], timeout_s=10)
        info = _bt_info(mac)
        return ok({"mac": mac, **info})
    except Exception as e:
        return err("bluetooth connect failed", 500, detail=str(e))


@app.post("/api/bluetooth/disconnect")
def bluetooth_disconnect():
    data = request.get_json(silent=True) or {}
    mac = (data.get("mac") or "").strip()
    if not mac:
        return err("missing mac")
    try:
        _btctl(["disconnect", mac], timeout_s=8)
        info = _bt_info(mac)
        return ok({"mac": mac, **info})
    except Exception as e:
        return err("bluetooth disconnect failed", 500, detail=str(e))


@app.get("/api/bluetooth/targets")
def bluetooth_targets():
    try:
        sinks = _pactl_list_bt_sinks()
        current = _read_bt_sink()
        return ok({"sinks": sinks, "current": current, "active": _service_active(BT_SNAPCLIENT_SERVICE)})
    except Exception as e:
        return err("bluetooth targets failed", 500, detail=str(e))


@app.post("/api/bluetooth/target")
def bluetooth_target_set():
    data = request.get_json(silent=True) or {}
    sink = (data.get("sink") or "").strip()
    if not sink:
        return err("missing sink")
    script = Path("/srv/toune/repo/toune-o-matic/scripts/set-bluetooth-target.sh")
    if not script.exists():
        return err("set target script not found", 404)
    try:
        res = subprocess.run(
            ["/usr/bin/sudo", "-n", "/bin/sh", str(script), sink],
            capture_output=True,
            text=True,
            timeout=10,
            env=dict(os.environ, PATH="/usr/sbin:/usr/bin:/sbin:/bin"),
        )
        if res.returncode != 0:
            return err("bluetooth target update failed", 500, detail=(res.stderr or res.stdout).strip())
        return ok({"sink": sink})
    except Exception as e:
        return err("bluetooth target update failed", 500, detail=str(e))


@app.post("/api/bluetooth/send")
def bluetooth_send_toggle():
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    action = "start" if enabled else "stop"
    try:
        res = subprocess.run(
            ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", action, BT_SNAPCLIENT_SERVICE],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode != 0:
            return err("bluetooth send update failed", 500, detail=(res.stderr or res.stdout).strip())
        return ok({"active": _service_active(BT_SNAPCLIENT_SERVICE)})
    except Exception as e:
        return err("bluetooth send update failed", 500, detail=str(e))


@app.post("/api/library/queue/random-next")
def library_queue_random_next():
    try:
        with _db_connect() as conn:
            row = conn.execute(
                "SELECT path, title, artist, album FROM track ORDER BY RANDOM() LIMIT 1"
            ).fetchone()
        if not row:
            return err("no tracks available", 404)
        with mpd_client() as c:
            status = c.status()
            song = status.get("song")
            sid = c.addid(row["path"])
            if song is not None:
                try:
                    c.moveid(sid, int(song) + 1)
                except Exception:
                    pass
            else:
                c.play()
        return ok({"path": row["path"], "title": row["title"], "artist": row["artist"], "album": row["album"]})
    except Exception as e:
        return err("random-next failed", 500, detail=str(e))


@app.get("/api/library/summary")
def library_summary():
    try:
        with _db_connect() as conn:
            rows = conn.execute(
                """
                SELECT path, title, artist, album, albumartist, track_no, disc_no, duration, genre, year, mtime, composer, work
                FROM track
                ORDER BY artist, album, track_no
                """
            ).fetchall()
        tracks = [dict(r) for r in rows]
    except Exception as e:
        return err("summary failed", 500, detail=str(e))

    artists_map: Dict[str, Dict[str, Any]] = {}
    albumartists_map: Dict[str, Dict[str, Any]] = {}
    albums_map: Dict[str, Dict[str, Any]] = {}
    genres_map: Dict[str, int] = {}
    years_map: Dict[int, int] = {}
    composers_map: Dict[str, int] = {}
    works_map: Dict[str, int] = {}
    folders_map: Dict[str, int] = {}
    album_mtime: Dict[str, int] = {}

    for t in tracks:
        artist = t.get("artist") or "Artiste inconnu"
        albumartist = t.get("albumartist") or artist
        album = t.get("album") or "Album inconnu"
        year = t.get("year") or 0
        genre = t.get("genre") or ""
        composer = t.get("composer") or ""
        work = t.get("work") or ""

        artist_id = _make_id("artist", artist)
        albumartist_id = _make_id("albumartist", albumartist)
        album_id = _make_id("album", artist, album)

        if artist_id not in artists_map:
            artists_map[artist_id] = {"id": artist_id, "name": artist, "albums": []}
        if albumartist_id not in albumartists_map:
            albumartists_map[albumartist_id] = {"id": albumartist_id, "name": albumartist, "albums": []}
        if album_id not in albums_map:
            albums_map[album_id] = {
                "id": album_id,
                "title": album,
                "artist": artist,
                "year": year,
                "tracks": [],
            }
        track_obj = {
            "title": t.get("title") or Path(t.get("path") or "").name,
            "artist": artist,
            "album": album,
            "duration": t.get("duration") or 0,
            "trackNo": t.get("track_no") or 0,
            "year": year or None,
            "path": t.get("path"),
        }
        albums_map[album_id]["tracks"].append(track_obj)

        if not any(al["id"] == album_id for al in artists_map[artist_id]["albums"]):
            artists_map[artist_id]["albums"].append(albums_map[album_id])
        if not any(al["id"] == album_id for al in albumartists_map[albumartist_id]["albums"]):
            albumartists_map[albumartist_id]["albums"].append(albums_map[album_id])

        if genre:
            for g in _split_multi(genre):
                genres_map[g] = genres_map.get(g, 0) + 1
        if year:
            years_map[int(year)] = years_map.get(int(year), 0) + 1
        if composer:
            for c in _split_multi(composer):
                composers_map[c] = composers_map.get(c, 0) + 1
        if work:
            works_map[work] = works_map.get(work, 0) + 1
        if t.get("path"):
            top = str(t["path"]).split("/", 1)[0]
            if top:
                folders_map[top] = folders_map.get(top, 0) + 1
        if t.get("mtime"):
            album_mtime[album_id] = max(album_mtime.get(album_id, 0), int(t["mtime"]))

    for album in albums_map.values():
        album["tracks"].sort(key=lambda x: (x.get("trackNo") or 0, x.get("title") or ""))

    playlists = _list_playlists()
    favourites = _list_favourites()
    newmusic = sorted(
        [albums_map[a] for a in albums_map.keys()],
        key=lambda a: album_mtime.get(a["id"], 0),
        reverse=True,
    )[:20]
    randommix = random.sample(tracks, k=min(25, len(tracks))) if tracks else []
    summary = {
        "artists": list(artists_map.values()),
        "albumartists": list(albumartists_map.values()),
        "albums": list(albums_map.values()),
        "genres": [{"name": k, "count": v} for k, v in genres_map.items()],
        "years": [{"year": k, "count": v} for k, v in years_map.items()],
        "composers": [{"name": k, "count": v} for k, v in composers_map.items()],
        "works": [{"name": k, "count": v} for k, v in works_map.items()],
        "newmusic": newmusic,
        "randommix": randommix,
        "folders": [{"name": k, "count": v} for k, v in folders_map.items()],
        "playlists": playlists,
        "radios": [],
        "favourites": favourites,
        "apps": [],
    }
    return ok(summary)


@app.post("/api/library/scan")
def library_scan():
    if SCAN_STATE["running"]:
        return ok(SCAN_STATE, note="scan already running")
    t = threading.Thread(target=_scan_library_worker, daemon=True)
    t.start()
    return ok(SCAN_STATE, note="scan started")


@app.get("/api/library/scan/status")
def library_scan_status():
    return ok(SCAN_STATE)


@app.get("/api/library/scan/logs")
def library_scan_logs():
    return ok(SCAN_STATE.get("log", []))


@app.get("/api/playlists")
def playlists_list():
    return ok(_list_playlists())


@app.get("/api/favourites")
def favourites_list():
    return ok(_list_favourites())


@app.post("/api/favourites/add")
def favourites_add():
    data = request.get_json(silent=True) or {}
    fav_type = (data.get("type") or "").strip() or "track"
    path = (data.get("path") or "").strip()
    title = (data.get("title") or "").strip()
    artist = (data.get("artist") or "").strip()
    album = (data.get("album") or "").strip()
    playlist = (data.get("playlist") or "").strip()
    subtitle = (data.get("subtitle") or "").strip()

    if fav_type == "track" and not path:
        return err("missing path")
    if fav_type == "playlist" and not playlist:
        return err("missing playlist")
    if fav_type == "radio" and not (path or title):
        return err("missing url or title")

    key = _favourite_key(fav_type, path=path, artist=artist, album=album, playlist=playlist, title=title)
    created_at = int(time.time())
    with _db_connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO favourite
            (type, key, title, subtitle, artist, album, path, playlist, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fav_type, key, title, subtitle, artist, album, path, playlist, created_at),
        )
        conn.commit()
    return ok({"key": key, "type": fav_type})


@app.post("/api/favourites/remove")
def favourites_remove():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    fav_type = (data.get("type") or "").strip()
    path = (data.get("path") or "").strip()
    artist = (data.get("artist") or "").strip()
    album = (data.get("album") or "").strip()
    playlist = (data.get("playlist") or "").strip()
    title = (data.get("title") or "").strip()

    if not key and fav_type:
        key = _favourite_key(fav_type, path=path, artist=artist, album=album, playlist=playlist, title=title)
    if not key:
        return err("missing key")
    with _db_connect() as conn:
        cur = conn.execute("DELETE FROM favourite WHERE key = ?", (key,))
        conn.commit()
    return ok({"removed": cur.rowcount})


@app.post("/api/playlists/create")
def playlists_create():
    name = (request.args.get("name") or "").strip()
    if not name:
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
    if not name:
        return err("missing playlist name")
    PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
    p = _playlist_path(name)
    if not p.exists():
        p.write_text("#EXTM3U\n", encoding="utf-8")
    return ok({"name": p.name})


@app.post("/api/playlists/delete")
def playlists_delete():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return err("missing playlist name")
    p = _playlist_path(name)
    if not p.exists():
        return err("playlist not found", 404)
    p.unlink()
    return ok({"deleted": p.name})


@app.post("/api/playlists/import")
def playlists_import():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    content = data.get("content") or ""
    if not name:
        return err("missing playlist name")
    if not content.strip():
        return err("missing content")
    try:
        payload = _import_playlist_content(name, content)
    except ValueError as e:
        return err(str(e))
    except Exception as e:
        return err("import failed", 500, detail=str(e))
    return ok(payload)


@app.post("/api/playlists/import-file")
def playlists_import_file():
    name = (request.form.get("name") or "").strip()
    file = request.files.get("file")
    if not file:
        return err("missing file")
    if not name:
        name = (file.filename or "").strip()
    if not name:
        return err("missing playlist name")
    raw = file.read() or b""
    if not raw.strip():
        return err("missing content")
    content = raw.decode("utf-8-sig", errors="replace")
    try:
        payload = _import_playlist_content(name, content)
    except ValueError as e:
        return err(str(e))
    except Exception as e:
        return err("import failed", 500, detail=str(e))
    return ok(payload)


@app.post("/api/playlists/rename")
def playlists_rename():
    data = request.get_json(silent=True) or {}
    src = (data.get("from") or "").strip()
    dst = (data.get("to") or "").strip()
    if not src or not dst:
        return err("missing from/to")
    src_path = _playlist_path(src)
    dst_path = _playlist_path(dst)
    if not src_path.exists():
        return err("playlist not found", 404)
    if dst_path.exists():
        return err("destination exists", 409)
    src_path.rename(dst_path)
    return ok({"name": dst_path.name})


@app.post("/api/playlists/repair")
def playlists_repair():
    name = (request.args.get("name") or "").strip()
    dry = (request.args.get("dry") or "").strip().lower() in ("1", "true", "yes")
    if not name:
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        dry = bool(data.get("dry")) if data else dry
    if not name:
        return err("missing playlist name")
    p = _playlist_path(name)
    if not p.exists():
        return err("playlist not found", 404)
    try:
        lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
        out, stats = _repair_playlist_lines(lines)
        if not dry:
            p.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
        payload = {"name": p.name, "dry": dry}
        payload.update(stats)
        return ok(payload)
    except Exception as e:
        return err("repair failed", 500, detail=str(e))


@app.post("/api/playlists/append")
def playlists_append():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    paths = data.get("paths") or []
    if not name:
        return err("missing playlist name")
    if not paths:
        return err("missing paths")
    PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
    p = _playlist_path(name)
    if not p.exists():
        p.write_text("#EXTM3U\n", encoding="utf-8")
    with p.open("a", encoding="utf-8") as f:
        for path in paths:
            if path:
                f.write(f"{path}\n")
    return ok({"name": p.name, "added": len(paths)})


@app.post("/api/playlists/move")
def playlists_move():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    frm = data.get("from")
    to = data.get("to")
    if not name or frm is None or to is None:
        return err("missing name/from/to")
    p = _playlist_path(name)
    if not p.exists():
        return err("playlist not found", 404)
    try:
        lines = [_strip_bom(ln) for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
        header = [ln for ln in lines if ln.startswith("#")]
        tracks = [ln for ln in lines if ln and not ln.startswith("#")]
        frm = int(frm)
        to = int(to)
        if frm < 0 or frm >= len(tracks) or to < 0 or to >= len(tracks):
            return err("index out of range")
        item = tracks.pop(frm)
        tracks.insert(to, item)
        out = header + tracks
        if header and not header[0].startswith("#EXTM3U"):
            out.insert(0, "#EXTM3U")
        p.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
        return ok({"name": p.name, "count": len(tracks)})
    except Exception as e:
        return err("move failed", 500, detail=str(e))


@app.post("/api/playlists/remove")
def playlists_remove():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    path = (data.get("path") or "").strip()
    if not name or not path:
        return err("missing name/path")
    p = _playlist_path(name)
    if not p.exists():
        return err("playlist not found", 404)
    try:
        lines = [_strip_bom(ln) for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
        kept = []
        removed = 0
        for ln in lines:
            if ln.strip() == path:
                removed += 1
                continue
            kept.append(ln)
        p.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
        return ok({"name": p.name, "removed": removed})
    except Exception as e:
        return err("remove failed", 500, detail=str(e))


@app.post("/api/playlists/load")
def playlists_load():
    # charge une .m3u (qui contient des chemins absolus ou relatifs)
    name = request.args.get("name", "")
    if not name:
        return err("missing ?name=")
    p = PLAYLISTS_DIR / name
    if not p.exists():
        return err("playlist not found", 404)

    try:
        lines = [_strip_bom(ln).strip() for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
        tracks = [ln for ln in lines if ln and not ln.startswith("#")]
        entries = [_playlist_entry_info(t) for t in tracks]
        mapped = [e["path"] for e in entries if e.get("available")]

        with mpd_client() as c:
            c.clear()
            for m in mapped:
                c.add(m)
            c.play()
            _write_queue_file(mapped)
            _write_queue_symlinks(mapped)
        return ok({
            "loaded": name,
            "tracks_added": len(mapped),
            "tracks_in_file": len(tracks),
            "missing": len([e for e in entries if not e.get("available")]),
        })
    except Exception as e:
        return err("load playlist failed", 500, detail=str(e))


@app.post("/api/playlists/queue")
def playlists_queue():
    name = request.args.get("name", "")
    if not name:
        return err("missing ?name=")
    p = PLAYLISTS_DIR / name
    if not p.exists():
        return err("playlist not found", 404)
    try:
        lines = [_strip_bom(ln).strip() for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
        tracks = [ln for ln in lines if ln and not ln.startswith("#")]
        entries = [_playlist_entry_info(t) for t in tracks]
        mapped = [e["path"] for e in entries if e.get("available")]

        with mpd_client() as c:
            for m in mapped:
                c.add(m)
            current = _read_queue_file()
            merged = current + mapped
            _write_queue_file(merged)
            _write_queue_symlinks(merged)
        return ok({
            "queued": name,
            "tracks_added": len(mapped),
            "tracks_in_file": len(tracks),
            "missing": len([e for e in entries if not e.get("available")]),
        })
    except Exception as e:
        return err("queue playlist failed", 500, detail=str(e))


@app.get("/api/playlists/info")
def playlists_info():
    name = request.args.get("name", "")
    if not name:
        return err("missing ?name=")
    p = PLAYLISTS_DIR / name
    if not p.exists():
        return err("playlist not found", 404)
    try:
        lines = [_strip_bom(ln).strip() for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
        tracks = [ln for ln in lines if ln and not ln.startswith("#")]
        entries = [_playlist_entry_info(t) for t in tracks]
        mapped = [e["path"] for e in entries if e.get("path") and not str(e.get("path")).startswith("http")]

        meta = {}
        if mapped:
            with _db_connect() as conn:
                placeholders = ",".join(["?"] * len(mapped))
                rows = conn.execute(
                    f"SELECT path, title, artist, album, duration, track_no, year FROM track WHERE path IN ({placeholders})",
                    mapped,
                ).fetchall()
            meta = {r["path"]: dict(r) for r in rows}

        ordered = []
        for entry in entries:
            path = entry.get("path") or ""
            m = meta.get(path) or {"path": path}
            if not m.get("title"):
                m["title"] = Path(path or entry.get("raw") or "—").name
            m["available"] = entry.get("available", False)
            m["reason"] = entry.get("reason")
            m["raw"] = entry.get("raw")
            ordered.append(m)
        return ok({"name": name, "tracks": ordered})
    except Exception as e:
        return err("playlist info failed", 500, detail=str(e))


@app.get("/api/docs/artist/bio")
def docs_artist_bio():
    name = (request.args.get("name") or "").strip()
    if not name:
        return err("missing ?name=")
    bio_dir = DOCS_ROOT / "Biographies"
    match = _find_doc_file(bio_dir, name, [".txt"])
    if not match:
        return err("bio not found", 404)
    return ok({"name": name, "text": match.read_text(encoding="utf-8", errors="ignore")})


@app.get("/api/docs/artist/photo")
def docs_artist_photo():
    name = (request.args.get("name") or "").strip()
    if not name:
        return err("missing ?name=")
    photo_dir = DOCS_ROOT / "Photos d'artiste"
    match = _find_doc_file(photo_dir, name, [".jpg", ".jpeg", ".png"])
    if not match:
        return err("photo not found", 404)
    size = request.args.get("size")
    return _serve_image(match, int(size) if size else None)


@app.get("/api/docs/album/review")
def docs_album_review():
    title = (request.args.get("title") or "").strip()
    if not title:
        return err("missing ?title=")
    review_dir = DOCS_ROOT / "Critiques d'albums"
    match = _find_doc_file(review_dir, title, [".txt"])
    if not match:
        return err("review not found", 404)
    return ok({"title": title, "text": match.read_text(encoding="utf-8", errors="ignore")})


@app.get("/api/docs/album/art")
def docs_album_art():
    artist = (request.args.get("artist") or "").strip()
    album = (request.args.get("album") or "").strip()
    if not artist or not album:
        return err("missing ?artist=&album=")
    docs_cover = _find_doc_file(DOCS_ROOT / "Pochettes", album, [".jpg", ".jpeg", ".png"])
    if docs_cover:
        size = request.args.get("size")
        return _serve_image(docs_cover, int(size) if size else None)
    album_dir = MUSIC_ROOT / artist / album
    if not album_dir.exists():
        return err("album folder not found", 404)
    for name in ("cover.jpg", "folder.jpg", "cover.png", "folder.png"):
        p = album_dir / name
        if p.exists():
            size = request.args.get("size")
            return _serve_image(p, int(size) if size else None)
    return err("art not found", 404)


def _list_playlists() -> List[Dict[str, Any]]:
    if not PLAYLISTS_DIR.exists():
        return []
    items: List[Dict[str, Any]] = []
    for p in sorted(PLAYLISTS_DIR.glob("*.m3u")):
        try:
            lines = [_strip_bom(ln).strip() for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()]
            tracks = [ln for ln in lines if ln and not ln.startswith("#")]
            items.append({"name": p.name, "tracks": len(tracks)})
        except Exception:
            items.append({"name": p.name, "tracks": 0})
    return items


def _list_favourites() -> List[Dict[str, Any]]:
    try:
        with _db_connect() as conn:
            rows = conn.execute(
                "SELECT type, key, title, subtitle, artist, album, path, playlist, created_at FROM favourite ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


def _favourite_key(
    fav_type: str,
    *,
    path: str = "",
    artist: str = "",
    album: str = "",
    playlist: str = "",
    title: str = "",
) -> str:
    base = ""
    if fav_type == "track":
        base = path
    elif fav_type == "album":
        base = f"{artist}::{album}"
    elif fav_type == "artist":
        base = artist
    elif fav_type == "playlist":
        base = playlist or title
    elif fav_type == "radio":
        base = path or title
    else:
        base = title or path or playlist or f"{artist}::{album}"
    return f"{fav_type}:{base}"


def _find_doc_file(folder: Path, name: str, exts: List[str]) -> Optional[Path]:
    if not folder.exists():
        return None
    wanted = name.strip().lower()
    wanted_safe = _safe_name(name).lower()
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() in exts:
            stem = p.stem.strip().lower()
            if stem == wanted or stem == wanted_safe:
                return p
    return None


def _wait_mpd_update(c: MPDClient, timeout_s: int = 120):
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            st = c.status()
        except Exception:
            break
        if "updating_db" not in st:
            return
        time.sleep(1)


@app.post("/api/docs/fetch")
def docs_fetch():
    if DOCS_STATE["running"]:
        return ok(DOCS_STATE, note="fetch already running")
    force = request.args.get("force") in ("1", "true", "yes")
    t = threading.Thread(target=_docs_fetch_worker, args=(force,), daemon=True)
    t.start()
    return ok(DOCS_STATE, note="fetch started")


@app.get("/api/docs/fetch/status")
def docs_fetch_status():
    return ok(DOCS_STATE)


@app.get("/api/docs/fetch/logs")
def docs_fetch_logs():
    return ok(DOCS_STATE.get("log", []))


def _docs_fetch_worker(force: bool = False):
    DOCS_STATE.update({
        "running": True,
        "phase": "init",
        "total_artists": 0,
        "done_artists": 0,
        "total_albums": 0,
        "done_albums": 0,
        "errors": 0,
        "started_at": time.time(),
        "finished_at": None,
        "last_error": None,
    })
    DOCS_STATE["log"] = []
    _log_event(DOCS_STATE, "info", "Récupération web démarrée")
    if not OPENAI_API_KEY:
        _log_event(DOCS_STATE, "warn", "OPENAI_API_KEY manquant (traduction désactivée)")
    if not LASTFM_API_KEY:
        _log_event(DOCS_STATE, "warn", "LASTFM_API_KEY manquant")
    if not DISCOGS_TOKEN:
        _log_event(DOCS_STATE, "warn", "DISCOGS_TOKEN manquant")
    if not GOOGLE_CSE_API_KEY or not GOOGLE_CSE_CX:
        _log_event(DOCS_STATE, "warn", "Google CSE non configuré (photos artistes)")
    try:
        photos_dir = DOCS_ROOT / "Photos d'artiste"
        force_photos = force or _dir_empty(photos_dir)
        with _db_connect() as conn:
            artists = [r["name"] for r in conn.execute("SELECT DISTINCT artist as name FROM track WHERE artist IS NOT NULL")]
            albums = conn.execute(
                "SELECT DISTINCT album, artist FROM track WHERE album IS NOT NULL AND artist IS NOT NULL"
            ).fetchall()
        DOCS_STATE["total_artists"] = len(artists)
        DOCS_STATE["total_albums"] = len(albums)

        DOCS_STATE["phase"] = "artists"
        for name in artists:
            _fetch_artist_docs(name, force, force_photos)
            DOCS_STATE["done_artists"] += 1
            time.sleep(0.2)

        DOCS_STATE["phase"] = "albums"
        for row in albums:
            _fetch_album_docs(row["artist"], row["album"], force)
            DOCS_STATE["done_albums"] += 1
            time.sleep(0.2)
    except Exception as e:
        DOCS_STATE["errors"] += 1
        DOCS_STATE["last_error"] = str(e)
        _log_event(DOCS_STATE, "error", "Erreur récupération web", error=str(e))
    finally:
        DOCS_STATE["running"] = False
        DOCS_STATE["phase"] = "idle"
        DOCS_STATE["finished_at"] = time.time()
        _log_event(DOCS_STATE, "info", "Récupération web terminée")


def _fetch_artist_docs(name: str, force: bool, force_photo: bool = False):
    safe = _safe_name(name)
    bio_path = DOCS_ROOT / "Biographies" / f"{safe}.txt"
    photo_path = DOCS_ROOT / "Photos d'artiste" / f"{safe}.jpg"
    bio_path.parent.mkdir(parents=True, exist_ok=True)
    photo_path.parent.mkdir(parents=True, exist_ok=True)

    if bio_path.exists() and not force:
        _log_event(DOCS_STATE, "info", "Bio déjà présente", artist=name)
    else:
        bio, lang, source = _get_artist_bio(name)
        if bio:
            if lang != "fr":
                bio = _translate_to_fr(bio, source_lang=lang, source=source)
            _write_text_file(bio_path, bio, source=source, translated=(lang != "fr"))
            _log_event(DOCS_STATE, "info", "Bio enregistrée", artist=name, source=source)
        else:
            _log_event(DOCS_STATE, "warn", "Bio introuvable", artist=name)

    photo_ok = photo_path.exists() and photo_path.stat().st_size > 8_000 and not photo_path.is_dir()
    if photo_ok and not (force or force_photo):
        if _is_placeholder_file(photo_path):
            _log_event(DOCS_STATE, "warn", "Photo placeholder détectée, relance", artist=name)
            photo_ok = False
        elif _is_album_cover_copy(name, photo_path):
            _log_event(DOCS_STATE, "warn", "Photo fallback détectée, relance", artist=name)
            photo_ok = False
        else:
            _log_event(DOCS_STATE, "info", "Photo déjà présente", artist=name)
    if (not photo_ok) or force or force_photo:
        img_url, source = _get_artist_photo(name)
        if img_url:
            if _download_image(img_url, photo_path):
                _log_event(DOCS_STATE, "info", "Photo enregistrée", artist=name, source=source)
            else:
                _log_event(DOCS_STATE, "warn", "Photo download échouée", artist=name, source=source)
                if _fallback_artist_photo_from_albums(name, photo_path):
                    _log_event(DOCS_STATE, "info", "Photo fallback depuis album", artist=name, source="album-cover")
                else:
                    _log_event(DOCS_STATE, "warn", "Photo introuvable", artist=name)
        else:
            if _fallback_artist_photo_from_albums(name, photo_path):
                _log_event(DOCS_STATE, "info", "Photo fallback depuis album", artist=name, source="album-cover")
            else:
                _log_event(DOCS_STATE, "warn", "Photo introuvable", artist=name)


def _fetch_album_docs(artist: str, album: str, force: bool):
    safe_album = _safe_name(album)
    review_path = DOCS_ROOT / "Critiques d'albums" / f"{safe_album}.txt"
    cover_path = DOCS_ROOT / "Pochettes" / f"{safe_album}.jpg"
    review_path.parent.mkdir(parents=True, exist_ok=True)
    cover_path.parent.mkdir(parents=True, exist_ok=True)

    if review_path.exists() and not force:
        _log_event(DOCS_STATE, "info", "Critique déjà présente", album=album)
    else:
        review, lang, source = _get_album_review(artist, album)
        if review:
            if lang != "fr":
                review = _translate_to_fr(review, source_lang=lang, source=source)
            _write_text_file(review_path, review, source=source, translated=(lang != "fr"))
            _log_event(DOCS_STATE, "info", "Critique enregistrée", album=album, source=source)
        else:
            _log_event(DOCS_STATE, "warn", "Critique introuvable", album=album)

    if cover_path.exists() and not force:
        _log_event(DOCS_STATE, "info", "Pochette déjà présente", album=album)
    else:
        img_url, source = _get_album_cover(artist, album)
        if img_url:
            if _download_image(img_url, cover_path):
                _log_event(DOCS_STATE, "info", "Pochette enregistrée", album=album, source=source)
            else:
                _log_event(DOCS_STATE, "warn", "Pochette download échouée", album=album, source=source)
        else:
            _log_event(DOCS_STATE, "warn", "Pochette introuvable", album=album)


def _get_artist_bio(name: str) -> Tuple[Optional[str], str, str]:
    text = _wikipedia_summary(name, "fr")
    if text:
        return text, "fr", "wikipedia"
    text = _lastfm_artist_bio(name, lang="fr")
    if text:
        return text, "fr", "lastfm"
    text = _wikipedia_summary(name, "en")
    if text:
        return text, "en", "wikipedia"
    text = _lastfm_artist_bio(name, lang="en")
    if text:
        return text, "en", "lastfm"
    text = _discogs_artist_profile(name)
    if text:
        return text, "en", "discogs"
    simple = _simplify_artist_name(name)
    if simple != name:
        text = _wikipedia_summary(simple, "fr") or _wikipedia_summary(simple, "en")
        if text:
            return text, "en", "wikipedia"
    return None, "fr", ""


def _get_artist_photo(name: str) -> Tuple[Optional[str], str]:
    order = _photo_source_order(name)
    simple = _simplify_artist_name(name)

    url, source = _get_artist_photo_from_sources(name, order)
    if url:
        return url, source
    if simple != name:
        url, source = _get_artist_photo_from_sources(simple, order)
        if url:
            return url, source
    return None, ""


def _get_album_review(artist: str, album: str) -> Tuple[Optional[str], str, str]:
    text = _lastfm_album_review(artist, album, lang="fr")
    if text:
        return text, "fr", "lastfm"
    text = _wikipedia_summary(f"{album} ({artist})", "fr") or _wikipedia_summary(f"{album} (album)", "fr")
    if text:
        return text, "fr", "wikipedia"
    text = _lastfm_album_review(artist, album, lang="en")
    if text:
        return text, "en", "lastfm"
    text = _wikipedia_summary(f"{album} ({artist})", "en") or _wikipedia_summary(f"{album} (album)", "en")
    if text:
        return text, "en", "wikipedia"
    text = _discogs_release_notes(artist, album)
    if text:
        return text, "en", "discogs"
    return None, "fr", ""


def _get_album_cover(artist: str, album: str) -> Tuple[Optional[str], str]:
    url = _cover_art_archive(artist, album)
    if url:
        return url, "coverartarchive"
    url = _lastfm_album_image(artist, album)
    if url:
        return url, "lastfm"
    url = _wikipedia_image(f"{album} ({artist})", "fr") or _wikipedia_image(f"{album} (album)", "en")
    if url:
        return url, "wikipedia"
    return None, ""


def _is_lastfm_placeholder(url: str) -> bool:
    if not url:
        return False
    lower = url.lower()
    return "2a96cbd8b46e442fc41c2b86b821562f" in lower or "noimage" in lower


def _is_placeholder_file(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img = img.convert("RGB").resize((12, 12))
            pixels = list(img.getdata())
        if not pixels:
            return False
        grays = [int(0.299 * r + 0.587 * g + 0.114 * b) for r, g, b in pixels]
        avg = sum(grays) / len(grays)
        var = sum((g - avg) ** 2 for g in grays) / len(grays)
        return avg > 220 and var < 80
    except Exception:
        return False


def _dir_empty(path: Path) -> bool:
    try:
        if not path.exists():
            return True
        return not any(path.iterdir())
    except Exception:
        return False


def _wikipedia_summary(title: str, lang: str) -> Optional[str]:
    try:
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(title)}"
        res = _http_get(url, timeout=10)
        if res.status_code != 200:
            return None
        data = res.json()
        return data.get("extract")
    except Exception:
        return None


def _wikipedia_image(title: str, lang: str) -> Optional[str]:
    try:
        img = _wikipedia_page_image(title, lang)
        if img:
            return img
        img = _wikipedia_summary_image(title, lang)
        if img:
            return img
        alt = _wikipedia_search_title(title, lang)
        if alt and alt.lower() != title.lower():
            img = _wikipedia_page_image(alt, lang) or _wikipedia_summary_image(alt, lang)
            if img:
                return img
    except Exception:
        return None
    return None


def _wikipedia_page_image(title: str, lang: str) -> Optional[str]:
    url = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "pageimages",
        "titles": title,
        "pithumbsize": 800,
        "format": "json",
        "redirects": 1,
    }
    res = _http_get(url, params=params, timeout=10)
    if res.status_code != 200:
        return None
    pages = res.json().get("query", {}).get("pages", {})
    for page in pages.values():
        thumb = page.get("thumbnail", {}).get("source")
        if thumb:
            return thumb
    return None


def _wikipedia_summary_image(title: str, lang: str) -> Optional[str]:
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(title)}"
    res = _http_get(url, timeout=10)
    if res.status_code != 200:
        return None
    data = res.json()
    return (data.get("originalimage", {}) or data.get("thumbnail", {})).get("source")


def _wikipedia_search_title(query: str, lang: str) -> Optional[str]:
    url = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "opensearch",
        "search": query,
        "limit": 1,
        "namespace": 0,
        "format": "json",
    }
    res = _http_get(url, params=params, timeout=10)
    if res.status_code != 200:
        return None
    data = res.json()
    titles = data[1] if isinstance(data, list) and len(data) > 1 else []
    return titles[0] if titles else None


def _wikidata_artist_image(name: str) -> Optional[str]:
    try:
        for lang in ("fr", "en"):
            entity = _wikidata_search_entity(name, lang)
            if not entity:
                continue
            img = _wikidata_entity_image(entity)
            if img:
                return img
    except Exception:
        return None
    return None


def _wikidata_search_entity(query: str, lang: str) -> Optional[str]:
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbsearchentities",
        "search": query,
        "language": lang,
        "format": "json",
        "limit": 1,
    }
    res = _http_get(url, params=params, timeout=10)
    if res.status_code != 200:
        return None
    results = res.json().get("search", [])
    if not results:
        return None
    return results[0].get("id")


def _wikidata_entity_image(entity_id: str) -> Optional[str]:
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "ids": entity_id,
        "props": "claims",
        "format": "json",
    }
    res = _http_get(url, params=params, timeout=10)
    if res.status_code != 200:
        return None
    entity = res.json().get("entities", {}).get(entity_id, {})
    claims = entity.get("claims", {})
    images = claims.get("P18", [])
    if not images:
        return None
    filename = images[0].get("mainsnak", {}).get("datavalue", {}).get("value")
    if not filename:
        return None
    safe = filename.replace(" ", "_")
    return f"https://commons.wikimedia.org/w/thumb.php?f={requests.utils.quote(safe)}&w=800"


def _photo_source_order(name: str) -> List[str]:
    default = ["wikipedia", "wikidata", "lastfm", "discogs", "google"]
    overrides = _load_photo_overrides()
    if overrides:
        artists = overrides.get("artists", {}) if isinstance(overrides, dict) else {}
        if isinstance(artists, dict):
            custom = artists.get(name) or artists.get(_simplify_artist_name(name))
            if isinstance(custom, list) and custom:
                default = [s for s in custom if isinstance(s, str)]
        if isinstance(overrides, dict):
            base = overrides.get("default")
            if isinstance(base, list) and base:
                default = [s for s in base if isinstance(s, str)]
    # ensure google is last resort unless explicitly overridden
    if "google" in default:
        default = [s for s in default if s != "google"] + ["google"]
    return default


def _load_photo_overrides() -> Optional[Dict[str, Any]]:
    try:
        if PHOTO_SOURCES_FILE.exists():
            return json.loads(PHOTO_SOURCES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None
    return None


def _get_artist_photo_from_sources(name: str, order: List[str]) -> Tuple[Optional[str], str]:
    for source in order:
        if source == "wikipedia":
            url = _wikipedia_image(name, "fr") or _wikipedia_image(name, "en")
        elif source == "wikidata":
            url = _wikidata_artist_image(name)
        elif source == "lastfm":
            url = _lastfm_artist_image(name) or _lastfm_artist_image(name, autocorrect=True)
        elif source == "discogs":
            url = _discogs_artist_image(name)
        elif source == "google":
            url = _google_artist_image(name)
        else:
            url = None
        if url:
            return url, source
    return None, ""


def _fallback_artist_photo_from_albums(artist: str, dest_path: Path) -> bool:
    try:
        if dest_path.exists() and not _is_album_cover_copy(artist, dest_path):
            return False
        with _db_connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT album FROM track WHERE artist = ? AND album IS NOT NULL",
                (artist,),
            ).fetchall()
        albums = [r["album"] for r in rows]
        if not albums:
            return False
        for album in albums:
            cover = _find_doc_file(DOCS_ROOT / "Pochettes", album, [".jpg", ".jpeg", ".png"])
            if cover and cover.exists():
                shutil.copyfile(cover, dest_path)
                return True
            album_dir = MUSIC_ROOT / artist / album
            for name in ("cover.jpg", "folder.jpg", "cover.png", "folder.png"):
                p = album_dir / name
                if p.exists():
                    shutil.copyfile(p, dest_path)
                    return True
    except Exception:
        return False
    return False


def _is_album_cover_copy(artist: str, photo_path: Path) -> bool:
    try:
        if not photo_path.exists():
            return False
        photo_size = photo_path.stat().st_size
        photo_hash = _file_md5(photo_path)
        if not photo_hash:
            return False
        with _db_connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT album FROM track WHERE artist = ? AND album IS NOT NULL",
                (artist,),
            ).fetchall()
        albums = [r["album"] for r in rows]
        for album in albums:
            cover = _find_doc_file(DOCS_ROOT / "Pochettes", album, [".jpg", ".jpeg", ".png"])
            if cover and cover.exists():
                if cover.stat().st_size == photo_size and _file_md5(cover) == photo_hash:
                    return True
            album_dir = MUSIC_ROOT / artist / album
            for name in ("cover.jpg", "folder.jpg", "cover.png", "folder.png"):
                p = album_dir / name
                if p.exists() and p.stat().st_size == photo_size:
                    if _file_md5(p) == photo_hash:
                        return True
    except Exception:
        return False
    return False


def _file_md5(path: Path) -> Optional[str]:
    try:
        h = hashlib.md5()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _lastfm_artist_bio(name: str, lang: str = "fr") -> Optional[str]:
    if not LASTFM_API_KEY:
        return None
    try:
        url = "https://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "artist.getinfo",
            "artist": name,
            "api_key": LASTFM_API_KEY,
            "format": "json",
            "lang": lang,
        }
        res = _http_get(url, params=params, timeout=10)
        if res.status_code != 200:
            return None
        bio = res.json().get("artist", {}).get("bio", {}).get("content")
        return _strip_lastfm(bio)
    except Exception:
        return None


def _lastfm_artist_image(name: str, autocorrect: bool = False) -> Optional[str]:
    if not LASTFM_API_KEY:
        return None
    try:
        url = "https://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "artist.getinfo",
            "artist": name,
            "api_key": LASTFM_API_KEY,
            "format": "json",
        }
        if autocorrect:
            params["autocorrect"] = 1
        res = _http_get(url, params=params, timeout=10)
        if res.status_code != 200:
            return None
        images = res.json().get("artist", {}).get("image", [])
        for img in reversed(images):
            if img.get("#text"):
                url = img.get("#text")
                if _is_lastfm_placeholder(url):
                    continue
                return url
    except Exception:
        return None
    return None


def _lastfm_album_review(artist: str, album: str, lang: str = "fr") -> Optional[str]:
    if not LASTFM_API_KEY:
        return None
    try:
        url = "https://ws.audioscrobbler.com/2.0/"
        params = {
            "method": "album.getinfo",
            "artist": artist,
            "album": album,
            "api_key": LASTFM_API_KEY,
            "format": "json",
            "lang": lang,
        }
        res = _http_get(url, params=params, timeout=10)
        if res.status_code != 200:
            return None
        wiki = res.json().get("album", {}).get("wiki", {}).get("content")
        return _strip_lastfm(wiki)
    except Exception:
        return None


def _lastfm_album_image(artist: str, album: str) -> Optional[str]:
    if not LASTFM_API_KEY:
        return None
    try:
        url = "https://ws.audioscrobbler.com/2.0/"
        params = {"method": "album.getinfo", "artist": artist, "album": album, "api_key": LASTFM_API_KEY, "format": "json"}
        res = _http_get(url, params=params, timeout=10)
        if res.status_code != 200:
            return None
        images = res.json().get("album", {}).get("image", [])
        for img in reversed(images):
            if img.get("#text"):
                url = img.get("#text")
                if _is_lastfm_placeholder(url):
                    continue
                return url
    except Exception:
        return None
    return None


def _discogs_search(query: str, type_: str):
    if not DISCOGS_TOKEN:
        return None
    url = "https://api.discogs.com/database/search"
    params = {"q": query, "type": type_, "token": DISCOGS_TOKEN}
    res = _http_get(url, params=params, timeout=10)
    if res.status_code != 200:
        return None
    data = res.json().get("results", [])
    return data[0] if data else None


def _http_get(url: str, **kwargs) -> requests.Response:
    headers = kwargs.pop("headers", {}) or {}
    headers.setdefault("User-Agent", "Toune-o-matic/1.0 (+https://localhost)")
    return requests.get(url, headers=headers, **kwargs)


def _discogs_artist_profile(name: str) -> Optional[str]:
    hit = _discogs_search(name, "artist")
    if not hit:
        return None
    rid = hit.get("id")
    if not rid:
        return None
    res = requests.get(f"https://api.discogs.com/artists/{rid}", params={"token": DISCOGS_TOKEN}, timeout=10)
    if res.status_code != 200:
        return None
    profile = res.json().get("profile")
    return _strip_html(profile) if profile else None


def _discogs_artist_image(name: str) -> Optional[str]:
    hit = _discogs_search(name, "artist")
    if not hit:
        return None
    return hit.get("thumb") or hit.get("cover_image")


def _discogs_release_notes(artist: str, album: str) -> Optional[str]:
    hit = _discogs_search(f"{artist} {album}", "release")
    if not hit:
        return None
    rid = hit.get("id")
    if not rid:
        return None
    res = requests.get(f"https://api.discogs.com/releases/{rid}", params={"token": DISCOGS_TOKEN}, timeout=10)
    if res.status_code != 200:
        return None
    notes = res.json().get("notes")
    return _strip_html(notes) if notes else None


def _cover_art_archive(artist: str, album: str) -> Optional[str]:
    try:
        url = "https://musicbrainz.org/ws/2/release-group/"
        query = f'artist:"{artist}" AND releasegroup:"{album}"'
        res = requests.get(url, params={"query": query, "fmt": "json"}, timeout=10)
        if res.status_code != 200:
            return None
        groups = res.json().get("release-groups", [])
        if not groups:
            return None
        mbid = groups[0].get("id")
        if not mbid:
            return None
        caa = requests.get(f"https://coverartarchive.org/release-group/{mbid}", timeout=10)
        if caa.status_code != 200:
            return None
        images = caa.json().get("images", [])
        for img in images:
            if img.get("front"):
                return img.get("image")
    except Exception:
        return None
    return None


def _google_artist_image(name: str) -> Optional[str]:
    if not GOOGLE_CSE_API_KEY or not GOOGLE_CSE_CX:
        return None
    try:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": GOOGLE_CSE_API_KEY,
            "cx": GOOGLE_CSE_CX,
            "q": f"{name} artist photo",
            "searchType": "image",
            "safe": "active",
            "num": 1,
            "imgType": "photo",
        }
        res = requests.get(url, params=params, timeout=10)
        if res.status_code != 200:
            return None
        items = res.json().get("items", [])
        if not items:
            return None
        return items[0].get("link")
    except Exception:
        return None


def _strip_lastfm(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    cleaned = text.split("Read more", 1)[0]
    cleaned = _strip_html(cleaned)
    return cleaned.strip()


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "")


def _write_text_file(path: Path, text: str, source: str = "", translated: bool = False):
    header = []
    header.append(f"Source: {source}" if source else "Source: inconnue")
    if translated:
        header.append("Note: texte traduit automatiquement.")
    header.append("")
    full = "\n".join(header) + text.strip()
    path.write_text(full, encoding="utf-8")


def _translate_to_fr(text: str, source_lang: str, source: str) -> str:
    if not OPENAI_API_KEY:
        return text
    try:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Tu traduis en français de façon fidèle et naturelle."},
                {"role": "user", "content": f"Texte source ({source_lang}, source {source}):\n{text}"},
            ],
            "temperature": 0.2,
        }
        res = requests.post(url, headers=headers, json=payload, timeout=20)
        if res.status_code != 200:
            return text
        out = res.json()["choices"][0]["message"]["content"]
        return out.strip()
    except Exception:
        return text


def _download_image(url: str, dest: Path) -> bool:
    try:
        res = _http_get(url, stream=True, timeout=15)
        if res.status_code != 200:
            return False
        content_type = (res.headers.get("Content-Type") or "").lower()
        if "image/svg" in content_type:
            return False
        data = res.content
        img = Image.open(io.BytesIO(data)).convert("RGB")
        tmp = dest.with_suffix(".tmp.jpg")
        img.save(tmp, "JPEG", quality=90, optimize=True)
        if tmp.stat().st_size < 1024:
            tmp.unlink(missing_ok=True)
            return False
        tmp.replace(dest)
        return True
    except Exception:
        return False


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=11000, debug=True)
