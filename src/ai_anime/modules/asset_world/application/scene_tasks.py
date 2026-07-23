"""Scene build and base-reference task scheduling use cases."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.asset_world.application.dto import (
    BuildScenesTask,
    SceneReferenceGenerationTask,
    ScheduledAssetTask,
)
from ai_anime.modules.asset_world.application.errors import (
    SceneNotFound,
    SceneProjectContextRequired,
)
from ai_anime.modules.asset_world.application.ports import (
    SceneTaskRepository,
    SceneTaskScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import task_config_scope


class SceneTaskUseCases:
    def __init__(self, scheduler: SceneTaskScheduler) -> None:
        self._scheduler = scheduler

    async def schedule_build_scenes(
        self,
        *,
        task_context: ProjectContext | None,
        output_dir: str | Path,
    ) -> ScheduledAssetTask:
        context = self._require_context(
            task_context,
            "场景补充需要 project context",
        )
        task = BuildScenesTask(output_dir=output_dir)
        receipt = await self._scheduler.enqueue_build_scenes(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            message="场景补充任务已进入队列",
        )

    async def schedule_reference(
        self,
        *,
        repository: SceneTaskRepository,
        task_context: ProjectContext | None,
        output_dir: str | Path,
        scene_name: str,
        kind: str,
        style: str,
        model: str | None,
    ) -> ScheduledAssetTask:
        scene = await repository.get_scene(scene_name)
        if scene is None:
            raise SceneNotFound(f"Scene '{scene_name}' not found")
        context = self._require_context(
            task_context,
            "场景参考图生成需要 project context",
        )
        scope = task_config_scope(
            "scene_ref",
            {"scene": scene.name, "kind": kind},
        )
        task = SceneReferenceGenerationTask(
            scene_name=scene.name,
            kind=kind,
            style=style,
            model=str(model or "").strip(),
            output_dir=output_dir,
            scope=scope,
        )
        receipt = await self._scheduler.enqueue_scene_reference(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=scope,
            message=f"场景「{scene.name}」{kind} 生成任务已进入队列",
        )

    @staticmethod
    def _require_context(
        task_context: ProjectContext | None,
        message: str,
    ) -> ProjectContext:
        if task_context is None:
            raise SceneProjectContextRequired(message)
        return task_context
