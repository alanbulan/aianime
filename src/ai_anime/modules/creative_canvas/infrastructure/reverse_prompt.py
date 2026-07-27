"""Creative Canvas image reverse-prompt task adapter."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ai_anime.modules.creative_canvas.application.reverse_prompt import (
    CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
    CreativeCanvasReversePromptStartFailed,
    CreativeCanvasReversePromptTask,
    CreativeCanvasReversePromptTaskReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_backend.limits import (
    ProjectTaskLimitExceeded,
    ProjectUserTaskLimitExceeded,
)
from ai_anime.task_identity import project_task_state_key


class TaskBackendCreativeCanvasReversePromptScheduler:
    def __init__(self, task_backend_provider: Callable[[], Any]) -> None:
        self._task_backend_provider = task_backend_provider

    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasReversePromptTask,
    ) -> CreativeCanvasReversePromptTaskReceipt:
        try:
            queued = await self._task_backend_provider().enqueue_project_task(
                context,
                task_type=CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
                queue_kind="default",
                episode=0,
                scope=task.job_id,
                payload={
                    "job_id": task.job_id,
                    "project_dir": str(task.project_dir),
                    "source_path": task.source_path.as_posix(),
                    "canvas_id": task.canvas_id or "",
                    "node_id": task.node_id or "",
                },
            )
        except (ProjectTaskLimitExceeded, ProjectUserTaskLimitExceeded):
            raise
        except RuntimeError as exc:
            raise CreativeCanvasReversePromptStartFailed(str(exc)) from exc

        task_id = str(queued.task_state.task_id or "") or None
        return CreativeCanvasReversePromptTaskReceipt(
            task_type=CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
            job_id=task.job_id,
            task_key=project_task_state_key(
                CREATIVE_CANVAS_REVERSE_PROMPT_TASK_TYPE,
                context.project_id,
                0,
                scope=task.job_id,
            ),
            task_episode=0,
            task_scope=task.job_id,
            backend=str(queued.backend),
            queue=str(queued.queue) if queued.queue is not None else None,
            task_id=task_id,
        )
