"""Application service for submitting project-scoped tasks."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from ai_anime.modules.task_execution.application.ports import TaskBackend
from ai_anime.modules.task_execution.domain.task_identity import project_task_state_key


@dataclass(frozen=True)
class ProjectTaskSubmission:
    task_type: str
    queue_kind: str = "default"
    episode: int = 0
    beat_num: int | None = None
    scope: str | None = None
    payload: dict[str, Any] | None = None


@dataclass(frozen=True)
class ProjectTaskSubmissionReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


class ProjectTaskSubmissionUseCases:
    def __init__(self, task_backend_provider: Callable[[], TaskBackend]) -> None:
        self._task_backend_provider = task_backend_provider

    async def submit(
        self,
        context: Any,
        submission: ProjectTaskSubmission,
    ) -> ProjectTaskSubmissionReceipt:
        task_options: dict[str, Any] = {
            "task_type": submission.task_type,
            "queue_kind": submission.queue_kind,
            "episode": submission.episode,
            "payload": submission.payload,
        }
        if submission.beat_num is not None:
            task_options["beat_num"] = submission.beat_num
        if submission.scope is not None:
            task_options["scope"] = submission.scope
        queued = await self._task_backend_provider().enqueue_project_task(
            context,
            **task_options,
        )
        return ProjectTaskSubmissionReceipt(
            task_id=str(queued.task_state.task_id),
            task_key=project_task_state_key(
                submission.task_type,
                context.project_id,
                submission.episode,
                beat_num=submission.beat_num,
                scope=submission.scope,
            ),
            backend=str(queued.backend),
            queue=str(queued.queue) if queued.queue is not None else None,
        )


__all__ = [
    "ProjectTaskSubmission",
    "ProjectTaskSubmissionReceipt",
    "ProjectTaskSubmissionUseCases",
]
