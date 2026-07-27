"""Creative Canvas project task backend adapter."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskStartFailed,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_backend.limits import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)
from ai_anime.task_identity import project_task_state_key


class TaskBackendCreativeCanvasTaskScheduler:
    def __init__(
        self,
        task_backend_provider: Callable[[], Any],
        *,
        translate_runtime_errors: bool = True,
    ) -> None:
        self._task_backend_provider = task_backend_provider
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
        task_kwargs = {
            "task_type": task.task_type,
            "queue_kind": task.queue_kind,
            "episode": task.episode,
            "scope": scope,
            "payload": payload,
        }
        if task.beat_num is not None:
            task_kwargs["beat_num"] = task.beat_num
        try:
            queued = await self._task_backend_provider().enqueue_project_task(
                context,
                **task_kwargs,
            )
        except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
            raise
        except RuntimeError as exc:
            if not self._translate_runtime_errors:
                raise
            raise CreativeCanvasTaskStartFailed(str(exc)) from exc

        task_id = str(queued.task_state.task_id or "") or None
        return CreativeCanvasTaskReceipt(
            task_type=task.task_type,
            job_id=task.job_id,
            task_key=project_task_state_key(
                task.task_type,
                context.project_id,
                task.episode,
                beat_num=task.beat_num,
                scope=scope,
            ),
            task_episode=task.episode,
            task_scope=scope,
            backend=str(queued.backend),
            queue=str(queued.queue) if queued.queue is not None else None,
            task_id=task_id,
            task_beat_num=task.beat_num,
        )
