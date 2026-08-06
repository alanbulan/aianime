"""Scene catalog naming and relationship rules."""

from __future__ import annotations

from typing import Any

from ai_anime.shared.utils.derived_scenes import compose_derived_scene_name

SCENE_TIME_TOKENS = {
    "清晨",
    "晨",
    "上午",
    "正午",
    "午",
    "午后",
    "下午",
    "黄昏",
    "傍晚",
    "夜晚",
    "夜",
    "白天",
    "日",
}


def compose_scene_asset_name(
    name: str,
    base_scene_id: str = "",
    variant_id: str = "",
    time_of_day: str = "",
) -> str:
    base = str(base_scene_id or "").strip()
    variant = str(variant_id or "").strip()
    scene_time = str(time_of_day or "").strip()
    if not base:
        return str(name or "").strip()
    scene_name = base
    if variant:
        scene_name = compose_derived_scene_name(scene_name, variant)
    if scene_time:
        scene_name = compose_derived_scene_name(scene_name, scene_time)
    return scene_name


def scene_identity(scene: Any, derived_from_scene: str = "") -> tuple[str, str, str]:
    base_scene_id = str(
        getattr(scene, "base_scene_id", "") or derived_from_scene or ""
    ).strip()
    variant_id = str(getattr(scene, "variant_id", "") or "").strip()
    time_of_day = str(getattr(scene, "time_of_day", "") or "").strip()
    if base_scene_id and not (variant_id or time_of_day):
        prefix = f"{base_scene_id}_"
        if str(scene.name).startswith(prefix):
            suffix = str(scene.name)[len(prefix) :].strip()
            if suffix:
                variant_candidate, separator, time_candidate = suffix.rpartition("_")
                if separator and time_candidate in SCENE_TIME_TOKENS:
                    variant_id = variant_candidate
                    time_of_day = time_candidate
                elif suffix in SCENE_TIME_TOKENS:
                    time_of_day = suffix
                else:
                    variant_id = suffix
    return base_scene_id, variant_id, time_of_day


def derived_scene_names(scenes: list[Any], scene_name: str) -> list[str]:
    return sorted(
        str(scene.name).strip()
        for scene in scenes
        if str(scene.name or "").strip()
        and str(getattr(scene, "base_scene_id", "") or "").strip() == scene_name
    )
