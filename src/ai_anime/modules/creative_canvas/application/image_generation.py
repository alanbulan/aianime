"""Creative Canvas image generation application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Protocol

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_IMAGE_GENERATION_TASK_TYPE = "freezone_gen"


class InvalidCreativeCanvasImageGenerationRequest(ValueError):
    pass


class CreativeCanvasImageGenerationReferenceMissing(FileNotFoundError):
    def __init__(self, reference_path: Path) -> None:
        self.reference_path = reference_path
        super().__init__(f"reference file not found: {reference_path}")


@dataclass(frozen=True)
class StartCreativeCanvasImageGenerationCommand:
    context: ProjectContext
    project_dir: Path
    prompt: str
    aspect_ratio: str
    image_size: str
    reference_urls: tuple[str, ...] = ()
    camera: CreativeCanvasImageCameraConfig | None = None
    style: CreativeCanvasImageStyleConfig | None = None
    provider: str | None = None
    model: str | None = None
    quality: str | None = None
    canvas_id: str | None = None
    node_id: str | None = None
    model_id: str | None = None
    gen_mode: str | None = None
    task_display: Mapping[str, str] | None = None


class CreativeCanvasImageGenerationPromptComposer(Protocol):
    def compose(
        self,
        prompt: str,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str: ...


class CreativeCanvasImageGenerationModelRouter(Protocol):
    def resolve(
        self,
        provider: str | None,
        model: str | None,
    ) -> tuple[str, str | None]: ...


class CreativeCanvasImageGenerationUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        prompts: CreativeCanvasImageGenerationPromptComposer,
        models: CreativeCanvasImageGenerationModelRouter,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._prompts = prompts
        self._models = models
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start(
        self,
        command: StartCreativeCanvasImageGenerationCommand,
    ) -> CreativeCanvasTaskReceipt:
        reference_paths = self._resolve_references(
            command.project_dir,
            command.reference_urls,
        )
        job_id = self._job_ids.new_id()
        try:
            provider, model = self._models.resolve(command.provider, command.model)
        except ValueError as exc:
            raise InvalidCreativeCanvasImageGenerationRequest(str(exc)) from exc
        prompt = self._prompts.compose(command.prompt, command.style, command.camera)
        display_payload = {
            "task_family": "freezone_canvas",
            "task_label": "自由生成图片",
            "display_name": "自由生成图片",
            **dict(command.task_display or {}),
        }
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_GENERATION_TASK_TYPE,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                payload={
                    "prompt": prompt,
                    "aspect_ratio": command.aspect_ratio,
                    "image_size": command.image_size,
                    "reference_paths": [path.as_posix() for path in reference_paths],
                    "provider": provider,
                    "model": model,
                    "quality": command.quality,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "model_id": command.model_id or "",
                    "gen_mode": command.gen_mode or "",
                    **display_payload,
                },
            ),
        )

    def _resolve_references(
        self,
        project_dir: Path,
        reference_urls: tuple[str, ...],
    ) -> list[Path]:
        reference_paths: list[Path] = []
        for reference_url in reference_urls:
            if not reference_url:
                continue
            try:
                reference_path = self._sources.resolve(project_dir, reference_url)
            except ValueError as exc:
                raise InvalidCreativeCanvasImageGenerationRequest(str(exc)) from exc
            if not self._sources.exists(reference_path):
                raise CreativeCanvasImageGenerationReferenceMissing(reference_path)
            reference_paths.append(reference_path)
        return reference_paths
