"""Stable application API exposed by Story Intake & Knowledge."""

from ai_anime.modules.story_intake.application.dto import (
    ProjectScope,
    StartIngestionCommand,
    UploadStoryDocumentCommand,
)
from ai_anime.modules.story_intake.application.errors import (
    NoChaptersDetected,
    ProjectContextRequired,
    StoryDocumentNotFound,
    StoryDocumentParseFailed,
    StoryDocumentTooLarge,
    StoryIntakeError,
    UnsafeStoryDocumentName,
    UnsupportedStoryDocument,
)
from ai_anime.modules.story_intake.domain import SpineTemplateChangeRequiresRebuild

__all__ = [
    "NoChaptersDetected",
    "ProjectContextRequired",
    "ProjectScope",
    "SpineTemplateChangeRequiresRebuild",
    "StartIngestionCommand",
    "StoryDocumentNotFound",
    "StoryDocumentParseFailed",
    "StoryDocumentTooLarge",
    "StoryIntakeError",
    "UnsafeStoryDocumentName",
    "UnsupportedStoryDocument",
    "UploadStoryDocumentCommand",
]
