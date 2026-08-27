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


def load_genre_mytags(db, category_name: str = "Genre") -> list[str]:
    """Liest alle MyTag-Werte aus der MyTag-Kategorie mit dem gegebenen Namen."""
    category = next(iter(db.get_my_tag(Name=category_name)), None)
    if category is None:
        return []
    return sorted(child.Name for child in category.Children)
