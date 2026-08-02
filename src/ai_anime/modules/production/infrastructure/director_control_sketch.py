"""Adapters for Director Control frame-to-sketch scheduling."""

from __future__ import annotations

from ai_anime.modules.asset_world.public import BeatViewerQuery, beat_viewer_use_cases
from ai_anime.modules.production.application.director_control_sketch import (
    DirectorControlFrameStatus,
    DirectorControlSketchTask,
    DirectorControlSketchTaskReceipt,
)
from ai_anime.modules.production.application.sketch_generation import (
    SKETCH_GENERATION_TASK_TYPE,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


class AssetWorldDirectorControlFrameSource:
    def status(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> DirectorControlFrameStatus:
        data = beat_viewer_use_cases().director_control_frame_status(
            context,
            BeatViewerQuery(episode_num=episode_num, beat_num=beat_num),
        )
        return DirectorControlFrameStatus(
            ready=bool(data["ready"]),
            scope=str(data["scope"]),
            data=data,
        )


class TaskExecutionDirectorControlSketchScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: DirectorControlSketchTask,
    ) -> DirectorControlSketchTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=SKETCH_GENERATION_TASK_TYPE,
                episode=task.episode_num,
                beat_num=task.beat_num,
                scope=task.scope,
                payload=task.backend_payload(),
            ),
        )
        return DirectorControlSketchTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
