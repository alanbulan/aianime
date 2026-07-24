from __future__ import annotations

from pathlib import Path

import pytest

from ai_anime.modules.production.infrastructure import sketch_color
from ai_anime.modules.production.infrastructure.sketch_color import (
    AssetWorldRuntimePropMenuSource,
    LocalProductionSketchWorkspace,
)


@pytest.mark.asyncio
async def test_runtime_prop_menu_delegates_to_asset_world_public_api(
    monkeypatch,
) -> None:
    captured: dict = {}

    async def runtime_prop_menu_for_episode(store, episode, beats):
        captured.update({"store": store, "episode": episode, "beats": beats})
        return [{"prop_id": "账单"}]

    monkeypatch.setattr(
        sketch_color,
        "runtime_prop_menu_for_episode",
        runtime_prop_menu_for_episode,
    )
    store = object()
    episode = {"episode": 2}
    beats = [{"beat_number": 1}]

    result = await AssetWorldRuntimePropMenuSource().for_episode(
        store,
        episode,
        beats,
    )

    assert result == [{"prop_id": "账单"}]
    assert captured == {"store": store, "episode": episode, "beats": beats}


def test_workspace_delegates_to_path_resolver(
    tmp_path: Path,
    monkeypatch,
) -> None:
    calls: list[tuple[str, int] | str] = []

    class _PathResolver:
        def __init__(self, output_dir: str, episode_num: int) -> None:
            calls.append((output_dir, episode_num))

        def clean_sketches(self) -> None:
            calls.append("clean")

    monkeypatch.setattr(sketch_color, "PathResolver", _PathResolver)

    LocalProductionSketchWorkspace().clear_episode_sketches(tmp_path, 2)

    assert calls == [(str(tmp_path), 2), "clean"]
