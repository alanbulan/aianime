"""Stable application API exposed by Story Intake & Knowledge."""

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from ai_anime.modules.story_intake.application.dto import (
    IngestionTask,
    StartIngestionCommand,
    UploadStoryDocumentCommand,
)
from ai_anime.modules.story_intake.application.errors import (
    NoChaptersDetected,
    StoryDocumentNotFound,
    StoryDocumentParseFailed,
    StoryDocumentTooLarge,
    StoryIntakeError,
    UnsafeStoryDocumentName,
    UnsupportedStoryDocument,
)
from ai_anime.modules.story_intake.domain import (
    STORY_IMPORT_REQUIRED_CODE,
    STORY_IMPORT_REQUIRED_MESSAGE,
    SpineTemplateChangeRequiresRebuild,
    StoryImportRequired,
    has_imported_story,
    load_imported_story_content,
    require_imported_story,
)

if TYPE_CHECKING:
    from ai_anime.modules.story_intake.bootstrap import StoryIntakeApplication


def build_chapter_preview(story_text: str) -> dict[str, Any]:
    from ai_anime.modules.story_intake.bootstrap import build_get_chapter_preview

    return build_get_chapter_preview().execute(story_text)


def create_story_intake_application(
    *,
    load_project_config: Callable[[str, str], dict[str, Any]],
    save_project_config: Callable[..., Any],
    default_aspect_ratio: Callable[[str | None], str],
) -> "StoryIntakeApplication":
    from ai_anime.modules.story_intake.bootstrap import build_story_intake_application

    return build_story_intake_application(
        load_project_config=load_project_config,
        save_project_config=save_project_config,
        default_aspect_ratio=default_aspect_ratio,
    )


async def get_knowledge_graph_snapshot(store: Any) -> dict[str, Any]:
    from ai_anime.modules.story_intake.bootstrap import build_get_knowledge_graph

    return await build_get_knowledge_graph(store).execute()


def story_import_required_response() -> dict[str, str | bool]:
    return {
        "ok": False,
        "code": STORY_IMPORT_REQUIRED_CODE,
        "error": STORY_IMPORT_REQUIRED_MESSAGE,
    }


__all__ = [
    "NoChaptersDetected",
    "IngestionTask",
    "STORY_IMPORT_REQUIRED_CODE",
    "STORY_IMPORT_REQUIRED_MESSAGE",
    "SpineTemplateChangeRequiresRebuild",
    "StartIngestionCommand",
    "StoryDocumentNotFound",
    "StoryDocumentParseFailed",
    "StoryDocumentTooLarge",
    "StoryIntakeError",
    "StoryImportRequired",
    "UnsafeStoryDocumentName",
    "UnsupportedStoryDocument",
    "UploadStoryDocumentCommand",
    "build_chapter_preview",
    "create_story_intake_application",
    "get_knowledge_graph_snapshot",
    "has_imported_story",
    "load_imported_story_content",
    "require_imported_story",
    "story_import_required_response",
]
