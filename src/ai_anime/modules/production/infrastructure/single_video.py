"""Adapters for preparing and scheduling one Beat video."""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.public import (
    resolve_target_video_duration,
)
from ai_anime.modules.model_usage.public import runtime_model_capability
from ai_anime.modules.production.application.ports import (
    ProductionBeatAudioDurationSource,
    ProductionEpisodeSource,
    ProductionRuntimePropMenuSource,
)
from ai_anime.modules.production.application.single_video import (
    SINGLE_VIDEO_TASK_TYPE,
    GenerateSingleVideoCommand,
    SingleVideoRejected,
    SingleVideoTask,
    SingleVideoTaskReceipt,
)
from ai_anime.modules.production.domain.single_video import (
    dialogue_only_video_model_error,
    missing_video_prompt_error,
    seedance2_initial_prompt,
    standard_video_prompt,
)
from ai_anime.modules.production.domain.video_model import (
    SEEDANCE2_DEFAULT_MIN_DURATION,
    grok_video_ratio,
    grok_video_resolution,
    happyhorse_ratio,
    happyhorse_resolution,
    is_grok_video_model,
    is_happyhorse_model,
    is_seedance2_model,
    normalize_video_generation_duration,
    video_api_resolution,
    video_resolution,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.production.infrastructure.seedance2_assets import (
    append_seedance2_user_reference_assets,
    build_seedance2_project_assets,
    selected_reference_paths,
)
from ai_anime.modules.production.application.seedance2_config import (
    Seedance2I2VMode,
    dump_seedance2_config,
    parse_seedance2_config,
)
from ai_anime.modules.production.infrastructure.seedance2_pipeline import (
    prepare_seedance2_generation_inputs,
)
from ai_anime.modules.task_execution.public import (
    ProjectTaskSubmission,
    ProjectTaskSubmissionUseCases,
)
from ai_anime.shared.infrastructure import project_stores
from ai_anime.shared.utils.media_io import get_audio_duration_async
from ai_anime.shared.utils.path_resolver import PathResolver


@dataclass(frozen=True)
class _ReferenceVideoPreparation:
    prompt: str
    duration: int
    resolution: str
    ratio: str
    image_path: str | None
    references: list[dict[str, str]]
    config_json: str


def _merge_seedance2_request_config(
    beat: dict[str, Any],
    *,
    seedance2_config_json: str | None,
    config_overrides: dict[str, Any],
) -> str | None:
    if seedance2_config_json is None and not config_overrides:
        return None

    merged = parse_seedance2_config(
        beat.get("seedance2_config_json")
    ).model_dump(mode="json")
    incoming: dict[str, Any] = {}
    if seedance2_config_json is not None:
        try:
            incoming = json.loads(str(seedance2_config_json or "{}"))
        except json.JSONDecodeError as exc:
            raise ValueError("seedance2_config_json must be valid JSON") from exc
        if not isinstance(incoming, dict):
            raise ValueError("seedance2_config_json must be a JSON object")
        merged.update(incoming)
    merged.update(config_overrides)

    if "generate_audio" in incoming or "generate_audio" in config_overrides:
        merged["generate_audio_user_set"] = True
    if "human_review" in incoming or "human_review" in config_overrides:
        merged["human_review_user_set"] = True

    saved_json = dump_seedance2_config(merged)
    beat["seedance2_config_json"] = saved_json
    return saved_json


def _seedance2_video_model_role(mode: Seedance2I2VMode) -> str:
    return {
        Seedance2I2VMode.TEXT_TO_VIDEO: "VIDEO_TEXT_TO_VIDEO",
        Seedance2I2VMode.FIRST_FRAME: "VIDEO_IMAGE_TO_VIDEO",
        Seedance2I2VMode.FIRST_LAST_FRAME: "VIDEO_FIRST_LAST_FRAME",
        Seedance2I2VMode.MULTIMODAL_REFERENCE: "VIDEO_ALL_REFERENCE",
    }[mode]


def _prepare_reference_video_beat(
    *,
    model_label: str,
    max_reference_images: int,
    resolution_resolver: Callable[[str | None], str],
    ratio_resolver: Callable[[str | None], str],
    output_dir: Path,
    episode_num: int,
    beat: dict[str, Any],
    next_beat: dict[str, Any] | None,
    frame_path: Path,
    video_mode: str,
    prompt: str,
    duration: float,
    resolution: str | None,
    ratio: str | None,
    prop_menu: list[Any],
) -> _ReferenceVideoPreparation:
    config = parse_seedance2_config(beat.get("seedance2_config_json"))
    mode = config.mode
    if mode == Seedance2I2VMode.FIRST_LAST_FRAME or video_mode == "keyframe":
        raise ValueError(
            f"{model_label} 不支持首尾帧模式，请改用首帧模式或多参模式"
        )

    final_prompt = str(config.final_prompt or prompt or "").strip()
    if not final_prompt:
        beat_num = int(beat.get("beat_number") or 0)
        prefix = f"Beat {beat_num} " if beat_num else ""
        raise ValueError(f"{prefix}缺少视频提示词，请先生成或填写视频提示词")

    target_duration = int(config.duration or duration or 0)
    config.duration = target_duration
    config.resolution = resolution_resolver(resolution or config.resolution)
    config.ratio = ratio_resolver(ratio or config.ratio)
    config.final_prompt = final_prompt

    image_path: str | None = None
    references: list[dict[str, str]] = []
    if mode == Seedance2I2VMode.FIRST_FRAME:
        image_path = str(frame_path)
    else:
        assets = build_seedance2_project_assets(
            project_output=output_dir,
            episode=episode_num,
            beat=beat,
            mode=Seedance2I2VMode.MULTIMODAL_REFERENCE,
            next_beat=next_beat,
            prop_menu=prop_menu,
        )
        append_seedance2_user_reference_assets(
            assets,
            reference_image_paths=list(config.reference_image_paths),
            reference_audio_paths=[],
        )
        image_paths = selected_reference_paths(assets, "reference_images")
        config.reference_image_paths = list(dict.fromkeys(image_paths))[
            :max_reference_images
        ]
        config.reference_audio_paths = []
        references = [
            {
                "type": "image",
                "path": path,
                "role": f"图片{index}",
                "field": "reference_images",
            }
            for index, path in enumerate(config.reference_image_paths, 1)
        ]

    return _ReferenceVideoPreparation(
        prompt=final_prompt,
        duration=target_duration,
        resolution=config.resolution,
        ratio=config.ratio,
        image_path=image_path,
        references=references,
        config_json=dump_seedance2_config(config),
    )


class MediaIoBeatAudioDurationSource:
    async def for_beat(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> float | None:
        audio_path = PathResolver(context.output_dir, episode_num).audio(beat_num)
        if not audio_path.exists():
            return None
        return await get_audio_duration_async(str(audio_path))


class LocalSingleVideoPreparer:
    def __init__(
        self,
        episode_source: ProductionEpisodeSource,
        prop_menu_source: ProductionRuntimePropMenuSource,
        audio_durations: ProductionBeatAudioDurationSource,
    ) -> None:
        self._episode_source = episode_source
        self._prop_menu_source = prop_menu_source
        self._audio_durations = audio_durations

    async def _persist_seedance2_config(
        self,
        store: Any,
        *,
        episode_num: int,
        beat_num: int,
        config_json: str | None,
    ) -> None:
        if config_json and hasattr(store, "update_beat_asset"):
            await store.update_beat_asset(
                episode_number=episode_num,
                beat_number=beat_num,
                seedance2_config_json=config_json,
            )

    async def _prop_menu(
        self,
        store: Any,
        *,
        episode_num: int,
        beats: list[dict[str, Any]],
    ) -> list[Any]:
        episode = self._episode_source.episode_or_none(store, episode_num)
        return await self._prop_menu_source.for_episode(store, episode, beats)

    async def _prepare_seedance2(
        self,
        store: Any,
        *,
        context: ProjectContext,
        command: GenerateSingleVideoCommand,
        beat: dict[str, Any],
        next_beat: dict[str, Any] | None,
        video_mode: str,
        duration: float,
        prop_menu: list[Any],
    ) -> Any:
        current_config = parse_seedance2_config(
            beat.get("seedance2_config_json")
        )
        requested_resolution = (
            video_api_resolution(command.resolution)
            if command.was_provided("resolution")
            else current_config.resolution
        )
        prepared = await prepare_seedance2_generation_inputs(
            project_output=context.output_dir,
            episode=command.episode_num,
            beat=beat,
            next_beat=next_beat,
            video_mode=video_mode,
            prompt=seedance2_initial_prompt(beat, video_mode),
            duration=duration,
            resolution=video_resolution(
                command.video_model,
                requested_resolution,
            ),
            ratio=command.ratio if command.was_provided("ratio") else None,
            prop_menu=prop_menu,
        )
        if not str(prepared.prompt or "").strip():
            raise ValueError(
                f"Beat {command.beat_num} Seedance 2.0 最终提示词为空，"
                "请先填写 Seedance2.0主体提示词或点击“AI 优化”。"
            )

        beat["seedance2_config_json"] = prepared.seedance2_config_json
        await self._persist_seedance2_config(
            store,
            episode_num=command.episode_num,
            beat_num=command.beat_num,
            config_json=prepared.seedance2_config_json,
        )
        return prepared

    async def prepare(
        self,
        context: ProjectContext,
        command: GenerateSingleVideoCommand,
    ) -> SingleVideoTask:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            return await self._prepare_with_store(store, context, command)
        finally:
            await store.close()

    async def _prepare_with_store(
        self,
        store: Any,
        context: ProjectContext,
        command: GenerateSingleVideoCommand,
    ) -> SingleVideoTask:
        beats = await store.get_beats_as_dicts(command.episode_num)
        beat = next(
            (
                item
                for item in beats
                if item.get("beat_number") == command.beat_num
            ),
            None,
        )
        if beat is None:
            raise SingleVideoRejected(f"Beat {command.beat_num} not found")

        model_error = dialogue_only_video_model_error(
            [beat],
            command.video_model,
        )
        if model_error:
            raise SingleVideoRejected(model_error)

        model_capability = runtime_model_capability(command.video_model)
        is_seedance2 = is_seedance2_model(
            command.video_model,
            getattr(model_capability, "video_profile", None),
        )
        is_happyhorse = is_happyhorse_model(command.video_model)
        is_grok_video = is_grok_video_model(command.video_model)
        output_dir = Path(context.output_dir)
        paths = PathResolver(output_dir, command.episode_num)
        frame_path = paths.first_frame_for_video(
            command.beat_num,
            use_director_render=command.use_director_render,
        )
        if not frame_path.exists():
            raise SingleVideoRejected(
                f"Beat {command.beat_num} 首帧不存在，请先生成预览"
            )

        beat_index = beats.index(beat)
        next_beat = beats[beat_index + 1] if beat_index + 1 < len(beats) else None

        video_mode = beat.get("video_mode", "first_frame")
        model_role = (
            "VIDEO_FIRST_LAST_FRAME"
            if video_mode == "keyframe"
            else "VIDEO_IMAGE_TO_VIDEO"
        )
        prompt = standard_video_prompt(beat, video_mode)
        audio_duration = await self._audio_durations.for_beat(
            context,
            command.episode_num,
            command.beat_num,
        )
        video_duration = resolve_target_video_duration(beat, audio_duration)

        last_frame_path = None
        if video_mode == "keyframe":
            next_beat_number = int((next_beat or {}).get("beat_number") or 0)
            if next_beat_number > 0:
                next_frame = paths.first_frame_for_video(
                    next_beat_number,
                    use_director_render=command.use_director_render,
                )
                if next_frame.exists():
                    last_frame_path = str(next_frame)
            if not last_frame_path:
                video_mode = "first_frame"
                prompt = standard_video_prompt(beat, video_mode)
                model_role = "VIDEO_IMAGE_TO_VIDEO"

        seedance2_config_json = None
        single_video_resolution: str | None = None
        references: list[dict[str, str]] = []
        reference_ratio: str | None = None
        if is_seedance2 or is_happyhorse or is_grok_video:
            try:
                request_config_json = _merge_seedance2_request_config(
                    beat,
                    seedance2_config_json=command.seedance2_config_json,
                    config_overrides=command.seedance2_config_overrides(),
                )
                await self._persist_seedance2_config(
                    store,
                    episode_num=command.episode_num,
                    beat_num=command.beat_num,
                    config_json=request_config_json,
                )
                prop_menu = await self._prop_menu(
                    store,
                    episode_num=command.episode_num,
                    beats=beats,
                )
                requested_resolution = (
                    command.resolution
                    if command.was_provided("resolution")
                    else None
                )
                requested_ratio = (
                    command.ratio if command.was_provided("ratio") else None
                )

                if is_seedance2:
                    prepared = await self._prepare_seedance2(
                        store,
                        context=context,
                        command=command,
                        beat=beat,
                        next_beat=next_beat,
                        video_mode=video_mode,
                        duration=video_duration,
                        prop_menu=prop_menu,
                    )
                    prompt = prepared.prompt
                    video_duration = prepared.duration
                    frame_path = (
                        Path(prepared.image_path)
                        if prepared.image_path
                        else frame_path
                    )
                    last_frame_path = prepared.last_frame_path
                    seedance2_config_json = prepared.seedance2_config_json
                    prepared_config = parse_seedance2_config(
                        prepared.seedance2_config_json
                    )
                    single_video_resolution = prepared_config.resolution
                    reference_ratio = prepared_config.ratio
                    model_role = _seedance2_video_model_role(prepared.mode)
                    video_mode = (
                        "keyframe" if prepared.last_frame_path else "first_frame"
                    )
                else:
                    prepared_reference = _prepare_reference_video_beat(
                        model_label=(
                            "HappyHorse 1.0" if is_happyhorse else "Grok Video"
                        ),
                        max_reference_images=9 if is_happyhorse else 7,
                        resolution_resolver=(
                            happyhorse_resolution
                            if is_happyhorse
                            else grok_video_resolution
                        ),
                        ratio_resolver=(
                            happyhorse_ratio if is_happyhorse else grok_video_ratio
                        ),
                        output_dir=output_dir,
                        episode_num=command.episode_num,
                        beat=beat,
                        next_beat=next_beat,
                        frame_path=frame_path,
                        video_mode=video_mode,
                        prompt=prompt,
                        duration=video_duration,
                        resolution=requested_resolution,
                        ratio=requested_ratio,
                        prop_menu=prop_menu,
                    )
                    await self._persist_seedance2_config(
                        store,
                        episode_num=command.episode_num,
                        beat_num=command.beat_num,
                        config_json=prepared_reference.config_json,
                    )
                    prompt = prepared_reference.prompt
                    video_duration = float(prepared_reference.duration)
                    frame_path = (
                        Path(prepared_reference.image_path)
                        if prepared_reference.image_path
                        else None
                    )
                    last_frame_path = None
                    seedance2_config_json = prepared_reference.config_json
                    single_video_resolution = prepared_reference.resolution
                    reference_ratio = prepared_reference.ratio
                    references = prepared_reference.references
                    model_role = (
                        "VIDEO_IMAGE_REFERENCE"
                        if references
                        else "VIDEO_IMAGE_TO_VIDEO"
                    )
                    video_mode = "first_frame"
            except ValueError as exc:
                raise SingleVideoRejected(str(exc)) from exc
        else:
            if not prompt.strip():
                raise SingleVideoRejected(
                    missing_video_prompt_error(command.beat_num)
                )
            if command.duration is not None:
                try:
                    video_duration = float(command.duration)
                except (TypeError, ValueError):
                    pass
            if audio_duration:
                video_duration = max(
                    float(video_duration),
                    float(math.ceil(float(audio_duration))),
                )
            if command.was_provided("resolution"):
                single_video_resolution = video_resolution(
                    command.video_model,
                    command.resolution,
                )

        minimum_duration = getattr(
            model_capability,
            "video_generation_min_seconds",
            None,
        )
        if is_seedance2:
            minimum_duration = max(
                float(minimum_duration or 0),
                SEEDANCE2_DEFAULT_MIN_DURATION,
            )
        maximum_duration = getattr(
            model_capability,
            "video_generation_max_seconds",
            None,
        )
        try:
            video_duration = float(
                normalize_video_generation_duration(
                    video_duration,
                    audio_duration,
                    minimum_seconds=minimum_duration,
                    maximum_seconds=maximum_duration,
                )
            )
        except ValueError as exc:
            raise SingleVideoRejected(str(exc)) from exc

        config: dict[str, Any] = {
            "beat": dict(beat),
            "frame_path": str(frame_path) if frame_path else None,
            "video_mode": video_mode,
            "prompt": prompt,
            "video_duration": video_duration,
            "video_model": command.video_model,
            "model_selector": str(command.model_selector or "").strip(),
            "model_role": model_role,
            "use_director_render": command.use_director_render,
            "last_frame_path": last_frame_path,
            "cognee_store_project": (
                f"{context.owner_username}/{context.project_name}"
            ),
        }
        if seedance2_config_json:
            config["seedance2_config"] = seedance2_config_json
        if single_video_resolution:
            config["resolution"] = single_video_resolution
        if is_seedance2 and reference_ratio:
            config["ratio"] = reference_ratio
        if is_happyhorse:
            config["ratio"] = happyhorse_ratio(reference_ratio)
            config["references"] = references
            if command.audio_setting is not None:
                config["audio_setting"] = command.audio_setting
        if is_grok_video:
            config["ratio"] = grok_video_ratio(reference_ratio)
            config["references"] = references

        return SingleVideoTask(
            episode_num=command.episode_num,
            beat_num=command.beat_num,
            config=config,
            output_dir=output_dir,
        )


class TaskExecutionSingleVideoScheduler:
    def __init__(self, submissions: ProjectTaskSubmissionUseCases) -> None:
        self._submissions = submissions

    async def enqueue(
        self,
        context: ProjectContext,
        task: SingleVideoTask,
    ) -> SingleVideoTaskReceipt:
        receipt = await self._submissions.submit(
            context,
            ProjectTaskSubmission(
                task_type=SINGLE_VIDEO_TASK_TYPE,
                queue_kind="video",
                episode=task.episode_num,
                beat_num=task.beat_num,
                payload=task.backend_payload(),
            ),
        )
        return SingleVideoTaskReceipt(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
        )
