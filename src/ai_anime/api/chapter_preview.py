"""Backward-compatible chapter preview imports for legacy API callers."""

from __future__ import annotations

from pathlib import Path

from ai_anime.utils.document_parsers import (
    count_billable_novel_chars as _count_billable_novel_chars,
    decode_novel_bytes as _decode_novel_bytes,
)
from ai_anime.modules.story_intake.infrastructure.document_gateway import (
    LocalStoryDocumentGateway,
)
from ai_anime.utils.document_parsers import (
    load_novel_text as _load_novel_text,
)


def decode_novel_bytes(raw: bytes) -> str:
    return _decode_novel_bytes(raw)


def load_novel_text(path: str | Path) -> str:
    return _load_novel_text(path)


def count_billable_novel_chars(text: str) -> int:
    return _count_billable_novel_chars(text)


def build_chapter_preview(novel_text: str) -> dict:
    return LocalStoryDocumentGateway().build_chapter_preview(novel_text)
