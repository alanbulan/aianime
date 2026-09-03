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
        return sorted(
            (
                task
                for task in tasks
                if (episode is None or task.episode == episode)
                and (not task_type_filter or task.task_type == task_type_filter)
                and (
                    not status_filter
                    or effective_task_status(task).strip().lower() == status_filter
                )
            ),
            key=lambda task: task.updated_at or task.created_at or "",
            reverse=True,
        )

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
            self._gateway.delete_for_project(
                context,
                ProjectTaskRef(
                    task_type=task.task_type,
                    episode=task.episode,
                    beat_num=task.beat_num,
                    scope=task.scope,
                ),
            )
            deleted += 1
        return deleted

    async def cancel(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> bool:
        return await self._gateway.cancel_for_project(context, reference)


__all__ = ["ProjectTaskUseCases"]
