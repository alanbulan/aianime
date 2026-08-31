"""Validation contract for per-conversation commercial model selectors."""

from __future__ import annotations


MODEL_SELECTOR_MAX_LENGTH = 768
MODEL_SELECTOR_PREFIXES = ("cloud:", "byok:")


def normalize_model_selector(value: object) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    if (
        len(normalized) > MODEL_SELECTOR_MAX_LENGTH
        or not normalized.startswith(MODEL_SELECTOR_PREFIXES)
        or any(ord(char) < 32 or ord(char) == 127 for char in normalized)
    ):
        raise ValueError("模型路由选择器无效")
    return normalized


__all__ = [
    "MODEL_SELECTOR_MAX_LENGTH",
    "MODEL_SELECTOR_PREFIXES",
    "normalize_model_selector",
]
