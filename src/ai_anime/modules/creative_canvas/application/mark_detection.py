"""Creative Canvas mark detection application use case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.domain import (
    CreativeCanvasMarkSelection,
    CreativeCanvasMarkSelectionRequired,
)


class InvalidCreativeCanvasMarkRequest(ValueError):
    pass


class CreativeCanvasMarkDetectionFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class DetectCreativeCanvasMarkCommand:
    project_dir: Path
    source_url: str
    selection: CreativeCanvasMarkSelection


@dataclass(frozen=True)
class DetectedCreativeCanvasMark:
    label: str
    note: str
    model: str


@dataclass(frozen=True)
class CreativeCanvasMarkDetectionResult:
    source_url: str
    selection: CreativeCanvasMarkSelection
    label: str
    note: str
    model: str


class CreativeCanvasMarkDetector(Protocol):
    async def detect(
        self,
        image_path: Path,
        selection: CreativeCanvasMarkSelection,
    ) -> DetectedCreativeCanvasMark: ...


class CreativeCanvasMarkDetectionUseCases:
    def __init__(
        self,
        sources: CreativeCanvasMediaSourceResolver,
        detector: CreativeCanvasMarkDetector,
    ) -> None:
        self._sources = sources
        self._detector = detector

    async def detect(
        self,
        command: DetectCreativeCanvasMarkCommand,
    ) -> CreativeCanvasMarkDetectionResult:
        if not command.source_url:
            raise InvalidCreativeCanvasMarkRequest("source_url is required")
        try:
            command.selection.require_target()
        except CreativeCanvasMarkSelectionRequired as exc:
            raise InvalidCreativeCanvasMarkRequest(str(exc)) from exc
        try:
            image_path = self._sources.resolve(
                command.project_dir,
                command.source_url,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasMarkRequest(str(exc)) from exc
        try:
            detected = await self._detector.detect(image_path, command.selection)
        except Exception as exc:
            raise CreativeCanvasMarkDetectionFailed(
                f"mark detect failed: {exc}"
            ) from exc
        return CreativeCanvasMarkDetectionResult(
            source_url=command.source_url,
            selection=command.selection,
            label=detected.label,
            note=detected.note,
            model=detected.model,
        )
