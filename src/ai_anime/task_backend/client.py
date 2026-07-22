"""Queue submission facade for project_id based tasks."""

from __future__ import annotations

from typing import Any

from ai_anime.ports import get_task_backend
from ai_anime.ports.tasks import QueuedTask
from ai_anime.project_context import ProjectContext
from ai_anime.task_state import TaskState


async def enqueue_project_task(
    ctx: ProjectContext,
    *,
    task_type: str,
    queue_kind: str = "default",
    episode: int = 0,
    beat_num: int | None = None,
    scope: str | None = None,
    payload: dict[str, Any] | None = None,
) -> QueuedTask:
    return await get_task_backend().enqueue_project_task(
        ctx,
        task_type=task_type,
        queue_kind=queue_kind,
        episode=episode,
        beat_num=beat_num,
        scope=scope,
        payload=payload,
    )


async def cancel_project_task(
    ctx: ProjectContext,
    task_state: TaskState,
) -> bool:
    return await get_task_backend().cancel_project_task(ctx, task_state)
