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
        "_content": content,
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
        "_content": content,
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
