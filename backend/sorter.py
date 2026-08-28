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
    selected_tracks: set[str] | None = None,
) -> list[dict]:
    plan: list[dict] = []

    for track in tracks:
        if selected_tracks is not None and track.name not in selected_tracks:
            plan.append({
                "track_name": track.name,
                "track_path": str(track),
                "genre": None,
                "source": "skip",
                "write_mytag": False,
                "target_path": None,
                "warnings": ["Track wurde abgewählt."],
            })
            continue

        content = content_lookup.get(str(track.resolve()))
        detected_genre = genre_from_content(content, known_genres) if content else None
        chosen = genre_choices.get(track.name)
        warnings: list[str] = []
        previous_genre = None

        if chosen is not None and chosen != detected_genre:
            genre = chosen
            source = "user"
            write_mytag = content is not None
            previous_genre = detected_genre
        elif detected_genre is not None:
            genre = detected_genre
            source = "mytag"
            write_mytag = False
        else:
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

        target_path = dj_root / genre / track.name
        if target_path.exists():
            warnings.append("Zieldatei existiert bereits, Track wird übersprungen.")

        item = {
            "track_name": track.name,
            "track_path": str(track),
            "genre": genre,
            "source": source,
            "write_mytag": write_mytag,
            "previous_genre": previous_genre,
            "target_path": str(target_path),
            "warnings": warnings,
        }
        if content is not None:
            item["_content"] = content
        plan.append(item)

    return plan


def execute_plan(db, plan_items: list[dict], find_mytag_fn, set_mytag_fn, remove_mytag_fn=None) -> list[dict]:
    results: list[dict] = []

    for item in plan_items:
        if item["warnings"] or item["source"] == "skip":
            results.append({"track_name": item["track_name"], "status": "skipped"})
            continue

        previous_genre = item.get("previous_genre")
        if previous_genre and remove_mytag_fn is not None:
            old_mytag = find_mytag_fn(db, previous_genre)
            if old_mytag is not None:
                remove_mytag_fn(db, item["_content"], old_mytag)

        if item["write_mytag"]:
            mytag = find_mytag_fn(db, item["genre"])
            if mytag is not None:
                set_mytag_fn(db, item["_content"], mytag)

        target = Path(item["target_path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(item["track_path"], str(target))
        results.append({"track_name": item["track_name"], "status": "moved"})

    return results
