"""Story Intake application use cases."""

from __future__ import annotations

import logging
from typing import Any

from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    StartIngestionCommand,
    UploadStoryDocumentCommand,
)
from ai_anime.modules.story_intake.application.errors import (
    NoChaptersDetected,
    StoryDocumentParseFailed,
    StoryDocumentTooLarge,
    StoryTextTooLarge,
)
from ai_anime.modules.story_intake.application.ports import (
    KnowledgeGraph,
    ProjectSettings,
    StoryDocument,
    TaskScheduler,
)
from ai_anime.modules.story_intake.domain import (
    IngestionOptions,
    MAX_STORY_IMPORT_CHARS,
    MAX_STORY_IMPORT_BYTES,
)
from ai_anime.modules.project_workspace.public import ProjectContext

logger = logging.getLogger("ai_anime.story_intake")


class GetChapterPreview:
    def __init__(self, documents: StoryDocument) -> None:
        self._documents = documents

    def execute(self, story_text: str) -> dict[str, Any]:
        return self._documents.build_chapter_preview(story_text)


class UploadStoryDocument:
    def __init__(
        self,
        documents: StoryDocument,
        get_chapter_preview: GetChapterPreview,
    ) -> None:
        self._documents = documents
        self._get_chapter_preview = get_chapter_preview

    def execute(
        self,
        scope: ProjectContext,
        command: UploadStoryDocumentCommand,
    ) -> dict[str, Any]:
        document = self._documents.store_upload(
            scope.output_dir,
            command.filename,
            command.stream,
        )
        try:
            story_text = self._documents.load_text(document)
            billable_chars = self._documents.count_billable_chars(story_text)
            if billable_chars > MAX_STORY_IMPORT_CHARS:
                raise StoryTextTooLarge(billable_chars, MAX_STORY_IMPORT_CHARS)
            preview = self._get_chapter_preview.execute(story_text)
        except (StoryDocumentParseFailed, StoryTextTooLarge):
            raise
        except Exception as exc:
            logger.warning(
                "[%s] failed to build chapter preview for %s",
                scope.project_name,
                document.filename,
                exc_info=True,
            )
            raise StoryDocumentParseFailed() from exc

        chapters = list(preview.get("chapters") or [])
        format_check = self._documents.build_format_check(
            story_text,
            chapters=chapters,
        )
        if not chapters:
            raise NoChaptersDetected(format_check)

        return {
            "filename": document.filename,
            "size": int(document.size or 0),
            **preview,
            "format_check": format_check,
        }


class StartIngestion:
    def __init__(
        self,
        documents: StoryDocument,
        project_settings: ProjectSettings,
        task_scheduler: TaskScheduler,
    ) -> None:
        self._documents = documents
        self._project_settings = project_settings
        self._task_scheduler = task_scheduler

    async def execute(
        self,
        scope: ProjectContext,
        command: StartIngestionCommand,
    ) -> dict[str, Any]:
        document = self._documents.get_existing(scope.output_dir, command.filename)
        if document.size is not None and document.size > MAX_STORY_IMPORT_BYTES:
            raise StoryDocumentTooLarge(MAX_STORY_IMPORT_BYTES)
        try:
            story_text = self._documents.load_text(document)
            billable_chars = self._documents.count_billable_chars(story_text)
            if billable_chars > MAX_STORY_IMPORT_CHARS:
                raise StoryTextTooLarge(billable_chars, MAX_STORY_IMPORT_CHARS)
        except (StoryDocumentParseFailed, StoryTextTooLarge):
            raise
        except Exception as exc:
            logger.warning(
                "[%s] failed to parse %s for billing",
                scope.project_name,
                document.filename,
                exc_info=True,
            )
            raise StoryDocumentParseFailed() from exc

        options = IngestionOptions(
            rebuild=command.rebuild,
            spine_template=command.spine_template,
        )
        task_config = options.task_config()
        self._project_settings.set_ingestion_configuration(
            scope.owner_username,
            scope.project_name,
            spine_template=command.spine_template,
        )

        scheduled = await self._task_scheduler.enqueue_ingestion(
            scope,
            IngestionTask(
                novel_path=document.path,
                config=task_config,
                billable_chars=billable_chars,
            ),
        )
        return {
            "task_type": "ingest_fast",
            "task_id": scheduled.task_id,
            "task_key": scheduled.task_key,
            "backend": scheduled.backend,
            "queue": scheduled.queue,
            "message": f"导入任务已进入队列: {document.filename}",
        }


class GetKnowledgeGraph:
    def __init__(self, knowledge_graph: KnowledgeGraph) -> None:
        self._knowledge_graph = knowledge_graph

    async def execute(self) -> dict[str, Any]:
        return await self._knowledge_graph.get_snapshot()
