"""Project task snapshots used by Task Execution use cases."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ProjectTaskRef:
    task_type: str
    episode: int
    beat_num: int | None = None
    scope: str | None = None


@dataclass(frozen=True)
class ProjectTask:
    task_id: str
    task_type: str
    queue_kind: str = "default"
    username: str = ""
    project: str = ""
    episode: int = 0
    project_id: str = ""
    requester_user_id: str = ""
    owner_username: str = ""
    project_name: str = ""
    beat_num: int | None = None
    scope: str | None = None
    status: str = "pending"
    progress: float = 0.0
    current_task: str = ""
    result: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    error: str | None = None
    logs: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    completed_at: str = ""
    expires_at: str = ""


def effective_task_status(task: ProjectTask) -> str:
    if (
        task.status in {"submitting", "queued", "running"}
        and task.progress >= 1.0
        and str(task.current_task or "").strip().lower()
        in {"完成", "completed", "done"}
    ):
        return "completed"
    return task.status


__all__ = ["ProjectTask", "ProjectTaskRef", "effective_task_status"]
