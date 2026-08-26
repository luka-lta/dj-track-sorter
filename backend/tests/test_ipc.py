import io
import json
from pathlib import Path
from types import SimpleNamespace

from ipc import dispatch, run_loop, IpcError
from settings import DEFAULT_SETTINGS


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
