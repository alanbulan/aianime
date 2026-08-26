"""Ports required by Story Intake application use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any, BinaryIO, Protocol

from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    ScheduledIngestion,
    StoredStoryDocument,
)
from ai_anime.modules.story_intake.domain import SpineTemplate
from ai_anime.modules.project_workspace.public import ProjectContext


class StoryDocument(Protocol):
    def store_upload(
        self,
        project_dir: Path,
        filename: str | None,
        stream: BinaryIO,
    ) -> StoredStoryDocument: ...

    def get_existing(self, project_dir: Path, filename: str) -> StoredStoryDocument: ...

    def load_text(self, document: StoredStoryDocument) -> str: ...

    def count_billable_chars(self, text: str) -> int: ...

    def build_chapter_preview(self, text: str) -> dict[str, Any]: ...

    def build_format_check(
        self,
        text: str,
        *,
        chapters: list[dict[str, Any]],
    ) -> dict[str, Any]: ...


class KnowledgeGraph(Protocol):
    async def get_snapshot(self) -> dict[str, Any]: ...


class ProjectSettings(Protocol):
    def get_spine_template(
        self,
        username: str,
        project_name: str,
    ) -> SpineTemplate: ...

    def set_ingestion_configuration(
        self,
        username: str,
        project_name: str,
        *,
        spine_template: SpineTemplate | None,
        visual_style: str | None,
        narration_style: str | None,
        ethnicity: str | None,
    ) -> None: ...


class TaskScheduler(Protocol):
    async def enqueue_ingestion(
        self,
        task_context: ProjectContext,
        task: IngestionTask,
    ) -> ScheduledIngestion: ...
