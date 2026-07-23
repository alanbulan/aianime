"""Commands and results owned by Story Intake use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from ai_anime.modules.story_intake.domain import SpineTemplate


@dataclass(frozen=True)
class ProjectScope:
    username: str
    project_name: str
    project_dir: Path
    task_context: object | None


@dataclass(frozen=True)
class UploadStoryDocumentCommand:
    filename: str | None
    stream: BinaryIO


@dataclass(frozen=True)
class StartIngestionCommand:
    filename: str
    rebuild: bool = False
    spine_template: SpineTemplate | None = None


@dataclass(frozen=True)
class StoredStoryDocument:
    filename: str
    path: Path
    size: int | None = None


@dataclass(frozen=True)
class IngestionTask:
    novel_path: Path
    config: dict[str, bool | str]
    billable_chars: int

    def backend_payload(self) -> dict[str, Any]:
        return {
            "novel_path": str(self.novel_path),
            "config": dict(self.config),
            "billing": {
                "billable_chars": self.billable_chars,
                "billing_quantity": self.billable_chars,
            },
        }


@dataclass(frozen=True)
class ScheduledIngestion:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
