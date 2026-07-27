"""Creative Canvas image editing application use cases."""

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
from ai_anime.modules.creative_canvas.domain.image_editing import (
    CreativeCanvasImageCameraConfig,
    CreativeCanvasImageStyleConfig,
    InvalidCreativeCanvasImageAspectRatio,
    InvalidCreativeCanvasImageSize,
    build_image_erase_prompt,
    build_image_outpaint_prompt,
    build_image_redraw_prompt,
    build_image_upscale_prompt,
    resolve_requested_image_aspect_ratio,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE = "freezone_edit"
CREATIVE_CANVAS_IMAGE_MASK_EDIT_TASK_TYPE = "freezone_mask_edit"
CreativeCanvasImageEditOperation = Literal["upscale", "outpaint", "redraw"]


class InvalidCreativeCanvasImageEditingRequest(ValueError):
    pass


class CreativeCanvasImageEditingSourceMissing(FileNotFoundError):
    def __init__(self, source_path: Path, *, field_name: str = "source") -> None:
        self.source_path = source_path
        self.field_name = field_name
        super().__init__(f"{field_name} not found: {source_path}")


@dataclass(frozen=True)
class StartCreativeCanvasImageEditingCommand:
    context: ProjectContext
    project_dir: Path
    operation: CreativeCanvasImageEditOperation
    source_url: str
    image_size: str
    model: str
    quality: str | None = None
    requested_aspect_ratio: str = "original"
    prompt: str = ""
    mask_url: str | None = None
    num_images: int = 1
    camera: CreativeCanvasImageCameraConfig | None = None
    style: CreativeCanvasImageStyleConfig | None = None


@dataclass(frozen=True)
class StartCreativeCanvasReferenceImageEditingCommand:
    context: ProjectContext
    project_dir: Path
    prompt: str
    base_url: str
    aspect_ratio: str
    image_size: str
    extra_reference_urls: tuple[str, ...] = ()
    camera: CreativeCanvasImageCameraConfig | None = None
    style: CreativeCanvasImageStyleConfig | None = None
    provider: str | None = None
    model: str | None = None
    quality: str | None = None
    canvas_id: str | None = None
    node_id: str | None = None
    model_id: str | None = None
    gen_mode: str | None = None


class CreativeCanvasImageEditingStorage(Protocol):
    def size(self, source_path: Path) -> tuple[int, int]: ...

    def prepare_outpaint_base(
        self,
        *,
        source_path: Path,
        project_dir: Path,
        target_aspect_ratio: str,
    ) -> Path: ...


class CreativeCanvasImageEditingPromptComposer(Protocol):
    def compose(
        self,
        prompt: str,
        style: CreativeCanvasImageStyleConfig | None,
        camera: CreativeCanvasImageCameraConfig | None,
    ) -> str: ...


class CreativeCanvasImageModelRouter(Protocol):
    def resolve(self, model: str) -> tuple[str, str | None]: ...

    def resolve_reference_edit(
        self,
        provider: str | None,
        model: str | None,
    ) -> tuple[str, str | None]: ...


class CreativeCanvasImageEditingUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        storage: CreativeCanvasImageEditingStorage,
        prompts: CreativeCanvasImageEditingPromptComposer,
        models: CreativeCanvasImageModelRouter,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._storage = storage
        self._prompts = prompts
        self._models = models
        self._job_ids = job_ids
        self._scheduler = scheduler

    def resolve_aspect_ratio(
        self,
        source_path: Path,
        requested_aspect_ratio: str,
    ) -> str:
        if str(requested_aspect_ratio or "").strip().lower() != "original":
            return requested_aspect_ratio
        width, height = self._storage.size(source_path)
        try:
            return resolve_requested_image_aspect_ratio(
                width,
                height,
                requested_aspect_ratio,
            )
        except (InvalidCreativeCanvasImageSize, InvalidCreativeCanvasImageAspectRatio) as exc:
            raise InvalidCreativeCanvasImageEditingRequest(
                f"invalid source image size: {source_path}"
                if isinstance(exc, InvalidCreativeCanvasImageSize)
                else str(exc)
            ) from exc

    async def start(
        self,
        command: StartCreativeCanvasImageEditingCommand,
    ) -> CreativeCanvasTaskReceipt:
        source_path = self._resolve_existing_source(
            command.project_dir,
            command.source_url,
            field_name="source",
        )
        if command.num_images != 1:
            message = (
                "outpaint currently supports only num_images = 1"
                if command.operation == "outpaint"
                else "num_images is currently limited to 1"
            )
            raise InvalidCreativeCanvasImageEditingRequest(message)

        aspect_ratio = self.resolve_aspect_ratio(
            source_path,
            command.requested_aspect_ratio,
        )

        task_type = CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE
        base_path = source_path
        payload: dict[str, object]
        prompt = self._operation_prompt(command)
        if command.operation == "outpaint":
            try:
                base_path = self._storage.prepare_outpaint_base(
                    source_path=source_path,
                    project_dir=command.project_dir,
                    target_aspect_ratio=aspect_ratio,
                )
            except (InvalidCreativeCanvasImageSize, InvalidCreativeCanvasImageAspectRatio) as exc:
                raise InvalidCreativeCanvasImageEditingRequest(str(exc)) from exc

        if command.mask_url:
            task_type = CREATIVE_CANVAS_IMAGE_MASK_EDIT_TASK_TYPE
            mask_path = self._resolve_existing_source(
                command.project_dir,
                command.mask_url,
                field_name="mask",
            )
            payload = {
                "base_path": base_path.as_posix(),
                "mask_path": mask_path.as_posix(),
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "image_size": command.image_size,
                "quality": command.quality or "medium",
            }
        else:
            payload = {
                "prompt": prompt,
                "base_path": base_path.as_posix(),
                "extra_reference_paths": [],
                "aspect_ratio": aspect_ratio,
                "image_size": command.image_size,
                "quality": command.quality or "medium",
            }

        provider, model = self._models.resolve(command.model)
        payload.update({"provider": provider, "model": model})
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=task_type,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                payload=payload,
            ),
        )

    async def start_reference_edit(
        self,
        command: StartCreativeCanvasReferenceImageEditingCommand,
    ) -> CreativeCanvasTaskReceipt:
        if not command.base_url:
            raise InvalidCreativeCanvasImageEditingRequest("base_url is required")
        base_path = self._resolve_existing_source(
            command.project_dir,
            command.base_url,
            field_name="base file",
        )
        extra_reference_paths = self._resolve_optional_references(
            command.project_dir,
            command.extra_reference_urls,
        )
        aspect_ratio = self.resolve_aspect_ratio(base_path, command.aspect_ratio)
        job_id = self._job_ids.new_id()
        try:
            provider, model = self._models.resolve_reference_edit(
                command.provider,
                command.model,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasImageEditingRequest(str(exc)) from exc
        prompt = self._prompts.compose(command.prompt, command.style, command.camera)
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_IMAGE_EDIT_TASK_TYPE,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                payload={
                    "prompt": prompt,
                    "base_path": base_path.as_posix(),
                    "extra_reference_paths": [
                        path.as_posix() for path in extra_reference_paths
                    ],
                    "aspect_ratio": aspect_ratio,
                    "image_size": command.image_size,
                    "provider": provider,
                    "model": model,
                    "quality": command.quality,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "model_id": command.model_id or "",
                    "gen_mode": command.gen_mode or "",
                    "task_family": "freezone_canvas",
                    "task_label": "编辑图片",
                    "display_name": "编辑图片",
                },
            ),
        )

    def _resolve_existing_source(
        self,
        project_dir: Path,
        source_url: str,
        *,
        field_name: str,
    ) -> Path:
        try:
            source_path = self._sources.resolve(project_dir, source_url)
        except ValueError as exc:
            raise InvalidCreativeCanvasImageEditingRequest(str(exc)) from exc
        if not self._sources.exists(source_path):
            raise CreativeCanvasImageEditingSourceMissing(
                source_path,
                field_name=field_name,
            )
        return source_path

    def _resolve_optional_references(
        self,
        project_dir: Path,
        reference_urls: tuple[str, ...],
    ) -> list[Path]:
        return [
            self._resolve_existing_source(
                project_dir,
                reference_url,
                field_name="reference file",
            )
            for reference_url in reference_urls
            if reference_url
        ]

    def _operation_prompt(self, command: StartCreativeCanvasImageEditingCommand) -> str:
        if command.operation == "upscale":
            prompt = build_image_upscale_prompt()
        elif command.operation == "outpaint":
            prompt = build_image_outpaint_prompt()
        elif command.mask_url and not command.prompt.strip():
            prompt = build_image_erase_prompt()
        else:
            prompt = build_image_redraw_prompt(command.prompt)
        return self._prompts.compose(prompt, command.style, command.camera)
