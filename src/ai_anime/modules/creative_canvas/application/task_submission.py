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


class CreativeCanvasTaskScheduler(Protocol):
    async def enqueue(
        self,
        context: ProjectContext,
        task: CreativeCanvasTaskSubmission,
    ) -> CreativeCanvasTaskReceipt: ...
