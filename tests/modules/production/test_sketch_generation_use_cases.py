from pathlib import Path

import pytest

from ai_anime.modules.production.application.sketch_generation import (
    GenerateSketchesCommand,
    PreparedSketchGeneration,
    SketchGenerationTask,
    SketchGenerationTaskReceipt,
    SketchGenerationUseCases,
)


class _Preparer:
    def __init__(self, prepared: PreparedSketchGeneration) -> None:
        self.prepared = prepared
        self.calls = []

    async def prepare(self, context, command):
        self.calls.append((context, command))
        return self.prepared


class _Scheduler:
    def __init__(self) -> None:
        self.calls = []

    async def enqueue(self, context, task):
        self.calls.append((context, task))
        return SketchGenerationTaskReceipt(
            grid_index=task.grid_index,
            scope=task.scope,
            task_id=f"task-{task.grid_index}",
            task_key=(
                f"task:sketch_generation:project:proj-1:3:{task.scope}"
            ),
            backend="celery",
            queue="default",
        )


def _task(tmp_path: Path, grid_index: int) -> SketchGenerationTask:
    return SketchGenerationTask(
        episode_num=3,
        grid_index=grid_index,
        output_dir=tmp_path,
        config={"style": "cinematic"},
    )


@pytest.mark.asyncio
async def test_generate_all_sketch_grids_prepares_schedules_and_projects_result(
    tmp_path: Path,
) -> None:
    context = object()
    command = GenerateSketchesCommand(episode_num=3, grid_index=-1)
    tasks = (_task(tmp_path, 0), _task(tmp_path, 1))
    prepared = PreparedSketchGeneration(
        episode_num=3,
        requested_grid_index=-1,
        grid_plan=((1, 1), (2, 2)),
        tasks=tasks,
    )
    preparer = _Preparer(prepared)
    scheduler = _Scheduler()

    scheduled = await SketchGenerationUseCases(preparer, scheduler).generate(
        context,
        command,
    )

    assert preparer.calls == [(context, command)]
    assert scheduler.calls == [(context, tasks[0]), (context, tasks[1])]
    assert tasks[0].backend_payload() == {
        "episode": 3,
        "output_dir": str(tmp_path),
        "config": {"style": "cinematic", "grid_index": 0},
    }
    assert scheduled.as_dict() == {
        "task_type": "sketch_generation",
        "backend": "celery",
        "data": {
            "dispatched": 2,
            "tasks": [
                {
                    "grid_index": 0,
                    "scope": "grid_0",
                    "task_id": "task-0",
                    "task_key": (
                        "task:sketch_generation:project:proj-1:3:grid_0"
                    ),
                    "backend": "celery",
                    "queue": "default",
                },
                {
                    "grid_index": 1,
                    "scope": "grid_1",
                    "task_id": "task-1",
                    "task_key": (
                        "task:sketch_generation:project:proj-1:3:grid_1"
                    ),
                    "backend": "celery",
                    "queue": "default",
                },
            ],
            "scopes": ["grid_0", "grid_1"],
        },
        "message": "第 3 集全集草图生成已进入队列 (1x1 + 2x2)",
    }


@pytest.mark.asyncio
async def test_generate_one_sketch_grid_preserves_single_task_envelope(
    tmp_path: Path,
) -> None:
    context = object()
    task = _task(tmp_path, 1)
    scheduled = await SketchGenerationUseCases(
        _Preparer(
            PreparedSketchGeneration(
                episode_num=3,
                requested_grid_index=1,
                grid_plan=((1, 1), (2, 2)),
                tasks=(task,),
            )
        ),
        _Scheduler(),
    ).generate(
        context,
        GenerateSketchesCommand(episode_num=3, grid_index=1),
    )

    assert scheduled.as_dict() == {
        "task_type": "sketch_generation",
        "backend": "celery",
        "task_id": "task-1",
        "task_key": "task:sketch_generation:project:proj-1:3:grid_1",
        "queue": "default",
        "message": "第 3 集草图生成已进入队列 (网格 1)",
    }
