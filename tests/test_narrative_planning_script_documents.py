from __future__ import annotations

import pytest

from ai_anime.modules.narrative_planning.public import (
    BeatNotFound,
    ScriptNotFound,
    save_episode_script,
    update_episode_script_beat,
)


class _Store:
    def __init__(self, script=None) -> None:
        self.script = script
        self.updated: tuple[int, int, dict] | None = None
        self.persisted: tuple[int, list[dict]] | None = None
        self.graph_loaded = False

    async def get_script_as_dict(self, episode_num: int):
        return self.script

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates,
    ) -> bool:
        self.updated = (episode_number, beat_number, updates)
        return True

    async def load_graph_state(self):
        self.graph_loaded = True

    async def persist_beats_from_script(self, episode_num: int, beats: list[dict]):
        self.persisted = (episode_num, beats)


@pytest.mark.asyncio
async def test_updates_beat_through_script_store() -> None:
    beat = {"beat_number": 2, "visual_description": "旧画面"}
    store = _Store({"beats": [beat]})

    updated = await update_episode_script_beat(
        store,
        episode_num=1,
        beat_num=2,
        updates={"visual_description": "新画面", "speaker": "秦"},
    )

    assert updated["visual_description"] == "新画面"
    assert store.updated == (
        1,
        2,
        {"visual_description": "新画面", "speaker": "秦"},
    )


@pytest.mark.asyncio
async def test_reports_missing_script_or_beat() -> None:
    with pytest.raises(ScriptNotFound):
        await update_episode_script_beat(
            _Store(),
            episode_num=1,
            beat_num=1,
            updates={},
        )

    with pytest.raises(BeatNotFound):
        await update_episode_script_beat(
            _Store({"beats": []}),
            episode_num=1,
            beat_num=1,
            updates={},
        )


@pytest.mark.asyncio
async def test_saves_normalized_script_beats() -> None:
    store = _Store()

    saved = await save_episode_script(
        store,
        episode_num=3,
        beats=[{"beat_number": 1, "visual_description": "画面"}],
    )

    assert store.graph_loaded is True
    assert store.persisted is not None
    assert store.persisted[0] == 3
    assert store.persisted[1][0]["visual_description"] == "画面"
    assert saved.as_dict() == {"episode": 3, "beats_count": 1}
