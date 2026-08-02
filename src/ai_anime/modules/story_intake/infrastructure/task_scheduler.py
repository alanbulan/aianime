"""Adapter from Story Intake tasks to Task Execution."""

from __future__ import annotations

from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    ScheduledIngestion,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class TaskExecutionScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue_ingestion(
        self,
        task_context: ProjectContext,
        task: IngestionTask,
    ) -> ScheduledIngestion:
        receipt = await self._submissions.submit(
            task_context,
            ProjectTaskSubmission(
                task_type="ingest_fast",
                payload=task.backend_payload(),
            ),
        )
        return ScheduledIngestion(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
