"""Helpers for normalizing model-generated text and JSON."""

from __future__ import annotations

import json
import re
from typing import Any

_OPENING_CODE_FENCE = re.compile(r"^```(?:[A-Za-z0-9_-]+)?\s*")
_CLOSING_CODE_FENCE = re.compile(r"\s*```\s*$")


def strip_model_response_code_fence(text: str) -> str:
    """Remove one optional outer Markdown code fence from a model response."""
    cleaned = (text or "").strip()
    if not cleaned.startswith("```"):
        return cleaned
    cleaned = _OPENING_CODE_FENCE.sub("", cleaned, count=1)
    return _CLOSING_CODE_FENCE.sub("", cleaned, count=1).strip()


def parse_model_json_response(text: str) -> Any:
    """Parse a JSON value from a fenced or prose-wrapped model response."""
    cleaned = strip_model_response_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as direct_error:
        decoder = json.JSONDecoder()
        for index, character in enumerate(cleaned):
            if character not in "[{":
                continue
            try:
                value, _end = decoder.raw_decode(cleaned[index:])
            except json.JSONDecodeError:
                continue
            return value
        raise direct_error


def parse_model_json_object_response(text: str) -> dict[str, Any]:
    """Parse one JSON object and reject scalar or array responses."""
    value = parse_model_json_response(text)
    if not isinstance(value, dict):
        raise ValueError("response is not a JSON object")
    return value


__all__ = [
    "parse_model_json_object_response",
    "parse_model_json_response",
    "strip_model_response_code_fence",
]
