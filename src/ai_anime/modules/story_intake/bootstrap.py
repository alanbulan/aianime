"""Composition root for the Story Intake bounded context."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from ai_anime.modules.story_intake.application.use_cases import (
    GetChapterPreview,
    GetKnowledgeGraph,
    StartIngestion,
    UploadStoryDocument,
)
from ai_anime.modules.story_intake.infrastructure.document_gateway import (
    LocalStoryDocumentGateway,
)
from ai_anime.modules.story_intake.infrastructure.knowledge_graph import (
    CogneeKnowledgeGraph,
)
from ai_anime.modules.story_intake.infrastructure.project_settings import (
    ProjectConfigSettings,
)
from ai_anime.modules.story_intake.infrastructure.task_scheduler import (
    TaskExecutionScheduler,
)
from ai_anime.modules.task_execution.public import project_task_submission_use_cases


@dataclass(frozen=True)
class StoryIntakeApplication:
    upload_story_document: UploadStoryDocument
    start_ingestion: StartIngestion


def build_get_chapter_preview() -> GetChapterPreview:
    return GetChapterPreview(LocalStoryDocumentGateway())


def build_story_intake_application(
    *,
    load_project_config: Callable[[str, str], dict[str, Any]],
    save_project_config: Callable[..., Any],
    default_aspect_ratio: Callable[[str | None], str],
) -> StoryIntakeApplication:
    documents = LocalStoryDocumentGateway()
    get_chapter_preview = GetChapterPreview(documents)
    return StoryIntakeApplication(
        upload_story_document=UploadStoryDocument(documents, get_chapter_preview),
        start_ingestion=StartIngestion(
            documents,
            ProjectConfigSettings(
                load_config=load_project_config,
                save_config=save_project_config,
                default_aspect_ratio=default_aspect_ratio,
            ),
            TaskExecutionScheduler(project_task_submission_use_cases()),
        ),
    )


def build_get_knowledge_graph(store: Any) -> GetKnowledgeGraph:
    return GetKnowledgeGraph(CogneeKnowledgeGraph(store))
