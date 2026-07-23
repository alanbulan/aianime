"""Adapter from Story Intake tasks to the existing task backend."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    ScheduledIngestion,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import project_task_state_key


class TaskBackendScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue_ingestion(
        self,
        task_context: ProjectContext,
        task: IngestionTask,
    ) -> ScheduledIngestion:
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            task_type="ingest_fast",
            queue_kind="default",
            episode=0,
            payload=task.backend_payload(),
        )
        return ScheduledIngestion(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key("ingest_fast", task_context.project_id, 0),
            backend=queued.backend,
            queue=queued.queue,
        )
