from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.narrative_planning.application.narrative_tasks import (
    ScheduleEpisodeAssetPlanning,
    ScheduleEpisodeIdentityPlanning,
)
from ai_anime.modules.narrative_planning.infrastructure.task_scheduler import (
    TaskExecutionScheduler,
)
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


@pytest.mark.asyncio
async def test_episode_asset_and_identity_planning_use_task_execution() -> None:
    calls: list[dict] = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append({"context": context, **kwargs})
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id=f"task-{len(calls)}"),
                backend="celery",
                queue="node.node_a.default",
            )

    context = SimpleNamespace(project_id="project-1")
    scheduler = TaskExecutionScheduler(
        ProjectTaskSubmissionUseCases(lambda: Backend())
    )

    scene = await ScheduleEpisodeAssetPlanning(scheduler).execute(
        task_context=context,
        episode_num=4,
        asset_kind="scene",
    )
    identity = await ScheduleEpisodeIdentityPlanning(scheduler).execute(
        task_context=context,
        episode_num=4,
    )

    assert scene.as_dict() == {
        "task_type": "episode_scene_planner",
        "task_id": "task-1",
        "task_key": (
            "task:episode_scene_planner:project:project-1:4:scene_run_ep004"
        ),
        "backend": "celery",
        "queue": "node.node_a.default",
        "message": "第 4 集场景规划已进入队列",
        "scope": "scene_run_ep004",
    }
    assert identity.as_dict() == {
        "task_type": "identity_planner",
        "task_id": "task-2",
        "task_key": "task:identity_planner:project:project-1:4",
        "backend": "celery",
        "queue": "node.node_a.default",
        "message": "第 4 集身份规划已进入队列",
    }
    assert calls == [
        {
            "context": context,
            "task_type": "episode_scene_planner",
            "queue_kind": "default",
            "episode": 4,
            "payload": {"episode": 4, "asset_kind": "scene"},
            "scope": "scene_run_ep004",
        },
        {
            "context": context,
            "task_type": "identity_planner",
            "queue_kind": "default",
            "episode": 4,
            "payload": {"episode": 4},
        },
    ]
