"""Adapter from Asset & World tasks to Task Execution."""

from __future__ import annotations

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
    StylePreviewGenerationTask,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class TaskExecutionAssetTaskScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

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

    async def enqueue_style_preview(
        self,
        task_context: ProjectContext,
        task: StylePreviewGenerationTask,
    ) -> AssetTaskQueueReceipt:
        return await self._enqueue(
            task_context,
            task_type=task.task_type,
            payload=task.backend_payload(),
            scope=task.scope,
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
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type=task_type,
                queue_kind=queue_kind,
                scope=scope,
                payload=payload,
            ),
        )
        return AssetTaskQueueReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
