"""Safe model parameters accepted from Creative Canvas catalog controls."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping

_PARAMETER_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_BLOCKED_KEYS = {
    "api_key",
    "authorization",
    "base_url",
    "headers",
    "height",
    "image",
    "images",
    "mask",
    "model",
    "n",
    "response_format",
    "size",
    "prompt",
    "url",
    "width",
    "aspect_ratio",
    "image_size",
    "resolution",
}


def normalize_canvas_model_parameters(
    values: Mapping[str, object] | None,
) -> dict[str, object]:
    if not values:
        return {}
    if len(values) > 32:
        raise ValueError("model parameters accept at most 32 fields")
    normalized: dict[str, object] = {}
    for raw_key, raw_value in values.items():
        key = str(raw_key or "").strip()
        if not _PARAMETER_KEY.fullmatch(key) or key.lower() in _BLOCKED_KEYS:
            raise ValueError(f"unsafe model parameter: {key or '<empty>'}")
        normalized[key] = _normalize_parameter_value(raw_value, key)
    return normalized


def _normalize_parameter_value(value: object, key: str) -> object:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"model parameter must be finite: {key}")
        if abs(value) > 2**53 - 1:
            raise ValueError(f"model parameter exceeds safe numeric range: {key}")
        return value
    if isinstance(value, str):
        if len(value) > 4096:
            raise ValueError(f"model parameter is too long: {key}")
        return value
    if isinstance(value, list):
        if len(value) > 64:
            raise ValueError(f"model parameter list is too long: {key}")
        return [_normalize_parameter_value(item, key) for item in value]
    raise ValueError(f"unsupported model parameter value: {key}")


__all__ = ["normalize_canvas_model_parameters"]
