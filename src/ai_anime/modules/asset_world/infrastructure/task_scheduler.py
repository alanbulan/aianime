"""Task-backend adapter for Asset & World jobs."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    AssetTaskQueueReceipt,
    BatchPropReferenceGenerationTask,
    BuildCharactersTask,
    BuildScenesTask,
    CharacterImageGenerationTask,
    PropReferenceGenerationTask,
    SceneReferenceGenerationTask,
    SceneStageGenerationTask,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import project_task_state_key


class TaskBackendAssetTaskScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue_build_characters(
        self,
        task_context: ProjectContext,
        task: BuildCharactersTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type="build_characters",
            payload=task.backend_payload(),
        )

    async def enqueue_character_image(
        self,
        task_context: ProjectContext,
        task: CharacterImageGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
            scope=task.scope,
        )

    async def enqueue_build_scenes(
        self,
        task_context: ProjectContext,
        task: BuildScenesTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
        )

    async def enqueue_scene_reference(
        self,
        task_context: ProjectContext,
        task: SceneReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
            scope=task.scope,
        )

    async def enqueue_scene_stage(
        self,
        task_context: ProjectContext,
        task: SceneStageGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
            scope=task.scope,
            queue_kind="world",
        )

    async def enqueue_prop_reference(
        self,
        task_context: ProjectContext,
        task: PropReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
            scope=task.scope,
        )

    async def enqueue_batch_prop_references(
        self,
        task_context: ProjectContext,
        task: BatchPropReferenceGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
        )

    async def _enqueue(
        self,
        task_context: ProjectContext,
        *,
        task_type: str,
        payload: dict[str, Any],
        scope: str | None = None,
        queue_kind: str = "default",
    ) -> AssetTaskQueueReceipt:
        task_options: dict[str, Any] = {
            "task_type": task_type,
            "queue_kind": queue_kind,
            "episode": 0,
            "payload": payload,
        }
        if scope is not None:
            task_options["scope"] = scope
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            **task_options,
        )
        return AssetTaskQueueReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                task_type,
                task_context.project_id,
                0,
                scope=scope,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
