"""Process-local commercial capability gate for model access."""

from __future__ import annotations

import hmac
import json
import os
import sys
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from threading import RLock
from typing import TextIO

MODEL_ACCESS_STDIN_ENV = "AI_ANIME_MODEL_ACCESS_STDIN"
_MODEL_ACCESS_SNAPSHOT_SCHEMA = "ai_anime.model_access.v2"
_MAX_MODEL_ACCESS_SNAPSHOT_BYTES = 64 * 1024

_lock = RLock()
_byok_allowed = False
_selected_mode = "cloud"
_byok_base_url = ""
_byok_api_key = ""
_byok_model_assignments: tuple["RuntimeModelAssignment", ...] = ()
_cloud_model_assignments: tuple["RuntimeModelAssignment", ...] = ()
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
        "AUDIO_MUSIC",
        "EMBEDDING",
        "RERANK",
        "MODERATION",
    }
)


@dataclass(frozen=True)
class RuntimeModelAssignment:
    model_id: str
    role: str


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
        elif isinstance(value, Mapping):
            model_id = str(value.get("modelId") or value.get("model_id") or "").strip()
            role = str(value.get("role") or "").strip().upper()
        else:
            raise ValueError(f"model assignment {index} must be an object")
        if not model_id or len(model_id) > 256:
            raise ValueError(f"model assignment {index} has an invalid modelId")
        if role not in MODEL_ROLES:
            raise ValueError(f"model assignment {index} has an invalid role")
        unique[(model_id, role)] = RuntimeModelAssignment(model_id=model_id, role=role)
    return tuple(sorted(unique.values(), key=lambda item: (item.model_id, item.role)))


def configure_model_access(
    *,
    allows_custom_models: bool,
    mode: str,
    byok_base_url: str = "",
    byok_api_key: str = "",
    model_assignments: Iterable[RuntimeModelAssignment | Mapping[str, object]] | None = None,
    cloud_model_assignments: Iterable[
        RuntimeModelAssignment | Mapping[str, object]
    ]
    | None = None,
) -> None:
    global _byok_allowed, _selected_mode, _byok_base_url, _byok_api_key
    global _byok_model_assignments, _cloud_model_assignments
    global _cloud_base_url_override, _cloud_api_key_override
    normalized_mode = str(mode or "").strip().lower()
    if normalized_mode not in {"cloud", "byok"}:
        raise ValueError("model access mode must be cloud or byok")
    normalized_base_url = str(byok_base_url or "").strip().rstrip("/")
    if normalized_mode == "byok" and not normalized_base_url:
        raise ValueError("BYOK Base URL is required")
    normalized_assignments = _normalize_model_assignments(model_assignments)
    normalized_cloud_assignments = _normalize_model_assignments(
        cloud_model_assignments
    )
    with _lock:
        _byok_allowed = bool(allows_custom_models)
        _selected_mode = normalized_mode if _byok_allowed else "cloud"
        _byok_base_url = normalized_base_url if _byok_allowed else ""
        _byok_api_key = str(byok_api_key or "").strip() if _byok_allowed else ""
        _byok_model_assignments = normalized_assignments if _byok_allowed else ()
        _cloud_model_assignments = normalized_cloud_assignments
        _cloud_base_url_override = None
        _cloud_api_key_override = None


def is_byok_allowed() -> bool:
    with _lock:
        return _byok_allowed


def runtime_model_access() -> RuntimeModelAccess:
    with _lock:
        if (
            _byok_allowed
            and _selected_mode == "byok"
            and _byok_base_url
        ):
            return RuntimeModelAccess(
                mode="byok",
                base_url=_byok_base_url,
                api_key=_byok_api_key,
                model_assignments=_byok_model_assignments,
            )
        cloud_base_url = _cloud_base_url_override
        cloud_api_key = _cloud_api_key_override
        return RuntimeModelAccess(
            mode="cloud",
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
            model_assignments=_cloud_model_assignments,
        )


def require_model_role(model: str, role: str) -> None:
    """Reject BYOK calls whose model was not assigned to the requested role."""
    clean_model = str(model or "").strip()
    clean_role = str(role or "").strip().upper()
    if not clean_model:
        raise ValueError("model is required")
    if clean_role not in MODEL_ROLES:
        raise ValueError("model role is invalid")
    access = runtime_model_access()
    if access.mode == "cloud":
        return
    if not any(
        item.model_id == clean_model and item.role == clean_role
        for item in access.model_assignments
    ):
        raise PermissionError(
            f"BYOK model {clean_model!r} is not assigned to role {clean_role}"
        )


def resolve_model_for_role(model: str, role: str) -> str:
    """Resolve one explicitly selected model for the active access mode.

    Cloud requests keep the platform catalog code unchanged. BYOK requests keep
    an explicitly assigned model or resolve a platform SKU to the first user
    assignment for the requested role.
    """
    clean_model = str(model or "").strip()
    clean_role = str(role or "").strip().upper()
    if not clean_model:
        raise ValueError("model is required")
    if clean_role not in MODEL_ROLES:
        raise ValueError("model role is invalid")

    access = runtime_model_access()
    if access.mode == "cloud":
        return clean_model
    role_assignments = tuple(
        item for item in access.model_assignments if item.role == clean_role
    )
    if any(item.model_id == clean_model for item in role_assignments):
        return clean_model
    if role_assignments:
        return role_assignments[0].model_id
    raise PermissionError(f"BYOK has no model assigned to role {clean_role}")


def resolve_internal_model_for_role(model: str, role: str) -> str:
    """Resolve a built-in logical model to the configured role default."""
    clean_model = str(model or "").strip()
    clean_role = str(role or "").strip().upper()
    if not clean_model:
        raise ValueError("model is required")
    if clean_role not in MODEL_ROLES:
        raise ValueError("model role is invalid")

    access = runtime_model_access()
    role_assignments = tuple(
        item for item in access.model_assignments if item.role == clean_role
    )
    if any(item.model_id == clean_model for item in role_assignments):
        return clean_model
    if role_assignments:
        return role_assignments[0].model_id
    if access.mode == "cloud":
        raise PermissionError(
            f"Cloud has no default model assigned to role {clean_role}"
        )
    raise PermissionError(f"BYOK has no model assigned to role {clean_role}")


def serialize_model_access_for_subprocess() -> str:
    access = runtime_model_access()
    return json.dumps(
        {
            "schema": _MODEL_ACCESS_SNAPSHOT_SCHEMA,
            "mode": access.mode,
            "baseUrl": access.base_url,
            "apiKey": access.api_key,
            "modelAssignments": [
                {"modelId": item.model_id, "role": item.role}
                for item in access.model_assignments
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
    if not isinstance(payload, dict) or payload.get("schema") != _MODEL_ACCESS_SNAPSHOT_SCHEMA:
        raise RuntimeError("model access snapshot schema is invalid")

    mode = str(payload.get("mode") or "").strip().lower()
    base_url = str(payload.get("baseUrl") or "").strip().rstrip("/")
    api_key = str(payload.get("apiKey") or "").strip()
    if mode not in {"cloud", "byok"} or not base_url:
        raise RuntimeError("model access snapshot values are invalid")

    model_assignments = _normalize_model_assignments(payload.get("modelAssignments"))

    global _byok_allowed, _selected_mode, _byok_base_url, _byok_api_key
    global _byok_model_assignments, _cloud_model_assignments
    global _cloud_base_url_override, _cloud_api_key_override
    with _lock:
        _byok_allowed = mode == "byok"
        _selected_mode = mode
        _byok_base_url = base_url if mode == "byok" else ""
        _byok_api_key = api_key if mode == "byok" else ""
        _byok_model_assignments = model_assignments if mode == "byok" else ()
        _cloud_model_assignments = model_assignments if mode == "cloud" else ()
        _cloud_base_url_override = base_url if mode == "cloud" else None
        _cloud_api_key_override = api_key if mode == "cloud" else None
    return True


def model_access_configured() -> bool:
    access = runtime_model_access()
    return bool(access.base_url and (access.mode == "byok" or access.api_key))


def require_model_admin_token(value: str | None) -> None:
    expected = os.environ.get("AI_ANIME_MODEL_ADMIN_TOKEN", "").strip()
    supplied = str(value or "").strip()
    if not expected or not supplied or not hmac.compare_digest(expected, supplied):
        raise PermissionError("model administration is restricted to Electron main")
