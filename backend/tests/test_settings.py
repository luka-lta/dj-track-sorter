import json
from pathlib import Path

from settings import DEFAULT_SETTINGS, load_settings, save_settings


def test_load_settings_returns_defaults_when_file_missing(tmp_path):
    path = tmp_path / "settings.json"
    result = load_settings(path)
    assert result == DEFAULT_SETTINGS


def test_save_then_load_roundtrips(tmp_path):
    path = tmp_path / "settings.json"
    custom = {
        "neu_dir": "/tmp/Neu",
        "dj_root": "/tmp/DJ",
        "known_genres": ["Hardtechno", "Schranz", "Techno"],
        "dry_run": False,
    }
    save_settings(path, custom)
    assert load_settings(path) == custom


def test_load_settings_merges_missing_keys_with_defaults(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps({"known_genres": ["Hardtechno"]}))
    result = load_settings(path)
    assert result["known_genres"] == ["Hardtechno"]
    assert result["dry_run"] == DEFAULT_SETTINGS["dry_run"]
    assert result["neu_dir"] == DEFAULT_SETTINGS["neu_dir"]
