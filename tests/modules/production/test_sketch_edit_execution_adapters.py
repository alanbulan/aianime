from __future__ import annotations

from types import SimpleNamespace

import pytest

from ai_anime.modules.production.application.sketch_edit_execution import (
    SketchEditExecutionTask,
    SketchEditExecutionUseCases,
)
from ai_anime.modules.production.infrastructure.sketch_edit_execution import (
    TaskExecutionSketchEditExecutionScheduler,
)
from ai_anime.modules.task_execution.public import ProjectTaskSubmissionUseCases


@pytest.mark.asyncio
async def test_sketch_edit_execution_submits_through_task_execution(tmp_path) -> None:
    calls: list[dict] = []

    class Backend:
        async def enqueue_project_task(self, context, **kwargs):
            calls.append({"context": context, **kwargs})
            return SimpleNamespace(
                task_state=SimpleNamespace(task_id="task-1"),
                backend="celery",
                queue="node.node_a.sketch",
            )

    context = SimpleNamespace(project_id="project-1")
    task = SketchEditExecutionTask(
        episode_num=1,
        project_dir=tmp_path,
        labels_name="labels.jsonl",
        model="cloud-image-standard",
    )
    use_cases = SketchEditExecutionUseCases(
        TaskExecutionSketchEditExecutionScheduler(
            ProjectTaskSubmissionUseCases(lambda: Backend())
        )
    )

    scheduled = await use_cases.start(context, task)

    assert scheduled.as_dict() == {
        "task_type": "sketch_edit_execute",
        "scope": task.scope,
        "task_id": "task-1",
        "task_key": (
            f"task:sketch_edit_execute:project:project-1:1:{task.scope}"
        ),
        "backend": "celery",
        "queue": "node.node_a.sketch",
        "message": "第 1 集 sketch edit execute 任务已进入队列",
    }
    assert calls == [
        {
            "context": context,
            "task_type": "sketch_edit_execute",
            "queue_kind": "sketch",
            "episode": 1,
            "payload": {
                "episode": 1,
                "project_dir": str(tmp_path),
                "labels_name": "labels.jsonl",
                "model": "cloud-image-standard",
            },
            "scope": task.scope,
        }
    ]
