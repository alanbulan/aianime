"""Task-execution adapter for sketch identity detection."""

from __future__ import annotations

from ai_anime.modules.production.application.sketch_marker_detection_task import (
    AI_IDENTITY_DETECTION_TASK_TYPE,
    ScheduleSketchMarkerDetectionCommand,
    SketchMarkerDetectionTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class TaskExecutionSketchMarkerDetectionScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        command: ScheduleSketchMarkerDetectionCommand,
    ) -> SketchMarkerDetectionTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=AI_IDENTITY_DETECTION_TASK_TYPE,
                episode=command.episode_num,
                payload={"episode": command.episode_num},
            ),
        )
        return SketchMarkerDetectionTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )


__all__ = ["TaskExecutionSketchMarkerDetectionScheduler"]
