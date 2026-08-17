"""Creative Canvas vision-analysis application contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CreativeCanvasVisionInput:
    data: bytes
    media_type: str = "image/png"


@dataclass(frozen=True)
class AnalyzeCreativeCanvasVisionCommand:
    prompt: str
    images: tuple[CreativeCanvasVisionInput, ...]
    timeout_seconds: float = 120.0


class CreativeCanvasVisionAnalyzer(Protocol):
    async def analyze(
        self,
        command: AnalyzeCreativeCanvasVisionCommand,
    ) -> tuple[str, str]: ...


class CreativeCanvasVisionAnalysisUseCases:
    def __init__(self, analyzer: CreativeCanvasVisionAnalyzer) -> None:
        self._analyzer = analyzer

    async def analyze(
        self,
        command: AnalyzeCreativeCanvasVisionCommand,
    ) -> tuple[str, str]:
        if not command.images:
            raise ValueError("at least one image is required")
        return await self._analyzer.analyze(command)


def creative_canvas_image_media_type(path: str) -> str:
    suffix = str(path).lower().rsplit(".", 1)[-1] if "." in str(path) else ""
    if suffix in {"jpg", "jpeg"}:
        return "image/jpeg"
    if suffix == "webp":
        return "image/webp"
    if suffix == "gif":
        return "image/gif"
    return "image/png"
