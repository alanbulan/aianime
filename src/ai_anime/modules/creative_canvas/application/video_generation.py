"""Creative Canvas video generation application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Mapping, Protocol

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.application.video_asset_library import (
    CreativeCanvasVideoAssetReader,
)
from ai_anime.modules.creative_canvas.domain.video_generation import (
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    get_video_camera_template,
    summarize_omni_reference_counts,
    validate_omni_reference_limits,
)
from ai_anime.modules.project_workspace.public import ProjectContext

CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE = "freezone_video_gen"
CreativeCanvasVideoReferenceType = Literal["image", "video", "audio"]


class InvalidCreativeCanvasVideoGenerationRequest(ValueError):
    pass


class CreativeCanvasVideoCharacterMissing(FileNotFoundError):
    def __init__(self, item_id: str) -> None:
        self.item_id = item_id
        super().__init__(f"video character library item not found: {item_id}")


class CreativeCanvasVideoGenerationModelPolicy(Protocol):
    def resolve_backend(self, model: str | None) -> str: ...

    def is_seedance2_backend(self, backend: str | None) -> bool: ...

    def is_happyhorse_backend(self, backend: str | None) -> bool: ...

    def normalize_aspect_ratio(self, value: str | None) -> str: ...

    def normalize_resolution(self, backend: str | None, value: str | None) -> str: ...

    def normalize_duration(self, backend: str | None, value: int | None) -> int: ...

    def normalize_scene_optimize(
        self,
        backend: str | None,
        value: str | None,
    ) -> str: ...


@dataclass(frozen=True)
class CreativeCanvasVideoGenerationOptions:
    prompt: str
    camera_template_id: str | None
    marks: tuple[Mapping[str, object], ...]
    aspect_ratio: str
    resolution: str
    duration_seconds: int
    generate_audio: bool
    human_review: bool
    scene_optimize: str | None
    model: str | None
    canvas_id: str | None = None
    node_id: str | None = None
    gen_mode: str | None = None


@dataclass(frozen=True)
class CreativeCanvasOmniVideoReference:
    media_type: CreativeCanvasVideoReferenceType
    url: str
    role: str = ""


@dataclass(frozen=True)
class StartCreativeCanvasTextVideoCommand:
    context: ProjectContext
    project_dir: Path
    options: CreativeCanvasVideoGenerationOptions
    character_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class StartCreativeCanvasImageVideoCommand:
    context: ProjectContext
    project_dir: Path
    options: CreativeCanvasVideoGenerationOptions
    image_urls: tuple[str, ...]


@dataclass(frozen=True)
class StartCreativeCanvasKeyframeVideoCommand:
    context: ProjectContext
    project_dir: Path
    options: CreativeCanvasVideoGenerationOptions
    first_frame_url: str | None = None
    last_frame_url: str | None = None


@dataclass(frozen=True)
class StartCreativeCanvasOmniVideoCommand:
    context: ProjectContext
    project_dir: Path
    options: CreativeCanvasVideoGenerationOptions
    theme: str
    references: tuple[CreativeCanvasOmniVideoReference, ...]


@dataclass(frozen=True)
class StartCreativeCanvasVideoEditCommand:
    context: ProjectContext
    project_dir: Path
    options: CreativeCanvasVideoGenerationOptions
    video_url: str
    image_urls: tuple[str, ...]
    audio_setting: str


@dataclass(frozen=True)
class CreativeCanvasVideoGenerationResult:
    receipt: CreativeCanvasTaskReceipt
    meta: dict[str, int] | None = None


class CreativeCanvasVideoGenerationUseCases:
    def __init__(
        self,
        sources: CreativeCanvasMediaSourceResolver,
        models: CreativeCanvasVideoGenerationModelPolicy,
        characters: CreativeCanvasVideoAssetReader,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._models = models
        self._characters = characters
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_text_video(
        self,
        command: StartCreativeCanvasTextVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        if not options.prompt.strip():
            raise InvalidCreativeCanvasVideoGenerationRequest("prompt is required")
        self._validate_camera_template(options.camera_template_id)
        backend = self._resolve_backend(options.model)

        character_items = self._select_character_items(
            command.project_dir,
            command.character_ids,
        )
        character_names = [str(item.get("name") or "") for item in character_items]
        character_urls = [
            url
            for item in character_items
            for url in item.get("image_urls") or []
            if isinstance(url, str) and url
        ]
        reference_items = [
            {"type": "image", "path": path, "role": "角色参考"}
            for path in self._resolve_urls(command.project_dir, character_urls)
        ]
        prompt = build_freezone_video_prompt(
            user_prompt=options.prompt,
            camera_template_id=options.camera_template_id,
            character_names=character_names,
            marks=self._marks(options),
        )
        return await self._enqueue(
            command.context,
            command.project_dir,
            options,
            backend=backend,
            prompt=prompt,
            reference_items=reference_items,
        )

    async def start_image_video(
        self,
        command: StartCreativeCanvasImageVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        self._validate_camera_template(options.camera_template_id)
        backend = self._resolve_backend(options.model)
        if not command.image_urls:
            raise InvalidCreativeCanvasVideoGenerationRequest("image_urls is required")
        if len(command.image_urls) > 9:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "image_urls count must be <= 9"
            )

        source_paths = self._resolve_urls(command.project_dir, command.image_urls)
        if not source_paths:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "at least one valid image_url is required"
            )
        if len(source_paths) != len(command.image_urls):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "some image_urls could not be resolved"
            )
        if (
            len(source_paths) > 1
            and not self._models.is_seedance2_backend(backend)
            and not self._models.is_happyhorse_backend(backend)
        ):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "multiple image references currently only support Seedance 2.0 or HappyHorse models"
            )

        happyhorse_reference_mode = (
            self._models.is_happyhorse_backend(backend)
            and options.gen_mode == "imageReference"
        )
        # HappyHorse uses the first-item role to distinguish r2v from first-frame i2v.
        reference_items: list[dict[str, object]] = []
        for index, path in enumerate(source_paths):
            role = (
                "图片参考"
                if happyhorse_reference_mode
                else "首帧"
                if index == 0
                else "图片参考"
            )
            reference_items.append({"type": "image", "path": path, "role": role})
        prompt = build_freezone_image_to_video_prompt(
            user_prompt=options.prompt,
            camera_template_id=options.camera_template_id,
            marks=self._marks(options),
            reference_image_count=len(source_paths),
        )
        return await self._enqueue(
            command.context,
            command.project_dir,
            options,
            backend=backend,
            prompt=prompt,
            reference_items=reference_items,
        )

    async def start_keyframe_video(
        self,
        command: StartCreativeCanvasKeyframeVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        self._validate_camera_template(options.camera_template_id)
        if not (command.first_frame_url or command.last_frame_url):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "first_frame_url or last_frame_url is required"
            )
        backend = self._resolve_backend(options.model)

        first_paths = self._resolve_urls(
            command.project_dir,
            (command.first_frame_url,) if command.first_frame_url else (),
        )
        last_paths = self._resolve_urls(
            command.project_dir,
            (command.last_frame_url,) if command.last_frame_url else (),
        )
        first_path = first_paths[0] if first_paths else ""
        last_path = last_paths[0] if last_paths else ""
        primary_first_path = first_path or last_path
        reference_items: list[dict[str, object]] = [
            {
                "type": "image",
                "path": primary_first_path,
                "role": "首帧" if first_path else "尾帧参考",
            }
        ]
        if self._models.is_seedance2_backend(backend) and last_path and first_path:
            reference_items.append({"type": "image", "path": last_path, "role": "尾帧"})
        prompt = build_freezone_keyframe_video_prompt(
            user_prompt=options.prompt,
            camera_template_id=options.camera_template_id,
            marks=self._marks(options),
            has_first_frame=bool(first_path),
            has_last_frame=bool(last_path),
        )
        return await self._enqueue(
            command.context,
            command.project_dir,
            options,
            backend=backend,
            prompt=prompt,
            reference_items=reference_items,
            last_frame_path=last_path or None,
        )

    async def start_omni_video(
        self,
        command: StartCreativeCanvasOmniVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        if not options.prompt.strip():
            raise InvalidCreativeCanvasVideoGenerationRequest("prompt is required")
        self._validate_camera_template(options.camera_template_id)
        backend = self._resolve_backend(options.model)
        if self._models.is_happyhorse_backend(backend):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "HappyHorse video does not support omni reference mode"
            )
        if not self._models.is_seedance2_backend(backend):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "omni video currently only supports Seedance 2.0 models"
            )

        raw_references = [
            {
                "type": reference.media_type,
                "url": reference.url,
                "role": reference.role,
            }
            for reference in command.references
        ]
        try:
            validate_omni_reference_limits(raw_references)
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc
        reference_items: list[dict[str, object]] = []
        for reference in raw_references:
            paths = self._resolve_urls(
                command.project_dir,
                (str(reference.get("url") or ""),),
            )
            if not paths:
                raise InvalidCreativeCanvasVideoGenerationRequest(
                    "reference url is required"
                )
            reference_items.append(
                {
                    "type": str(reference.get("type") or "image"),
                    "path": paths[0],
                    "role": str(reference.get("role") or ""),
                }
            )
        prompt = build_freezone_omni_video_prompt(
            user_prompt=options.prompt,
            theme=command.theme,
            camera_template_id=options.camera_template_id,
            marks=self._marks(options),
        )
        return await self._enqueue(
            command.context,
            command.project_dir,
            options,
            backend=backend,
            prompt=prompt,
            reference_items=reference_items,
            meta=summarize_omni_reference_counts(raw_references),
        )

    async def start_video_edit(
        self,
        command: StartCreativeCanvasVideoEditCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        self._validate_camera_template(options.camera_template_id)
        backend = self._resolve_backend(options.model)
        if not self._models.is_happyhorse_backend(backend):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "video edit currently only supports HappyHorse models"
            )
        if not command.video_url.strip():
            raise InvalidCreativeCanvasVideoGenerationRequest("video_url is required")

        video_paths = self._resolve_urls(command.project_dir, (command.video_url,))
        if not video_paths:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "video_url could not be resolved"
            )
        image_paths = self._resolve_urls(command.project_dir, command.image_urls)
        if len(image_paths) != len(command.image_urls):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "some image_urls could not be resolved"
            )
        if len(image_paths) > 5:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "image_urls count must be <= 5"
            )

        reference_items: list[dict[str, object]] = [
            {"type": "video", "path": video_paths[0], "role": "视频编辑源"}
        ]
        reference_items.extend(
            {"type": "image", "path": path, "role": "图片参考"} for path in image_paths
        )
        prompt = build_freezone_image_to_video_prompt(
            user_prompt=options.prompt,
            camera_template_id=options.camera_template_id,
            marks=self._marks(options),
            reference_image_count=len(image_paths),
        )
        return await self._enqueue(
            command.context,
            command.project_dir,
            options,
            backend=backend,
            prompt=prompt,
            reference_items=reference_items,
            audio_setting=command.audio_setting,
        )

    async def _enqueue(
        self,
        context: ProjectContext,
        project_dir: Path,
        options: CreativeCanvasVideoGenerationOptions,
        *,
        backend: str,
        prompt: str,
        reference_items: list[dict[str, object]],
        last_frame_path: str | None = None,
        audio_setting: str | None = None,
        meta: dict[str, int] | None = None,
    ) -> CreativeCanvasVideoGenerationResult:
        job_id = self._job_ids.new_id()
        receipt = await self._scheduler.enqueue(
            context,
            CreativeCanvasTaskSubmission(
                task_type=CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE,
                queue_kind="video",
                job_id=job_id,
                project_dir=project_dir,
                payload={
                    "canvas_id": options.canvas_id or "",
                    "node_id": options.node_id or "",
                    "model_id": options.model or "",
                    "gen_mode": options.gen_mode or "",
                    "prompt": prompt,
                    "reference_items": reference_items,
                    "aspect_ratio": self._models.normalize_aspect_ratio(
                        options.aspect_ratio
                    ),
                    "resolution": self._models.normalize_resolution(
                        backend,
                        options.resolution,
                    ),
                    "duration_seconds": self._models.normalize_duration(
                        backend,
                        options.duration_seconds,
                    ),
                    "generate_audio": options.generate_audio,
                    "human_review": options.human_review,
                    "scene_optimize": self._models.normalize_scene_optimize(
                        backend,
                        options.scene_optimize,
                    ),
                    "backend": backend,
                    "last_frame_path": last_frame_path,
                    "audio_setting": audio_setting or "",
                },
            ),
        )
        return CreativeCanvasVideoGenerationResult(receipt=receipt, meta=meta)

    def _select_character_items(
        self,
        project_dir: Path,
        character_ids: tuple[str, ...],
    ) -> tuple[Mapping[str, object], ...]:
        if not character_ids:
            return ()
        items = self._characters.list_items(project_dir)
        mapping = {str(item.get("id")): item for item in items}
        for item_id in character_ids:
            if item_id not in mapping:
                raise CreativeCanvasVideoCharacterMissing(item_id)
        return tuple(mapping[item_id] for item_id in character_ids)

    def _resolve_urls(
        self,
        project_dir: Path,
        urls: tuple[str, ...] | list[str],
    ) -> list[str]:
        paths: list[str] = []
        for url in urls:
            if not url:
                continue
            try:
                paths.append(self._sources.resolve(project_dir, url).as_posix())
            except ValueError as exc:
                raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc
        return paths

    def _resolve_backend(self, model: str | None) -> str:
        try:
            return self._models.resolve_backend(model)
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc

    @staticmethod
    def _validate_camera_template(camera_template_id: str | None) -> None:
        if camera_template_id and not get_video_camera_template(camera_template_id):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                f"unknown camera_template_id: {camera_template_id}"
            )

    @staticmethod
    def _marks(
        options: CreativeCanvasVideoGenerationOptions,
    ) -> list[dict[str, object]]:
        return [dict(mark) for mark in options.marks]
