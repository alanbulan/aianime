from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.public import (
    EpisodeNotFound,
    get_episode_details,
    list_episode_summaries,
    update_episode_metadata,
)


class _Repository:
    def __init__(self, episode=None) -> None:
        self.episode = episode
        self.updates: list[dict] = []

    def get_all_episodes(self):
        return [self.episode] if self.episode is not None else []

    def get_episode(self, episode_num: int):
        if self.episode is None:
            return None
        return self.episode if self.episode.number == episode_num else None

    async def update_episode(self, episode_num: int, **updates) -> None:
        self.updates.append(updates)
        for key, value in updates.items():
            setattr(self.episode, key, value)


def _episode():
    return SimpleNamespace(
        number=1,
        title="第一集",
        content_summary="摘要",
        raw_content="原文",
        beat_source_text="改写",
        character_names=["秦"],
        key_events=["入宫"],
        cliffhanger="悬念",
        identity_ids=["秦_青年"],
        identity_default_map={"秦": "秦_青年"},
        scene_menu=[{"scene_id": "宫门"}],
        prop_menu=[{"prop_id": "玉佩"}],
    )


def test_projects_episode_list_and_details() -> None:
    repository = _Repository(_episode())

    summaries = list_episode_summaries(repository)
    details = get_episode_details(repository, 1)

    assert summaries[0]["summary"] == "摘要"
    assert summaries[0]["scene_menu"] == [{"scene_id": "宫门"}]
    assert details["raw_content"] == "原文"
    assert details["identity_default_map"] == {"秦": "秦_青年"}


def test_reports_missing_episode() -> None:
    with pytest.raises(EpisodeNotFound):
        get_episode_details(_Repository(), 9)


@pytest.mark.asyncio
async def test_updates_episode_metadata() -> None:
    repository = _Repository(_episode())

    updated = await update_episode_metadata(
        repository,
        episode_num=1,
        updates={"title": "新标题"},
    )

    assert repository.updates == [{"title": "新标题"}]
    assert updated["title"] == "新标题"
