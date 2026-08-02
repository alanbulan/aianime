"""Task admission errors and capacity values."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProjectTaskLimitExceeded(RuntimeError):
    project_id: str
    queue_kind: str
    limit: int
    active: int

    def __post_init__(self) -> None:
        super().__init__(self.project_id, self.queue_kind, self.limit, self.active)

    def __str__(self) -> str:
        return (
            f"project {self.project_id} {self.queue_kind} lane is full "
            f"({self.active}/{self.limit})"
        )


@dataclass
class ProjectUserTaskLimitExceeded(RuntimeError):
    project_id: str
    requester_user_id: str
    queue_kind: str
    limit: int
    active: int

    def __post_init__(self) -> None:
        super().__init__(
            self.project_id,
            self.requester_user_id,
            self.queue_kind,
            self.limit,
            self.active,
        )

    def __str__(self) -> str:
        return (
            f"user {self.requester_user_id} in project {self.project_id} "
            f"{self.queue_kind} lane is full ({self.active}/{self.limit})"
        )


@dataclass
class GlobalLaneQueueLimitExceeded(RuntimeError):
    project_id: str
    queue_kind: str
    limit: int
    queued: int

    def __post_init__(self) -> None:
        super().__init__(self.project_id, self.queue_kind, self.limit, self.queued)

    def __str__(self) -> str:
        return (
            f"global {self.queue_kind} lane queue is full for project {self.project_id} "
            f"({self.queued}/{self.limit})"
        )


@dataclass(frozen=True)
class ProjectLaneCapacity:
    limit: int | None
    active: int
    remaining: int | None
    user_limit: int | None
    user_active: int
    user_remaining: int | None

    def to_dict(self) -> dict[str, int | None]:
        return {
            "limit": self.limit,
            "active": self.active,
            "remaining": self.remaining,
            "user_limit": self.user_limit,
            "user_active": self.user_active,
            "user_remaining": self.user_remaining,
        }


def remaining_capacity(limit: int | None, active: int) -> int | None:
    if limit is None:
        return None
    return max(limit - active, 0)


__all__ = [
    "GlobalLaneQueueLimitExceeded",
    "ProjectLaneCapacity",
    "ProjectTaskLimitExceeded",
    "ProjectUserTaskLimitExceeded",
    "remaining_capacity",
]
