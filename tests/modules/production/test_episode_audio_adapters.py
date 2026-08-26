from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_audio import EpisodeAudioTask
from ai_anime.modules.production.infrastructure import episode_audio
from ai_anime.modules.production.infrastructure.episode_audio import (
    IndexTTS2EpisodeAudioPlanner,
    TaskExecutionEpisodeAudioScheduler,
)
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


@pytest.mark.asyncio
async def test_audio_planner_uses_context_store_and_closes_it(monkeypatch) -> None:
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

    async def build(**kwargs):
        calls.append(("build", kwargs))
        return SimpleNamespace(
            beat_numbers=[2],
            errors=["missing voice"],
            voice_requirements=["design-voice"],
            billable_chars=12,
        )

    monkeypatch.setattr(
        episode_audio.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        episode_audio,
        "build_indextts2_audio_generation_plan",
        build,
    )
    monkeypatch.setattr(
        episode_audio,
        "resolve_model_for_role",
        lambda role: "voice-clone-model" if role == "AUDIO_VOICE_CLONE" else "",
    )

    result = await IndexTTS2EpisodeAudioPlanner().plan(
        context,
        3,
        [2],
        "redo_selected",
    )

    assert result.beat_numbers == (2,)
    assert result.errors == ("missing voice",)
    assert result.voice_requirements == ("design-voice",)
    assert result.billable_chars == 12
    assert result.pricing_model == "voice-clone-model"
    assert calls == [
        (
            "build",
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
async def test_audio_planner_reports_missing_voice_clone_model(monkeypatch) -> None:
    class _Store:
        async def close(self) -> None:
            pass

    async def make_store(_context):
        return _Store()

    async def build(**_kwargs):
        return SimpleNamespace(
            beat_numbers=[],
            errors=["Beat 01 解说声线缺失：项目解说人声线未配置"],
            voice_requirements=[],
            billable_chars=0,
        )

    def missing_model(_role: str) -> str:
        raise PermissionError("missing role")

    monkeypatch.setattr(
        episode_audio.project_stores,
        "make_sqlite_store_for_context",
        make_store,
    )
    monkeypatch.setattr(
        episode_audio,
        "build_indextts2_audio_generation_plan",
        build,
    )
    monkeypatch.setattr(episode_audio, "resolve_model_for_role", missing_model)

    result = await IndexTTS2EpisodeAudioPlanner().plan(
        SimpleNamespace(owner_username="alice", project_name="demo"),
        1,
        [1],
        "redo_selected",
    )

    assert result.pricing_model == ""
    assert result.errors == (
        "Beat 01 解说声线缺失：项目解说人声线未配置",
        "AI 配音模型缺失：当前未配置可用的 AUDIO_VOICE_CLONE 云端或 BYOK 模型",
    )


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
