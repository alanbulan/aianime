"""Commands and results owned by Story Intake use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Mapping

from ai_anime.modules.story_intake.domain import SpineTemplate


@dataclass(frozen=True)
class UploadStoryDocumentCommand:
    filename: str | None
    stream: BinaryIO


@dataclass(frozen=True)
class StartIngestionCommand:
    filename: str
    text_model: str
    embedding_model: str
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
    text_model: str
    embedding_model: str
    config: dict[str, bool | str]
    billable_chars: int

    @classmethod
    def from_backend_payload(cls, payload: Mapping[str, Any]) -> IngestionTask:
        raw_config = dict(payload.get("config") or {})
        config = {
            str(key): value
            for key, value in raw_config.items()
            if isinstance(value, (bool, str))
        }
        billing = dict(payload.get("billing") or {})
        models = dict(payload.get("models") or {})
        return cls(
            novel_path=Path(str(payload["novel_path"])),
            text_model=str(models["text"]),
            embedding_model=str(models["embedding"]),
            config=config,
            billable_chars=int(billing.get("billable_chars") or 0),
        )

    def backend_payload(self) -> dict[str, Any]:
        return {
            "novel_path": str(self.novel_path),
            "models": {
                "text": self.text_model,
                "embedding": self.embedding_model,
            },
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
