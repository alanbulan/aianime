"""Pure Scene Viewer and Director Stage presentation rules."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Mapping, Sequence

ACTOR_FALLBACK_COLORS = (
    "#38bdf8",
    "#f97316",
    "#22c55e",
    "#e879f9",
    "#facc15",
    "#fb7185",
)
PROP_FALLBACK_COLORS = (
    "#a78bfa",
    "#2dd4bf",
    "#f472b6",
    "#84cc16",
    "#60a5fa",
    "#fb923c",
)


def splat_format(path: Path | None) -> str:
    suffix = path.suffix.lower().lstrip(".") if path is not None else ""
    return suffix if suffix in {"ply", "sog", "splat", "ksplat"} else "unknown"


def marker_hex(value: str | None, fallback: str) -> str:
    token = str(value or "").strip().split(" ", 1)[0]
    return token if re.fullmatch(r"#[0-9a-fA-F]{6}", token) else fallback


def scene_plate_preview_payload(
    *,
    scene_id: str,
    variant_id: str,
    time_of_day: str,
    resolved_scene_name: str,
    time_baked: bool,
    planned_scene_name: str = "",
) -> dict[str, Any]:
    has_time = bool(str(time_of_day or "").strip())
    if not has_time:
        render_status = "no_time"
        render_relight = False
        render_label = f"Render：将使用 {resolved_scene_name}，锁图光"
        video_reference_label = (
            f"视频参考：将使用 {resolved_scene_name}，提示词时间：无"
        )
    elif planned_scene_name and planned_scene_name != resolved_scene_name:
        render_status = "planned_missing"
        render_relight = True
        render_label = (
            f"Render：已规划 {planned_scene_name} 但暂无图，将使用 "
            f"{resolved_scene_name}，relight 到 {time_of_day}"
        )
        video_reference_label = (
            f"视频参考：将使用 {resolved_scene_name}，提示词时间：{time_of_day}"
        )
    elif time_baked:
        render_status = "time_baked"
        render_relight = False
        render_label = f"Render：将使用 {resolved_scene_name}，锁图光"
        video_reference_label = (
            f"视频参考：将使用 {resolved_scene_name}，提示词时间：{time_of_day}"
        )
    else:
        render_status = "relight"
        render_relight = True
        render_label = f"Render：将使用 {resolved_scene_name}，relight 到 {time_of_day}"
        video_reference_label = (
            f"视频参考：将使用 {resolved_scene_name}，提示词时间：{time_of_day}"
        )

    return {
        "scene_id": scene_id,
        "variant_id": variant_id,
        "time_of_day": time_of_day,
        "resolved_scene_name": resolved_scene_name,
        "planned_scene_name": planned_scene_name,
        "time_baked": time_baked,
        "render": {
            "resolved_scene_name": resolved_scene_name,
            "planned_scene_name": planned_scene_name,
            "relight": render_relight,
            "status": render_status,
            "label": render_label,
        },
        "videoReference": {
            "resolved_scene_name": resolved_scene_name,
            "prompt_time_of_day": time_of_day,
            "label": video_reference_label,
        },
    }


def director_palette(
    beat_context: Mapping[str, Any] | None,
    *,
    anonymous_actor_colors: Sequence[str],
    anonymous_prop_colors: Sequence[str],
    sketch_colors: Mapping[str, str] | None = None,
    prop_marker_colors: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    if beat_context is None:
        return {
            "actors": [],
            "props": [],
            "anonymous_colors": list(anonymous_actor_colors),
            "anonymous_prop_colors": list(anonymous_prop_colors),
        }

    actor_colors = sketch_colors or {}
    prop_colors = prop_marker_colors or {}
    identities = list(actor_colors) or list(beat_context["detected_identities"])
    props = list(prop_colors) or list(beat_context["detected_props"])
    return {
        "actors": [
            {
                "identity_id": identity_id,
                "label": identity_id,
                "color": marker_hex(
                    actor_colors.get(identity_id),
                    ACTOR_FALLBACK_COLORS[index % len(ACTOR_FALLBACK_COLORS)],
                ),
            }
            for index, identity_id in enumerate(identities)
        ],
        "props": [
            {
                "prop_id": prop_id,
                "label": prop_id,
                "color": marker_hex(
                    prop_colors.get(prop_id),
                    PROP_FALLBACK_COLORS[index % len(PROP_FALLBACK_COLORS)],
                ),
            }
            for index, prop_id in enumerate(props)
        ],
        "anonymous_colors": [],
        "anonymous_prop_colors": list(anonymous_prop_colors),
    }
