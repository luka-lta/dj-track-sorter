from __future__ import annotations

import json
from pathlib import Path

DEFAULT_SETTINGS: dict = {
    "neu_dir": str(Path.home() / "Music" / "DJ" / "Neues"),
    "dj_root": str(Path.home() / "Music" / "DJ"),
    "known_genres": ["Hardtechno", "Schranz"],
    "dry_run": True,
}


def load_settings(path: Path) -> dict:
    if not path.exists():
        return dict(DEFAULT_SETTINGS)
    stored = json.loads(path.read_text())
    return {**DEFAULT_SETTINGS, **stored}


def save_settings(path: Path, settings: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2))
