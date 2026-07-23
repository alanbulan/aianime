from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ScriptGenerationTask:
    episode: int
    output_dir: str | Path
    config: dict[str, Any] = field(default_factory=dict)

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "config": dict(self.config),
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class BeatVideoPromptTask:
    episode: int
    beat_num: int
    field: str
    language: str
    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "beat_num": self.beat_num,
            "field": self.field,
            "language": self.language,
            "output_dir": str(self.output_dir),
            "display_name": (
                f"生成提示词 · EP{self.episode} / Beat {self.beat_num}"
            ),
        }


@dataclass(frozen=True)
class TaskQueueReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledNarrativeTask:
    task_type: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    message: str

    @classmethod
    def from_receipt(
        cls,
        receipt: TaskQueueReceipt,
        *,
        task_type: str,
        message: str,
    ) -> ScheduledNarrativeTask:
        return cls(
            task_type=task_type,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            message=message,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": self.task_type,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": self.message,
        }
