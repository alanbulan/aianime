from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.episode_audio import (
    AudioVoicePrerequisitesMissing,
    EpisodeAudioBillingQuote,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    EpisodeAudioGenerationPlan,
    EpisodeAudioTaskReceipt,
    EpisodeAudioUseCases,
    GenerateEpisodeAudioCommand,
)
from ai_anime.modules.production.domain.voice_design import VoiceDesignRequirement


class _BeatSource:
    def __init__(self, beats: list[dict]) -> None:
        self.beats = beats
        self.calls: list[tuple[object, int]] = []

    async def for_episode(self, context, episode_num: int) -> list[dict]:
        self.calls.append((context, episode_num))
        return self.beats


class _Planner:
    def __init__(
        self,
        errors: list[str] | None = None,
        beat_numbers: list[int] | None = None,
    ) -> None:
        self.errors = errors or []
        self.beat_numbers = [1] if beat_numbers is None else beat_numbers
        self.calls: list[tuple[object, int, list[int] | None, str]] = []

    async def plan(
        self,
        context,
        episode_num: int,
        beat_numbers: list[int] | None,
        mode: str,
    ) -> EpisodeAudioGenerationPlan:
        self.calls.append((context, episode_num, beat_numbers, mode))
        return EpisodeAudioGenerationPlan(
            beat_numbers=tuple(self.beat_numbers),
            errors=tuple(self.errors),
            billable_chars=8,
        )


class _Billing:
    async def quote(self, plan) -> EpisodeAudioBillingQuote:
        return EpisodeAudioBillingQuote(
            beat_numbers=plan.beat_numbers,
            quantity=plan.quantity,
            unit_cost=2,
            cost=2 * plan.quantity,
            display=str(2 * plan.quantity),
            prereq_errors=plan.errors,
        )

    def task_payload(self, plan) -> dict:
        return {
            "pricing_quantity": plan.quantity,
            "pricing_metrics": {
                "call_count": plan.quantity,
                "item_count": plan.quantity,
                "billable_chars": plan.billable_chars,
            },
        }


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
    planner = _Planner()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(source, planner, _Billing(), scheduler)

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
    assert planner.calls == [(context, 3, None, "sync_changed")]
    _, task = scheduler.calls[0]
    assert task.backend_payload() == {
        "episode": 3,
        "mode": "sync_changed",
        "beat_numbers": [1],
        "output_dir": str(tmp_path),
        "state_dir": str(tmp_path / "state"),
        "billing": {
            "pricing_quantity": 1,
            "pricing_metrics": {
                "call_count": 1,
                "item_count": 1,
                "billable_chars": 8,
            },
        },
    }


@pytest.mark.asyncio
async def test_generate_rejects_episode_without_beats(tmp_path: Path) -> None:
    planner = _Planner()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(_BeatSource([]), planner, _Billing(), scheduler)

    with pytest.raises(EpisodeAudioBeatsMissing, match="No beats found for episode 3"):
        await use_cases.generate(
            _context(tmp_path),
            GenerateEpisodeAudioCommand(episode_num=3),
        )

    assert planner.calls == []
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_generate_reports_first_five_voice_errors(tmp_path: Path) -> None:
    errors = [f"error-{index}" for index in range(6)]
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 1}]),
        _Planner(errors),
        _Billing(),
        scheduler,
    )

    with pytest.raises(AudioVoicePrerequisitesMissing) as caught:
        await use_cases.generate(
            _context(tmp_path),
            GenerateEpisodeAudioCommand(episode_num=3),
        )

    assert str(caught.value) == "；".join(errors)
    assert caught.value.code == "voice_prereq_required"
    assert scheduler.calls == []


@pytest.mark.asyncio
async def test_generate_auto_designs_missing_voices_then_schedules(
    tmp_path: Path,
) -> None:
    context = _context(tmp_path)
    requirement = VoiceDesignRequirement(
        key="character:夏栀:slot:youth",
        target="character_slot",
        label="夏栀·青年时期",
        voice_prompt="清澈自然的青年女声",
        preview_text="我们开始吧。",
        character_name="夏栀",
        slot="youth",
    )

    class _RecoveringPlanner:
        def __init__(self) -> None:
            self.calls = 0

        async def plan(self, *_args) -> EpisodeAudioGenerationPlan:
            self.calls += 1
            if self.calls == 1:
                return EpisodeAudioGenerationPlan(
                    beat_numbers=(1,),
                    errors=("Beat 01 角色声线缺失：夏栀_青年时期",),
                    voice_requirements=(requirement,),
                )
            return EpisodeAudioGenerationPlan(
                beat_numbers=(1,),
                billable_chars=8,
            )

    class _Provisioner:
        def __init__(self) -> None:
            self.calls: list[tuple[object, tuple[VoiceDesignRequirement, ...]]] = []

        async def provision(self, candidate, requirements):
            self.calls.append((candidate, requirements))
            return tuple(item.label for item in requirements)

    planner = _RecoveringPlanner()
    provisioner = _Provisioner()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 1}]),
        planner,
        _Billing(),
        scheduler,
        provisioner,
    )

    result = await use_cases.generate(
        context,
        GenerateEpisodeAudioCommand(episode_num=3),
    )

    assert result.task_id == "task-1"
    assert planner.calls == 2
    assert provisioner.calls == [(context, (requirement,))]
    assert len(scheduler.calls) == 1


@pytest.mark.asyncio
async def test_regenerate_beat_preserves_index_fallback(tmp_path: Path) -> None:
    context = _context(tmp_path)
    planner = _Planner()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 9}]),
        planner,
        _Billing(),
        scheduler,
    )

    result = await use_cases.regenerate_beat(context, 3, 1)

    assert result.as_dict()["message"] == "第 3 集 Beat 1 语音生成已进入队列"
    assert planner.calls == [(context, 3, [1], "redo_selected")]
    _, task = scheduler.calls[0]
    assert task.backend_payload()["beat_numbers"] == [1]
    assert task.backend_payload()["mode"] == "redo_selected"


@pytest.mark.asyncio
async def test_regenerate_beat_rejects_unknown_number(tmp_path: Path) -> None:
    planner = _Planner()
    scheduler = _Scheduler()
    use_cases = EpisodeAudioUseCases(
        _BeatSource([{"beat_number": 9}]),
        planner,
        _Billing(),
        scheduler,
    )

    with pytest.raises(EpisodeAudioBeatMissing, match="Beat 2 not found"):
        await use_cases.regenerate_beat(
            _context(tmp_path),
            3,
            2,
        )

    assert planner.calls == []
    assert scheduler.calls == []
