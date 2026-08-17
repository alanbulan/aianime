from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentUseCases,
    SketchColorMarkersMissing,
    SketchColorPersistenceFailed,
)


class _Store:
    def __init__(
        self,
        previous_colors: dict[str, str],
        *,
        fail_persistence: bool = False,
        characters: list[Any] | None = None,
    ) -> None:
        self.previous_colors = previous_colors
        self.fail_persistence = fail_persistence
        self.characters = characters or []
        self.saved_colors: list[tuple[int, dict[str, str]]] = []
        self.episode_updates: list[tuple[int, dict[str, Any]]] = []

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]:
        assert episode_num == 2
        return self.previous_colors

    def get_all_characters(self) -> list[Any]:
        return self.characters

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None:
        if self.fail_persistence:
            raise RuntimeError("persistence unavailable")
        self.previous_colors = dict(colors)
        self.saved_colors.append((episode_num, colors))

    async def update_episode(self, episode_num: int, **updates: Any) -> None:
        self.episode_updates.append((episode_num, updates))


class _ColorAssigner:
    def __init__(self, colors: dict[str, str]) -> None:
        self.colors = colors
        self.calls: list[dict[str, Any]] = []

    def assign(
        self,
        characters: list[dict[str, Any]],
        beats: list[dict[str, Any]],
        *,
        existing_colors: dict[str, str] | None = None,
    ) -> dict[str, str]:
        self.calls.append(
            {
                "characters": characters,
                "beats": beats,
                "existing_colors": existing_colors,
            }
        )
        return self.colors


class _Episodes:
    def __init__(self, identity_ids: list[str] | None = None) -> None:
        self.calls: list[tuple[Any, int]] = []
        self.identity_ids = identity_ids or []

    def episode_or_none(self, store: Any, episode_num: int) -> Any:
        self.calls.append((store, episode_num))
        return SimpleNamespace(
            number=episode_num,
            identity_ids=self.identity_ids,
        )


class _PropMenus:
    def __init__(self, menu: list[dict[str, Any]]) -> None:
        self.menu = menu
        self.calls: list[tuple[Any, Any, list[dict[str, Any]]]] = []

    async def for_episode(
        self,
        store: Any,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        self.calls.append((store, episode, beats))
        return self.menu


class _Workspace:
    def __init__(self) -> None:
        self.cleared: list[tuple[str | Path, int]] = []

    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None:
        self.cleared.append((output_dir, episode_num))


def _use_cases(
    colors: dict[str, str],
    prop_menu: list[dict[str, Any]],
    *,
    identity_ids: list[str] | None = None,
) -> tuple[SketchColorAssignmentUseCases, _ColorAssigner, _Workspace]:
    assigner = _ColorAssigner(colors)
    workspace = _Workspace()
    return (
        SketchColorAssignmentUseCases(
            assigner,
            _Episodes(identity_ids),
            _PropMenus(prop_menu),
            workspace,
        ),
        assigner,
        workspace,
    )


@pytest.mark.asyncio
async def test_incremental_identity_assignment_persists_without_cleaning() -> None:
    previous = {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"}
    current = {
        **previous,
        "Hero_B": "#00FFFF FLUORESCENT CYAN",
    }
    store = _Store(previous)
    use_cases, assigner, workspace = _use_cases(current, [])
    beats = [{"visual_description": "{{Hero_A}} and {{Hero_B}}"}]

    result = await use_cases.assign(
        store=store,
        episode_num=2,
        beats=beats,
        output_dir="output/demo",
    )

    assert result.identity_colors == current
    assert result.prop_colors == {}
    assert assigner.calls == [
        {
            "characters": [],
            "beats": beats,
            "existing_colors": previous,
        }
    ]
    assert store.saved_colors == [(2, current)]
    assert store.episode_updates == []
    assert workspace.cleared == []


@pytest.mark.asyncio
async def test_prop_assignment_updates_episode_and_invalidates_initial_sketches() -> None:
    store = _Store({})
    prop_menu = [{"prop_id": "账单", "is_global_asset": True}]
    use_cases, _assigner, workspace = _use_cases({}, prop_menu)

    result = await use_cases.assign(
        store=store,
        episode_num=2,
        beats=[{"visual_description": "男人拿起[[账单]]。"}],
        output_dir="output/demo",
    )

    assert set(result.prop_colors) == {"账单"}
    assert store.saved_colors == []
    assert store.episode_updates == [(2, {"prop_menu": prop_menu})]
    assert prop_menu[0]["marker_color"] == result.prop_colors["账单"]
    assert workspace.cleared == [("output/demo", 2)]


@pytest.mark.asyncio
async def test_missing_markers_are_rejected() -> None:
    store = _Store({})
    use_cases, _assigner, workspace = _use_cases({}, [])

    with pytest.raises(SketchColorMarkersMissing):
        await use_cases.assign(
            store=store,
            episode_num=2,
            beats=[{"visual_description": "empty room"}],
            output_dir="output/demo",
        )

    assert workspace.cleared == []


@pytest.mark.asyncio
async def test_persistence_failure_is_reported_before_invalidating_sketches() -> None:
    store = _Store({}, fail_persistence=True)
    colors = {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"}
    use_cases, _assigner, workspace = _use_cases(colors, [])

    with pytest.raises(SketchColorPersistenceFailed, match="persistence unavailable"):
        await use_cases.assign(
            store=store,
            episode_num=2,
            beats=[{"visual_description": "{{Hero_A}} enters"}],
            output_dir="output/demo",
        )

    assert workspace.cleared == []


@pytest.mark.asyncio
async def test_assignment_fills_all_planned_episode_identities() -> None:
    class _PlannedAssigner(_ColorAssigner):
        def assign(
            self,
            characters: list[dict[str, Any]],
            beats: list[dict[str, Any]],
            *,
            existing_colors: dict[str, str] | None = None,
        ) -> dict[str, str]:
            self.calls.append(
                {
                    "characters": characters,
                    "beats": beats,
                    "existing_colors": existing_colors,
                }
            )
            if characters:
                return {"Hero_A": "#FF00FF FLUORESCENT MAGENTA"}
            return {}

    character = SimpleNamespace(
        name="Hero",
        identities=[SimpleNamespace(identity_id="Hero_A")],
    )
    store = _Store({}, characters=[character])
    assigner = _PlannedAssigner({})
    workspace = _Workspace()
    use_cases = SketchColorAssignmentUseCases(
        assigner,
        _Episodes(["Hero_A"]),
        _PropMenus([]),
        workspace,
    )

    result = await use_cases.assign(
        store=store,
        episode_num=2,
        beats=[{"visual_description": "Hero enters"}],
        output_dir="output/demo",
    )

    assert result.identity_colors == {
        "Hero_A": "#FF00FF FLUORESCENT MAGENTA"
    }
    assert assigner.calls[1]["characters"] == [
        {"name": "Hero", "identities": [{"identity_id": "Hero_A"}]}
    ]
    assert store.saved_colors == [(2, result.identity_colors)]
