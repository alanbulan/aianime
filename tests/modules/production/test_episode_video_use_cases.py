from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_video import (
    ComposeEpisodeVideoCommand,
    EpisodeBeatsMissing,
    EpisodeVideoTaskReceipt,
    EpisodeVideoUseCases,
    FinalEpisodeVideoStatus,
)


class _BeatSource:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.calls: list[tuple[object, int]] = []

    async def for_episode(self, context, episode_num: int) -> list[dict]:
        self.calls.append((context, episode_num))
        return self.beats


class _Scheduler:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    async def enqueue(self, context, task) -> EpisodeVideoTaskReceipt:
        self.calls.append((context, task))
        return EpisodeVideoTaskReceipt(
            task_id="task-1",
            task_key="task:compose_episode:project:proj-1:2",
            backend="celery",
            queue="node.local.ffmpeg",
        )


class _FinalVideos:
    def __init__(self) -> None:
        self.calls: list[tuple[object, int]] = []

    def status(self, context, episode_num: int) -> FinalEpisodeVideoStatus:
        self.calls.append((context, episode_num))
        return FinalEpisodeVideoStatus(
            exists=True,
            filename="ep002_final.mp4",
            video_url="/media/final.mp4",
        )


def _context():
    return SimpleNamespace(output_dir=Path("project"), project_id="proj-1")


@pytest.mark.asyncio
async def test_compose_schedules_exact_episode_payload() -> None:
    context = _context()
    beats = [{"beat_number": 1}, {"beat_number": 2}]
    source = _BeatSource(beats)
    scheduler = _Scheduler()
    use_cases = EpisodeVideoUseCases(source, scheduler, _FinalVideos())

    result = await use_cases.compose(
        context,
        ComposeEpisodeVideoCommand(
            episode_num=2,
            add_subtitles=False,
            add_bgm=True,
            resolution="1080x1920",
        ),
    )

    assert result.as_dict() == {
        "task_type": "compose_episode",
        "task_id": "task-1",
        "task_key": "task:compose_episode:project:proj-1:2",
        "backend": "celery",
        "queue": "node.local.ffmpeg",
        "message": "第 2 集成片合成已进入队列",
    }
    assert source.calls == [(context, 2)]
    assert len(scheduler.calls) == 1
    scheduled_context, task = scheduler.calls[0]
    assert scheduled_context is context
    assert task.backend_payload() == {
        "beats": beats,
        "add_subtitles": False,
        "add_bgm": True,
        "episode": 2,
        "output_dir": "project",
        "resolution": "1080x1920",
    }


@pytest.mark.asyncio
async def test_compose_rejects_episode_without_beats_before_scheduling() -> None:
    scheduler = _Scheduler()
    use_cases = EpisodeVideoUseCases(_BeatSource([]), scheduler, _FinalVideos())

    with pytest.raises(EpisodeBeatsMissing, match="No beats found for episode 2"):
        await use_cases.compose(
            _context(),
            ComposeEpisodeVideoCommand(episode_num=2),
        )

    assert scheduler.calls == []


def test_final_status_delegates_to_catalog() -> None:
    context = _context()
    catalog = _FinalVideos()
    use_cases = EpisodeVideoUseCases(_BeatSource([]), _Scheduler(), catalog)

    result = use_cases.final_status(context, 2)

    assert result.as_dict() == {
        "exists": True,
        "filename": "ep002_final.mp4",
        "video_url": "/media/final.mp4",
    }
    assert catalog.calls == [(context, 2)]
