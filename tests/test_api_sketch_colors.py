from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.production.public import (
    AssignProjectSketchColorsCommand,
    SketchColorAssignmentResult,
    SketchColorMarkersMissing,
    SketchEpisodeBeatsMissing,
)
from ai_anime.modules.project_workspace.public import ProjectContext


def _configure(monkeypatch, tmp_path, *, use_cases):
    from ai_anime.api.routes import generation

    context = ProjectContext(
        project_id="project-1",
        project_name="demo",
        owner_type="user",
        owner_id="user-alice",
        owner_username="alice",
        requester_user_id="user-alice",
        requester_username="alice",
        requester_principals=(("user", "user-alice"),),
        effective_role="editor",
        home_node_id="local",
        output_dir=tmp_path,
        state_dir=tmp_path / "_state",
        runtime_dir=tmp_path / "_runtime",
        is_home_node=True,
    )

    async def resolve_project(project: str, user: dict, required_role: str):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return SimpleNamespace(
            ctx=context,
            username="alice",
            project_name="demo",
            output_dir=str(tmp_path),
        )

    monkeypatch.setattr(generation, "_resolve_generation_project", resolve_project)
    monkeypatch.setattr(generation, "sketch_marker_use_cases", lambda: use_cases)
    return generation, context


@pytest.mark.asyncio
async def test_assign_colors_maps_application_result(monkeypatch, tmp_path) -> None:
    calls: list[dict] = []

    class _UseCases:
        async def assign_colors(self, context, command):
            calls.append({"context": context, "command": command})
            return SketchColorAssignmentResult(
                identity_colors={"Hero_A": "#FF00FF FLUORESCENT MAGENTA"},
                prop_colors={"账单": "#0D47A1 ROYAL BLUE"},
            )

    generation, context = _configure(
        monkeypatch,
        tmp_path,
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
            "context": context,
            "command": AssignProjectSketchColorsCommand(episode_num=2),
        }
    ]


@pytest.mark.asyncio
async def test_assign_colors_maps_missing_markers(monkeypatch, tmp_path) -> None:
    class _UseCases:
        async def assign_colors(self, _context, _command):
            raise SketchColorMarkersMissing

    generation, _context = _configure(
        monkeypatch,
        tmp_path,
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
    class _UseCases:
        async def assign_colors(self, _context, command):
            raise SketchEpisodeBeatsMissing(command.episode_num)

    generation, _context = _configure(
        monkeypatch,
        tmp_path,
        use_cases=_UseCases(),
    )

    response = await generation.assign_sketch_colors(
        project="demo",
        episode_num=2,
        user={"username": "alice"},
    )

    assert response == {"ok": False, "error": "No beats found for episode 2"}
