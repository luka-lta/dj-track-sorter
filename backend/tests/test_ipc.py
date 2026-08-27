import io
import json
from types import SimpleNamespace
from unittest.mock import patch

from ipc import dispatch, run_loop, IpcError
from settings import DEFAULT_SETTINGS, save_settings


def test_dispatch_get_settings_returns_defaults_when_missing(tmp_path):
    settings_path = tmp_path / "settings.json"
    result = dispatch("get_settings", {}, {"settings_path": settings_path})
    assert result == DEFAULT_SETTINGS


def test_dispatch_save_settings_persists(tmp_path):
    settings_path = tmp_path / "settings.json"
    new_settings = {**DEFAULT_SETTINGS, "known_genres": ["Hardtechno", "Trance"]}

    result = dispatch("save_settings", {"settings": new_settings},
                       {"settings_path": settings_path})

    assert result == {"saved": True}
    assert json.loads(settings_path.read_text())["known_genres"] == ["Hardtechno", "Trance"]


def test_dispatch_unknown_command_raises_ipc_error(tmp_path):
    try:
        dispatch("bogus", {}, {"settings_path": tmp_path / "settings.json"})
        assert False, "expected IpcError"
    except IpcError as e:
        assert "bogus" in str(e)


def test_run_loop_processes_one_request_and_stops_on_eof(tmp_path):
    settings_path = tmp_path / "settings.json"
    request = json.dumps({"id": 1, "cmd": "get_settings", "params": {}}) + "\n"
    stdin = io.StringIO(request)
    stdout = io.StringIO()

    run_loop(stdin, stdout, settings_path)

    lines = [line for line in stdout.getvalue().splitlines() if line.strip()]
    assert len(lines) == 1
    response = json.loads(lines[0])
    assert response == {"id": 1, "ok": True, "result": DEFAULT_SETTINGS}


def test_run_loop_reports_error_for_unknown_command(tmp_path):
    settings_path = tmp_path / "settings.json"
    request = json.dumps({"id": 5, "cmd": "bogus", "params": {}}) + "\n"
    stdin = io.StringIO(request)
    stdout = io.StringIO()

    run_loop(stdin, stdout, settings_path)

    response = json.loads(stdout.getvalue().splitlines()[0])
    assert response["id"] == 5
    assert response["ok"] is False
    assert "bogus" in response["error"]


def test_dispatch_scan_reports_missing_neu_dir(tmp_path):
    settings_path = tmp_path / "settings.json"
    missing_dir = tmp_path / "does-not-exist"
    save_settings(settings_path, {**DEFAULT_SETTINGS, "neu_dir": str(missing_dir)})

    with patch("ipc.db.open_db", return_value=SimpleNamespace()), \
         patch("ipc.db.build_content_lookup", return_value={}):
        result = dispatch("scan", {}, {"settings_path": settings_path})

    assert result["tracks"] == []
    assert result["neu_dir_missing"] is True


def test_dispatch_scan_includes_track_path(tmp_path):
    neu_dir = tmp_path / "neu"
    neu_dir.mkdir()
    track = neu_dir / "a.mp3"
    track.write_bytes(b"data")

    settings_path = tmp_path / "settings.json"
    save_settings(settings_path, {**DEFAULT_SETTINGS, "neu_dir": str(neu_dir)})

    with patch("ipc.db.open_db", return_value=SimpleNamespace()), \
         patch("ipc.db.build_content_lookup", return_value={}):
        result = dispatch("scan", {}, {"settings_path": settings_path})

    assert result["tracks"] == [{
        "track_name": "a.mp3",
        "track_path": str(track),
        "found_in_rekordbox": False,
        "detected_genre": None,
    }]


def test_dispatch_plan_uses_genre_choice_for_untagged_track(tmp_path):
    neu_dir = tmp_path / "neu"
    neu_dir.mkdir()
    track = neu_dir / "b.mp3"
    track.write_bytes(b"data")
    dj_root = tmp_path / "DJ"

    settings_path = tmp_path / "settings.json"
    save_settings(settings_path, {
        **DEFAULT_SETTINGS,
        "neu_dir": str(neu_dir),
        "dj_root": str(dj_root),
    })

    content = SimpleNamespace(FolderPath=str(track.resolve()), ID="c1", MyTags=[])

    with patch("ipc.db.open_db", return_value=SimpleNamespace()), \
         patch("ipc.db.build_content_lookup", return_value={str(track.resolve()): content}):
        result = dispatch("plan", {"genre_choices": {"b.mp3": "Hardtechno"}},
                           {"settings_path": settings_path})

    plan_item = result["plan"][0]
    assert plan_item["genre"] == "Hardtechno"
    assert plan_item["source"] == "user"
    assert plan_item["write_mytag"] is True


def test_dispatch_execute_moves_track_with_genre_choice(tmp_path):
    neu_dir = tmp_path / "neu"
    neu_dir.mkdir()
    track = neu_dir / "e.mp3"
    track.write_bytes(b"data")
    dj_root = tmp_path / "DJ"

    settings_path = tmp_path / "settings.json"
    save_settings(settings_path, {
        **DEFAULT_SETTINGS,
        "neu_dir": str(neu_dir),
        "dj_root": str(dj_root),
        "dry_run": False,
    })

    content = SimpleNamespace(FolderPath=str(track.resolve()), ID="c1", MyTags=[])
    fake_mytag = SimpleNamespace(ID="tag-1", Name="Hardtechno")
    fake_db = SimpleNamespace(
        get_my_tag=lambda Name: [fake_mytag] if Name == "Hardtechno" else [],
        commit=lambda: None,
    )

    with patch("ipc.db.open_db", return_value=fake_db), \
         patch("ipc.db.build_content_lookup", return_value={str(track.resolve()): content}), \
         patch("ipc._set_mytag") as mock_set_mytag:
        result = dispatch("execute", {"genre_choices": {"e.mp3": "Hardtechno"}},
                           {"settings_path": settings_path})

    assert result["results"] == [{"track_name": "e.mp3", "status": "moved"}]
    assert (dj_root / "Hardtechno" / "e.mp3").exists()
    assert not track.exists()
    mock_set_mytag.assert_called_once()
    called_content, called_mytag = mock_set_mytag.call_args[0][1], mock_set_mytag.call_args[0][2]
    assert called_content is content
    assert called_mytag is fake_mytag


def test_dispatch_sync_genres_persists_and_returns_genres(tmp_path):
    settings_path = tmp_path / "settings.json"
    save_settings(settings_path, {**DEFAULT_SETTINGS, "known_genres": ["Old"]})

    with patch("ipc.db.open_db", return_value=SimpleNamespace()), \
         patch("ipc.db.load_genre_mytags", return_value=["Hardtechno", "Schranz"]):
        result = dispatch("sync_genres", {}, {"settings_path": settings_path})

    assert result == {"known_genres": ["Hardtechno", "Schranz"]}
    assert json.loads(settings_path.read_text())["known_genres"] == ["Hardtechno", "Schranz"]


def test_dispatch_sync_genres_raises_ipc_error_when_db_locked(tmp_path):
    from db import DbLockedError

    settings_path = tmp_path / "settings.json"
    save_settings(settings_path, DEFAULT_SETTINGS)

    with patch("ipc.db.open_db", side_effect=DbLockedError("closed pls")):
        try:
            dispatch("sync_genres", {}, {"settings_path": settings_path})
            assert False, "expected IpcError"
        except IpcError as e:
            assert "rekordbox" in str(e)
