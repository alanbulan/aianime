from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import AssetTaskQueueReceipt
from ai_anime.modules.asset_world.application.errors import (
    InvalidPropInput,
    PropNotFound,
    PropProjectContextRequired,
)
from ai_anime.modules.asset_world.application.prop_tasks import PropTaskUseCases
from ai_anime.modules.task_execution.public import task_config_scope


@dataclass
class _Prop:
    name: str
    visual_prompt: str = ""
    description: str = ""


class _Repository:
    def __init__(self, props: list[_Prop] | None = None) -> None:
        self.props = {prop.name: prop for prop in props or []}

    async def get_prop(self, name: str) -> _Prop | None:
        return self.props.get(name)


class _Scheduler:
    def __init__(self) -> None:
        self.reference_task = None
        self.batch_task = None
        self.contexts: list[object] = []

    async def enqueue_prop_reference(self, task_context, task):
        self.contexts.append(task_context)
        self.reference_task = task
        return AssetTaskQueueReceipt(
            task_id="task-prop",
            task_key=f"task:prop_reference_asset:0:{task.scope}",
            backend="inline",
            queue="inline",
        )

    async def enqueue_batch_prop_references(self, task_context, task):
        self.contexts.append(task_context)
        self.batch_task = task
        return AssetTaskQueueReceipt(
            task_id="task-batch",
            task_key="task:batch_prop_ref:0",
            backend="inline",
            queue="inline",
        )


def _context():
    return SimpleNamespace(project_id="project-1")


@pytest.mark.asyncio
async def test_schedules_prop_reference_with_owned_scope_payload_and_response(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = PropTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_reference(
        repository=_Repository([_Prop(name="玉佩", visual_prompt="青玉")]),
        task_context=_context(),
        output_dir=tmp_path,
        prop_name="玉佩",
        style="period-drama",
        model="image-model",
    )

    expected_scope = task_config_scope("prop_ref", {"prop": "玉佩"})
    assert scheduler.reference_task.scope == expected_scope
    assert scheduler.reference_task.backend_payload() == {
        "prop_name": "玉佩",
        "style": "period-drama",
        "model": "image-model",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "prop_reference_asset",
        "scope": expected_scope,
        "task_id": "task-prop",
        "task_key": f"task:prop_reference_asset:0:{expected_scope}",
        "backend": "inline",
        "queue": "inline",
        "message": "道具「玉佩」参考图生成任务已进入队列",
    }


@pytest.mark.asyncio
async def test_schedules_batch_prop_references_with_owned_payload(
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = PropTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_batch_references(
        task_context=_context(),
        output_dir=tmp_path,
        style="period-drama",
        model="image-model",
    )

    assert scheduler.batch_task.backend_payload() == {
        "style": "period-drama",
        "model": "image-model",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "batch_prop_ref",
        "task_id": "task-batch",
        "task_key": "task:batch_prop_ref:0",
        "backend": "inline",
        "queue": "inline",
        "message": "批量道具参考图生成任务已进入队列",
    }


@pytest.mark.asyncio
async def test_prop_reference_rejects_missing_or_empty_prop(tmp_path: Path) -> None:
    use_cases = PropTaskUseCases(_Scheduler())

    with pytest.raises(PropNotFound, match="Prop '不存在' not found"):
        await use_cases.schedule_reference(
            repository=_Repository(),
            task_context=_context(),
            output_dir=tmp_path,
            prop_name="不存在",
            style="",
            model="",
        )
    with pytest.raises(InvalidPropInput, match="has no visual prompt"):
        await use_cases.schedule_reference(
            repository=_Repository([_Prop(name="")]),
            task_context=_context(),
            output_dir=tmp_path,
            prop_name="",
            style="",
            model="",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("single", "道具参考图生成需要 project context"),
        ("batch", "批量道具参考图生成需要 project context"),
    ],
)
async def test_prop_tasks_require_project_context(
    operation: str,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = PropTaskUseCases(_Scheduler())

    with pytest.raises(PropProjectContextRequired, match=message):
        if operation == "single":
            await use_cases.schedule_reference(
                repository=_Repository([_Prop(name="玉佩", visual_prompt="青玉")]),
                task_context=None,
                output_dir=tmp_path,
                prop_name="玉佩",
                style="",
                model="cloud-image-standard",
            )
        else:
            await use_cases.schedule_batch_references(
                task_context=None,
                output_dir=tmp_path,
                style="",
                model="cloud-image-standard",
            )
