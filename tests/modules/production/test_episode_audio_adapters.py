from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_audio import EpisodeAudioTask
from ai_anime.modules.production.infrastructure import episode_audio
from ai_anime.modules.production.infrastructure.episode_audio import (
    IndexTTS2VoicePrerequisiteChecker,
    TaskExecutionEpisodeAudioScheduler,
)
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


@pytest.mark.asyncio
async def test_voice_checker_uses_context_store_and_closes_it(monkeypatch) -> None:
    calls: list[tuple[str, object]] = []

    class _Store:
        async def close(self) -> None:
            calls.append(("close", None))

    context = SimpleNamespace(
        owner_username="alice",
        project_name="demo",
    )
    store = _Store()

    async def make_store(candidate):
        assert candidate is context
        return store

    async def collect(**kwargs):
        calls.append(("collect", kwargs))
        return ["missing voice"]

    monkeypatch.setattr(
        episode_audio.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        episode_audio,
        "collect_indextts2_voice_prereq_errors",
        collect,
    )

    result = await IndexTTS2VoicePrerequisiteChecker().check(
        context,
        3,
        [2],
        "redo_selected",
    )

    assert result == ["missing voice"]
    assert calls == [
        (
            "collect",
            {
                "store": store,
                "username": "alice",
                "project": "demo",
                "episode": 3,
                "beat_numbers": [2],
                "mode": "redo_selected",
            },
        ),
        ("close", None),
    ]


@pytest.mark.asyncio
async def test_audio_scheduler_preserves_task_payload_and_identity() -> None:
    calls: list[tuple[object, dict]] = []

    class _Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append((context, kwargs))
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="inline",
                queue="inline",
            )

    context = SimpleNamespace(project_id="proj-1")
    task = EpisodeAudioTask(
        episode_num=3,
        model="audio-speech-test",
        mode="redo_selected",
        beat_numbers=[2],
        output_dir=Path("output"),
        state_dir=Path("state"),
    )

    receipt = await TaskExecutionEpisodeAudioScheduler(
        ProjectTaskSubmissionUseCases(lambda: _Backend())
    ).enqueue(context, task)

    assert receipt.task_id == "task-1"
    assert receipt.task_key == "task:audio_generation_indextts2:project:proj-1:3"
    assert receipt.backend == "inline"
    assert receipt.queue == "inline"
    assert calls == [
        (
            context,
            {
                "task_type": "audio_generation_indextts2",
                "queue_kind": "default",
                "episode": 3,
                "payload": task.backend_payload(),
            },
        )
    ]
