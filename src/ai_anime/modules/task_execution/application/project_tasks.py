"""Project task query and command use cases."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.task_execution.application.ports import ProjectTaskGateway
from ai_anime.modules.task_execution.domain.project_task import (
    ProjectTask,
    ProjectTaskRef,
    effective_task_status,
)


class ProjectTaskUseCases:
    def __init__(self, gateway: ProjectTaskGateway) -> None:
        self._gateway = gateway

    def list_for_project(
        self,
        context: Any,
        *,
        episode: int | None = None,
        task_type: str | None = None,
        status: str | None = None,
    ) -> list[ProjectTask]:
        tasks = self._gateway.list_for_project(context)
        task_type_filter = (task_type or "").strip()
        status_filter = (status or "").strip().lower()
        return [
            task
            for task in tasks
            if (episode is None or task.episode == episode)
            and (not task_type_filter or task.task_type == task_type_filter)
            and (
                not status_filter
                or effective_task_status(task).strip().lower() == status_filter
            )
        ]

    def get_by_key(self, context: Any, task_key: str) -> ProjectTask | None:
        return self._gateway.get_by_key(context, task_key)

    def get_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> ProjectTask | None:
        return self._gateway.get_for_project(context, reference)

    def clear_completed(self, context: Any) -> int:
        deleted = 0
        for task in self._gateway.list_for_project(context):
            if effective_task_status(task) != "completed":
                continue
            deleted += int(self._gateway.delete_for_project(context, task))
        return deleted

    async def cancel(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> bool:
        return await self._gateway.cancel_for_project(context, reference)


__all__ = ["ProjectTaskUseCases"]
