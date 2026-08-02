"""Creative Canvas document identifier rules."""

from __future__ import annotations

import re


_CREATIVE_CANVAS_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def is_valid_creative_canvas_id(canvas_id: str) -> bool:
    return bool(_CREATIVE_CANVAS_ID_RE.fullmatch(canvas_id))


def require_creative_canvas_id(canvas_id: str) -> str:
    if not is_valid_creative_canvas_id(canvas_id):
        raise ValueError(f"invalid canvas_id: {canvas_id!r}")
    return canvas_id
