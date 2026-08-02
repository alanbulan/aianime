"""Creative Canvas text-processing application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE = "freezone_text_translate"
CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE = "freezone_story_script"


class InvalidCreativeCanvasTextProcessingRequest(ValueError):
    pass


class CreativeCanvasTextProcessingSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        super().__init__(f"source not found: {source_path}")


class CreativeCanvasTextSourceReader(Protocol):
    def read(self, source_path: Path) -> str: ...


@dataclass(frozen=True)
class StartCreativeCanvasTextTranslationCommand:
    context: ProjectContext
    project_dir: Path
    text: str
    model: str
    node_type: Literal["generic", "image", "video", "audio", "text"]
    canvas_id: str | None = None
    node_id: str | None = None


@dataclass(frozen=True)
class StartCreativeCanvasStoryScriptCommand:
    context: ProjectContext
    project_dir: Path
    source_text: str
    source_url: str | None
    prompt: str
    model: str
    canvas_id: str | None = None
    node_id: str | None = None


class CreativeCanvasTextProcessingUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        text_reader: CreativeCanvasTextSourceReader,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._text_reader = text_reader
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_translation(
        self,
        command: StartCreativeCanvasTextTranslationCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.text.strip():
            raise InvalidCreativeCanvasTextProcessingRequest("text is required")
        model = command.model.strip()
        if not model:
            raise InvalidCreativeCanvasTextProcessingRequest("model is required")

        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_TEXT_TRANSLATION_TASK_TYPE,
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "text": command.text,
                    "model": model,
                    "node_type": command.node_type,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                },
            ),
        )

    async def start_story_script(
        self,
        command: StartCreativeCanvasStoryScriptCommand,
    ) -> CreativeCanvasTaskReceipt:
        model = command.model.strip()
        if not model:
            raise InvalidCreativeCanvasTextProcessingRequest("model is required")

        source_text = command.source_text.strip()
        if not source_text and command.source_url:
            source_path = self._resolve_source(command.project_dir, command.source_url)
            try:
                source_text = self._text_reader.read(source_path).strip()
            except UnicodeError as exc:
                raise InvalidCreativeCanvasTextProcessingRequest(
                    f"unsupported text encoding: {source_path.name}"
                ) from exc

        if not source_text:
            raise InvalidCreativeCanvasTextProcessingRequest(
                "source_text or source_url is required"
            )

        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_STORY_SCRIPT_TASK_TYPE,
                queue_kind="default",
                job_id=self._job_ids.new_id(),
                project_dir=command.project_dir,
                payload={
                    "source_text": source_text,
                    "prompt": command.prompt,
                    "model": model,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                },
            ),
        )

    def _resolve_source(self, project_dir: Path, source_url: str) -> Path:
        try:
            source_path = self._sources.resolve(project_dir, source_url)
        except ValueError as exc:
            raise InvalidCreativeCanvasTextProcessingRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasTextProcessingSourceMissing(source_path)
        return source_path
