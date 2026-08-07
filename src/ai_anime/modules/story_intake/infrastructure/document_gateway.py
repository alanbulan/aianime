"""Local-file adapter for uploaded story documents."""

from __future__ import annotations

from pathlib import Path
from typing import Any, BinaryIO

from ai_anime.modules.story_intake.application.dto import StoredStoryDocument
from ai_anime.modules.story_intake.application.errors import (
    StoryDocumentNotFound,
    StoryDocumentParseFailed,
    StoryDocumentTooLarge,
    UnsafeStoryDocumentName,
    UnsupportedStoryDocument,
)
from ai_anime.modules.story_intake.domain import MAX_STORY_UPLOAD_BYTES
from ai_anime.shared.utils.document_parsers import (
    DocumentParseError,
    count_billable_novel_chars,
    is_supported_novel_path,
    load_novel_text,
    supported_novel_extensions_label,
)
from ai_anime.shared.utils.screenplay_quality import build_import_format_check
from ai_anime.shared.utils.upload_safety import (
    UploadTooLargeError,
    is_safe_upload_target,
    sanitize_upload_filename,
    stream_to_file_with_limit,
)


class LocalStoryDocumentGateway:
    def store_upload(
        self,
        project_dir: Path,
        filename: str | None,
        stream: BinaryIO,
    ) -> StoredStoryDocument:
        uploads_dir = project_dir / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        safe_name = sanitize_upload_filename(filename)
        self._validate_supported_target(uploads_dir, safe_name)
        destination = uploads_dir / safe_name
        try:
            size = stream_to_file_with_limit(
                stream,
                destination,
                max_bytes=MAX_STORY_UPLOAD_BYTES,
            )
        except UploadTooLargeError as exc:
            raise StoryDocumentTooLarge(MAX_STORY_UPLOAD_BYTES) from exc
        return StoredStoryDocument(filename=safe_name, path=destination, size=size)

    def get_existing(self, project_dir: Path, filename: str) -> StoredStoryDocument:
        uploads_dir = project_dir / "uploads"
        safe_name = sanitize_upload_filename(filename)
        if safe_name != filename:
            raise UnsafeStoryDocumentName
        self._validate_supported_target(uploads_dir, safe_name)

        path = uploads_dir / safe_name
        if not path.exists():
            raise StoryDocumentNotFound(filename)
        return StoredStoryDocument(
            filename=safe_name,
            path=path,
            size=path.stat().st_size,
        )

    def load_text(self, document: StoredStoryDocument) -> str:
        try:
            return load_novel_text(document.path)
        except DocumentParseError as exc:
            raise StoryDocumentParseFailed(
                detail=str(exc),
                source_format=exc.source_format,
            ) from exc

    def count_billable_chars(self, text: str) -> int:
        return count_billable_novel_chars(text)

    def build_chapter_preview(self, text: str) -> dict[str, Any]:
        from ai_anime.modules.knowledge_graph.public import ChapterDetector

        chapters = ChapterDetector().detect(text)
        payload = []
        for chapter in chapters:
            content = getattr(chapter, "content", "") or ""
            first_line = content.splitlines()[0].strip() if content else ""
            title = (
                getattr(chapter, "title", None) or first_line or f"第{chapter.number}章"
            )
            payload.append(
                {
                    "number": chapter.number,
                    "title": title,
                    "start_line": chapter.start_line,
                    "end_line": chapter.end_line,
                    "content": content,
                    "word_count": len(content),
                }
            )

        return {
            "total_chars": len(text),
            "billable_chars": count_billable_novel_chars(text),
            "count": len(chapters),
            "chapters": payload,
        }

    def build_format_check(
        self,
        text: str,
        *,
        chapters: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return build_import_format_check(
            text,
            has_chapters=bool(chapters),
            chapters=chapters,
        )

    @staticmethod
    def _validate_supported_target(uploads_dir: Path, safe_name: str) -> None:
        if not is_safe_upload_target(uploads_dir, safe_name):
            raise UnsafeStoryDocumentName
        if not is_supported_novel_path(safe_name):
            raise UnsupportedStoryDocument(
                safe_name,
                supported_novel_extensions_label(),
            )
