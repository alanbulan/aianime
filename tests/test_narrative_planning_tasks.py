from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    IdentityPlanRequired,
    ProjectContextRequired,
    ScheduleEpisodePlanning,
    StartScriptGeneration,
)
from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    EpisodePlanningTask,
    ScriptGenerationTask,
    TaskQueueReceipt,
)
from ai_anime.modules.narrative_planning.infrastructure.task_scheduler import (
    TaskExecutionScheduler,
)


class _Store:
    def __init__(self, identity_ids: list[str]) -> None:
        self.episode = SimpleNamespace(identity_ids=identity_ids)

    def get_episode(self, episode_num: int):
        return self.episode


class _SketchWorkspace:
    def __init__(self) -> None:
        self.cleared: list[tuple[str, int]] = []

    def clear_episode_sketches(self, output_dir, episode_num: int) -> None:
        self.cleared.append((str(output_dir), episode_num))


class _Scheduler:
    def __init__(self) -> None:
        self.task = None

    async def enqueue_script_generation(self, task_context, task):
        self.task = task
        return TaskQueueReceipt(
            task_id="task-1",
            task_key="task:script_writer:1",
            backend="inline",
            queue="inline",
        )

    async def enqueue_episode_planning(self, task_context, task):
        self.task = task
        return TaskQueueReceipt(
            task_id="task-episodes",
            task_key="task:build_episodes:0",
            backend="inline",
            queue="inline",
        )


@pytest.mark.asyncio
async def test_requires_identity_before_clearing_sketches() -> None:
    sketches = _SketchWorkspace()
    service = StartScriptGeneration(
        task_scheduler=_Scheduler(),
        sketch_workspace=sketches,
    )

    with pytest.raises(IdentityPlanRequired):
        await service.execute(
            _Store([]),
            task_context=None,
            output_dir="output",
            episode_num=2,
        )

    assert sketches.cleared == []


@pytest.mark.asyncio
async def test_requires_context_after_clearing_stale_sketches() -> None:
    sketches = _SketchWorkspace()
    service = StartScriptGeneration(
        task_scheduler=_Scheduler(),
        sketch_workspace=sketches,
    )

    with pytest.raises(ProjectContextRequired):
        await service.execute(
            _Store(["秦_青年"]),
            task_context=None,
            output_dir="output",
            episode_num=2,
        )

    assert sketches.cleared == [("output", 2)]


@pytest.mark.asyncio
async def test_schedules_script_generation_with_owned_payload() -> None:
    scheduler = _Scheduler()
    service = StartScriptGeneration(
        task_scheduler=scheduler,
        sketch_workspace=_SketchWorkspace(),
    )

    scheduled = await service.execute(
        _Store(["秦_青年"]),
        task_context=SimpleNamespace(project_id="project-1"),
        output_dir="output",
        episode_num=2,
    )

    assert scheduler.task.backend_payload() == {
        "episode": 2,
        "config": {},
        "output_dir": "output",
    }
    assert scheduled.as_dict() == {
        "task_type": "script_writer",
        "task_id": "task-1",
        "task_key": "task:script_writer:1",
        "backend": "inline",
        "queue": "inline",
        "message": "第 2 集剧本生成任务已进入队列",
    }


@pytest.mark.asyncio
async def test_schedules_episode_planning_with_owned_payload() -> None:
    scheduler = _Scheduler()
    service = ScheduleEpisodePlanning(scheduler)

    scheduled = await service.execute(
        task_context=SimpleNamespace(project_id="project-1"),
        target_episodes=12,
        planning_mode="chapters",
        output_dir="output",
        state_dir="state",
    )

    assert scheduler.task.backend_payload() == {
        "config": {
            "target_episodes": 12,
            "planning_mode": "chapters",
        },
        "output_dir": "output",
        "state_dir": "state",
    }
    assert scheduled.as_dict()["task_type"] == "build_episodes"


@pytest.mark.asyncio
async def test_task_scheduler_maps_all_narrative_tasks_to_task_execution() -> None:
    class Submissions:
        def __init__(self) -> None:
            self.calls = []

        async def submit(self, context, submission):
            self.calls.append((context, submission))
            return SimpleNamespace(
                task_id=f"task-{len(self.calls)}",
                task_key=f"task-key-{len(self.calls)}",
                backend="inline",
                queue="inline",
            )

    context = SimpleNamespace(project_id="project-1")
    submissions = Submissions()
    scheduler = TaskExecutionScheduler(submissions)

    episode_receipt = await scheduler.enqueue_episode_planning(
        context,
        EpisodePlanningTask(
            target_episodes=12,
            planning_mode="chapters",
            output_dir="output",
            state_dir="state",
        ),
    )
    script_receipt = await scheduler.enqueue_script_generation(
        context,
        ScriptGenerationTask(episode=2, output_dir="output"),
    )
    prompt_receipt = await scheduler.enqueue_beat_video_prompt(
        context,
        BeatVideoPromptTask(
            episode=2,
            beat_num=3,
            field="video_prompt",
            language="zh-CN",
            output_dir="output",
        ),
    )

    assert [call[1].task_type for call in submissions.calls] == [
        "build_episodes",
        "script_writer",
        "beat_video_prompt",
    ]
    assert [call[1].episode for call in submissions.calls] == [0, 2, 2]
    assert [call[1].beat_num for call in submissions.calls] == [None, None, 3]
    assert submissions.calls[0][1].payload == {
        "config": {"target_episodes": 12, "planning_mode": "chapters"},
        "output_dir": "output",
        "state_dir": "state",
    }
    assert submissions.calls[1][1].payload == {
        "episode": 2,
        "config": {},
        "output_dir": "output",
    }
    assert submissions.calls[2][1].payload["beat_num"] == 3
    assert episode_receipt.task_id == "task-1"
    assert script_receipt.task_key == "task-key-2"
    assert prompt_receipt.queue == "inline"
