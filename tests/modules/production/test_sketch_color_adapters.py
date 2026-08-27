from __future__ import annotations

import pytest

from ai_anime.modules.production.infrastructure import sketch_color
from ai_anime.modules.production.infrastructure.sketch_color import (
    AssetWorldRuntimePropMenuSource,
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
