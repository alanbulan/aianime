"""Adapters from the legacy task state store to Task Execution contracts."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, fields
from typing import Any

from ai_anime.modules.task_execution.domain.project_task import (
    ProjectTask,
    ProjectTaskRef,
)


def _snapshot(task_state: Any) -> ProjectTask:
    payload = asdict(task_state)
    return ProjectTask(
        **{field.name: payload[field.name] for field in fields(ProjectTask)}
    )


class LocalProjectTaskGateway:
    def __init__(
        self,
        task_manager_provider: Callable[[], Any],
        task_backend_provider: Callable[[], Any],
    ) -> None:
        self._task_manager_provider = task_manager_provider
        self._task_backend_provider = task_backend_provider

    def list_for_project(self, context: Any) -> list[ProjectTask]:
        manager = self._task_manager_provider()
        return [_snapshot(task) for task in manager.list_tasks_for_project(context)]

    def get_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> ProjectTask | None:
        task = self._native_task(context, reference)
        return _snapshot(task) if task is not None else None

    def delete_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> None:
        self._task_manager_provider().delete_task_for_project(
            context,
            reference.task_type,
            reference.episode,
            beat_num=reference.beat_num,
            scope=reference.scope,
        )

    async def cancel_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> bool:
        task = self._native_task(context, reference)
        if task is None:
            return False
        await self._task_backend_provider().cancel_project_task(context, task)
        return True

    def _native_task(self, context: Any, reference: ProjectTaskRef) -> Any | None:
        return self._task_manager_provider().get_task_for_project(
            context,
            reference.task_type,
            reference.episode,
            beat_num=reference.beat_num,
            scope=reference.scope,
        )


__all__ = ["LocalProjectTaskGateway"]
