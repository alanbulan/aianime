"""Encode per-conversation commercial model route overrides for Hermes."""

from __future__ import annotations

import base64
import binascii
import re
from dataclasses import dataclass

from ai_anime.modules.ai_assistant.domain.model_selector import (
    normalize_model_selector,
)


MODEL_ROUTE_PREFIX = "ai-anime-route:"
AUTOMATIC_MODEL_ID = "ai-anime-assistant-auto"
REASONING_EFFORT_MARKER = ":reasoning-effort:"


@dataclass(frozen=True, slots=True)
class ModelRouteSelection:
    selector: str | None
    reasoning_effort: str | None


def _valid_reasoning_effort(value: str) -> bool:
    return (
        0 < len(value) <= 64
        and not any(ord(char) < 32 or ord(char) == 127 for char in value)
    )


def _encode_token(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_token(value: str) -> str | None:
    if not value or re.fullmatch(r"[A-Za-z0-9_-]+", value) is None:
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.b64decode(
            padded.encode("ascii"),
            altchars=b"-_",
            validate=True,
        ).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None


def encode_model_route(selector: str, reasoning_effort: str | None = None) -> str:
    """Return an opaque model id that survives Hermes provider parsing."""
    normalized = normalize_model_selector(selector)
    if normalized is None:
        raise ValueError("模型路由选择器无效")
    model_id = f"{MODEL_ROUTE_PREFIX}{_encode_token(normalized)}"
    return _with_reasoning_effort(model_id, reasoning_effort)


def encode_automatic_model(reasoning_effort: str | None = None) -> str:
    """Return the automatic route model id with an optional exact effort."""
    return _with_reasoning_effort(AUTOMATIC_MODEL_ID, reasoning_effort)


def _with_reasoning_effort(model_id: str, reasoning_effort: str | None) -> str:
    normalized = str(reasoning_effort or "").strip()
    if not normalized:
        return model_id
    if not _valid_reasoning_effort(normalized):
        raise ValueError("思考力度无效")
    return f"{model_id}{REASONING_EFFORT_MARKER}{_encode_token(normalized)}"


def decode_model_route(value: object) -> str | None:
    """Recover a selector from a raw model id or ACP provider-prefixed choice."""
    selection = decode_model_selection(value)
    return selection.selector if selection is not None else None


def decode_model_selection(value: object) -> ModelRouteSelection | None:
    """Recover the exact per-conversation selector and reasoning effort."""
    text = str(value or "").strip()
    marker = text.find(MODEL_ROUTE_PREFIX)
    selector: str | None
    suffix: str
    if marker >= 0:
        payload_and_suffix = text[marker + len(MODEL_ROUTE_PREFIX) :]
        payload, separator, remainder = payload_and_suffix.partition(
            REASONING_EFFORT_MARKER
        )
        try:
            selector = normalize_model_selector(_decode_token(payload.strip()))
        except ValueError:
            return None
        if selector is None:
            return None
        suffix = remainder if separator else ""
    else:
        automatic_marker = text.find(AUTOMATIC_MODEL_ID)
        if automatic_marker < 0:
            return None
        remainder = text[automatic_marker + len(AUTOMATIC_MODEL_ID) :]
        if remainder and not remainder.startswith(REASONING_EFFORT_MARKER):
            return None
        selector = None
        suffix = remainder[len(REASONING_EFFORT_MARKER) :] if remainder else ""
    reasoning_effort = _decode_token(suffix.strip()) if suffix else None
    if suffix and (
        reasoning_effort is None
        or not _valid_reasoning_effort(reasoning_effort)
    ):
        return None
    return ModelRouteSelection(
        selector=selector,
        reasoning_effort=reasoning_effort,
    )


__all__ = [
    "AUTOMATIC_MODEL_ID",
    "MODEL_ROUTE_PREFIX",
    "ModelRouteSelection",
    "decode_model_route",
    "decode_model_selection",
    "encode_automatic_model",
    "encode_model_route",
]
