"""Image source selection rules for project assets."""

from __future__ import annotations

from typing import Any, Literal, Mapping, cast

AssetImageKind = Literal["character", "scene", "prop"]

CHARACTER_IMAGE_SELECTION_CONFIG_KEY = "character_image_selection"
ASSET_IMAGE_SELECTION_CONFIG_KEYS: dict[AssetImageKind, str] = {
    "character": CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
    "scene": "scene_image_selection",
    "prop": "prop_image_selection",
}
CHARACTER_IMAGE_USAGE_TASK_TYPES = ("character_portrait", "identity_image")
DEFAULT_CHARACTER_STYLE = "chinese_period_drama"
DEFAULT_CHARACTER_ETHNICITY = "Chinese"


def normalize_asset_image_kind(value: str) -> AssetImageKind | None:
    normalized = str(value or "").strip().lower()
    if normalized in ASSET_IMAGE_SELECTION_CONFIG_KEYS:
        return cast(AssetImageKind, normalized)
    return None


def stored_project_style(config: Mapping[str, Any]) -> str:
    return str(config.get("visual_style") or config.get("project_style") or "")


def character_generation_style(
    config: Mapping[str, Any],
    requested_style: str | None,
) -> str:
    return cast(
        str,
        requested_style or config.get("visual_style", DEFAULT_CHARACTER_STYLE),
    )


def character_generation_ethnicity(
    config: Mapping[str, Any],
    requested_ethnicity: str | None,
) -> str:
    if requested_ethnicity is not None:
        return requested_ethnicity
    return cast(
        str,
        config.get("ethnicity", DEFAULT_CHARACTER_ETHNICITY),
    )
