"""Task Execution adapter for sketch edit execution."""

from __future__ import annotations

from ai_anime.modules.production.application.sketch_edit_execution import (
    SKETCH_EDIT_EXECUTION_TASK_TYPE,
    SketchEditExecutionTask,
    SketchEditExecutionTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class TaskExecutionSketchEditExecutionScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: SketchEditExecutionTask,
    ) -> SketchEditExecutionTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=SKETCH_EDIT_EXECUTION_TASK_TYPE,
                queue_kind="sketch",
                episode=task.episode_num,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return SketchEditExecutionTaskReceipt(
            scope=task.scope,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
