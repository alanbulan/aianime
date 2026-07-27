"""Creative Canvas project task submission contracts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.project_workspace.public import ProjectContext


class CreativeCanvasTaskStartFailed(RuntimeError):
    pass


class CreativeCanvasJobIds(Protocol):
    def new_id(self) -> str: ...


@dataclass(frozen=True)
class CreativeCanvasTaskSubmission:
    task_type: str
    queue_kind: str
    job_id: str
    project_dir: Path
    payload: dict[str, Any]
    episode: int = 0
    beat_num: int | None = None
    scope: str | None = None
    inject_job_context: bool = True


@dataclass(frozen=True)
class CreativeCanvasTaskReceipt:
    task_type: str
    job_id: str
    task_key: str
    task_episode: int
    task_scope: str
    backend: str
    queue: str | None
    task_id: str | None
    task_beat_num: int | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "task_type": self.task_type,
            "job_id": self.job_id,
            "task_key": self.task_key,
            "task_episode": self.task_episode,
            "task_scope": self.task_scope,
            "backend": self.backend,
            "queue": self.queue,
        }
        if self.task_beat_num is not None:
            data["task_beat_num"] = self.task_beat_num
        if self.task_id:
            data["task_id"] = self.task_id
        return data


class CreativeCanvasTaskScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt: ...
