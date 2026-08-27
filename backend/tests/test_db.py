from types import SimpleNamespace

from db import load_genre_mytags


def make_db(categories: dict[str, list[str]]):
    """Fake db double: categories maps category name -> list of child tag names."""
    rows = []
    for category_name, child_names in categories.items():
        children = [SimpleNamespace(Name=name) for name in child_names]
        rows.append(SimpleNamespace(Name=category_name, Children=children))

    def get_my_tag(**kwargs):
        name = kwargs.get("Name")
        return [row for row in rows if row.Name == name]

    return SimpleNamespace(get_my_tag=get_my_tag)


def test_load_genre_mytags_returns_sorted_child_names():
    db = make_db({"Genre": ["Schranz", "Hardtechno"]})
    assert load_genre_mytags(db) == ["Hardtechno", "Schranz"]


def test_load_genre_mytags_ignores_other_categories():
    db = make_db({"Genre": ["Techno"], "Mood": ["Dark", "Uplifting"]})
    assert load_genre_mytags(db) == ["Techno"]


def test_load_genre_mytags_returns_empty_list_when_category_missing():
    db = make_db({"Mood": ["Dark"]})
    assert load_genre_mytags(db) == []


def test_load_genre_mytags_returns_empty_list_when_category_has_no_children():
    db = make_db({"Genre": []})
    assert load_genre_mytags(db) == []
