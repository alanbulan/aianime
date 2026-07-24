"""Adapters for Director Control frame-to-sketch scheduling."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

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
from ai_anime.task_identity import project_task_state_key


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


class TaskBackendDirectorControlSketchScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue(
        self,
        context: ProjectContext,
        task: DirectorControlSketchTask,
    ) -> DirectorControlSketchTaskReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            context,
            task_type=SKETCH_GENERATION_TASK_TYPE,
            queue_kind="default",
            episode=task.episode_num,
            beat_num=task.beat_num,
            scope=task.scope,
            payload=task.backend_payload(),
        )
        return DirectorControlSketchTaskReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                SKETCH_GENERATION_TASK_TYPE,
                context.project_id,
                task.episode_num,
                beat_num=task.beat_num,
                scope=task.scope,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
