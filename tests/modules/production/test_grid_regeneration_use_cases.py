from pathlib import Path

import pytest

from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationTask,
    GridRegenerationTaskReceipt,
    GridRegenerationUseCases,
    RegenerateGridCommand,
)


class _Preparer:
    def __init__(self, task: GridRegenerationTask) -> None:
        self.task = task
        self.calls = []

    async def prepare(self, context, command):
        self.calls.append((context, command))
        return self.task


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        return GridRegenerationTaskReceipt(
            scope=task.scope,
            task_id="task-1",
            task_key=f"task:grid_regenerate:project:proj-1:2:{task.scope}",
            backend="celery",
            queue="default",
        )


@pytest.mark.asyncio
async def test_grid_regeneration_prepares_schedules_and_projects_response(
    tmp_path: Path,
) -> None:
    context = object()
    task = GridRegenerationTask(
        episode_num=2,
        grid_index=3,
        output_dir=tmp_path,
        config={"render_mode": "Render"},
    )
    preparer = _Preparer(task)
    scheduler = _Scheduler()
    command = RegenerateGridCommand(episode_num=2, grid_index=3)

    scheduled = await GridRegenerationUseCases(
        preparer,
        scheduler,
    ).regenerate(context, command)

    assert preparer.calls == [(context, command)]
    assert scheduler.calls == [(context, task)]
    assert task.scope == "grid_3"
    assert task.backend_payload() == {
        "episode": 2,
        "grid_index": 3,
        "output_dir": str(tmp_path),
        "config": {"render_mode": "Render"},
    }
    assert scheduled.as_dict() == {
        "task_type": "grid_regenerate",
        "scope": "grid_3",
        "task_id": "task-1",
        "task_key": "task:grid_regenerate:project:proj-1:2:grid_3",
        "backend": "celery",
        "queue": "default",
        "message": "第 2 集网格 3 重新生成已进入队列",
    }
