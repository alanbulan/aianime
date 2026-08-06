"""Pure Beat background-anchor rules."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ai_anime.shared.utils.background_anchor import (
    ANCHOR_DIRECTOR_ENV_ONLY,
    ANCHOR_MASTER,
    ANCHOR_REVERSE,
    ANCHOR_SELECTED_BACKGROUND,
    background_anchor_label,
    normalize_background_anchor_id,
)

BACKGROUND_SOURCE_ANCHORS = (
    ANCHOR_DIRECTOR_ENV_ONLY,
    ANCHOR_MASTER,
    ANCHOR_REVERSE,
    ANCHOR_SELECTED_BACKGROUND,
)
SNAPSHOT_SOURCE_ANCHORS = frozenset(
    {
        ANCHOR_MASTER,
        ANCHOR_REVERSE,
        ANCHOR_DIRECTOR_ENV_ONLY,
    }
)


def current_background_source(
    scene_ref: Mapping[str, Any] | None,
    *,
    inferred_source: str = "",
) -> tuple[str, str]:
    ref = scene_ref if isinstance(scene_ref, Mapping) else {}
    stored_anchor = normalize_background_anchor_id(
        str(ref.get("render_anchor_id") or ANCHOR_MASTER)
    )
    raw_source = str(ref.get("render_anchor_source_id") or "").strip()
    source_anchor = normalize_background_anchor_id(raw_source) if raw_source else ""

    if stored_anchor != ANCHOR_SELECTED_BACKGROUND:
        return stored_anchor, stored_anchor

    if source_anchor not in BACKGROUND_SOURCE_ANCHORS:
        raw_inferred_source = str(inferred_source or "").strip()
        source_anchor = (
            normalize_background_anchor_id(raw_inferred_source)
            if raw_inferred_source
            else ""
        )
    if source_anchor not in BACKGROUND_SOURCE_ANCHORS:
        source_anchor = ANCHOR_SELECTED_BACKGROUND
    return stored_anchor, source_anchor


def selected_background_scene_ref(
    scene_ref: Mapping[str, Any] | None,
    *,
    scene_name: str,
    source_anchor_id: str,
) -> dict[str, Any]:
    ref = dict(scene_ref or {})
    ref["scene_id"] = scene_name
    ref["render_anchor_id"] = ANCHOR_SELECTED_BACKGROUND
    ref["render_anchor_source_id"] = normalize_background_anchor_id(
        source_anchor_id
    )
    ref.pop("render_anchor_path", None)
    return ref


__all__ = [
    "ANCHOR_DIRECTOR_ENV_ONLY",
    "ANCHOR_MASTER",
    "ANCHOR_REVERSE",
    "ANCHOR_SELECTED_BACKGROUND",
    "BACKGROUND_SOURCE_ANCHORS",
    "SNAPSHOT_SOURCE_ANCHORS",
    "background_anchor_label",
    "current_background_source",
    "normalize_background_anchor_id",
    "selected_background_scene_ref",
]
