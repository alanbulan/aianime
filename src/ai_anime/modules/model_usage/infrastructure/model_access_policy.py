"""Process-local commercial capability gate for model access."""

from __future__ import annotations

import hmac
import json
import math
import os
import re
import sys
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from threading import RLock
from typing import TextIO

MODEL_ACCESS_STDIN_ENV = "AI_ANIME_MODEL_ACCESS_STDIN"
_MODEL_ACCESS_SNAPSHOT_SCHEMA = "ai_anime.model_access.v5"
_MAX_MODEL_ACCESS_SNAPSHOT_BYTES = 64 * 1024

_lock = RLock()
_byok_allowed = False
_selected_mode = "mixed"
_model_assignments: tuple["RuntimeModelAssignment", ...] = ()
_model_capabilities: tuple["RuntimeModelCapability", ...] = ()
_cloud_base_url_override: str | None = None
_cloud_api_key_override: str | None = None

MODEL_ROLES = frozenset(
    {
        "TEXT",
        "IMAGE_GENERATION",
        "IMAGE_EDIT",
        "VIDEO_TEXT_TO_VIDEO",
        "VIDEO_IMAGE_TO_VIDEO",
        "VIDEO_FIRST_LAST_FRAME",
        "VIDEO_IMAGE_REFERENCE",
        "VIDEO_ALL_REFERENCE",
        "VIDEO_EDIT",
        "AUDIO_SPEECH",
        "AUDIO_VOICE_CLONE",
        "AUDIO_VOICE_DESIGN",
        "AUDIO_MUSIC",
        "EMBEDDING",
    }
)


@dataclass(frozen=True)
class RuntimeModelAssignment:
    model_id: str
    role: str
    priority: int = 100
    enabled: bool = True
    context_window: int | None = None
    max_output_tokens: int | None = None
    reasoning_efforts: tuple[str, ...] = ()
    default_reasoning_effort: str | None = None


@dataclass(frozen=True)
class RuntimeModelCapability:
    model_id: str
    video_profile: str | None = None
    video_ratio_options: tuple[str, ...] = ()
    video_resolution_options: tuple[str, ...] = ()
    video_size_options: tuple[str, ...] = ()
    video_supports_generate_audio: bool | None = None
    video_supports_human_review: bool | None = None
    video_extra_parameter_names: tuple[str, ...] = ()
    video_scene_optimize_options: tuple[str, ...] = ()
    video_generation_min_seconds: float | None = None
    video_generation_max_seconds: float | None = None
    video_duration_options: tuple[float, ...] = ()
    max_reference_images: int | None = None
    max_reference_videos: int | None = None
    max_reference_audios: int | None = None
    max_reference_total: int | None = None
    reference_audio_min_seconds: float | None = None
    reference_audio_max_seconds: float | None = None
    reference_audio_total_min_seconds: float | None = None
    reference_audio_total_max_seconds: float | None = None
    reference_video_min_seconds: float | None = None
    reference_video_max_seconds: float | None = None
    reference_video_total_min_seconds: float | None = None
    reference_video_total_max_seconds: float | None = None


@dataclass(frozen=True)
class RuntimeModelAccess:
    mode: str
    base_url: str
    api_key: str
    model_assignments: tuple[RuntimeModelAssignment, ...] = ()


def _normalize_model_assignments(
    values: Iterable[RuntimeModelAssignment | Mapping[str, object]] | None,
) -> tuple[RuntimeModelAssignment, ...]:
    unique: dict[tuple[str, str], RuntimeModelAssignment] = {}
    for index, value in enumerate(values or ()):
        if isinstance(value, RuntimeModelAssignment):
            model_id = value.model_id.strip()
            role = value.role.strip().upper()
            priority = value.priority
            enabled = value.enabled
            context_window = value.context_window
            max_output_tokens = value.max_output_tokens
            reasoning_efforts = value.reasoning_efforts
            default_reasoning_effort = value.default_reasoning_effort
        elif isinstance(value, Mapping):
            model_id = str(value.get("modelId") or value.get("model_id") or "").strip()
            role = str(value.get("role") or "").strip().upper()
            raw_priority = value.get("priority", 100 + index)
            if isinstance(raw_priority, bool):
                raise ValueError(f"model assignment {index} has an invalid priority")
            priority = int(raw_priority)
            enabled = value.get("enabled") is not False
            context_window = _optional_positive_integer(
                value.get("contextWindow", value.get("context_window")),
                f"model assignment {index} contextWindow",
            )
            max_output_tokens = _optional_positive_integer(
                value.get("maxOutputTokens", value.get("max_output_tokens")),
                f"model assignment {index} maxOutputTokens",
            )
            reasoning_efforts = _normalize_reasoning_efforts(
                value.get("reasoningEfforts", value.get("reasoning_efforts")),
                index=index,
            )
            raw_default = value.get(
                "defaultReasoningEffort",
                value.get("default_reasoning_effort"),
            )
            default_reasoning_effort = str(raw_default or "").strip() or None
        else:
            raise ValueError(f"model assignment {index} must be an object")
        if not model_id or len(model_id) > 256:
            raise ValueError(f"model assignment {index} has an invalid modelId")
        if role not in MODEL_ROLES:
            raise ValueError(f"model assignment {index} has an invalid role")
        if priority < 1 or priority > 9999:
            raise ValueError(f"model assignment {index} has an invalid priority")
        if (
            default_reasoning_effort is not None
            and default_reasoning_effort not in reasoning_efforts
        ):
            raise ValueError(
                f"model assignment {index} has an invalid defaultReasoningEffort"
            )
        unique[(model_id, role)] = RuntimeModelAssignment(
            model_id=model_id,
            role=role,
            priority=priority,
            enabled=enabled,
            context_window=context_window,
            max_output_tokens=max_output_tokens,
            reasoning_efforts=reasoning_efforts,
            default_reasoning_effort=default_reasoning_effort,
        )
    return tuple(
        sorted(
            (item for item in unique.values() if item.enabled),
            key=lambda item: (item.priority, item.role, item.model_id),
        )
    )


def _optional_positive_integer(value: object, label: str) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError(f"{label} is invalid")
    parsed = int(value)
    if parsed <= 0:
        raise ValueError(f"{label} is invalid")
    return parsed


def _normalize_reasoning_efforts(value: object, *, index: int) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(f"model assignment {index} has invalid reasoningEfforts")
    options: list[str] = []
    for item in value:
        option = str(item or "").strip()
        if not option or len(option) > 64 or any(ord(char) < 32 for char in option):
            raise ValueError(
                f"model assignment {index} has invalid reasoningEfforts"
            )
        if option not in options:
            options.append(option)
    if len(options) > 16:
        raise ValueError(f"model assignment {index} has invalid reasoningEfforts")
    return tuple(options)


_CAPABILITY_FIELDS = {
    "videoGenerationMinSeconds": "video_generation_min_seconds",
    "videoGenerationMaxSeconds": "video_generation_max_seconds",
    "referenceAudioMinSeconds": "reference_audio_min_seconds",
    "referenceAudioMaxSeconds": "reference_audio_max_seconds",
    "referenceAudioTotalMinSeconds": "reference_audio_total_min_seconds",
    "referenceAudioTotalMaxSeconds": "reference_audio_total_max_seconds",
    "referenceVideoMinSeconds": "reference_video_min_seconds",
    "referenceVideoMaxSeconds": "reference_video_max_seconds",
    "referenceVideoTotalMinSeconds": "reference_video_total_min_seconds",
    "referenceVideoTotalMaxSeconds": "reference_video_total_max_seconds",
}
_COUNT_CAPABILITY_FIELDS = {
    "maxReferenceImages": "max_reference_images",
    "maxReferenceVideos": "max_reference_videos",
    "maxReferenceAudios": "max_reference_audios",
    "maxReferenceTotal": "max_reference_total",
}
_VIDEO_PROFILES = frozenset({"standard", "seedance2", "happyhorse", "grok"})


def _normalize_video_resolution_options(
    value: object,
    *,
    index: int,
) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(
            f"model capability {index} has invalid videoResolutionOptions"
        )
    options: list[str] = []
    for raw in value:
        option = str(raw or "").strip().lower()
        if re.fullmatch(r"\d{2,5}p", option) is None:
            raise ValueError(
                f"model capability {index} has invalid videoResolutionOptions"
            )
        if option not in options:
            options.append(option)
    return tuple(options)


def _normalize_video_ratio_options(
    value: object,
    *,
    index: int,
) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(f"model capability {index} has invalid videoRatioOptions")
    options: list[str] = []
    for raw in value:
        option = str(raw or "").strip().lower()
        if option != "auto" and re.fullmatch(r"\d{1,4}:\d{1,4}", option) is None:
            raise ValueError(
                f"model capability {index} has invalid videoRatioOptions"
            )
        if option not in options:
            options.append(option)
    return tuple(options)


def _normalize_video_size_options(
    value: object,
    *,
    index: int,
) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(f"model capability {index} has invalid videoSizeOptions")
    options: list[str] = []
    for raw in value:
        option = str(raw or "").strip().lower()
        match = re.fullmatch(r"(\d{2,5})x(\d{2,5})", option)
        if match is None:
            raise ValueError(
                f"model capability {index} has invalid videoSizeOptions"
            )
        width, height = (int(match.group(1)), int(match.group(2)))
        if not (64 <= width <= 8192 and 64 <= height <= 8192):
            raise ValueError(
                f"model capability {index} has invalid videoSizeOptions"
            )
        normalized = f"{width}x{height}"
        if normalized not in options:
            options.append(normalized)
    return tuple(options)


def _normalize_video_extra_parameter_names(
    value: object,
    *,
    index: int,
) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(
            f"model capability {index} has invalid videoExtraParameterNames"
        )
    options: list[str] = []
    for raw in value:
        option = str(raw or "").strip()
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", option) is None:
            raise ValueError(
                f"model capability {index} has invalid videoExtraParameterNames"
            )
        if option not in options:
            options.append(option)
    return tuple(options)


def _normalize_video_scene_optimize_options(
    value: object,
    *,
    index: int,
) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(
            f"model capability {index} has invalid videoSceneOptimizeOptions"
        )
    options: list[str] = []
    for raw in value:
        option = str(raw or "").strip()
        if (
            not option
            or len(option) > 128
            or any(ord(char) < 32 for char in option)
        ):
            raise ValueError(
                f"model capability {index} has invalid videoSceneOptimizeOptions"
            )
        if option not in options:
            options.append(option)
    return tuple(options)


def _normalize_video_duration_options(
    value: object,
    *,
    index: int,
) -> tuple[float, ...]:
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, Iterable):
        raise ValueError(
            f"model capability {index} has invalid videoDurationOptions"
        )
    options: list[float] = []
    for raw in value:
        if (
            isinstance(raw, bool)
            or not isinstance(raw, (int, float))
            or not math.isfinite(raw)
            or raw <= 0
        ):
            raise ValueError(
                f"model capability {index} has invalid videoDurationOptions"
            )
        option = float(raw)
        if option not in options:
            options.append(option)
    return tuple(options)


def _normalize_model_capabilities(
    values: Iterable[RuntimeModelCapability | Mapping[str, object]] | None,
) -> tuple[RuntimeModelCapability, ...]:
    unique: dict[str, RuntimeModelCapability] = {}
    for index, value in enumerate(values or ()):
        if isinstance(value, RuntimeModelCapability):
            capability = value
        elif isinstance(value, Mapping):
            model_id = str(value.get("modelId") or value.get("model_id") or "").strip()
            if not model_id or len(model_id) > 256:
                raise ValueError(f"model capability {index} has an invalid modelId")
            video_profile = str(
                value.get("videoProfile") or value.get("video_profile") or ""
            ).strip().lower() or None
            video_ratio_options = _normalize_video_ratio_options(
                value.get(
                    "videoRatioOptions",
                    value.get("video_ratio_options"),
                ),
                index=index,
            )
            video_resolution_options = _normalize_video_resolution_options(
                value.get(
                    "videoResolutionOptions",
                    value.get("video_resolution_options"),
                ),
                index=index,
            )
            video_size_options = _normalize_video_size_options(
                value.get(
                    "videoSizeOptions",
                    value.get("video_size_options"),
                ),
                index=index,
            )
            video_supports_generate_audio = value.get(
                "videoSupportsGenerateAudio",
                value.get("video_supports_generate_audio"),
            )
            if video_supports_generate_audio is not None and not isinstance(
                video_supports_generate_audio,
                bool,
            ):
                raise ValueError(
                    f"model capability {index} has invalid videoSupportsGenerateAudio"
                )
            video_supports_human_review = value.get(
                "videoSupportsHumanReview",
                value.get("video_supports_human_review"),
            )
            if video_supports_human_review is not None and not isinstance(
                video_supports_human_review,
                bool,
            ):
                raise ValueError(
                    f"model capability {index} has invalid videoSupportsHumanReview"
                )
            video_extra_parameter_names = _normalize_video_extra_parameter_names(
                value.get(
                    "videoExtraParameterNames",
                    value.get("video_extra_parameter_names"),
                ),
                index=index,
            )
            video_scene_optimize_options = _normalize_video_scene_optimize_options(
                value.get(
                    "videoSceneOptimizeOptions",
                    value.get("video_scene_optimize_options"),
                ),
                index=index,
            )
            video_duration_options = _normalize_video_duration_options(
                value.get(
                    "videoDurationOptions",
                    value.get("video_duration_options"),
                ),
                index=index,
            )
            fields: dict[str, float | None] = {}
            for external_name, field_name in _CAPABILITY_FIELDS.items():
                raw = value.get(external_name, value.get(field_name))
                if raw is None:
                    fields[field_name] = None
                    continue
                if (
                    isinstance(raw, bool)
                    or not isinstance(raw, (int, float))
                    or not math.isfinite(raw)
                    or raw <= 0
                ):
                    raise ValueError(
                        f"model capability {index} has an invalid {external_name}"
                    )
                fields[field_name] = float(raw)
            count_fields: dict[str, int | None] = {}
            for external_name, field_name in _COUNT_CAPABILITY_FIELDS.items():
                raw = value.get(external_name, value.get(field_name))
                if raw is None:
                    count_fields[field_name] = None
                    continue
                if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
                    raise ValueError(
                        f"model capability {index} has an invalid {external_name}"
                    )
                count_fields[field_name] = raw
            capability = RuntimeModelCapability(
                model_id=model_id,
                video_profile=video_profile,
                video_ratio_options=video_ratio_options,
                video_resolution_options=video_resolution_options,
                video_size_options=video_size_options,
                video_supports_generate_audio=video_supports_generate_audio,
                video_supports_human_review=video_supports_human_review,
                video_extra_parameter_names=video_extra_parameter_names,
                video_scene_optimize_options=video_scene_optimize_options,
                video_duration_options=video_duration_options,
                **fields,
                **count_fields,
            )
        else:
            raise ValueError(f"model capability {index} must be an object")
        model_id = capability.model_id.strip()
        if not model_id or len(model_id) > 256:
            raise ValueError(f"model capability {index} has an invalid modelId")
        video_profile = str(capability.video_profile or "").strip().lower() or None
        video_ratio_options = _normalize_video_ratio_options(
            capability.video_ratio_options,
            index=index,
        )
        video_resolution_options = _normalize_video_resolution_options(
            capability.video_resolution_options,
            index=index,
        )
        video_size_options = _normalize_video_size_options(
            capability.video_size_options,
            index=index,
        )
        video_supports_generate_audio = capability.video_supports_generate_audio
        if video_supports_generate_audio is not None and not isinstance(
            video_supports_generate_audio,
            bool,
        ):
            raise ValueError(
                f"model capability {index} has invalid videoSupportsGenerateAudio"
            )
        video_supports_human_review = capability.video_supports_human_review
        if video_supports_human_review is not None and not isinstance(
            video_supports_human_review,
            bool,
        ):
            raise ValueError(
                f"model capability {index} has invalid videoSupportsHumanReview"
            )
        video_extra_parameter_names = _normalize_video_extra_parameter_names(
            capability.video_extra_parameter_names,
            index=index,
        )
        video_scene_optimize_options = _normalize_video_scene_optimize_options(
            capability.video_scene_optimize_options,
            index=index,
        )
        video_duration_options = _normalize_video_duration_options(
            capability.video_duration_options,
            index=index,
        )
        if video_profile is not None and video_profile not in _VIDEO_PROFILES:
            raise ValueError(
                f"model capability {index} has an invalid videoProfile"
            )
        for external_name, field_name in _COUNT_CAPABILITY_FIELDS.items():
            count = getattr(capability, field_name)
            if isinstance(count, bool) or (
                count is not None and (not isinstance(count, int) or count < 0)
            ):
                raise ValueError(
                    f"model capability {index} has an invalid {external_name}"
                )
        generation_minimum = capability.video_generation_min_seconds
        generation_maximum = capability.video_generation_max_seconds
        if (
            generation_minimum is not None
            and generation_maximum is not None
            and generation_minimum > generation_maximum
        ):
            raise ValueError(
                f"model capability {index} has generation min greater than max"
            )
        for media in ("audio", "video"):
            minimum = getattr(capability, f"reference_{media}_min_seconds")
            maximum = getattr(capability, f"reference_{media}_max_seconds")
            total_minimum = getattr(
                capability,
                f"reference_{media}_total_min_seconds",
            )
            total_maximum = getattr(
                capability,
                f"reference_{media}_total_max_seconds",
            )
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(
                    f"model capability {index} has {media} min greater than max"
                )
            if (
                total_minimum is not None
                and total_maximum is not None
                and total_minimum > total_maximum
            ):
                raise ValueError(
                    f"model capability {index} has {media} total min greater than max"
                )
        unique[model_id] = RuntimeModelCapability(
            model_id=model_id,
            video_profile=video_profile,
            video_ratio_options=video_ratio_options,
            video_resolution_options=video_resolution_options,
            video_size_options=video_size_options,
            video_supports_generate_audio=video_supports_generate_audio,
            video_supports_human_review=video_supports_human_review,
            video_extra_parameter_names=video_extra_parameter_names,
            video_scene_optimize_options=video_scene_optimize_options,
            video_duration_options=video_duration_options,
            **{
                field_name: getattr(capability, field_name)
                for field_name in _CAPABILITY_FIELDS.values()
            },
            **{
                field_name: getattr(capability, field_name)
                for field_name in _COUNT_CAPABILITY_FIELDS.values()
            },
        )
    return tuple(sorted(unique.values(), key=lambda item: item.model_id))


def configure_model_access(
    *,
    allows_custom_models: bool,
    mode: str,
    model_assignments: Iterable[RuntimeModelAssignment | Mapping[str, object]]
    | None = None,
    model_capabilities: Iterable[RuntimeModelCapability | Mapping[str, object]]
    | None = None,
) -> None:
    global _byok_allowed, _selected_mode, _model_assignments
    global _model_capabilities
    global _cloud_base_url_override, _cloud_api_key_override
    normalized_mode = str(mode or "").strip().lower()
    if normalized_mode != "mixed":
        raise ValueError("model access mode must be mixed")
    normalized_assignments = _normalize_model_assignments(model_assignments)
    normalized_capabilities = _normalize_model_capabilities(model_capabilities)
    with _lock:
        _byok_allowed = bool(allows_custom_models)
        _selected_mode = "mixed"
        _model_assignments = normalized_assignments
        _model_capabilities = normalized_capabilities
        _cloud_base_url_override = None
        _cloud_api_key_override = None


def is_byok_allowed() -> bool:
    with _lock:
        return _byok_allowed


def runtime_model_access() -> RuntimeModelAccess:
    with _lock:
        cloud_base_url = _cloud_base_url_override
        cloud_api_key = _cloud_api_key_override
        return RuntimeModelAccess(
            mode="mixed",
            base_url=(
                cloud_base_url
                if cloud_base_url is not None
                else os.environ.get("AI_ANIME_CLOUD_PROXY_BASE_URL", "").strip()
            ),
            api_key=(
                cloud_api_key
                if cloud_api_key is not None
                else os.environ.get("AI_ANIME_CLOUD_PROXY_TOKEN", "").strip()
            ),
            model_assignments=_model_assignments,
        )


def runtime_model_capability(model_id: str | None) -> RuntimeModelCapability | None:
    normalized = str(model_id or "").strip()
    if not normalized:
        return None
    with _lock:
        return next(
            (item for item in _model_capabilities if item.model_id == normalized),
            None,
        )


def resolve_model_for_role(role: str) -> str:
    """Return the current highest-priority model route for one role."""
    return resolve_model_assignment_for_role(role).model_id


def resolve_model_assignment_for_role(role: str) -> RuntimeModelAssignment:
    """Return the highest-priority assignment including effective runtime limits."""
    clean_role = str(role or "").strip().upper()
    if clean_role not in MODEL_ROLES:
        raise ValueError("model role is invalid")

    access = runtime_model_access()
    role_assignments = tuple(
        item for item in access.model_assignments if item.role == clean_role
    )
    if role_assignments:
        return role_assignments[0]
    raise PermissionError(f"no model is assigned to role {clean_role}")


def serialize_model_access_for_subprocess() -> str:
    access = runtime_model_access()
    with _lock:
        capabilities = _model_capabilities
    return json.dumps(
        {
            "schema": _MODEL_ACCESS_SNAPSHOT_SCHEMA,
            "allowsCustomModels": is_byok_allowed(),
            "mode": access.mode,
            "baseUrl": access.base_url,
            "apiKey": access.api_key,
            "modelAssignments": [
                {
                    "modelId": item.model_id,
                    "role": item.role,
                    "priority": item.priority,
                    "enabled": item.enabled,
                    **(
                        {"contextWindow": item.context_window}
                        if item.context_window is not None
                        else {}
                    ),
                    **(
                        {"maxOutputTokens": item.max_output_tokens}
                        if item.max_output_tokens is not None
                        else {}
                    ),
                    **(
                        {"reasoningEfforts": list(item.reasoning_efforts)}
                        if item.reasoning_efforts
                        else {}
                    ),
                    **(
                        {"defaultReasoningEffort": item.default_reasoning_effort}
                        if item.default_reasoning_effort is not None
                        else {}
                    ),
                }
                for item in access.model_assignments
            ],
            "modelCapabilities": [
                {
                    "modelId": item.model_id,
                    **(
                        {"videoProfile": item.video_profile}
                        if item.video_profile is not None
                        else {}
                    ),
                    **(
                        {"videoRatioOptions": list(item.video_ratio_options)}
                        if item.video_ratio_options
                        else {}
                    ),
                    **(
                        {
                            "videoResolutionOptions": list(
                                item.video_resolution_options
                            )
                        }
                        if item.video_resolution_options
                        else {}
                    ),
                    **(
                        {
                            "videoSupportsHumanReview": (
                                item.video_supports_human_review
                            )
                        }
                        if item.video_supports_human_review is not None
                        else {}
                    ),
                    **(
                        {"videoDurationOptions": list(item.video_duration_options)}
                        if item.video_duration_options
                        else {}
                    ),
                    **(
                        {
                            "videoSceneOptimizeOptions": list(
                                item.video_scene_optimize_options
                            )
                        }
                        if item.video_scene_optimize_options
                        else {}
                    ),
                    **(
                        {"videoSizeOptions": list(item.video_size_options)}
                        if item.video_size_options
                        else {}
                    ),
                    **(
                        {
                            "videoSupportsGenerateAudio": (
                                item.video_supports_generate_audio
                            )
                        }
                        if item.video_supports_generate_audio is not None
                        else {}
                    ),
                    **(
                        {
                            "videoExtraParameterNames": list(
                                item.video_extra_parameter_names
                            )
                        }
                        if item.video_extra_parameter_names
                        else {}
                    ),
                    **{
                        external_name: getattr(item, field_name)
                        for external_name, field_name in _CAPABILITY_FIELDS.items()
                        if getattr(item, field_name) is not None
                    },
                    **{
                        external_name: getattr(item, field_name)
                        for external_name, field_name in _COUNT_CAPABILITY_FIELDS.items()
                        if getattr(item, field_name) is not None
                    },
                }
                for item in capabilities
            ],
        },
        ensure_ascii=True,
        separators=(",", ":"),
    )


def load_model_access_from_stdin(stream: TextIO | None = None) -> bool:
    """Restore one model-access snapshot delivered through an anonymous stdin pipe."""
    if os.environ.pop(MODEL_ACCESS_STDIN_ENV, "") != "1":
        return False

    source = stream if stream is not None else sys.stdin
    raw = source.read(_MAX_MODEL_ACCESS_SNAPSHOT_BYTES + 1)
    if len(raw.encode("utf-8")) > _MAX_MODEL_ACCESS_SNAPSHOT_BYTES:
        raise RuntimeError("model access snapshot exceeds the allowed size")
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("model access snapshot is invalid") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("schema") != _MODEL_ACCESS_SNAPSHOT_SCHEMA
    ):
        raise RuntimeError("model access snapshot schema is invalid")

    mode = str(payload.get("mode") or "").strip().lower()
    allows_custom_models = payload.get("allowsCustomModels") is True
    base_url = str(payload.get("baseUrl") or "").strip().rstrip("/")
    api_key = str(payload.get("apiKey") or "").strip()
    if mode != "mixed" or not base_url:
        raise RuntimeError("model access snapshot values are invalid")

    model_assignments = _normalize_model_assignments(payload.get("modelAssignments"))
    model_capabilities = _normalize_model_capabilities(payload.get("modelCapabilities"))

    global _byok_allowed, _selected_mode, _model_assignments
    global _model_capabilities
    global _cloud_base_url_override, _cloud_api_key_override
    with _lock:
        _byok_allowed = allows_custom_models
        _selected_mode = "mixed"
        _model_assignments = model_assignments
        _model_capabilities = model_capabilities
        _cloud_base_url_override = base_url
        _cloud_api_key_override = api_key
    return True


def model_access_configured() -> bool:
    access = runtime_model_access()
    return bool(access.base_url and access.api_key)


def require_model_admin_token(value: str | None) -> None:
    expected = os.environ.get("AI_ANIME_MODEL_ADMIN_TOKEN", "").strip()
    supplied = str(value or "").strip()
    if not expected or not supplied or not hmac.compare_digest(expected, supplied):
        raise PermissionError("model administration is restricted to Electron main")
