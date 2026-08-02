"""Creative Canvas generation-history application contract."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class RecordCreativeCanvasGenerationCommand:
    project_dir: Path
    canvas_id: str | None
    node_id: str | None
    task_type: str
    job_id: str
    task_key: str
    status: str
    media_type: str
    result: dict[str, Any] | None = None
    error: str | None = None
    prompt: str | None = None
    extra: dict[str, Any] | None = None


class CreativeCanvasGenerationHistoryWriter(Protocol):
    def append(
        self,
        command: RecordCreativeCanvasGenerationCommand,
    ) -> dict[str, Any] | None: ...


class CreativeCanvasGenerationHistoryUseCases:
    def __init__(self, writer: CreativeCanvasGenerationHistoryWriter) -> None:
        self._writer = writer

    def record(
        self,
        command: RecordCreativeCanvasGenerationCommand,
    ) -> dict[str, Any] | None:
        return self._writer.append(command)
