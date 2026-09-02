"""Prop reference task scheduling use cases."""

from __future__ import annotations

from pathlib import Path

from ai_anime.modules.asset_world.application.dto import (
    BatchPropReferenceGenerationTask,
    PropReferenceGenerationTask,
    ScheduledAssetTask,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidImageSelection,
    InvalidPropInput,
    PropNotFound,
    PropProjectContextRequired,
)
from ai_anime.modules.asset_world.application.image_settings import resolve_image_model
from ai_anime.modules.asset_world.application.ports import (
    PropTaskRepository,
    PropTaskScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import task_config_scope
from ai_anime.modules.model_usage.public import resolve_model_route


class PropTaskUseCases:
    def __init__(self, scheduler: PropTaskScheduler) -> None:
        self._scheduler = scheduler

    async def schedule_reference(
        self,
        *,
        repository: PropTaskRepository,
        task_context: ProjectContext | None,
        output_dir: str | Path,
        prop_name: str,
        style: str,
        model: str,
    ) -> ScheduledAssetTask:
        prop = await repository.get_prop(prop_name)
        if prop is None:
            raise PropNotFound(f"Prop '{prop_name}' not found")
        if not (prop.visual_prompt or prop.description or prop.name):
            raise InvalidPropInput(f"Prop '{prop.name}' has no visual prompt")
        try:
            model_route = resolve_model_route(resolve_image_model(model))
        except InvalidImageSelection as exc:
            raise InvalidPropInput(str(exc)) from exc
        if not model_route.model:
            raise InvalidPropInput("请先选择道具图片模型")
        context = self._require_context(
            task_context,
            "道具参考图生成需要 project context",
        )
        scope = task_config_scope("prop_ref", {"prop": prop.name})
        task = PropReferenceGenerationTask(
            prop_name=prop.name,
            style=style,
            model=model_route.model,
            model_selector=model_route.selector,
            output_dir=output_dir,
            scope=scope,
        )
        receipt = await self._scheduler.enqueue_prop_reference(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            scope=scope,
            message=f"道具「{prop.name}」参考图生成任务已进入队列",
        )

    async def schedule_batch_references(
        self,
        *,
        task_context: ProjectContext | None,
        output_dir: str | Path,
        style: str,
        model: str,
    ) -> ScheduledAssetTask:
        try:
            model_route = resolve_model_route(resolve_image_model(model))
        except InvalidImageSelection as exc:
            raise InvalidPropInput(str(exc)) from exc
        if not model_route.model:
            raise InvalidPropInput("请先选择道具图片模型")
        context = self._require_context(
            task_context,
            "批量道具参考图生成需要 project context",
        )
        task = BatchPropReferenceGenerationTask(
            style=style,
            model=model_route.model,
            model_selector=model_route.selector,
            output_dir=output_dir,
        )
        receipt = await self._scheduler.enqueue_batch_prop_references(context, task)
        return ScheduledAssetTask.from_receipt(
            receipt,
            task_type=task.task_type,
            message="批量道具参考图生成任务已进入队列",
        )

    @staticmethod
    def _require_context(
        task_context: ProjectContext | None,
        message: str,
    ) -> ProjectContext:
        if task_context is None:
            raise PropProjectContextRequired(message)
        return task_context
