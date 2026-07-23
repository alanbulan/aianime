"""Task-backend adapter for character catalog and image jobs."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    AssetTaskQueueReceipt,
    BuildCharactersTask,
    CharacterImageGenerationTask,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import project_task_state_key


class TaskBackendCharacterTaskScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue_build_characters(
        self,
        task_context: ProjectContext,
        task: BuildCharactersTask,
    ) -> AssetTaskQueueReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            task_type="build_characters",
            queue_kind="default",
            episode=0,
            payload=task.backend_payload(),
        )
        return AssetTaskQueueReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                "build_characters",
                task_context.project_id,
                0,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )

    async def enqueue_character_image(
        self,
        task_context: ProjectContext,
        task: CharacterImageGenerationTask,
    ) -> AssetTaskQueueReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            task_type=task.task_type,
            queue_kind="default",
            episode=0,
            scope=task.scope,
            payload=task.backend_payload(),
        )
        return AssetTaskQueueReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                task.task_type,
                task_context.project_id,
                0,
                scope=task.scope,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
