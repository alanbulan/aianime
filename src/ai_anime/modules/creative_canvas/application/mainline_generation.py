"""Creative Canvas mainline image generation use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.application.task_submission import (
    CreativeCanvasJobIds,
    CreativeCanvasTaskReceipt,
    CreativeCanvasTaskScheduler,
    CreativeCanvasTaskSubmission,
)
from ai_anime.modules.creative_canvas.domain.mainline_generation import (
    build_scene_360_prompt,
    infer_scene_id_from_master_path,
    mainline_mode_key,
    normalize_mainline_aspect_ratio,
    normalize_mainline_frame_quality,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.task_identity import selection_scope, task_config_scope

MAINLINE_SCENE_360_IMAGE_SIZE = "2K"


class InvalidCreativeCanvasMainlineGeneration(ValueError):
    pass


class CreativeCanvasMainlineMediaMissing(FileNotFoundError):
    pass


class CreativeCanvasMainlineBeatMissing(LookupError):
    pass


@dataclass(frozen=True)
class GenerateCreativeCanvasSketchFromContextCommand:
    context: ProjectContext
    project_dir: Path
    episode: int
    beat: int
    source_kind: str
    source_url: str | None
    aspect_ratio: str
    canvas_id: str | None = None
    node_id: str | None = None


@dataclass(frozen=True)
class GenerateCreativeCanvasFrameFromContextCommand:
    context: ProjectContext
    project_dir: Path
    episode: int
    beat: int
    sketch_url: str
    background_url: str | None
    identity_urls: tuple[str, ...]
    prop_urls: tuple[str, ...]
    aspect_ratio: str
    quality: str
    canvas_id: str | None = None
    node_id: str | None = None


@dataclass(frozen=True)
class GenerateCreativeCanvasScene360Command:
    context: ProjectContext
    project_dir: Path
    reference_url: str
    reverse_reference_url: str | None
    mode: str
    model: str | None
    quality: str | None
    canvas_id: str | None = None
    node_id: str | None = None


@dataclass(frozen=True)
class StartCreativeCanvasBackgroundSketchCommand:
    context: ProjectContext
    project_dir: Path
    episode: int
    beat: int
    beat_payload: Mapping[str, Any] | None
    background_url: str
    aspect_ratio: str = "2:3"
    canvas_id: str | None = None
    node_id: str | None = None
    task_display: Mapping[str, str] | None = None


@dataclass(frozen=True)
class StartCreativeCanvasDirectorSketchCommand:
    context: ProjectContext
    project_dir: Path
    episode: int
    beat: int
    director_combined_url: str
    aspect_ratio: str = "2:3"
    canvas_id: str | None = None
    node_id: str | None = None
    task_display: Mapping[str, str] | None = None


@dataclass(frozen=True)
class StartCreativeCanvasBeatSketchCommand:
    context: ProjectContext
    project_dir: Path
    episode: int
    beat: int
    canvas_id: str | None = None
    node_id: str | None = None
    task_display: Mapping[str, str] | None = None


@dataclass(frozen=True)
class StartCreativeCanvasFrameFromContextCommand:
    context: ProjectContext
    project_dir: Path
    sketch_url: str
    reference_urls: tuple[str, ...]
    extra_reference_urls: tuple[str, ...] = ()
    identity_references: tuple[Mapping[str, Any], ...] = ()
    prop_references: tuple[Mapping[str, Any], ...] = ()
    episode: int = 0
    beat: int | None = None
    beat_payload: Mapping[str, Any] | None = None
    standalone_beat_context: Mapping[str, Any] | None = None
    quality: str = "medium"
    background_reference_mode: str = "material_only"
    canvas_id: str | None = None
    node_id: str | None = None
    task_display: Mapping[str, str] | None = None


@dataclass(frozen=True)
class StartCreativeCanvasScene360Command:
    context: ProjectContext
    project_dir: Path
    scene_id: str
    master_url: str
    reverse_url: str | None
    description: str | None = None
    model: str | None = None
    image_size: str | None = None
    quality: str | None = None
    canvas_id: str | None = None
    node_id: str | None = None
    auto_commit: bool = True
    task_display: Mapping[str, str] | None = None


class CreativeCanvasMainlineGenerationConfigSource(Protocol):
    async def load_beat(
        self,
        context: ProjectContext,
        episode: int,
        beat: int,
    ) -> dict[str, Any]: ...

    async def single_beat_config(
        self,
        context: ProjectContext,
        *,
        episode: int,
        beat: int,
        mode_key: str,
        aspect_ratio: str,
        is_sketch: bool,
    ) -> dict[str, Any]: ...

    def standalone_frame_config(
        self,
        context: ProjectContext,
        *,
        beat_payload: Mapping[str, Any] | None,
        beat_context: Mapping[str, Any],
        mode_key: str,
        aspect_ratio: str,
        quality: str,
    ) -> dict[str, Any]: ...


class CreativeCanvasImageAspectReader(Protocol):
    def read_aspect_ratio(self, path: Path) -> str: ...


class CreativeCanvasScene360Runtime(Protocol):
    def artifact_dir(self, project_dir: Path, job_id: str) -> Path: ...

    def resolve_model(self, model: str | None) -> tuple[str, str | None]: ...


class CreativeCanvasMainlineGenerationUseCases:
    def __init__(
        self,
        sources: CreativeCanvasExistingMediaSourceResolver,
        configs: CreativeCanvasMainlineGenerationConfigSource,
        image_aspects: CreativeCanvasImageAspectReader,
        scene_runtime: CreativeCanvasScene360Runtime,
        job_ids: CreativeCanvasJobIds,
        scheduler: CreativeCanvasTaskScheduler,
    ) -> None:
        self._sources = sources
        self._configs = configs
        self._image_aspects = image_aspects
        self._scene_runtime = scene_runtime
        self._job_ids = job_ids
        self._scheduler = scheduler

    async def generate_sketch_from_context(
        self,
        command: GenerateCreativeCanvasSketchFromContextCommand,
    ) -> CreativeCanvasTaskReceipt:
        beat_payload = await self._configs.load_beat(
            command.context,
            command.episode,
            command.beat,
        )
        source_url = (command.source_url or "").strip()
        source_label = {
            "beat": "Beat 上下文",
            "selected_background": "当前背景",
            "director_combined": "导演合成图",
            "background_candidate": "背景候选",
        }.get(command.source_kind, "输入参考")
        task_display = {
            "task_family": "mainline_skill",
            "task_label": "生成草图",
            "display_name": f"生成草图 · EP{command.episode} / Beat {command.beat}",
            "source_label": source_label,
            "target_label": "当前草图",
            "skill_id": "freezone.sketch_from_context",
        }
        if command.source_kind == "director_combined":
            if not source_url:
                raise InvalidCreativeCanvasMainlineGeneration(
                    "source_url is required for director_combined"
                )
            return await self.start_director_sketch(
                StartCreativeCanvasDirectorSketchCommand(
                    context=command.context,
                    project_dir=command.project_dir,
                    episode=command.episode,
                    beat=command.beat,
                    director_combined_url=source_url,
                    aspect_ratio=command.aspect_ratio,
                    canvas_id=command.canvas_id,
                    node_id=command.node_id,
                    task_display={
                        **task_display,
                        "skill_id": "freezone.sketch_from_director_combined",
                        "source_label": "导演合成图",
                    },
                )
            )
        if source_url:
            return await self.start_background_sketch(
                StartCreativeCanvasBackgroundSketchCommand(
                    context=command.context,
                    project_dir=command.project_dir,
                    episode=command.episode,
                    beat=command.beat,
                    beat_payload=beat_payload,
                    background_url=source_url,
                    aspect_ratio=command.aspect_ratio,
                    canvas_id=command.canvas_id,
                    node_id=command.node_id,
                    task_display=task_display,
                )
            )
        return await self.start_beat_sketch(
            StartCreativeCanvasBeatSketchCommand(
                context=command.context,
                project_dir=command.project_dir,
                episode=command.episode,
                beat=command.beat,
                canvas_id=command.canvas_id,
                node_id=command.node_id,
                task_display=task_display,
            )
        )

    async def generate_frame_from_context(
        self,
        command: GenerateCreativeCanvasFrameFromContextCommand,
    ) -> CreativeCanvasTaskReceipt:
        beat_payload = await self._configs.load_beat(
            command.context,
            command.episode,
            command.beat,
        )
        return await self.start_frame_from_context(
            StartCreativeCanvasFrameFromContextCommand(
                context=command.context,
                project_dir=command.project_dir,
                episode=command.episode,
                beat=command.beat,
                beat_payload=beat_payload,
                sketch_url=command.sketch_url,
                reference_urls=(command.background_url,) if command.background_url else (),
                extra_reference_urls=(*command.identity_urls, *command.prop_urls),
                quality=command.quality,
                canvas_id=command.canvas_id,
                node_id=command.node_id,
                task_display={
                    "task_family": "mainline_skill",
                    "task_label": "渲染分镜",
                    "display_name": f"渲染分镜 · EP{command.episode} / Beat {command.beat}",
                    "source_label": "草图 + 背景 + 身份/道具",
                    "target_label": "当前分镜",
                    "skill_id": "freezone.frame_from_context",
                },
            )
        )

    async def generate_scene_360(
        self,
        command: GenerateCreativeCanvasScene360Command,
    ) -> CreativeCanvasTaskReceipt:
        reference_path = self._resolve_required_media(
            command.project_dir,
            command.reference_url,
            required_message="reference_url is required",
            missing_prefix="master file not found",
            require_exists=False,
        )
        scene_id = infer_scene_id_from_master_path(reference_path, command.project_dir)
        if not scene_id:
            raise InvalidCreativeCanvasMainlineGeneration(
                "could not infer scene_id from reference_url"
            )
        return await self.start_scene_360(
            StartCreativeCanvasScene360Command(
                context=command.context,
                project_dir=command.project_dir,
                scene_id=scene_id,
                master_url=command.reference_url,
                reverse_url=command.reverse_reference_url,
                model=command.model,
                image_size=MAINLINE_SCENE_360_IMAGE_SIZE,
                quality=command.quality,
                canvas_id=command.canvas_id,
                node_id=command.node_id,
                auto_commit=command.mode == "commit",
                task_display={
                    "task_family": "mainline_skill",
                    "task_label": "生成 360 全景",
                    "display_name": f"生成 360 全景 · {scene_id or '场景'}",
                    "source_label": "Master + Reverse",
                    "target_label": "360 全景",
                    "skill_id": "freezone.scene_360",
                },
            )
        )

    async def start_background_sketch(
        self,
        command: StartCreativeCanvasBackgroundSketchCommand,
    ) -> CreativeCanvasTaskReceipt:
        task_type = "mainline_sketch_from_context"
        aspect_ratio = normalize_mainline_aspect_ratio(command.aspect_ratio)
        mode_key = mainline_mode_key(aspect_ratio, is_sketch=True)
        background_path = self._resolve_required_media(
            command.project_dir,
            command.background_url,
            required_message="background_url is required",
            missing_prefix="base file not found",
        )
        config = await self._configs.single_beat_config(
            command.context,
            episode=command.episode,
            beat=command.beat,
            mode_key=mode_key,
            aspect_ratio=aspect_ratio,
            is_sketch=True,
        )
        effective_beat = dict(command.beat_payload or {})
        if effective_beat:
            effective_beat["episode_number"] = command.episode
            effective_beat["beat_number"] = command.beat
            config["beats"] = [effective_beat]
        config["promote_direct_sketch"] = False
        scene_ref = effective_beat.get("scene_ref") or {}
        scene_id = str(
            scene_ref.get("scene_id") or scene_ref.get("name") or ""
        ).strip()
        config["canvas_scene_refs"] = [
            {
                "beat_number": command.beat,
                "image_path": background_path.as_posix(),
                "base_id": scene_id or "canvas background",
                "label": str((command.task_display or {}).get("source_label") or "背景"),
                "source_level": "selected_background_image",
            }
        ]
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type=task_type,
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                episode=command.episode,
                beat_num=command.beat,
                scope=job_id,
                inject_job_context=False,
                payload={
                    "job_id": job_id,
                    "episode": command.episode,
                    "beat_num": command.beat,
                    "output_dir": str(command.project_dir),
                    "config": config,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "task_family": "mainline_skill",
                    "task_label": "生成草图",
                    "display_name": "生成草图",
                    **dict(command.task_display or {}),
                },
            ),
        )

    async def start_director_sketch(
        self,
        command: StartCreativeCanvasDirectorSketchCommand,
    ) -> CreativeCanvasTaskReceipt:
        source_path = self._resolve_required_media(
            command.project_dir,
            command.director_combined_url,
            required_message="director_combined_url is required",
            missing_prefix="director combined file not found",
        )
        aspect_ratio = normalize_mainline_aspect_ratio(command.aspect_ratio)
        job_id = self._job_ids.new_id()
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="mainline_director_control_sketch",
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                episode=command.episode,
                beat_num=command.beat,
                scope=job_id,
                inject_job_context=False,
                payload={
                    "job_id": job_id,
                    "episode": command.episode,
                    "beat_num": command.beat,
                    "project_dir": str(command.project_dir),
                    "state_dir": str(command.context.state_dir),
                    "control_frame_path": source_path.as_posix(),
                    "mode_key": mainline_mode_key(aspect_ratio, is_sketch=True),
                    "aspect_ratio": aspect_ratio,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "task_family": "mainline_skill",
                    "task_label": "导演合成图转草图",
                    "display_name": (
                        f"导演合成图转草图 · EP{command.episode} / Beat {command.beat}"
                    ),
                    "source_label": "导演合成图",
                    "target_label": "当前草图候选",
                    **dict(command.task_display or {}),
                },
            ),
        )

    async def start_beat_sketch(
        self,
        command: StartCreativeCanvasBeatSketchCommand,
    ) -> CreativeCanvasTaskReceipt:
        mode_key = "1x1_2-3_sketch"
        scope = selection_scope(mode_key, [command.beat])
        config = await self._configs.single_beat_config(
            command.context,
            episode=command.episode,
            beat=command.beat,
            mode_key=mode_key,
            aspect_ratio="2:3",
            is_sketch=True,
        )
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="sketch_generation",
                queue_kind="default",
                job_id=scope,
                project_dir=command.project_dir,
                episode=command.episode,
                scope=scope,
                inject_job_context=False,
                payload={
                    "episode": command.episode,
                    "output_dir": str(command.project_dir),
                    "config": config,
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "task_family": "mainline_skill",
                    "task_label": "生成草图",
                    "display_name": f"生成草图 · EP{command.episode} / Beat {command.beat}",
                    "source_label": "Beat 上下文",
                    "target_label": "当前草图",
                    **dict(command.task_display or {}),
                },
            ),
        )

    async def start_frame_from_context(
        self,
        command: StartCreativeCanvasFrameFromContextCommand,
    ) -> CreativeCanvasTaskReceipt:
        sketch_path = self._resolve_required_media(
            command.project_dir,
            command.sketch_url,
            required_message="sketch_url is required",
            missing_prefix="sketch file not found",
        )
        inferred_aspect_ratio = self._image_aspects.read_aspect_ratio(sketch_path)
        mode_key = mainline_mode_key(inferred_aspect_ratio, is_sketch=False)
        reference_paths = self._resolve_optional_media(
            command.project_dir,
            command.reference_urls,
        )
        extra_reference_paths = self._resolve_optional_media(
            command.project_dir,
            command.extra_reference_urls,
        )
        identity_references = self._resolve_typed_references(
            command.project_dir,
            command.identity_references,
        )
        prop_references = self._resolve_typed_references(
            command.project_dir,
            command.prop_references,
        )
        for path in [
            *reference_paths,
            *extra_reference_paths,
            *[item["image_path"] for item in identity_references],
            *[item["image_path"] for item in prop_references],
        ]:
            if not self._sources.exists(path):
                raise CreativeCanvasMainlineMediaMissing(
                    f"reference file not found: {path}"
                )

        standalone = command.standalone_beat_context is not None
        if standalone:
            config = self._configs.standalone_frame_config(
                command.context,
                beat_payload=command.beat_payload,
                beat_context=command.standalone_beat_context or {},
                mode_key=mode_key,
                aspect_ratio=inferred_aspect_ratio,
                quality=command.quality,
            )
            item_index_key = "panel_index"
            item_index = 0
            sketch_key = "0"
            task_episode = 0
            task_beat = None
        else:
            if command.beat is None:
                raise InvalidCreativeCanvasMainlineGeneration("beat is required")
            config = await self._configs.single_beat_config(
                command.context,
                episode=command.episode,
                beat=command.beat,
                mode_key=mode_key,
                aspect_ratio=inferred_aspect_ratio,
                is_sketch=False,
            )
            effective_beat = dict(command.beat_payload or {})
            if effective_beat:
                effective_beat["episode_number"] = command.episode
                effective_beat["beat_number"] = command.beat
                config["beats"] = [effective_beat]
            config["promote_selected_regen"] = False
            config["image_quality"] = normalize_mainline_frame_quality(command.quality)
            item_index_key = "beat_number"
            item_index = command.beat
            sketch_key = str(command.beat)
            task_episode = command.episode
            task_beat = command.beat

        config["canvas_sketch_paths"] = {sketch_key: sketch_path.as_posix()}
        effective_scene = dict(command.beat_payload or {}).get("scene_ref") or {}
        scene_id = str(
            effective_scene.get("scene_id") or effective_scene.get("name") or ""
        ).strip()
        canvas_refs: list[dict[str, Any]] = []
        if reference_paths:
            background_ref: dict[str, Any] = {
                item_index_key: item_index,
                "image_path": reference_paths[0].as_posix(),
                "base_id": scene_id or "canvas background",
                "label": "背景",
                "source_level": "selected_background_image",
            }
            if command.background_reference_mode == "material_only":
                background_ref["reference_mode"] = "material_only"
            canvas_refs.append(background_ref)
        generic_ref_index = 1
        for item in identity_references:
            identity_id = str(item.get("identity_id") or "").strip()
            if identity_id:
                config.setdefault("canvas_identity_refs", []).append(
                    {
                        item_index_key: item_index,
                        "identity_id": identity_id,
                        "image_path": item["image_path"].as_posix(),
                        "reference_mode": (
                            "portrait_only"
                            if str(item.get("slot_kind") or "") == "portrait"
                            else "composite"
                        ),
                    }
                )
                continue
            canvas_refs.append(
                self._generic_canvas_reference(
                    item_index_key,
                    item_index,
                    item["image_path"],
                    generic_ref_index,
                )
            )
            generic_ref_index += 1
        for item in prop_references:
            prop_id = str(item.get("prop_id") or "").strip()
            if prop_id:
                config.setdefault("canvas_prop_refs", []).append(
                    {
                        item_index_key: item_index,
                        "prop_id": prop_id,
                        "image_path": item["image_path"].as_posix(),
                        "source_level": "canvas_prop_reference_image",
                    }
                )
                continue
            canvas_refs.append(
                self._generic_canvas_reference(
                    item_index_key,
                    item_index,
                    item["image_path"],
                    generic_ref_index,
                )
            )
            generic_ref_index += 1
        for path in extra_reference_paths:
            canvas_refs.append(
                self._generic_canvas_reference(
                    item_index_key,
                    item_index,
                    path,
                    generic_ref_index,
                )
            )
            generic_ref_index += 1
        if canvas_refs:
            config["canvas_scene_refs"] = canvas_refs

        job_id = self._job_ids.new_id()
        payload: dict[str, Any] = {
            "job_id": job_id,
            "episode": task_episode,
            "output_dir": str(command.project_dir),
            "mode_key": mode_key,
            "config": config,
            "canvas_id": command.canvas_id or "",
            "node_id": command.node_id or "",
            "task_family": "mainline_skill",
            "task_label": "渲染分镜",
            "display_name": "渲染分镜",
            **dict(command.task_display or {}),
        }
        if task_beat is not None:
            payload["beat_num"] = task_beat
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="mainline_frame_from_context",
                queue_kind="default",
                job_id=job_id,
                project_dir=command.project_dir,
                episode=task_episode,
                beat_num=task_beat,
                scope=job_id,
                inject_job_context=False,
                payload=payload,
            ),
        )

    async def start_scene_360(
        self,
        command: StartCreativeCanvasScene360Command,
    ) -> CreativeCanvasTaskReceipt:
        master_path = self._resolve_required_media(
            command.project_dir,
            command.master_url,
            required_message="master_url is required",
            missing_prefix="master file not found",
        )
        reverse_path = None
        if command.reverse_url:
            reverse_path = self._resolve_required_media(
                command.project_dir,
                command.reverse_url,
                required_message="reverse_url is required",
                missing_prefix="reverse master file not found",
            )
        step = "pano_from_master"
        job_id = (
            task_config_scope("stage_asset", {"scene": command.scene_id, "step": step})
            if command.auto_commit
            else self._job_ids.new_id()
        )
        artifact_dir = self._scene_runtime.artifact_dir(command.project_dir, job_id)
        provider, model = self._scene_runtime.resolve_model(command.model)
        return await self._scheduler.enqueue(
            command.context,
            CreativeCanvasTaskSubmission(
                task_type="stage_asset",
                queue_kind="world",
                job_id=job_id,
                project_dir=command.project_dir,
                scope=job_id,
                inject_job_context=False,
                payload={
                    "scene_name": command.scene_id,
                    "step": step,
                    "params": {
                        "description": (command.description or "").strip()
                        or build_scene_360_prompt(command.scene_id),
                        "provider": provider or "newapi",
                        "model": model or command.model,
                        "image_size": command.image_size
                        or MAINLINE_SCENE_360_IMAGE_SIZE,
                        "quality": command.quality or "medium",
                        "master_path": master_path.as_posix(),
                        "reverse_master_path": (
                            reverse_path.as_posix() if reverse_path else ""
                        ),
                        "artifact_dir": (
                            str(artifact_dir) if not command.auto_commit else ""
                        ),
                        "update_manifest": command.auto_commit,
                    },
                    "project_dir": str(command.project_dir),
                    "canvas_id": command.canvas_id or "",
                    "node_id": command.node_id or "",
                    "task_family": "mainline_skill",
                    "task_label": "生成 360 全景",
                    "display_name": f"生成 360 全景 · {command.scene_id}",
                    "source_label": "场景 Master + Reverse",
                    "target_label": "360 全景",
                    **dict(command.task_display or {}),
                },
            ),
        )

    def _resolve_required_media(
        self,
        project_dir: Path,
        source_url: str,
        *,
        required_message: str,
        missing_prefix: str,
        require_exists: bool = True,
    ) -> Path:
        if not str(source_url or "").strip():
            raise InvalidCreativeCanvasMainlineGeneration(required_message)
        try:
            path = self._sources.resolve(project_dir, source_url)
        except ValueError as exc:
            raise InvalidCreativeCanvasMainlineGeneration(str(exc)) from exc
        if require_exists and not self._sources.exists(path):
            raise CreativeCanvasMainlineMediaMissing(f"{missing_prefix}: {path}")
        return path

    def _resolve_optional_media(
        self,
        project_dir: Path,
        source_urls: tuple[str, ...],
    ) -> list[Path]:
        paths: list[Path] = []
        for source_url in source_urls:
            if not source_url:
                continue
            try:
                paths.append(self._sources.resolve(project_dir, source_url))
            except ValueError as exc:
                raise InvalidCreativeCanvasMainlineGeneration(str(exc)) from exc
        return paths

    def _resolve_typed_references(
        self,
        project_dir: Path,
        references: tuple[Mapping[str, Any], ...],
    ) -> list[dict[str, Any]]:
        resolved: list[dict[str, Any]] = []
        for reference in references:
            image_url = str(reference.get("image_url") or "")
            paths = self._resolve_optional_media(project_dir, (image_url,))
            if paths:
                resolved.append({**dict(reference), "image_path": paths[0]})
        return resolved

    @staticmethod
    def _generic_canvas_reference(
        item_index_key: str,
        item_index: int,
        path: Path,
        reference_index: int,
    ) -> dict[str, Any]:
        return {
            item_index_key: item_index,
            "image_path": path.as_posix(),
            "base_id": f"canvas reference {reference_index}",
            "label": f"画布参考 {reference_index}",
            "source_level": "canvas_reference_image",
        }
