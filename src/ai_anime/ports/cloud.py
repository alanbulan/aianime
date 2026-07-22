"""Cloud generation adapter boundary for desktop and hosted runtimes."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

CloudTaskKind = Literal["text", "image", "video", "audio", "story"]
ProgressCallback = Callable[[float, str], Awaitable[None]]
CancellationCheck = Callable[[], bool]


@dataclass(frozen=True)
class CloudTaskRequest:
    task_id: str
    task_type: str
    kind: CloudTaskKind
    project_id: str
    episode: int
    beat_num: int | None
    scope: str | None
    payload: dict[str, Any]
    output_dir: Path


@dataclass(frozen=True)
class CloudTaskResult:
    provider_task_id: str
    provider: str
    model: str
    kind: CloudTaskKind
    output: dict[str, Any]

    def as_task_result(self) -> dict[str, Any]:
        return {
            "provider_task_id": self.provider_task_id,
            "provider": self.provider,
            "model": self.model,
            "kind": self.kind,
            **self.output,
        }


class CloudTaskCancelled(Exception):
    """Raised when an adapter observes cooperative task cancellation."""


class CloudAdapter(Protocol):
    name: str

    async def run_task(
        self,
        request: CloudTaskRequest,
        *,
        report_progress: ProgressCallback,
        is_cancelled: CancellationCheck,
    ) -> CloudTaskResult: ...
