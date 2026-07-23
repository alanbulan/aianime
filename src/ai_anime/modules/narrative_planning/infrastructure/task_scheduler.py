from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    ScriptGenerationTask,
    TaskQueueReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import project_task_state_key


class TaskBackendScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue_script_generation(
        self,
        task_context: ProjectContext,
        task: ScriptGenerationTask,
    ) -> TaskQueueReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            task_type="script_writer",
            queue_kind="default",
            episode=task.episode,
            payload=task.backend_payload(),
        )
        return TaskQueueReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                "script_writer",
                task_context.project_id,
                task.episode,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )

    async def enqueue_beat_video_prompt(
        self,
        task_context: ProjectContext,
        task: BeatVideoPromptTask,
    ) -> TaskQueueReceipt:
        queued = await self._task_backend_provider().enqueue_project_task(
            task_context,
            task_type="beat_video_prompt",
            queue_kind="default",
            episode=task.episode,
            beat_num=task.beat_num,
            payload=task.backend_payload(),
        )
        return TaskQueueReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                "beat_video_prompt",
                task_context.project_id,
                task.episode,
                beat_num=task.beat_num,
            ),
            backend=queued.backend,
            queue=queued.queue,
        )
