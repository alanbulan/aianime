"""Expected Story Intake use-case failures."""

from __future__ import annotations

from pathlib import Path
from typing import Any


class StoryIntakeError(Exception):
    """Base class for failures that the HTTP adapter maps to the legacy contract."""


class UnsafeStoryDocumentName(StoryIntakeError):
    pass


class UnsupportedStoryDocument(StoryIntakeError):
    def __init__(self, filename: str, supported_extensions: str) -> None:
        super().__init__(filename)
        self.suffix = Path(filename).suffix.lower() or "无扩展名"
        self.supported_extensions = supported_extensions


class StoryDocumentTooLarge(StoryIntakeError):
    def __init__(self, max_bytes: int) -> None:
        super().__init__(max_bytes)
        self.max_bytes = max_bytes


class StoryDocumentNotFound(StoryIntakeError):
    def __init__(self, filename: str) -> None:
        super().__init__(filename)
        self.filename = filename


class StoryDocumentParseFailed(StoryIntakeError):
    def __init__(
        self,
        *,
        detail: str | None = None,
        source_format: str | None = None,
    ) -> None:
        super().__init__(detail or "解析章节失败")
        self.detail = detail
        self.source_format = source_format


class NoChaptersDetected(StoryIntakeError):
    def __init__(self, format_check: dict[str, Any]) -> None:
        super().__init__("未检测到有效章节内容")
        self.format_check = format_check
