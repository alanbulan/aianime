"""Process-local commercial capability gate for model access."""

from __future__ import annotations

import hmac
import json
import math
import os
import sys
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from threading import RLock
from typing import TextIO

MODEL_ACCESS_STDIN_ENV = "AI_ANIME_MODEL_ACCESS_STDIN"
_MODEL_ACCESS_SNAPSHOT_SCHEMA = "ai_anime.model_access.v4"
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


@dataclass(frozen=True)
class RuntimeModelCapability:
    model_id: str
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
        elif isinstance(value, Mapping):
            model_id = str(value.get("modelId") or value.get("model_id") or "").strip()
            role = str(value.get("role") or "").strip().upper()
            raw_priority = value.get("priority", 100 + index)
            if isinstance(raw_priority, bool):
                raise ValueError(f"model assignment {index} has an invalid priority")
            priority = int(raw_priority)
            enabled = value.get("enabled") is not False
        else:
            raise ValueError(f"model assignment {index} must be an object")
        if not model_id or len(model_id) > 256:
            raise ValueError(f"model assignment {index} has an invalid modelId")
        if role not in MODEL_ROLES:
            raise ValueError(f"model assignment {index} has an invalid role")
        if priority < 1 or priority > 9999:
            raise ValueError(f"model assignment {index} has an invalid priority")
        unique[(model_id, role)] = RuntimeModelAssignment(
            model_id=model_id,
            role=role,
            priority=priority,
            enabled=enabled,
        )
    return tuple(
        sorted(
            (item for item in unique.values() if item.enabled),
            key=lambda item: (item.priority, item.role, item.model_id),
        )
    )


_CAPABILITY_FIELDS = {
    "referenceAudioMinSeconds": "reference_audio_min_seconds",
    "referenceAudioMaxSeconds": "reference_audio_max_seconds",
    "referenceAudioTotalMinSeconds": "reference_audio_total_min_seconds",
    "referenceAudioTotalMaxSeconds": "reference_audio_total_max_seconds",
    "referenceVideoMinSeconds": "reference_video_min_seconds",
    "referenceVideoMaxSeconds": "reference_video_max_seconds",
    "referenceVideoTotalMinSeconds": "reference_video_total_min_seconds",
    "referenceVideoTotalMaxSeconds": "reference_video_total_max_seconds",
}


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
            capability = RuntimeModelCapability(model_id=model_id, **fields)
        else:
            raise ValueError(f"model capability {index} must be an object")
        model_id = capability.model_id.strip()
        if not model_id or len(model_id) > 256:
            raise ValueError(f"model capability {index} has an invalid modelId")
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
            **{
                field_name: getattr(capability, field_name)
                for field_name in _CAPABILITY_FIELDS.values()
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
    clean_role = str(role or "").strip().upper()
    if clean_role not in MODEL_ROLES:
        raise ValueError("model role is invalid")

    access = runtime_model_access()
    role_assignments = tuple(
        item for item in access.model_assignments if item.role == clean_role
    )
    if role_assignments:
        return role_assignments[0].model_id
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
                }
                for item in access.model_assignments
            ],
            "modelCapabilities": [
                {
                    "modelId": item.model_id,
                    **{
                        external_name: getattr(item, field_name)
                        for external_name, field_name in _CAPABILITY_FIELDS.items()
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
