"""Ports owned by the Task Execution application layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol

from ai_anime.modules.task_execution.domain.project_task import (
    ProjectTask,
    ProjectTaskRef,
)


@dataclass(frozen=True)
class QueuedTask:
    task_state: Any
    backend: str
    queue: str | None = None
    celery_id: str | None = None


ProjectTaskRunner = Callable[[dict[str, Any], Any], dict[str, Any] | None]


class TaskBackend(Protocol):
    async def enqueue_project_task(
        self,
        ctx,
        *,
        task_type: str,
        queue_kind: str = "default",
        episode: int = 0,
        beat_num: int | None = None,
        scope: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> QueuedTask: ...

    async def cancel_project_task(self, ctx, task_state) -> bool: ...


class CancellationStore(Protocol):
    async def request_cancel(
        self,
        *,
        project_id: str,
        task_type: str,
        episode: int,
        task_id: str,
        beat_num: int | None = None,
        scope: str | None = None,
        ttl_seconds: int = 86_400,
    ) -> None: ...

    async def is_cancel_requested(
        self,
        *,
        project_id: str,
        task_type: str,
        episode: int,
        task_id: str,
        beat_num: int | None = None,
        scope: str | None = None,
    ) -> bool: ...


class ProjectTaskGateway(Protocol):
    def list_for_project(self, context: Any) -> list[ProjectTask]: ...

    def get_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> ProjectTask | None: ...

    def delete_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> None: ...

    async def cancel_for_project(
        self,
        context: Any,
        reference: ProjectTaskRef,
    ) -> bool: ...


class TaskAdmissionPolicy(Protocol):
    @property
    def queue_kinds(self) -> frozenset[str]: ...

    def project_effective_active_limit(
        self,
        queue_kind: str,
        *,
        eligible_user_count: int,
    ) -> int | None: ...

    def project_user_active_limit(self, queue_kind: str) -> int | None: ...


class ProjectTaskCapacityGateway(Protocol):
    async def eligible_user_count(self, context: Any) -> int: ...

    def count_project_active(self, context: Any, queue_kind: str) -> int: ...

    def count_user_active(self, context: Any, queue_kind: str) -> int: ...


__all__ = [
    "CancellationStore",
    "ProjectTaskGateway",
    "ProjectTaskCapacityGateway",
    "ProjectTaskRunner",
    "QueuedTask",
    "TaskBackend",
    "TaskAdmissionPolicy",
]
