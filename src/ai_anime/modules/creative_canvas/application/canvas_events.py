"""Creative Canvas event-recording application service."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.creative_canvas.domain import CreativeCanvasEventActor


@dataclass(frozen=True)
class RecordCreativeCanvasEventCommand:
    project_dir: Path
    project_id: str
    canvas_id: str | None
    event_type: str
    actor: CreativeCanvasEventActor
    payload: Mapping[str, Any]


class CreativeCanvasEventWriter(Protocol):
    def append(self, command: RecordCreativeCanvasEventCommand) -> None: ...


class CreativeCanvasEventRecorder:
    def __init__(self, writer: CreativeCanvasEventWriter) -> None:
        self._writer = writer

    def record(self, command: RecordCreativeCanvasEventCommand) -> None:
        self._writer.append(command)


__all__ = [
    "CreativeCanvasEventRecorder",
    "CreativeCanvasEventWriter",
    "RecordCreativeCanvasEventCommand",
]
