"""Project task admission capacity queries."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.task_execution.application.ports import (
    ProjectTaskCapacityGateway,
    TaskAdmissionPolicy,
)
from ai_anime.modules.task_execution.domain.admission import (
    ProjectLaneCapacity,
    remaining_capacity,
)


class ProjectTaskLimitUseCases:
    def __init__(
        self,
        capacity_gateway: ProjectTaskCapacityGateway,
        admission_policy: TaskAdmissionPolicy,
    ) -> None:
        self._capacity_gateway = capacity_gateway
        self._admission_policy = admission_policy

    async def limits_for_project(
        self,
        context: Any,
    ) -> dict[str, ProjectLaneCapacity]:
        eligible_user_count = await self._capacity_gateway.eligible_user_count(context)
        capacities: dict[str, ProjectLaneCapacity] = {}
        for queue_kind in sorted(self._admission_policy.queue_kinds):
            limit = self._admission_policy.project_effective_active_limit(
                queue_kind,
                eligible_user_count=eligible_user_count,
            )
            active = self._capacity_gateway.count_project_active(context, queue_kind)
            user_limit = self._admission_policy.project_user_active_limit(queue_kind)
            user_active = self._capacity_gateway.count_user_active(context, queue_kind)
            capacities[queue_kind] = ProjectLaneCapacity(
                limit=limit,
                active=active,
                remaining=remaining_capacity(limit, active),
                user_limit=user_limit,
                user_active=user_active,
                user_remaining=remaining_capacity(user_limit, user_active),
            )
        return capacities


__all__ = ["ProjectTaskLimitUseCases"]
