from pathlib import Path

import pytest

from ai_anime.modules.production.application.selected_regeneration import (
    RegenerateSelectedBeatsCommand,
    SelectedRegenerationKind,
    SelectedRegenerationTask,
    SelectedRegenerationTaskReceipt,
    SelectedRegenerationUseCases,
)


class _Preparer:
    def __init__(self, task: SelectedRegenerationTask) -> None:
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
        return SelectedRegenerationTaskReceipt(
            task_id="task-1",
            task_key=(
                f"task:{task.task_type}:project:proj-1:2:{task.scope}"
            ),
            backend="celery",
            queue="default",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("kind", "task_type", "label"),
    [
        (SelectedRegenerationKind.RENDER, "selected_regen", "画面"),
        (SelectedRegenerationKind.SKETCH, "sketch_regen", "草图"),
    ],
)
async def test_selected_regeneration_prepares_schedules_and_projects_response(
    tmp_path: Path,
    kind: SelectedRegenerationKind,
    task_type: str,
    label: str,
) -> None:
    context = object()
    scope = "1x1_2-3__scope"
    task = SelectedRegenerationTask(
        kind=kind,
        episode_num=2,
        mode_key="1x1_2-3",
        scope=scope,
        output_dir=tmp_path,
        config={"selected_beat_numbers": [3, 1]},
    )
    preparer = _Preparer(task)
    scheduler = _Scheduler()
    command = RegenerateSelectedBeatsCommand(
        kind=kind,
        episode_num=2,
        beat_indices=(3, 1),
    )

    scheduled = await SelectedRegenerationUseCases(
        preparer,
        scheduler,
    ).regenerate(context, command)

    assert preparer.calls == [(context, command)]
    assert scheduler.calls == [(context, task)]
    assert task.task_type == task_type
    assert task.backend_payload() == {
        "episode": 2,
        "mode_key": "1x1_2-3",
        "output_dir": str(tmp_path),
        "config": {
            "selected_beat_numbers": [3, 1],
            "mode_key": "1x1_2-3",
        },
    }
    assert scheduled.as_dict() == {
        "task_type": task_type,
        "scope": scope,
        "task_id": "task-1",
        "task_key": f"task:{task_type}:project:proj-1:2:{scope}",
        "backend": "celery",
        "queue": "default",
        "message": f"第 2 集选中 Beats {label}再生已进入队列",
    }
