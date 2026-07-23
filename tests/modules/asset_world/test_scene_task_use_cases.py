from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_anime.modules.asset_world.application.dto import AssetTaskQueueReceipt
from ai_anime.modules.asset_world.application.errors import (
    SceneNotFound,
    SceneProjectContextRequired,
)
from ai_anime.modules.asset_world.application.scene_tasks import SceneTaskUseCases
from ai_anime.task_identity import task_config_scope


@dataclass
class _Scene:
    name: str


class _Repository:
    def __init__(self, scenes: list[_Scene] | None = None) -> None:
        self.scenes = {scene.name: scene for scene in scenes or []}

    async def get_scene(self, name: str) -> _Scene | None:
        return self.scenes.get(name)


class _Scheduler:
    def __init__(self) -> None:
        self.build_task = None
        self.reference_task = None
        self.contexts: list[object] = []

    async def enqueue_build_scenes(self, task_context, task):
        self.contexts.append(task_context)
        self.build_task = task
        return AssetTaskQueueReceipt(
            task_id="task-build-scenes",
            task_key="task:build_scenes:0",
            backend="inline",
            queue="inline",
        )

    async def enqueue_scene_reference(self, task_context, task):
        self.contexts.append(task_context)
        self.reference_task = task
        return AssetTaskQueueReceipt(
            task_id="task-scene-reference",
            task_key=f"task:scene_reference_asset:0:{task.scope}",
            backend="inline",
            queue="inline",
        )


def _context():
    return SimpleNamespace(project_id="project-1")


@pytest.mark.asyncio
async def test_schedules_scene_build_with_owned_payload(tmp_path: Path) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_build_scenes(
        task_context=_context(),
        output_dir=tmp_path,
    )

    assert scheduler.build_task.backend_payload() == {"output_dir": str(tmp_path)}
    assert scheduled.as_dict() == {
        "task_type": "build_scenes",
        "task_id": "task-build-scenes",
        "task_key": "task:build_scenes:0",
        "backend": "inline",
        "queue": "inline",
        "message": "场景补充任务已进入队列",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["master", "reverse_master"])
async def test_schedules_scene_reference_with_owned_scope_payload_and_response(
    kind: str,
    tmp_path: Path,
) -> None:
    scheduler = _Scheduler()
    use_cases = SceneTaskUseCases(scheduler)

    scheduled = await use_cases.schedule_reference(
        repository=_Repository([_Scene(name="大殿")]),
        task_context=_context(),
        output_dir=tmp_path,
        scene_name="大殿",
        kind=kind,
        style="period-drama",
        model="  image-model  ",
    )

    expected_scope = task_config_scope(
        "scene_ref",
        {"scene": "大殿", "kind": kind},
    )
    assert scheduler.reference_task.scope == expected_scope
    assert scheduler.reference_task.backend_payload() == {
        "scene_name": "大殿",
        "kind": kind,
        "model": "image-model",
        "style": "period-drama",
        "output_dir": str(tmp_path),
    }
    assert scheduled.as_dict() == {
        "task_type": "scene_reference_asset",
        "scope": expected_scope,
        "task_id": "task-scene-reference",
        "task_key": f"task:scene_reference_asset:0:{expected_scope}",
        "backend": "inline",
        "queue": "inline",
        "message": f"场景「大殿」{kind} 生成任务已进入队列",
    }


@pytest.mark.asyncio
async def test_scene_reference_rejects_missing_scene(tmp_path: Path) -> None:
    use_cases = SceneTaskUseCases(_Scheduler())

    with pytest.raises(SceneNotFound, match="Scene '不存在' not found"):
        await use_cases.schedule_reference(
            repository=_Repository(),
            task_context=_context(),
            output_dir=tmp_path,
            scene_name="不存在",
            kind="master",
            style="",
            model=None,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("build", "场景补充需要 project context"),
        ("reference", "场景参考图生成需要 project context"),
    ],
)
async def test_scene_tasks_require_project_context(
    operation: str,
    message: str,
    tmp_path: Path,
) -> None:
    use_cases = SceneTaskUseCases(_Scheduler())

    with pytest.raises(SceneProjectContextRequired, match=message):
        if operation == "build":
            await use_cases.schedule_build_scenes(
                task_context=None,
                output_dir=tmp_path,
            )
        else:
            await use_cases.schedule_reference(
                repository=_Repository([_Scene(name="大殿")]),
                task_context=None,
                output_dir=tmp_path,
                scene_name="大殿",
                kind="master",
                style="",
                model=None,
            )
