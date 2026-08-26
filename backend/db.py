from __future__ import annotations

from pathlib import Path


class DbLockedError(Exception):
    """rekordbox database could not be opened (likely rekordbox is still running)."""


def open_db():
    from pyrekordbox import Rekordbox6Database

    try:
        return Rekordbox6Database()
    except Exception as e:
        raise DbLockedError(str(e)) from e


def build_content_lookup(db) -> dict[str, object]:
    lookup: dict[str, object] = {}
    for content in db.get_content():
        try:
            path = str(Path(content.FolderPath).resolve())
        except Exception:
            continue
        lookup[path] = content
    return lookup
