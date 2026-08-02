"""Project task capacity counters backed by TaskState and Project Workspace."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any


class LocalProjectTaskCapacityGateway:
    def __init__(
        self,
        task_manager_provider: Callable[[], Any],
        eligible_user_counter: Callable[[Any], Awaitable[int]],
    ) -> None:
        self._task_manager_provider = task_manager_provider
        self._eligible_user_counter = eligible_user_counter

    async def eligible_user_count(self, context: Any) -> int:
        return await self._eligible_user_counter(context)

    def count_project_active(self, context: Any, queue_kind: str) -> int:
        return self._task_manager_provider().count_active_tasks_for_project_lane(
            context,
            queue_kind,
        )

    def count_user_active(self, context: Any, queue_kind: str) -> int:
        return self._task_manager_provider().count_active_tasks_for_project_user_lane(
            context,
            queue_kind,
        )


__all__ = ["LocalProjectTaskCapacityGateway"]
