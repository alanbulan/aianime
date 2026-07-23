from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    IdentityPlanRequired,
    ProjectContextRequired,
    StartScriptGeneration,
)
from ai_anime.modules.narrative_planning.application.task_dto import (
    TaskQueueReceipt,
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
