"""Adapter from Creative Canvas jobs to Task Execution."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)


class TaskExecutionCreativeCanvasTaskScheduler:
    def __init__(
        self,
        submissions: ProjectTaskSubmissionUseCases,
        *,
        translate_runtime_errors: bool = True,
    ) -> None:
        self._submissions = submissions
        self._translate_runtime_errors = translate_runtime_errors

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt:
        scope = task.scope or task.job_id
        payload = dict(task.payload)
        if task.inject_job_context:
            payload = {
                "job_id": task.job_id,
                "project_dir": str(task.project_dir),
                **payload,
            }
        try:
            receipt = await self._submissions.submit(
                context,
                ProjectTaskSubmission(
                    task_type=task.task_type,
                    queue_kind=task.queue_kind,
                    episode=task.episode,
                    beat_num=task.beat_num,
                    scope=scope,
                    payload=payload,
                ),
            )
        except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
            raise
        except RuntimeError as exc:
            if not self._translate_runtime_errors:
                raise
            raise CreativeCanvasTaskStartFailed(str(exc)) from exc

        return CreativeCanvasTaskReceipt(
            task_type=task.task_type,
            job_id=task.job_id,
            task_key=receipt.task_key,
            task_episode=task.episode,
            task_scope=scope,
            backend=receipt.backend,
            queue=receipt.queue,
            task_id=receipt.task_id or None,
            task_beat_num=task.beat_num,
        )
