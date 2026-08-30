"""Scheduling contract for long-running verification model calls."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)


@dataclass(frozen=True)
class ScheduledVerificationTask:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    scope: str
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": "verification_model",
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "scope": self.scope,
            "message": self.message,
        }


class ScheduleVerificationModelTask:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def execute(
        self,
        context: ProjectContext,
        *,
        operation: str,
        episode: int,
        beat_num: int | None = None,
        payload: dict[str, Any] | None = None,
        display_name: str,
    ) -> ScheduledVerificationTask:
        scope = operation
        task_payload = {
            "operation": operation,
            "display_name": display_name,
            **dict(payload or {}),
        }
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type="verification_model",
                episode=episode,
                beat_num=beat_num,
                scope=scope,
                payload=task_payload,
            ),
        )
        return ScheduledVerificationTask(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            scope=scope,
            message=f"{display_name}任务已进入队列",
        )


__all__ = ["ScheduleVerificationModelTask", "ScheduledVerificationTask"]
