# DJ Track Sorter Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing `sort_tracks.py` CLI logic into a cross-platform (macOS + Windows) Electron desktop app, with a bundled Python sidecar handling rekordbox DB access, and no network/server component.

**Architecture:** Electron main process spawns a PyInstaller-built Python sidecar binary as a child process. Main process and sidecar exchange line-delimited JSON messages over stdin/stdout (request `{id, cmd, params}` → response `{id, ok, result|error}`). Renderer talks to main process via `contextBridge`/`ipcRenderer`; main process forwards to the sidecar and relays responses back. All local, no ports opened.

**Tech Stack:** Electron (main + renderer, vanilla JS/HTML/CSS, no framework), Python 3 + `pyrekordbox` (sidecar logic, ported from `sort_tracks.py`), PyInstaller (sidecar packaging), electron-builder (app packaging), pytest (backend tests).

**Spec:** `docs/superpowers/specs/2026-08-26-dj-sort-desktop-design.md`

## Global Constraints

- No server/network process — sidecar communicates only via stdin/stdout with the parent Electron process (per spec Architektur section).
- rekordbox must be closed while the app performs DB writes; app must detect a locked DB and show a clear "please close rekordbox" message with retry (per spec Error-Handling section).
- Every run shows a preview (`plan`) of exactly what will happen before `execute` runs — no silent DRY_RUN-only mode; DRY_RUN flag stays as an additional dev/debug toggle (per spec Datenfluss + Settings-Storage sections).
- Settings (Neu-folder path, DJ-root path, `KNOWN_GENRES`, DRY_RUN flag) are user-editable via a Settings screen and persisted to `app.getPath('userData')/settings.json` (per spec Settings-Storage section).
- IPC command namespace (`scan`, `plan`, `execute`, `get_settings`, `save_settings`) must stay additive — leave room for a future `download` command without renaming existing ones (per spec v2-Vorbereitung section).
- Existing target-exists-skip behavior from `sort_tracks.py` must be preserved: never overwrite a file that already exists at the target path.

---

## File Structure

```
dj-track-sorter/
├── backend/
│   ├── main.py            # sidecar entrypoint, runs the IPC loop
│   ├── ipc.py              # stdin/stdout JSON loop + command dispatch
│   ├── db.py                # open_db, build_content_lookup (ported)
│   ├── sorter.py            # genre_from_content, build_plan, execute_plan (ported)
│   ├── settings.py          # load_settings, save_settings, DEFAULT_SETTINGS
│   ├── requirements.txt
│   └── tests/
│       ├── test_sorter.py
│       ├── test_ipc.py
│       └── test_settings.py
├── main/
│   ├── main.js               # Electron app lifecycle, window creation
│   ├── sidecar.js            # spawn/manage Python sidecar, JSON line protocol
│   ├── ipc-handlers.js        # ipcMain handlers: scan/plan/execute/settings/pick-folder
│   └── preload.js             # contextBridge exposing safe API to renderer
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── app.js                 # view router / state (scan → confirm → log)
│   ├── views/
│   │   ├── track-list.js
│   │   ├── confirm-dialog.js
│   │   ├── log-panel.js
│   │   └── settings.js
├── package.json
├── electron-builder.yml
└── build-sidecar.sh          # PyInstaller build wrapper
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `backend/requirements.txt`
- Create: `.gitignore`

**Interfaces:**
- Produces: npm scripts `start`, `test:backend` that later tasks rely on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dj-track-sorter",
  "version": "0.1.0",
  "private": true,
  "main": "main/main.js",
  "scripts": {
    "start": "electron .",
    "test:backend": "cd backend && python3 -m pytest -v"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3"
  }
}
```

- [ ] **Step 2: Create `backend/requirements.txt`**

```
pyrekordbox>=0.3.0
pytest>=8.0.0
pyinstaller>=6.0.0
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
backend/build/
backend/dist/
*.pyc
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run: `npm install` in project root.
Run: `python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt`

Expected: both commands finish without error.

- [ ] **Step 5: Commit**

```bash
git add package.json backend/requirements.txt .gitignore
git commit -m "chore: scaffold electron + python project"
```

---

### Task 2: Backend settings module

**Files:**
- Create: `backend/settings.py`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS: dict`, `load_settings(path: Path) -> dict`, `save_settings(path: Path, settings: dict) -> None`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_settings.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_settings.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'settings'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/settings.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_settings.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/settings.py backend/tests/test_settings.py
git commit -m "feat: add backend settings load/save"
```

---

### Task 3: Backend db module (ported from `sort_tracks.py`)

**Files:**
- Create: `backend/db.py`

**Interfaces:**
- Consumes: `pyrekordbox.Rekordbox6Database`
- Produces: `open_db() -> Rekordbox6Database` (raises `DbLockedError` on failure), `build_content_lookup(db) -> dict[str, object]`, exception class `DbLockedError`

No dedicated test file for this task — `open_db`/`build_content_lookup` require a real rekordbox installation and are exercised in the Task 11 manual end-to-end test instead. This task is a straight port with one behavior change: raise a typed exception instead of `sys.exit`, so `ipc.py` (Task 5) can turn it into a structured error response.

- [ ] **Step 1: Write `backend/db.py`**

```python
# backend/db.py
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
```

- [ ] **Step 2: Manual smoke check (no rekordbox test DB required at this point)**

Run: `cd backend && .venv/bin/python -c "import db; print(db.DbLockedError, db.open_db, db.build_content_lookup)"`
Expected: prints the three names without import errors.

- [ ] **Step 3: Commit**

```bash
git add backend/db.py
git commit -m "feat: add backend rekordbox db access module"
```

---

### Task 4: Backend sorter module (plan/execute logic)

**Files:**
- Create: `backend/sorter.py`
- Test: `backend/tests/test_sorter.py`

**Interfaces:**
- Consumes: nothing beyond stdlib; `content_lookup` values are duck-typed objects with `.FolderPath`, `.ID`, `.MyTags` (list of objects with `.MyTagName`, `.MyTagID`).
- Produces:
  - `genre_from_content(content, known_genres: set[str]) -> str | None`
  - `build_plan(tracks: list[Path], content_lookup: dict[str, object], known_genres: set[str], dj_root: Path, genre_choices: dict[str, str]) -> list[dict]`
  - `execute_plan(db, plan_items: list[dict], find_mytag_fn, set_mytag_fn) -> list[dict]` (used by `ipc.py` in Task 5; `find_mytag_fn`/`set_mytag_fn` are injected so this stays testable without a real db)

Each plan item dict: `{"track_name": str, "track_path": str, "genre": str | None, "source": "mytag" | "user" | "skip", "write_mytag": bool, "target_path": str | None, "warnings": list[str]}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sorter.py
from pathlib import Path
from types import SimpleNamespace

from sorter import genre_from_content, build_plan, execute_plan

KNOWN_GENRES = {"Hardtechno", "Schranz"}


def make_content(folder_path: str, tag_names: list[str], content_id: str = "c1"):
    my_tags = [SimpleNamespace(MyTagName=name, MyTagID=name) for name in tag_names]
    return SimpleNamespace(FolderPath=folder_path, ID=content_id, MyTags=my_tags)


def test_genre_from_content_returns_known_tag():
    content = make_content("/x.mp3", ["Foo", "Schranz"])
    assert genre_from_content(content, KNOWN_GENRES) == "Schranz"


def test_genre_from_content_returns_none_when_no_known_tag():
    content = make_content("/x.mp3", ["Foo", "Bar"])
    assert genre_from_content(content, KNOWN_GENRES) is None


def test_genre_from_content_returns_none_when_no_tags():
    content = make_content("/x.mp3", [])
    assert genre_from_content(content, KNOWN_GENRES) is None


def test_build_plan_uses_existing_mytag_without_user_choice(tmp_path):
    track = tmp_path / "a.mp3"
    track.write_bytes(b"")
    content = make_content(str(track.resolve()), ["Schranz"])
    lookup = {str(track.resolve()): content}
    dj_root = tmp_path / "DJ"

    plan = build_plan([track], lookup, KNOWN_GENRES, dj_root, genre_choices={})

    assert plan == [{
        "track_name": "a.mp3",
        "track_path": str(track),
        "genre": "Schranz",
        "source": "mytag",
        "write_mytag": False,
        "target_path": str(dj_root / "Schranz" / "a.mp3"),
        "warnings": [],
    }]


def test_build_plan_uses_user_choice_and_flags_write_mytag(tmp_path):
    track = tmp_path / "b.mp3"
    track.write_bytes(b"")
    content = make_content(str(track.resolve()), [])
    lookup = {str(track.resolve()): content}
    dj_root = tmp_path / "DJ"

    plan = build_plan(
        [track], lookup, KNOWN_GENRES, dj_root,
        genre_choices={"b.mp3": "Hardtechno"},
    )

    assert plan == [{
        "track_name": "b.mp3",
        "track_path": str(track),
        "genre": "Hardtechno",
        "source": "user",
        "write_mytag": True,
        "target_path": str(dj_root / "Hardtechno" / "b.mp3"),
        "warnings": [],
    }]


def test_build_plan_skips_track_with_no_choice(tmp_path):
    track = tmp_path / "c.mp3"
    track.write_bytes(b"")
    dj_root = tmp_path / "DJ"

    plan = build_plan([track], {}, KNOWN_GENRES, dj_root, genre_choices={})

    assert plan == [{
        "track_name": "c.mp3",
        "track_path": str(track),
        "genre": None,
        "source": "skip",
        "write_mytag": False,
        "target_path": None,
        "warnings": ["Track wurde nicht in der rekordbox-Datenbank gefunden."],
    }]


def test_build_plan_warns_when_target_exists(tmp_path):
    track = tmp_path / "d.mp3"
    track.write_bytes(b"")
    content = make_content(str(track.resolve()), ["Schranz"])
    lookup = {str(track.resolve()): content}
    dj_root = tmp_path / "DJ"
    existing_target = dj_root / "Schranz" / "d.mp3"
    existing_target.parent.mkdir(parents=True)
    existing_target.write_bytes(b"")

    plan = build_plan([track], lookup, KNOWN_GENRES, dj_root, genre_choices={})

    assert plan[0]["warnings"] == ["Zieldatei existiert bereits, Track wird übersprungen."]


def test_execute_plan_moves_file_and_sets_mytag(tmp_path):
    track = tmp_path / "e.mp3"
    track.write_bytes(b"data")
    target = tmp_path / "DJ" / "Hardtechno" / "e.mp3"
    content = SimpleNamespace(ID="c1", MyTags=[])

    calls = {"set_mytag": []}

    def find_mytag_fn(db, name):
        return SimpleNamespace(ID="tag-1", Name=name)

    def set_mytag_fn(db, content_arg, mytag):
        calls["set_mytag"].append((content_arg.ID, mytag.Name))

    plan_items = [{
        "track_name": "e.mp3",
        "track_path": str(track),
        "genre": "Hardtechno",
        "source": "user",
        "write_mytag": True,
        "target_path": str(target),
        "warnings": [],
        "_content": content,
    }]

    results = execute_plan(db=None, plan_items=plan_items,
                            find_mytag_fn=find_mytag_fn, set_mytag_fn=set_mytag_fn)

    assert target.exists()
    assert not track.exists()
    assert calls["set_mytag"] == [("c1", "Hardtechno")]
    assert results == [{"track_name": "e.mp3", "status": "moved"}]


def test_execute_plan_skips_items_with_warnings(tmp_path):
    track = tmp_path / "f.mp3"
    track.write_bytes(b"data")

    plan_items = [{
        "track_name": "f.mp3",
        "track_path": str(track),
        "genre": "Hardtechno",
        "source": "mytag",
        "write_mytag": False,
        "target_path": str(tmp_path / "DJ" / "Hardtechno" / "f.mp3"),
        "warnings": ["Zieldatei existiert bereits, Track wird übersprungen."],
        "_content": None,
    }]

    results = execute_plan(db=None, plan_items=plan_items,
                            find_mytag_fn=lambda *a: None, set_mytag_fn=lambda *a: None)

    assert track.exists()
    assert results == [{"track_name": "f.mp3", "status": "skipped"}]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_sorter.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sorter'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/sorter.py
from __future__ import annotations

import shutil
from pathlib import Path


def genre_from_content(content, known_genres: set[str]) -> str | None:
    try:
        tag_names = [tag.MyTagName for tag in content.MyTags]
    except Exception:
        tag_names = []
    for name in tag_names:
        if name in known_genres:
            return name
    return None


def build_plan(
    tracks: list[Path],
    content_lookup: dict[str, object],
    known_genres: set[str],
    dj_root: Path,
    genre_choices: dict[str, str],
) -> list[dict]:
    plan: list[dict] = []

    for track in tracks:
        content = content_lookup.get(str(track.resolve()))
        genre = genre_from_content(content, known_genres) if content else None
        source = "mytag" if genre else None
        write_mytag = False
        warnings: list[str] = []

        if genre is None:
            chosen = genre_choices.get(track.name)
            if chosen is None:
                plan.append({
                    "track_name": track.name,
                    "track_path": str(track),
                    "genre": None,
                    "source": "skip",
                    "write_mytag": False,
                    "target_path": None,
                    "warnings": ["Track wurde nicht in der rekordbox-Datenbank gefunden."]
                        if content is None else
                        ["Kein Genre ausgewählt, Track wird übersprungen."],
                })
                continue
            genre = chosen
            source = "user"
            write_mytag = content is not None

        target_path = dj_root / genre / track.name
        if target_path.exists():
            warnings.append("Zieldatei existiert bereits, Track wird übersprungen.")

        item = {
            "track_name": track.name,
            "track_path": str(track),
            "genre": genre,
            "source": source,
            "write_mytag": write_mytag,
            "target_path": str(target_path),
            "warnings": warnings,
        }
        if content is not None:
            item["_content"] = content
        plan.append(item)

    return plan


def execute_plan(db, plan_items: list[dict], find_mytag_fn, set_mytag_fn) -> list[dict]:
    results: list[dict] = []

    for item in plan_items:
        if item["warnings"] or item["source"] == "skip":
            results.append({"track_name": item["track_name"], "status": "skipped"})
            continue

        if item["write_mytag"]:
            mytag = find_mytag_fn(db, item["genre"])
            if mytag is not None:
                set_mytag_fn(db, item["_content"], mytag)

        target = Path(item["target_path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(item["track_path"], str(target))
        results.append({"track_name": item["track_name"], "status": "moved"})

    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_sorter.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add backend/sorter.py backend/tests/test_sorter.py
git commit -m "feat: add backend plan/execute sorter logic"
```

---

### Task 5: Backend IPC loop and entrypoint

**Files:**
- Create: `backend/ipc.py`
- Create: `backend/main.py`
- Test: `backend/tests/test_ipc.py`

**Interfaces:**
- Consumes: `db.open_db`, `db.build_content_lookup`, `db.DbLockedError` (Task 3); `sorter.build_plan`, `sorter.execute_plan`, `sorter.genre_from_content` (Task 4); `settings.load_settings`, `settings.save_settings`, `settings.DEFAULT_SETTINGS` (Task 2)
- Produces: `dispatch(cmd: str, params: dict, deps: dict) -> dict` (returns the `result` payload or raises `IpcError(message)`), `run_loop(stdin, stdout, settings_path: Path) -> None`

`run_loop` reads one JSON object per line from `stdin` (`{"id": int, "cmd": str, "params": dict}`), calls `dispatch`, and writes one JSON object per line to `stdout` (`{"id": int, "ok": true, "result": ...}` or `{"id": int, "ok": false, "error": str}`). Loop exits cleanly on EOF.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_ipc.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ipc.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ipc'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/ipc.py
from __future__ import annotations

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
    known_genres = set(settings["known_genres"])
    results = []
    for track in tracks:
        content = lookup.get(str(track.resolve()))
        genre = sorter.genre_from_content(content, known_genres) if content else None
        results.append({
            "track_name": track.name,
            "found_in_rekordbox": content is not None,
            "detected_genre": genre,
        })
    return {"tracks": results}


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
    plan = sorter.build_plan(tracks, lookup, known_genres, dj_root, genre_choices)
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
    plan = sorter.build_plan(tracks, lookup, known_genres, dj_root, genre_choices)

    if settings.get("dry_run"):
        return {"results": [{"track_name": i["track_name"], "status": "dry_run"} for i in plan]}

    results = sorter.execute_plan(
        rb_db, plan,
        find_mytag_fn=lambda d, name: next(iter(d.get_my_tag(Name=name)), None),
        set_mytag_fn=_set_mytag,
    )
    rb_db.commit()
    return {"results": results}


def _set_mytag(rb_db, content, mytag) -> None:
    import datetime
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


_HANDLERS = {
    "get_settings": _cmd_get_settings,
    "save_settings": _cmd_save_settings,
    "scan": _cmd_scan,
    "plan": _cmd_plan,
    "execute": _cmd_execute,
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
```

```python
# backend/main.py
import sys
from pathlib import Path

from ipc import run_loop

if __name__ == "__main__":
    settings_path = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        Path.home() / ".dj-track-sorter" / "settings.json"
    )
    run_loop(sys.stdin, sys.stdout, settings_path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ipc.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/ipc.py backend/main.py backend/tests/test_ipc.py
git commit -m "feat: add backend IPC loop and sidecar entrypoint"
```

---

### Task 6: Electron sidecar process manager

**Files:**
- Create: `main/sidecar.js`

**Interfaces:**
- Consumes: `backend/main.py` (via `python3` in dev, packaged binary path in prod — packaging wired in Task 11)
- Produces: `class Sidecar` with `start(settingsPath: string): void`, `send(cmd: string, params: object): Promise<object>` (resolves with `result`, rejects with `Error(message)` on `ok: false`), `stop(): void`, event `'crash'` emitted with exit code

- [ ] **Step 1: Write `main/sidecar.js`**

```js
// main/sidecar.js
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

class Sidecar extends EventEmitter {
  constructor(command, args) {
    super();
    this.command = command;
    this.args = args;
    this.process = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  start(settingsPath) {
    this.process = spawn(this.command, [...this.args, settingsPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on('line', (line) => this._handleLine(line));

    this.process.stderr.on('data', (chunk) => {
      console.error('[sidecar stderr]', chunk.toString());
    });

    this.process.on('exit', (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('Sidecar-Prozess wurde beendet'));
      }
      this.pending.clear();
      this.emit('crash', code);
    });
  }

  _handleLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch (e) {
      console.error('[sidecar] invalid JSON line:', line);
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) return;
    this.pending.delete(response.id);
    if (response.ok) {
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(response.error));
    }
  }

  send(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify({ id, cmd, params }) + '\n');
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = { Sidecar };
```

- [ ] **Step 2: Manual smoke check**

Run:
```bash
node -e "
const { Sidecar } = require('./main/sidecar');
const path = require('path');
const s = new Sidecar('python3', [path.join(__dirname, 'backend', 'main.py')]);
s.start(path.join(__dirname, 'tmp-settings.json'));
s.send('get_settings', {}).then((r) => { console.log('OK', r); s.stop(); process.exit(0); })
  .catch((e) => { console.error('FAIL', e); process.exit(1); });
"
```
Expected: prints `OK { neu_dir: ..., dj_root: ..., known_genres: [...], dry_run: true }`

- [ ] **Step 3: Commit**

```bash
git add main/sidecar.js
git commit -m "feat: add electron sidecar process manager"
```

---

### Task 7: Electron main process, preload bridge, IPC handlers

**Files:**
- Create: `main/main.js`
- Create: `main/preload.js`
- Create: `main/ipc-handlers.js`

**Interfaces:**
- Consumes: `Sidecar` (Task 6)
- Produces: renderer-visible `window.djApi` with methods `getSettings()`, `saveSettings(settings)`, `scan()`, `plan(genreChoices)`, `execute()`, `pickFolder(): Promise<string | null>`, all returning Promises. Also exposes `onSidecarCrash(callback)`.

- [ ] **Step 1: Write `main/ipc-handlers.js`**

```js
// main/ipc-handlers.js
const { ipcMain, dialog } = require('electron');

function registerIpcHandlers(sidecar) {
  ipcMain.handle('dj:get-settings', () => sidecar.send('get_settings'));
  ipcMain.handle('dj:save-settings', (_e, settings) => sidecar.send('save_settings', { settings }));
  ipcMain.handle('dj:scan', () => sidecar.send('scan'));
  ipcMain.handle('dj:plan', (_e, genreChoices) => sidecar.send('plan', { genre_choices: genreChoices }));
  ipcMain.handle('dj:execute', () => sidecar.send('execute'));
  ipcMain.handle('dj:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

module.exports = { registerIpcHandlers };
```

- [ ] **Step 2: Write `main/preload.js`**

```js
// main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  getSettings: () => ipcRenderer.invoke('dj:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('dj:save-settings', settings),
  scan: () => ipcRenderer.invoke('dj:scan'),
  plan: (genreChoices) => ipcRenderer.invoke('dj:plan', genreChoices),
  execute: () => ipcRenderer.invoke('dj:execute'),
  pickFolder: () => ipcRenderer.invoke('dj:pick-folder'),
  onSidecarCrash: (callback) => ipcRenderer.on('dj:sidecar-crash', (_e, code) => callback(code)),
});
```

- [ ] **Step 3: Write `main/main.js`**

```js
// main/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { Sidecar } = require('./sidecar');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow;
let sidecar;

function sidecarCommand() {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return { command: path.join(process.resourcesPath, 'sidecar', `dj-sorter-sidecar${ext}`), args: [] };
  }
  return { command: 'python3', args: [path.join(__dirname, '..', 'backend', 'main.py')] };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

app.whenReady().then(() => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  const { command, args } = sidecarCommand();
  sidecar = new Sidecar(command, args);
  sidecar.start(settingsPath);
  sidecar.on('crash', (code) => {
    if (mainWindow) mainWindow.webContents.send('dj:sidecar-crash', code);
  });

  registerIpcHandlers(sidecar);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (sidecar) sidecar.stop();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Manual smoke check**

Run: `npm start`
Expected: Electron window opens with no console errors about missing `src/index.html` (a placeholder file is fine for now — created in Task 8). Check devtools console for `djApi` being defined: open devtools, type `window.djApi`, expect an object with the six methods.

- [ ] **Step 5: Commit**

```bash
git add main/main.js main/preload.js main/ipc-handlers.js
git commit -m "feat: wire electron main process to sidecar via IPC"
```

---

### Task 8: Renderer shell + track list view

**Files:**
- Create: `src/index.html`
- Create: `src/styles.css`
- Create: `src/app.js`
- Create: `src/views/track-list.js`

**Interfaces:**
- Consumes: `window.djApi.scan()`, `window.djApi.plan(genreChoices)`, `window.djApi.getSettings()`
- Produces: `renderTrackList(container, { tracks, knownGenres, onSubmit })` — `onSubmit(genreChoices: Record<string,string>)` called when user clicks "Vorschau"

- [ ] **Step 1: Write `src/index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>DJ Track Sorter</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app"></div>
  <script src="views/track-list.js"></script>
  <script src="views/confirm-dialog.js"></script>
  <script src="views/log-panel.js"></script>
  <script src="views/settings.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/styles.css`**

```css
:root {
  --bg: #0f1115;
  --surface: #171a21;
  --border: #262b36;
  --text: #e6e9ef;
  --muted: #8b94a7;
  --accent: #6ea8fe;
  --danger: #f28b82;
  --success: #81c995;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}

#app {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

header.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

h1 { font-size: 1.25rem; font-weight: 600; }

button {
  background: var(--accent);
  color: #0f1115;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-weight: 600;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}

button:disabled { opacity: 0.5; cursor: not-allowed; }

.track-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: var(--surface);
}

.track-row .genre-badge {
  color: var(--success);
  font-size: 0.85rem;
}

.track-row select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem;
}

.warning { color: var(--danger); font-size: 0.85rem; }

.log-line { font-family: monospace; font-size: 0.85rem; padding: 0.15rem 0; }
</style>
```

- [ ] **Step 3: Write `src/views/track-list.js`**

```js
// src/views/track-list.js
function renderTrackList(container, { tracks, knownGenres, onSubmit }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Neue Tracks</h1>';
  container.appendChild(header);

  if (tracks.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Keine neuen Tracks gefunden.';
    container.appendChild(empty);
    return;
  }

  const choices = {};

  for (const track of tracks) {
    const row = document.createElement('div');
    row.className = 'track-row';

    const name = document.createElement('span');
    name.textContent = track.track_name;
    row.appendChild(name);

    if (track.detected_genre) {
      const badge = document.createElement('span');
      badge.className = 'genre-badge';
      badge.textContent = track.detected_genre;
      row.appendChild(badge);
    } else {
      const select = document.createElement('select');
      const skipOption = document.createElement('option');
      skipOption.value = '';
      skipOption.textContent = 'Überspringen';
      select.appendChild(skipOption);
      for (const genre of knownGenres) {
        const opt = document.createElement('option');
        opt.value = genre;
        opt.textContent = genre;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        if (select.value) choices[track.track_name] = select.value;
        else delete choices[track.track_name];
      });
      row.appendChild(select);
    }

    container.appendChild(row);
  }

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Vorschau';
  submitBtn.addEventListener('click', () => onSubmit(choices));
  container.appendChild(submitBtn);
}
```

- [ ] **Step 4: Write `src/app.js`**

```js
// src/app.js
async function main() {
  const app = document.getElementById('app');
  const settings = await window.djApi.getSettings();
  const { tracks } = await window.djApi.scan();

  renderTrackList(app, {
    tracks,
    knownGenres: settings.known_genres,
    onSubmit: async (genreChoices) => {
      const { plan } = await window.djApi.plan(genreChoices);
      renderConfirmDialog(app, {
        plan,
        onConfirm: async () => {
          const { results } = await window.djApi.execute();
          renderLogPanel(app, { results });
        },
        onCancel: () => main(),
      });
    },
  });

  window.djApi.onSidecarCrash(() => {
    app.innerHTML = '<p class="warning">Backend-Prozess abgestürzt. Bitte App neu starten.</p>';
  });
}

main();
```

- [ ] **Step 5: Manual smoke check**

Run: `npm start`
Expected: window shows "Neue Tracks" header and either the empty-state message or a track list, depending on the configured `neu_dir`. No uncaught exceptions in devtools console.

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css src/app.js src/views/track-list.js
git commit -m "feat: add renderer shell and track list view"
```

---

### Task 9: Confirm dialog + log panel views

**Files:**
- Create: `src/views/confirm-dialog.js`
- Create: `src/views/log-panel.js`

**Interfaces:**
- Consumes: plan items shape from Task 4/5 (`track_name`, `genre`, `target_path`, `warnings`), execute results shape (`track_name`, `status`)
- Produces: `renderConfirmDialog(container, { plan, onConfirm, onCancel })`, `renderLogPanel(container, { results })`

- [ ] **Step 1: Write `src/views/confirm-dialog.js`**

```js
// src/views/confirm-dialog.js
function renderConfirmDialog(container, { plan, onConfirm, onCancel }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Vorschau</h1>';
  container.appendChild(header);

  for (const item of plan) {
    const row = document.createElement('div');
    row.className = 'track-row';

    const label = document.createElement('span');
    if (item.warnings.length > 0) {
      label.textContent = `${item.track_name} — übersprungen: ${item.warnings.join(' ')}`;
      label.className = 'warning';
    } else {
      label.textContent = `${item.track_name} → ${item.target_path}`;
    }
    row.appendChild(label);
    container.appendChild(row);
  }

  const actions = document.createElement('div');

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Ausführen';
  confirmBtn.addEventListener('click', onConfirm);
  actions.appendChild(confirmBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Zurück';
  cancelBtn.addEventListener('click', onCancel);
  actions.appendChild(cancelBtn);

  container.appendChild(actions);
}
```

- [ ] **Step 2: Write `src/views/log-panel.js`**

```js
// src/views/log-panel.js
function renderLogPanel(container, { results }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Ergebnis</h1>';
  container.appendChild(header);

  for (const result of results) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = `${result.track_name}: ${result.status}`;
    container.appendChild(line);
  }

  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Neu scannen';
  restartBtn.addEventListener('click', () => main());
  container.appendChild(restartBtn);
}
```

- [ ] **Step 3: Manual smoke check**

Run: `npm start`, click through Scan → pick a genre for an untagged track (or rely on auto-detected ones) → Vorschau → Ausführen.
Expected: confirm dialog lists target paths, execute shows a result log line per track, "Neu scannen" returns to the track list.

- [ ] **Step 4: Commit**

```bash
git add src/views/confirm-dialog.js src/views/log-panel.js
git commit -m "feat: add confirm dialog and result log views"
```

---

### Task 10: Settings screen

**Files:**
- Create: `src/views/settings.js`
- Modify: `src/app.js` — add a settings button in the header that opens the settings view

**Interfaces:**
- Consumes: `window.djApi.getSettings()`, `window.djApi.saveSettings(settings)`, `window.djApi.pickFolder()`
- Produces: `renderSettings(container, { settings, onSave, onCancel })`

- [ ] **Step 1: Write `src/views/settings.js`**

```js
// src/views/settings.js
function renderSettings(container, { settings, onSave, onCancel }) {
  container.innerHTML = '';
  const state = { ...settings, known_genres: [...settings.known_genres] };

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Einstellungen</h1>';
  container.appendChild(header);

  function folderRow(label, key) {
    const row = document.createElement('div');
    row.className = 'track-row';
    const text = document.createElement('span');
    text.textContent = `${label}: ${state[key]}`;
    row.appendChild(text);
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Ändern';
    btn.addEventListener('click', async () => {
      const picked = await window.djApi.pickFolder();
      if (picked) {
        state[key] = picked;
        text.textContent = `${label}: ${state[key]}`;
      }
    });
    row.appendChild(btn);
    container.appendChild(row);
  }

  folderRow('Neu-Ordner', 'neu_dir');
  folderRow('DJ-Root', 'dj_root');

  const genresRow = document.createElement('div');
  genresRow.className = 'track-row';
  const genresInput = document.createElement('input');
  genresInput.value = state.known_genres.join(', ');
  genresInput.placeholder = 'Genre1, Genre2, ...';
  genresInput.addEventListener('input', () => {
    state.known_genres = genresInput.value.split(',').map((g) => g.trim()).filter(Boolean);
  });
  genresRow.appendChild(genresInput);
  container.appendChild(genresRow);

  const dryRunRow = document.createElement('div');
  dryRunRow.className = 'track-row';
  const dryRunLabel = document.createElement('label');
  const dryRunCheckbox = document.createElement('input');
  dryRunCheckbox.type = 'checkbox';
  dryRunCheckbox.checked = state.dry_run;
  dryRunCheckbox.addEventListener('change', () => { state.dry_run = dryRunCheckbox.checked; });
  dryRunLabel.appendChild(dryRunCheckbox);
  dryRunLabel.appendChild(document.createTextNode(' DRY RUN (nichts schreiben, nur simulieren)'));
  dryRunRow.appendChild(dryRunLabel);
  container.appendChild(dryRunRow);

  const actions = document.createElement('div');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Speichern';
  saveBtn.addEventListener('click', () => onSave(state));
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Abbrechen';
  cancelBtn.addEventListener('click', onCancel);
  actions.appendChild(cancelBtn);

  container.appendChild(actions);
}
```

- [ ] **Step 2: Modify `src/app.js` to add settings navigation**

Add a settings button to the header rendered in `main()`, and a handler that saves via `djApi.saveSettings` then returns to the track list:

```js
// src/app.js — replace the body of main() with:
async function main() {
  const app = document.getElementById('app');
  const settings = await window.djApi.getSettings();
  const { tracks } = await window.djApi.scan();

  const app_ = app; // keep reference for nested closures
  const wrapper = document.createElement('div');
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'secondary';
  settingsBtn.textContent = 'Einstellungen';
  settingsBtn.addEventListener('click', () => {
    renderSettings(app_, {
      settings,
      onSave: async (newSettings) => {
        await window.djApi.saveSettings(newSettings);
        main();
      },
      onCancel: () => main(),
    });
  });

  renderTrackList(app, {
    tracks,
    knownGenres: settings.known_genres,
    onSubmit: async (genreChoices) => {
      const { plan } = await window.djApi.plan(genreChoices);
      renderConfirmDialog(app, {
        plan,
        onConfirm: async () => {
          const { results } = await window.djApi.execute();
          renderLogPanel(app, { results });
        },
        onCancel: () => main(),
      });
    },
  });

  app.querySelector('header.app-header').appendChild(settingsBtn);

  window.djApi.onSidecarCrash(() => {
    app.innerHTML = '<p class="warning">Backend-Prozess abgestürzt. Bitte App neu starten.</p>';
  });
}

main();
```

- [ ] **Step 3: Manual smoke check**

Run: `npm start`, click "Einstellungen", change the genre list, save.
Expected: returns to track list, new genre list reflected in dropdowns on next open of Settings.

- [ ] **Step 4: Commit**

```bash
git add src/views/settings.js src/app.js
git commit -m "feat: add settings screen for folders, genres, dry run"
```

---

### Task 11: Packaging (PyInstaller sidecar + electron-builder)

**Files:**
- Create: `build-sidecar.sh`
- Create: `electron-builder.yml`
- Modify: `package.json` — add `build:sidecar` and `dist` scripts

**Interfaces:**
- Produces: `dist/sidecar/dj-sorter-sidecar[.exe]` (consumed by `main/main.js`'s `sidecarCommand()` packaged branch from Task 7), final installers under `dist/`

- [ ] **Step 1: Write `build-sidecar.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
.venv/bin/pyinstaller --onefile --name dj-sorter-sidecar main.py \
  --distpath ../resources/sidecar --workpath build --specpath build
```

- [ ] **Step 2: Write `electron-builder.yml`**

```yaml
appId: com.example.djtracksorter
productName: DJ Track Sorter
directories:
  output: dist
files:
  - main/**/*
  - src/**/*
  - package.json
extraResources:
  - from: resources/sidecar
    to: sidecar
mac:
  target: dmg
  category: public.app-category.music
win:
  target: nsis
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
{
  "scripts": {
    "start": "electron .",
    "test:backend": "cd backend && python3 -m pytest -v",
    "build:sidecar": "bash build-sidecar.sh",
    "dist": "npm run build:sidecar && electron-builder"
  }
}
```

- [ ] **Step 4: Build and verify**

Run: `chmod +x build-sidecar.sh && npm run dist`
Expected: `resources/sidecar/dj-sorter-sidecar` binary produced, then an installer appears under `dist/` (`.dmg` on macOS, `.exe`/nsis installer on Windows — build on the target OS or via CI matrix, PyInstaller binaries are not cross-compilable).

- [ ] **Step 5: Commit**

```bash
git add build-sidecar.sh electron-builder.yml package.json
git commit -m "build: add PyInstaller sidecar build and electron-builder packaging"
```

---

### Task 12: Manual end-to-end verification

**Files:** none (verification task, no code changes)

**Interfaces:** none

- [ ] **Step 1: Prepare a safe rekordbox test environment**

In rekordbox: File > Library > Backup Library. Confirm the backup file exists before continuing (per spec Error-Handling section — never test destructive DB writes against an unbacked-up library).

- [ ] **Step 2: Prepare dummy files**

Create 2-3 zero-byte or short dummy `.mp3` files in the configured `neu_dir`. Import at least one of them into rekordbox and assign it a MyTag from `KNOWN_GENRES` (e.g. "Schranz") so both the auto-detected and manual-choice paths get exercised.

- [ ] **Step 3: Run the full flow with DRY_RUN on**

Launch app (`npm start`), open Settings, confirm `dry_run` is checked, save. Scan → assign a genre to the untagged dummy track → Vorschau → Ausführen.
Expected: log panel shows `status: dry_run` for all tracks, no files moved, no rekordbox MyTag changes.

- [ ] **Step 4: Run the full flow with rekordbox open (lock detection)**

With rekordbox running, trigger Scan.
Expected: UI surfaces the "rekordbox-Datenbank konnte nicht geöffnet werden" error from `db.DbLockedError`, not a crash.

- [ ] **Step 5: Run the full flow for real**

Close rekordbox. Turn off `dry_run` in Settings. Scan → Vorschau → Ausführen.
Expected: dummy files moved into `dj_root/<genre>/`, the previously-untagged track now has the chosen MyTag in rekordbox (verify by reopening rekordbox and checking the track's MyTag), log panel shows `status: moved` for both.

- [ ] **Step 6: Verify existing-target skip behavior**

Copy a dummy file back into `neu_dir` under the same name as one already moved. Scan → Vorschau.
Expected: plan shows a warning "Zieldatei existiert bereits, Track wird übersprungen." and Ausführen leaves the file in place (not overwritten, not moved).

---

## Self-Review Notes

- Spec coverage: Architektur → Tasks 6/7; Komponenten (backend/main/renderer/settings-storage) → Tasks 2-10; Datenfluss → Tasks 5/8/9; Error-Handling (DB locked, sidecar crash, target exists) → Tasks 5/6/7/12; Testing → Tasks 2/4/5 (pytest) + Task 12 (manual); v2-Vorbereitung → IPC command dispatch table in Task 5 is a plain dict keyed by command name, additive by construction.
- No placeholders: every step has literal code or an exact command.
- Type consistency checked: plan item shape (`track_name`, `track_path`, `genre`, `source`, `write_mytag`, `target_path`, `warnings`) is identical across Task 4 (`sorter.py`), Task 5 (`ipc.py` `_cmd_plan`), Task 8/9 (renderer views). Execute result shape (`track_name`, `status`) identical across Task 4, Task 5, Task 9.
