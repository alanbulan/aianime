"""Canonical imported-story prerequisite rules."""

from __future__ import annotations

from pathlib import Path


STORY_IMPORT_REQUIRED_CODE = "NOVEL_IMPORT_REQUIRED"
STORY_IMPORT_REQUIRED_MESSAGE = "请先导入小说"


class StoryImportRequired(ValueError):
    """Raised when a graph-derived build starts without imported source text."""

    error_code = STORY_IMPORT_REQUIRED_CODE

    def __init__(self) -> None:
        super().__init__(STORY_IMPORT_REQUIRED_MESSAGE)


def load_imported_story_content(project_dir: str | Path) -> str | None:
    source_path = Path(project_dir) / "novel.txt"
    if not source_path.exists():
        return None
    return source_path.read_text(encoding="utf-8")


def has_imported_story(project_dir: str | Path) -> bool:
    content = load_imported_story_content(project_dir)
    return bool(content and content.strip())


def require_imported_story(project_dir: str | Path) -> str:
    content = load_imported_story_content(project_dir)
    if not content or not content.strip():
        raise StoryImportRequired
    return content
