from __future__ import annotations

import datetime
import json
from pathlib import Path

import db
import sorter
from settings import load_settings, save_settings


class IpcError(Exception):
    pass


def _cmd_get_settings(params: dict, deps: dict) -> dict:
    return load_settings(deps["settings_path"])


def _cmd_save_settings(params: dict, deps: dict) -> dict:
    save_settings(deps["settings_path"], params["settings"])
    return {"saved": True}


def _cmd_scan(params: dict, deps: dict) -> dict:
    settings = load_settings(deps["settings_path"])
    neu_dir = Path(settings["neu_dir"])
    neu_dir_missing = not neu_dir.exists()
    audio_extensions = {".mp3", ".m4a", ".mp4", ".flac", ".wav", ".aiff", ".aif"}
    tracks = sorted(
        p for p in neu_dir.iterdir()
        if p.is_file() and p.suffix.lower() in audio_extensions
    ) if not neu_dir_missing else []

    try:
        rb_db = db.open_db()
    except db.DbLockedError as e:
        raise IpcError(f"rekordbox-Datenbank konnte nicht geöffnet werden: {e}") from e

    lookup = db.build_content_lookup(rb_db)
    known_genres = set(settings["known_genres"])
    results = []
    for track in tracks:
        content = lookup.get(str(track.resolve()))
        genre = sorter.genre_from_content(content, known_genres) if content else None
        results.append({
            "track_name": track.name,
            "track_path": str(track),
            "found_in_rekordbox": content is not None,
            "detected_genre": genre,
            "date_added": datetime.datetime.fromtimestamp(track.stat().st_mtime).isoformat(),
        })
    return {"tracks": results, "neu_dir_missing": neu_dir_missing}


def _cmd_plan(params: dict, deps: dict) -> dict:
    settings = load_settings(deps["settings_path"])
    neu_dir = Path(settings["neu_dir"])
    dj_root = Path(settings["dj_root"])
    known_genres = set(settings["known_genres"])
    audio_extensions = {".mp3", ".m4a", ".mp4", ".flac", ".wav", ".aiff", ".aif"}
    tracks = sorted(
        p for p in neu_dir.iterdir()
        if p.is_file() and p.suffix.lower() in audio_extensions
    ) if neu_dir.exists() else []

    try:
        rb_db = db.open_db()
    except db.DbLockedError as e:
        raise IpcError(f"rekordbox-Datenbank konnte nicht geöffnet werden: {e}") from e

    lookup = db.build_content_lookup(rb_db)
    genre_choices = params.get("genre_choices", {})
    selected_tracks = set(params["selected_tracks"]) if "selected_tracks" in params else None
    plan = sorter.build_plan(tracks, lookup, known_genres, dj_root, genre_choices, selected_tracks)
    return {"plan": [{k: v for k, v in item.items() if k != "_content"} for item in plan]}


def _cmd_execute(params: dict, deps: dict) -> dict:
    settings = load_settings(deps["settings_path"])
    neu_dir = Path(settings["neu_dir"])
    dj_root = Path(settings["dj_root"])
    known_genres = set(settings["known_genres"])
    audio_extensions = {".mp3", ".m4a", ".mp4", ".flac", ".wav", ".aiff", ".aif"}
    tracks = sorted(
        p for p in neu_dir.iterdir()
        if p.is_file() and p.suffix.lower() in audio_extensions
    ) if neu_dir.exists() else []

    try:
        rb_db = db.open_db()
    except db.DbLockedError as e:
        raise IpcError(f"rekordbox-Datenbank konnte nicht geöffnet werden: {e}") from e

    lookup = db.build_content_lookup(rb_db)
    genre_choices = params.get("genre_choices", {})
    selected_tracks = set(params["selected_tracks"]) if "selected_tracks" in params else None
    plan = sorter.build_plan(tracks, lookup, known_genres, dj_root, genre_choices, selected_tracks)

    if settings.get("dry_run"):
        return {"results": [{"track_name": i["track_name"], "status": "dry_run"} for i in plan]}

    results = sorter.execute_plan(
        rb_db, plan,
        find_mytag_fn=lambda d, name: next(iter(d.get_my_tag(Name=name)), None),
        set_mytag_fn=_set_mytag,
        remove_mytag_fn=_remove_mytag,
    )
    rb_db.commit()
    return {"results": results}


def _cmd_sync_genres(params: dict, deps: dict) -> dict:
    try:
        rb_db = db.open_db()
    except db.DbLockedError as e:
        raise IpcError(f"rekordbox-Datenbank konnte nicht geöffnet werden: {e}") from e

    known_genres = db.load_genre_mytags(rb_db)
    settings = load_settings(deps["settings_path"])
    settings["known_genres"] = known_genres
    save_settings(deps["settings_path"], settings)
    return {"known_genres": known_genres}


def _set_mytag(rb_db, content, mytag) -> None:
    from uuid import uuid4
    from pyrekordbox.db6 import tables

    if any(s.MyTagID == mytag.ID for s in content.MyTags):
        return

    now = datetime.datetime.now()
    song_mytag = tables.DjmdSongMyTag.create(
        ID=str(uuid4()), MyTagID=mytag.ID, ContentID=content.ID, TrackNo=1,
        UUID=str(uuid4()), created_at=now, updated_at=now,
    )
    rb_db.add(song_mytag)


def _remove_mytag(rb_db, content, mytag) -> None:
    song_mytag = next((s for s in content.MyTags if s.MyTagID == mytag.ID), None)
    if song_mytag is not None:
        rb_db.delete(song_mytag)


_HANDLERS = {
    "get_settings": _cmd_get_settings,
    "save_settings": _cmd_save_settings,
    "scan": _cmd_scan,
    "plan": _cmd_plan,
    "execute": _cmd_execute,
    "sync_genres": _cmd_sync_genres,
}


def dispatch(cmd: str, params: dict, deps: dict) -> dict:
    handler = _HANDLERS.get(cmd)
    if handler is None:
        raise IpcError(f"Unbekanntes Kommando: {cmd}")
    return handler(params, deps)


def run_loop(stdin, stdout, settings_path: Path) -> None:
    deps = {"settings_path": settings_path}
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            result = dispatch(request["cmd"], request.get("params", {}), deps)
            response = {"id": request["id"], "ok": True, "result": result}
        except Exception as e:
            response = {"id": request["id"], "ok": False, "error": str(e)}
        stdout.write(json.dumps(response) + "\n")
        stdout.flush()
