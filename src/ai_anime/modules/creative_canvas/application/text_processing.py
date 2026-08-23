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
    model_selector: str | None
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
    model_selector: str | None
    video_url: str | None
    duration_sec: float | None
    character_refs: tuple[dict[str, str], ...]
    max_frames: int
    scene_threshold: float
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
                    "model_id": (command.model_selector or "").strip(),
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

        video_path: Path | None = None
        if command.video_url:
            video_path = self._resolve_source(command.project_dir, command.video_url)

        character_refs = [dict(reference) for reference in command.character_refs]
        character_image_paths: list[str] = []
        for reference in character_refs:
            image_url = str(reference.get("image_url") or "").strip()
            if not image_url:
                continue
            try:
                image_path = self._sources.resolve(command.project_dir, image_url)
            except ValueError:
                # 外链仍保留用于结果回填，但不作为本地多模态附件。
                continue
            if self._sources.exists(image_path):
                character_image_paths.append(str(image_path))

        if not source_text and video_path is None and not character_image_paths:
            raise InvalidCreativeCanvasTextProcessingRequest(
                "source_text, source_url, video_url or character_refs is required"
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
                    "model_id": (command.model_selector or "").strip(),
                    "video_path": str(video_path) if video_path else "",
                    "duration_sec": command.duration_sec,
                    "max_frames": command.max_frames,
                    "scene_threshold": command.scene_threshold,
                    "character_refs": character_refs,
                    "character_image_paths": character_image_paths,
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
