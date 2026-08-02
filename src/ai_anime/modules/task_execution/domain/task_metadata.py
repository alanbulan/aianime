"""Task display metadata derived from submission payloads."""

from __future__ import annotations

from typing import Any


def display_metadata_for_task(
    task_type: str,
    payload: dict[str, Any] | None,
) -> dict[str, str]:
    if not payload:
        return {}
    metadata: dict[str, str] = {}

    for key in (
        "display_name",
        "task_label",
        "task_family",
        "source_label",
        "target_label",
        "canvas_id",
        "node_id",
        "skill_id",
    ):
        value = str(payload.get(key) or "").strip()
        if value:
            metadata[key] = value

    if task_type == "stage_asset":
        for key in ("scene_name", "step"):
            value = str(payload.get(key) or "").strip()
            if value:
                metadata[key] = value
    return metadata


__all__ = ["display_metadata_for_task"]
