from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_audio import (
    AudioVoicePrerequisitesMissing,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    EpisodeAudioTaskReceipt,
    EpisodeAudioUseCases,
    GenerateEpisodeAudioCommand,
)


class _BeatSource:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.calls: list[tuple[object, int]] = []

    async def for_episode(self, context, episode_num: int) -> list[dict]:
        self.calls.append((context, episode_num))
        return self.beats


class _VoicePrerequisites:
    def __init__(self, errors: list[str] | None = None) -> None:
        self.errors = errors or []
        self.calls: list[tuple[object, int, list[int] | None, str]] = []

    async def check(
        self,
        context,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> list[str]:
        self.calls.append((context, episode_num, beat_numbers, mode))
        return self.errors


class _Scheduler:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    async def enqueue(self, context, task) -> EpisodeAudioTaskReceipt:
        self.calls.append((context, task))
        return EpisodeAudioTaskReceipt(
            task_id="task-1",
            task_key="task:audio_generation_indextts2:project:proj-1:3",
            backend="celery",
            queue="default",
        )


def _context(tmp_path: Path):
    return SimpleNamespace(
        project_id="proj-1",
        project_name="demo",
        owner_username="alice",
        output_dir=tmp_path,
        state_dir=tmp_path / "state",
    )


@pytest.mark.asyncio
async def test_generate_schedules_default_sync_mode(tmp_path: Path) -> None:
    context = _context(tmp_path)
    source = _BeatSource([{"beat_number": 1}])
    prerequisites = _VoicePrerequisites()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(source, prerequisites, scheduler)

    result = await use_cases.generate(
        context,
        GenerateEpisodeAudioCommand(episode_num=3),
    )

    assert result.as_dict() == {
        "task_type": "audio_generation_indextts2",
        "task_id": "task-1",
        "task_key": "task:audio_generation_indextts2:project:proj-1:3",
        "backend": "celery",
        "queue": "default",
        "message": "第 3 集语音批量生成已进入队列",
    }
    assert source.calls == [(context, 3)]
    assert prerequisites.calls == [(context, 3, None, "sync_changed")]
    _, task = scheduler.calls[0]
    assert task.backend_payload() == {
        "episode": 3,
        "mode": "sync_changed",
        "beat_numbers": None,
        "output_dir": str(tmp_path),
        "state_dir": str(tmp_path / "state"),
    }


@pytest.mark.asyncio
async def test_generate_rejects_episode_without_beats(tmp_path: Path) -> None:
    prerequisites = _VoicePrerequisites()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(_BeatSource([]), prerequisites, scheduler)

    with pytest.raises(EpisodeAudioBeatsMissing, match="No beats found for episode 3"):
        await use_cases.generate(
            _context(tmp_path),
            GenerateEpisodeAudioCommand(episode_num=3),
        )

    assert prerequisites.calls == []
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_generate_reports_first_five_voice_errors(tmp_path: Path) -> None:
    errors = [f"error-{index}" for index in range(6)]
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 1}]),
        _VoicePrerequisites(errors),
        scheduler,
    )

    with pytest.raises(AudioVoicePrerequisitesMissing) as caught:
        await use_cases.generate(
            _context(tmp_path),
            GenerateEpisodeAudioCommand(episode_num=3),
        )

    assert str(caught.value) == "error-0；error-1；error-2；error-3；error-4 ..."
    assert caught.value.code == "voice_prereq_required"
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_regenerate_beat_preserves_index_fallback(tmp_path: Path) -> None:
    context = _context(tmp_path)
    prerequisites = _VoicePrerequisites()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 9}]),
        prerequisites,
        scheduler,
    )

    result = await use_cases.regenerate_beat(context, 3, 1)

    assert result.as_dict()["message"] == "第 3 集 Beat 1 语音生成已进入队列"
    assert prerequisites.calls == [(context, 3, [1], "redo_selected")]
    _, task = scheduler.calls[0]
    assert task.backend_payload()["beat_numbers"] == [1]
    assert task.backend_payload()["mode"] == "redo_selected"


@pytest.mark.asyncio
async def test_regenerate_beat_rejects_unknown_number(tmp_path: Path) -> None:
    prerequisites = _VoicePrerequisites()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 9}]),
        prerequisites,
        scheduler,
    )

    with pytest.raises(EpisodeAudioBeatMissing, match="Beat 2 not found"):
        await use_cases.regenerate_beat(_context(tmp_path), 3, 2)

    assert prerequisites.calls == []
    assert scheduler.calls == []
