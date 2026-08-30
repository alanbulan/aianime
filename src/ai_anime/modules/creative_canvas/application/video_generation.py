"""Creative Canvas video generation application use cases."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
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
    CreativeCanvasVideoRequestedMode,
    build_freezone_image_to_video_prompt,
    build_freezone_keyframe_video_prompt,
    build_freezone_omni_video_prompt,
    build_freezone_video_prompt,
    get_video_camera_template,
    resolve_video_generation_mode,
    summarize_omni_reference_counts,
    validate_omni_reference_limits,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.utils.media_durations import (
    validate_reference_media_durations,
)

CREATIVE_CANVAS_VIDEO_GENERATION_TASK_TYPE = "freezone_video_gen"
CreativeCanvasVideoReferenceType = Literal["image", "video", "audio"]
CreativeCanvasVideoGenerationMode = CreativeCanvasVideoRequestedMode


class InvalidCreativeCanvasVideoGenerationRequest(ValueError):
    pass


class CreativeCanvasVideoCharacterMissing(FileNotFoundError):
    def __init__(self, item_id: str) -> None:
        self.item_id = item_id
        super().__init__(f"video character library item not found: {item_id}")


class CreativeCanvasVideoGenerationModelPolicy(Protocol):
    def resolve_model(self, model: str | None) -> str: ...

    def normalize_aspect_ratio(self, model: str | None, value: str | None) -> str: ...

    def normalize_resolution(self, model: str | None, value: str | None) -> str: ...

    def normalize_duration(self, model: str | None, value: int | None) -> int: ...

    def normalize_generate_audio(self, model: str | None, value: bool) -> bool: ...

    def normalize_human_review(self, model: str | None, value: bool) -> bool: ...

    def normalize_extra_params(
        self,
        model: str | None,
        value: Mapping[str, object] | None,
    ) -> dict[str, object]: ...

    def normalize_scene_optimize(
        self,
        model: str | None,
        value: str | None,
    ) -> str: ...

    def reference_duration_limits(
        self,
        model: str | None,
        media_type: CreativeCanvasVideoReferenceType,
    ) -> tuple[float | None, float | None, float | None, float | None]: ...

    def reference_count_limits(
        self,
        model: str | None,
    ) -> tuple[int | None, int | None, int | None, int | None]: ...


class CreativeCanvasReferenceDurationProbe(Protocol):
    async def probe_seconds(
        self,
        path: str,
        media_type: CreativeCanvasVideoReferenceType,
    ) -> float | None: ...


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
    extra_params: Mapping[str, object] | None = None
    model_selector: str | None = None
    canvas_id: str | None = None
    node_id: str | None = None
    gen_mode: CreativeCanvasVideoGenerationMode | None = None


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
        reference_durations: CreativeCanvasReferenceDurationProbe,
        characters: CreativeCanvasVideoAssetReader,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._models = models
        self._reference_durations = reference_durations
        self._characters = characters
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def start_text_video(
        self,
        command: StartCreativeCanvasTextVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = self._with_generation_mode(
            command.options,
            default="textToVideo",
            allowed=("textToVideo",),
        )
        if not options.prompt.strip():
            raise InvalidCreativeCanvasVideoGenerationRequest("prompt is required")
        self._validate_camera_template(options.camera_template_id)
        model = self._resolve_model(options.model)

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
            {
                "type": "image",
                "path": path,
                "role": "角色参考",
                "field": "reference_images",
            }
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
            model=model,
            prompt=prompt,
            reference_items=reference_items,
        )

    async def start_image_video(
        self,
        command: StartCreativeCanvasImageVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = command.options
        self._validate_camera_template(options.camera_template_id)
        model = self._resolve_model(options.model)
        if not command.image_urls:
            raise InvalidCreativeCanvasVideoGenerationRequest("image_urls is required")
        max_images = self._models.reference_count_limits(model)[0]
        if max_images is not None and len(command.image_urls) > max_images:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                f"image_urls count must be <= {max_images}"
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
        inferred_mode = "imageReference" if len(source_paths) > 1 else "imageToVideo"
        options = self._with_generation_mode(
            options,
            default=inferred_mode,
            allowed=("imageToVideo", "imageReference"),
        )
        if options.gen_mode == "imageToVideo" and len(source_paths) != 1:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "imageToVideo requires exactly one image_url"
            )
        reference_items: list[dict[str, object]] = []
        for index, path in enumerate(source_paths):
            reference_items.append(
                {
                    "type": "image",
                    "path": path,
                    "role": "首帧" if index == 0 else "图片参考",
                    "field": "input_reference" if index == 0 else "reference_images",
                }
            )
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
            model=model,
            prompt=prompt,
            reference_items=reference_items,
        )

    async def start_keyframe_video(
        self,
        command: StartCreativeCanvasKeyframeVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = self._with_generation_mode(
            command.options,
            default="firstLastFrame",
            allowed=("firstFrame", "firstLastFrame"),
        )
        self._validate_camera_template(options.camera_template_id)
        if options.gen_mode == "firstFrame" and not command.first_frame_url:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "firstFrame requires first_frame_url"
            )
        if options.gen_mode == "firstFrame" and command.last_frame_url:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "firstFrame does not accept last_frame_url"
            )
        if options.gen_mode == "firstLastFrame" and not (
            command.first_frame_url or command.last_frame_url
        ):
            raise InvalidCreativeCanvasVideoGenerationRequest(
                "firstLastFrame requires at least one keyframe"
            )
        model = self._resolve_model(options.model)

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
                "field": "input_reference" if first_path else "last_frame",
            }
        ]
        if last_path and first_path:
            reference_items.append(
                {
                    "type": "image",
                    "path": last_path,
                    "role": "尾帧",
                    "field": "last_frame",
                }
            )
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
            model=model,
            prompt=prompt,
            reference_items=reference_items,
            last_frame_path=last_path or None,
        )

    async def start_omni_video(
        self,
        command: StartCreativeCanvasOmniVideoCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = self._with_generation_mode(
            command.options,
            default="allReference",
            allowed=("allReference",),
        )
        if not options.prompt.strip():
            raise InvalidCreativeCanvasVideoGenerationRequest("prompt is required")
        self._validate_camera_template(options.camera_template_id)
        model = self._resolve_model(options.model)

        raw_references = [
            {
                "type": reference.media_type,
                "url": reference.url,
                "role": reference.role,
            }
            for reference in command.references
        ]
        try:
            max_images, max_videos, max_audios, max_total = (
                self._models.reference_count_limits(model)
            )
            validate_omni_reference_limits(
                raw_references,
                max_images=max_images,
                max_videos=max_videos,
                max_audios=max_audios,
                max_total=max_total,
            )
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
                    "field": f"reference_{str(reference.get('type') or 'image')}s",
                }
            )
        for media_type in ("audio", "video"):
            media_items = [
                item for item in reference_items if item.get("type") == media_type
            ]
            duration_limits = self._models.reference_duration_limits(
                model,
                media_type,
            )
            if not media_items or not any(
                limit is not None for limit in duration_limits
            ):
                continue
            durations = await asyncio.gather(
                *(
                    self._reference_durations.probe_seconds(
                        str(item["path"]),
                        media_type,
                    )
                    for item in media_items
                )
            )
            measured = [
                (Path(str(item["path"])).name or f"{media_type}{index}", duration)
                for index, (item, duration) in enumerate(
                    zip(media_items, durations),
                    start=1,
                )
            ]
            try:
                validate_reference_media_durations(
                    measured,
                    min_seconds=duration_limits[0],
                    max_seconds=duration_limits[1],
                    total_min_seconds=duration_limits[2],
                    total_max_seconds=duration_limits[3],
                    media_label=media_type,
                )
            except ValueError as exc:
                raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc
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
            model=model,
            prompt=prompt,
            reference_items=reference_items,
            meta=summarize_omni_reference_counts(raw_references),
        )

    async def start_video_edit(
        self,
        command: StartCreativeCanvasVideoEditCommand,
    ) -> CreativeCanvasVideoGenerationResult:
        options = self._with_generation_mode(
            command.options,
            default="videoEdit",
            allowed=("videoEdit",),
        )
        self._validate_camera_template(options.camera_template_id)
        model = self._resolve_model(options.model)
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
            {
                "type": "video",
                "path": video_paths[0],
                "role": "视频编辑源",
                "field": "input_reference",
            }
        ]
        reference_items.extend(
            {
                "type": "image",
                "path": path,
                "role": "图片参考",
                "field": "reference_images",
            }
            for path in image_paths
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
            model=model,
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
        model: str,
        prompt: str,
        reference_items: list[dict[str, object]],
        last_frame_path: str | None = None,
        audio_setting: str | None = None,
        meta: dict[str, int] | None = None,
    ) -> CreativeCanvasVideoGenerationResult:
        mode_contract = resolve_video_generation_mode(options.gen_mode or "textToVideo")
        try:
            extra_params = self._models.normalize_extra_params(
                model,
                options.extra_params,
            )
            aspect_ratio = self._models.normalize_aspect_ratio(
                model,
                options.aspect_ratio,
            )
            resolution = self._models.normalize_resolution(
                model,
                options.resolution,
            )
            duration_seconds = self._models.normalize_duration(
                model,
                options.duration_seconds,
            )
            generate_audio = self._models.normalize_generate_audio(
                model,
                options.generate_audio,
            )
            human_review = self._models.normalize_human_review(
                model,
                options.human_review,
            )
            scene_optimize = self._models.normalize_scene_optimize(
                model,
                options.scene_optimize,
            )
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc
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
                    "model_id": options.model_selector or "",
                    "gen_mode": mode_contract.execution_mode,
                    "requested_gen_mode": options.gen_mode or "",
                    "prompt": prompt,
                    "reference_items": reference_items,
                    "aspect_ratio": aspect_ratio,
                    "resolution": resolution,
                    "duration_seconds": duration_seconds,
                    "generate_audio": generate_audio,
                    "human_review": human_review,
                    "scene_optimize": scene_optimize,
                    "extra_params": extra_params,
                    "video_model": model,
                    "model_role": mode_contract.model_role,
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

    def _resolve_model(self, model: str | None) -> str:
        try:
            return self._models.resolve_model(model)
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoGenerationRequest(str(exc)) from exc

    @staticmethod
    def _with_generation_mode(
        options: CreativeCanvasVideoGenerationOptions,
        *,
        default: CreativeCanvasVideoGenerationMode,
        allowed: tuple[CreativeCanvasVideoGenerationMode, ...],
    ) -> CreativeCanvasVideoGenerationOptions:
        mode = options.gen_mode or default
        if mode not in allowed:
            raise InvalidCreativeCanvasVideoGenerationRequest(
                f"generation mode {mode!r} is invalid for this operation"
            )
        return replace(options, gen_mode=mode)

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
