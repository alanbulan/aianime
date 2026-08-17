from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)


class _Store:
    def __init__(self, sketch_colors: dict[str, str]) -> None:
        self.characters = [SimpleNamespace(name="林昭")]
        self.sketch_colors = sketch_colors
        self.saved: list[tuple[int, dict[str, str]]] = []

    def get_episode(self, episode_num: int) -> Any:
        return {"episode": episode_num}

    def get_all_characters(self) -> list[Any]:
        return self.characters

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]:
        assert episode_num == 2
        return self.sketch_colors

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None:
        self.saved.append((episode_num, colors))


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
        return existing_colors or self.colors


class _Episodes:
    def episode_or_none(self, store: Any, episode_num: int) -> Any:
        return store.get_episode(episode_num)


class _CharacterProjector:
    def __init__(self) -> None:
        self.project_calls: list[tuple[list[Any], str]] = []
        self.map_calls: list[dict[str, Any]] = []

    def project_characters(
        self,
        characters: list[Any],
        project: str,
    ) -> list[dict[str, Any]]:
        self.project_calls.append((characters, project))
        return [{"name": character.name} for character in characters]

    def build_character_map(self, **kwargs: Any) -> dict[str, dict[str, Any]]:
        self.map_calls.append(kwargs)
        return {"林昭": {"sketch_color": "#3366FF"}}


@pytest.mark.asyncio
async def test_build_character_map_reuses_persisted_sketch_colors() -> None:
    store = _Store({"林昭_青年": "#3366FF"})
    colors = _ColorAssigner({"unused": "#FFFFFF"})
    projector = _CharacterProjector()
    use_cases = ProductionGenerationContextUseCases(
        store,
        _Episodes(),
        colors,
        projector,
    )
    beats = [{"beat_number": 1}]

    result = await use_cases.build_character_map(
        beats=beats,
        project="demo",
        episode_num=2,
        use_detected_identities=True,
    )

    assert result == {"林昭": {"sketch_color": "#3366FF"}}
    assert projector.project_calls == [(store.characters, "demo")]
    assert projector.map_calls == [
        {
            "beats": beats,
            "characters": [{"name": "林昭"}],
            "project": "demo",
            "sketch_colors": {"林昭_青年": "#3366FF"},
            "use_detected_identities": True,
        }
    ]
    assert colors.calls == [
        {
            "characters": [],
            "beats": beats,
            "existing_colors": {"林昭_青年": "#3366FF"},
        }
    ]
    assert store.saved == []


@pytest.mark.asyncio
async def test_build_character_map_assigns_and_persists_missing_colors() -> None:
    store = _Store({})
    assigned = {"林昭_青年": "#3366FF"}
    colors = _ColorAssigner(assigned)
    projector = _CharacterProjector()
    use_cases = ProductionGenerationContextUseCases(
        store,
        _Episodes(),
        colors,
        projector,
    )
    beats = [{"beat_number": 1}]

    await use_cases.build_character_map(
        beats=beats,
        project="demo",
        episode_num=2,
    )

    assert colors.calls == [
        {
            "characters": [],
            "beats": beats,
            "existing_colors": None,
        }
    ]
    assert store.saved == [(2, assigned)]
    assert projector.map_calls[0]["sketch_colors"] == assigned


def test_episode_lookup_delegates_to_episode_source() -> None:
    store = _Store({})
    use_cases = ProductionGenerationContextUseCases(
        store,
        _Episodes(),
        _ColorAssigner({}),
        _CharacterProjector(),
    )

    assert use_cases.episode_or_none(2) == {"episode": 2}
