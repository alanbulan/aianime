from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.production.public import (
    SketchColorAssignmentResult,
    SketchColorMarkersMissing,
)


class _Store:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats

    async def get_beats_as_dicts(self, episode_num: int) -> list[dict]:
        assert episode_num == 2
        return self.beats


def _configure(monkeypatch, tmp_path, *, beats: list[dict], use_cases):
    from ai_anime.api.routes import generation

    store = _Store(beats)

    async def resolve_project(project: str, user: dict, required_role: str):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return SimpleNamespace(
            ctx=None,
            username="alice",
            project_name="demo",
            output_dir=str(tmp_path),
        )

    async def make_store(username: str, project: str):
        assert (username, project) == ("alice", "demo")
        return store

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "make_sqlite_store", make_store)
    monkeypatch.setattr(
        generation,
        "sketch_color_assignment_use_cases",
        lambda candidate: use_cases if candidate is store else None,
    )
    return generation


@pytest.mark.asyncio
async def test_assign_colors_maps_application_result(monkeypatch, tmp_path) -> None:
    calls: list[dict] = []

    class _UseCases:
        async def assign(self, **kwargs):
            calls.append(kwargs)
            return SketchColorAssignmentResult(
                identity_colors={"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
                prop_colors={"账单": "#0D47A1 ROYAL BLUE"},
            )

    generation = _configure(
        monkeypatch,
        tmp_path,
        beats=[{"beat_number": 1}],
        use_cases=_UseCases(),
    )

    response = await generation.assign_sketch_colors(
        project="demo",
        episode_num=2,
        user={"username": "alice"},
    )

    assert response == {
        "ok": True,
        "data": {
            "colors": {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
            "count": 1,
            "prop_colors": {"账单": "#0D47A1 ROYAL BLUE"},
            "prop_count": 1,
        },
    }
    assert calls == [
        {
            "episode_num": 2,
            "beats": [{"beat_number": 1}],
            "output_dir": str(tmp_path),
        }
    ]


@pytest.mark.asyncio
async def test_assign_colors_maps_missing_markers(monkeypatch, tmp_path) -> None:
    class _UseCases:
        async def assign(self, **_kwargs):
            raise SketchColorMarkersMissing

    generation = _configure(
        monkeypatch,
        tmp_path,
        beats=[{"beat_number": 1}],
        use_cases=_UseCases(),
    )

    response = await generation.assign_sketch_colors(
        project="demo",
        episode_num=2,
        user={"username": "alice"},
    )

    assert response == {
        "ok": False,
        "error": "No identity or global prop markers found in beats",
    }


@pytest.mark.asyncio
async def test_assign_colors_keeps_no_beats_response(monkeypatch, tmp_path) -> None:
    generation = _configure(
        monkeypatch,
        tmp_path,
        beats=[],
        use_cases=object(),
    )

    response = await generation.assign_sketch_colors(
        project="demo",
        episode_num=2,
        user={"username": "alice"},
    )

    assert response == {"ok": False, "error": "No beats found for episode 2"}
