"""Creative Canvas image upscale application use case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ai_anime.modules.creative_canvas.application.image_sources import (
    CreativeCanvasExistingImageSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_upscale import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    InvalidCreativeCanvasImageSize,
    resolve_original_image_aspect_ratio,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_IMAGE_UPSCALE_TASK_TYPE = "freezone_edit"


class InvalidCreativeCanvasImageUpscaleRequest(ValueError):
    pass


class CreativeCanvasImageUpscaleSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        super().__init__(f"source not found: {source_path}")


@dataclass(frozen=True)
class StartCreativeCanvasImageUpscaleCommand:
    context: ProjectContext
    project_dir: Path
    source_url: str
    image_size: str
    model: str
    quality: str | None = None
    camera: CreativeCanvasImageCameraConfig | None = None
    style: CreativeCanvasImageStyleConfig | None = None


class CreativeCanvasImageInspector(Protocol):
    def size(self, source_path: Path) -> tuple[int, int]: ...


class CreativeCanvasImageUpscalePromptComposer(Protocol):
    def compose(
        self,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str: ...


class CreativeCanvasImageModelRouter(Protocol):
    def resolve(self, model: str) -> tuple[str, str | None]: ...


class CreativeCanvasImageUpscaleUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingImageSourceResolver,
        images: CreativeCanvasImageInspector,
        prompts: CreativeCanvasImageUpscalePromptComposer,
        models: CreativeCanvasImageModelRouter,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._images = images
        self._prompts = prompts
        self._models = models
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start(
        self,
        command: StartCreativeCanvasImageUpscaleCommand,
    ) -> CreativeCanvasTaskReceipt:
        try:
            source_path = self._sources.resolve(
                command.project_dir,
                command.source_url,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasImageUpscaleRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasImageUpscaleSourceMissing(source_path)

        width, height = self._images.size(source_path)
        try:
            aspect_ratio = resolve_original_image_aspect_ratio(width, height)
        except InvalidCreativeCanvasImageSize as exc:
            raise InvalidCreativeCanvasImageUpscaleRequest(
                f"invalid source image size: {source_path}"
            ) from exc
        provider, model = self._models.resolve(command.model)
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_UPSCALE_TASK_TYPE,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                payload={
                    "prompt": self._prompts.compose(command.style, command.camera),
                    "base_path": source_path.as_posix(),
                    "extra_reference_paths": [],
                    "aspect_ratio": aspect_ratio,
                    "image_size": command.image_size,
                    "provider": provider,
                    "model": model,
                    "quality": command.quality or "medium",
                },
            ),
        )
