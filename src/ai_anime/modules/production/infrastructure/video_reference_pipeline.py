"""Provider-neutral video-reference input preparation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

from ai_anime.modules.production.infrastructure.media_generation.video_generator import ShotReference
from ai_anime.modules.asset_world.public import probe_voice_sample_duration_seconds
from ai_anime.modules.production.infrastructure.video_reference_assets import (
    VideoReferenceAsset,
    apply_prompt_audio_selection,
    append_user_video_reference_assets,
    build_video_reference_assets,
    selected_reference_paths,
)
from ai_anime.modules.production.infrastructure.video_prompt_composer import (
    validate_generated_video_prompt,
)
from ai_anime.modules.production.application.video_config import (
    VideoReferenceMode,
    dump_video_config,
    parse_video_config,
)
from ai_anime.modules.production.domain.video_dialogue import (
    required_video_dialogue_texts,
)
from ai_anime.modules.production.domain.video_model import (
    normalize_video_generation_duration,
)
from ai_anime.modules.production.infrastructure.video_reference_voice import (
    normalize_video_audio_type,
)
from ai_anime.shared.utils.media_durations import validate_reference_media_durations
from ai_anime.shared.utils.voice_samples import (
    REFERENCE_VOICE_MAX_SECONDS,
    REFERENCE_VOICE_MIN_SECONDS,
)

MAX_VIDEO_REFERENCE_AUDIOS = 3
MIN_VIDEO_REFERENCE_AUDIO_SECONDS = REFERENCE_VOICE_MIN_SECONDS
MAX_VIDEO_REFERENCE_AUDIO_TOTAL_SECONDS = REFERENCE_VOICE_MAX_SECONDS


@dataclass(frozen=True)
class VideoReferencePreparedGeneration:
    prompt: str
    video_config_json: str
    duration: int
    mode: VideoReferenceMode
    image_path: str | None
    last_frame_path: str | None
    references: list[ShotReference]
    assets: list[VideoReferenceAsset]


@dataclass(frozen=True)
class VideoReferencePrereqError:
    beat_number: int
    key: str
    label: str
    media_type: str
    path: str
    reason: str
    identity_id: str = ""


def _unique_paths(paths: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for path in paths:
        text = str(path or "").strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def _references_from_paths(
    *,
    image_paths: list[str],
    audio_paths: list[str],
) -> list[ShotReference]:
    references: list[ShotReference] = []
    for index, path in enumerate(image_paths, start=1):
        references.append(
            ShotReference(
                "image",
                path,
                f"图片{index}",
                field="reference_images",
            )
        )
    for index, path in enumerate(audio_paths, start=1):
        references.append(
            ShotReference(
                "audio",
                path,
                f"音频{index}",
                field="reference_audios",
            )
        )
    return references


def _with_multimodal_frame_guidance(
    final_prompt: str,
    assets: list[VideoReferenceAsset],
) -> str:
    anchors = {
        asset.key: asset.reference_label
        for asset in assets
        if asset.selected
        and asset.request_field == "reference_images"
        and asset.key in {"first_frame", "last_frame"}
    }
    first_label = anchors.get("first_frame")
    last_label = anchors.get("last_frame")
    if not first_label or not last_label:
        return final_prompt
    guidance = (
        f"{first_label}作为视频起始画面，{last_label}作为视频结束画面，"
        "在两者之间保持主体、场景和镜头运动连续；其余图片与音频仅作为身份、环境、道具和声线参考。"
    )
    return f"{guidance}\n{final_prompt}"


def _asset_missing_reason(asset: VideoReferenceAsset) -> str:
    if not getattr(asset, "required", True) and not asset.selected:
        return ""
    if not asset.exists:
        return "missing"
    if asset.validation_error:
        return asset.validation_error
    return ""


def _selected_audio_assets(
    assets: list[VideoReferenceAsset],
) -> list[VideoReferenceAsset]:
    return [
        asset
        for asset in assets
        if asset.media_type == "audio"
        and asset.selected
        and asset.request_field == "reference_audios"
    ]


def _validate_reference_audio_request(audio_paths: list[str]) -> None:
    if len(audio_paths) > MAX_VIDEO_REFERENCE_AUDIOS:
        raise ValueError("视频参考音频最多 3 段")

    measured: list[tuple[str, float | None]] = []
    for index, path in enumerate(audio_paths, start=1):
        try:
            duration = probe_voice_sample_duration_seconds(path)
        except ValueError:
            duration = None
        measured.append((f"音频{index}", duration))
    try:
        validate_reference_media_durations(
            measured,
            min_seconds=MIN_VIDEO_REFERENCE_AUDIO_SECONDS,
            max_seconds=None,
            total_min_seconds=None,
            total_max_seconds=MAX_VIDEO_REFERENCE_AUDIO_TOTAL_SECONDS,
            media_label="audio",
        )
    except ValueError as exc:
        raise ValueError(
            f"视频参考音频时长不合规（{exc}）。"
            f"每段需至少 {MIN_VIDEO_REFERENCE_AUDIO_SECONDS:g} 秒，"
            f"合计不超过 {MAX_VIDEO_REFERENCE_AUDIO_TOTAL_SECONDS:g} 秒；"
            "为获得稳定效果，建议每段保留清晰单人声 3-5 秒"
        ) from exc


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip())


def _validate_dialogue_final_prompt(
    *,
    beat: dict[str, Any],
    final_prompt: str,
    assets: list[VideoReferenceAsset],
) -> None:
    if normalize_video_audio_type(beat) != "dialogue":
        return

    required_texts = required_video_dialogue_texts(beat)
    prompt_text = _compact_text(final_prompt)
    missing_lines = [
        text
        for text in required_texts
        if _compact_text(text) and _compact_text(text) not in prompt_text
    ]
    if missing_lines:
        raise ValueError(
            "视频最终提示词缺少台词内容："
            + "、".join(str(item) for item in missing_lines[:3])
        )

    audio_labels = [
        asset.reference_label
        for asset in _selected_audio_assets(assets)
        if asset.reference_label.startswith("音频")
    ]
    if not audio_labels or any(label not in final_prompt for label in audio_labels):
        raise ValueError(
            "视频最终提示词缺少参考声线，请在台词描述中写明对应音频编号"
        )


def collect_video_reference_prereq_errors(
    *,
    project_output: str | Path,
    episode: int,
    beats: list[dict[str, Any]],
    characters: list[Any] | None = None,
    prop_menu: list[Any] | None = None,
) -> list[VideoReferencePrereqError]:
    """Return missing or invalid project references before video generation."""

    project_output = Path(project_output)
    errors: list[VideoReferencePrereqError] = []
    for index, beat in enumerate(beats):
        config = parse_video_config(beat.get("video_config_json"))
        next_beat = beats[index + 1] if index + 1 < len(beats) else None
        assets = build_video_reference_assets(
            project_output=project_output,
            episode=episode,
            beat=beat,
            mode=config.mode,
            next_beat=next_beat,
            characters=characters,
            prop_menu=prop_menu,
        )
        final_prompt = str(config.final_prompt or "").strip()
        append_user_video_reference_assets(
            assets,
            reference_image_paths=list(config.reference_image_paths),
            reference_audio_paths=list(config.reference_audio_paths),
        )
        assets = apply_prompt_audio_selection(assets, final_prompt)
        beat_number = int(beat.get("beat_number") or index + 1)
        selected_audio_assets = _selected_audio_assets(assets)
        if len(selected_audio_assets) > MAX_VIDEO_REFERENCE_AUDIOS:
            errors.append(
                VideoReferencePrereqError(
                    beat_number=beat_number,
                    key="reference_audios",
                    label="视频参考音频最多 3 段，请减少同一 Beat 的 speaker 或合并台词",
                    media_type="audio",
                    path="",
                    reason="reference_audio_count_exceeded",
                )
            )
            continue
        for asset in assets:
            reason = _asset_missing_reason(asset)
            if not reason:
                continue
            errors.append(
                VideoReferencePrereqError(
                    beat_number=beat_number,
                    key=asset.key,
                    label=f"{asset.label}（{asset.note}）"
                    if asset.note
                    else asset.label,
                    media_type=asset.media_type,
                    path=str(asset.path),
                    reason=reason,
                    identity_id=asset.identity_id,
                )
            )
    return errors


async def prepare_video_reference_generation_inputs(
    *,
    project_output: str | Path,
    episode: int,
    beat: dict[str, Any],
    video_mode: str,
    prompt: str,
    duration: float,
    resolution: str = "720p",
    ratio: str = "9:16",
    next_beat: dict[str, Any] | None = None,
    characters: list[Any] | None = None,
    prop_menu: list[Any] | None = None,
) -> VideoReferencePreparedGeneration:
    """Prepare prompt, config, and media references for one video beat."""

    project_output = Path(project_output)
    config = parse_video_config(beat.get("video_config_json"))

    if video_mode == "keyframe" and config.mode != VideoReferenceMode.FIRST_LAST_FRAME:
        config.mode = VideoReferenceMode.FIRST_LAST_FRAME

    assets = build_video_reference_assets(
        project_output=project_output,
        episode=episode,
        beat=beat,
        mode=config.mode,
        next_beat=next_beat,
        characters=characters,
        prop_menu=prop_menu,
    )
    append_user_video_reference_assets(
        assets,
        reference_image_paths=list(config.reference_image_paths),
        reference_audio_paths=list(config.reference_audio_paths),
    )

    target_duration = normalize_video_generation_duration(
        config.duration,
        duration,
    )
    config.duration = target_duration
    config.resolution = resolution or config.resolution
    config.ratio = ratio or config.ratio

    final_prompt = str(config.final_prompt or "").strip()
    if not final_prompt:
        beat_number = int(beat.get("beat_number") or 0)
        prefix = f"Beat {beat_number} " if beat_number else ""
        raise ValueError(
            f"{prefix}视频最终提示词为空，请先在视频配置面板生成或填写最终提示词"
        )
    if config.prompt_source == "generated":
        validate_generated_video_prompt(
            final_prompt,
            source_text=config.prompt_validation_source,
        )
    config.final_prompt = final_prompt
    assets = apply_prompt_audio_selection(assets, final_prompt)

    auto_images = selected_reference_paths(assets, "reference_images")
    auto_audios = selected_reference_paths(assets, "reference_audios")
    config.reference_image_paths = _unique_paths(auto_images)
    config.reference_audio_paths = _unique_paths(auto_audios)
    _validate_reference_audio_request(config.reference_audio_paths)

    _validate_dialogue_final_prompt(
        beat=beat,
        final_prompt=final_prompt,
        assets=assets,
    )

    image_path: str | None = None
    last_frame_path: str | None = None
    references: list[ShotReference] = []

    if config.mode == VideoReferenceMode.FIRST_FRAME:
        first_frames = selected_reference_paths(assets, "image_url")
        image_path = first_frames[0] if first_frames else None
    elif config.mode == VideoReferenceMode.FIRST_LAST_FRAME:
        first_frames = selected_reference_paths(assets, "first_frame_image")
        last_frames = selected_reference_paths(assets, "last_frame_image")
        image_path = first_frames[0] if first_frames else None
        last_frame_path = last_frames[0] if last_frames else None
    else:
        references = _references_from_paths(
            image_paths=config.reference_image_paths,
            audio_paths=config.reference_audio_paths,
        )
        final_prompt = _with_multimodal_frame_guidance(final_prompt, assets)

    return VideoReferencePreparedGeneration(
        prompt=final_prompt,
        video_config_json=dump_video_config(config),
        duration=target_duration,
        mode=config.mode,
        image_path=image_path,
        last_frame_path=last_frame_path,
        references=references,
        assets=assets,
    )
