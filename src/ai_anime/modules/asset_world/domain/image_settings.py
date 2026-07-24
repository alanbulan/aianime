"""Image source selection rules for project assets."""

from __future__ import annotations

from typing import Literal, cast

AssetImageKind = Literal["character", "scene", "prop"]

CHARACTER_IMAGE_SELECTION_CONFIG_KEY = "character_image_selection"
ASSET_IMAGE_SELECTION_CONFIG_KEYS: dict[AssetImageKind, str] = {
    "character": CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
    "scene": "scene_image_selection",
    "prop": "prop_image_selection",
}
CHARACTER_IMAGE_USAGE_TASK_TYPES = ("character_portrait", "identity_image")


def normalize_asset_image_kind(value: str) -> AssetImageKind | None:
    normalized = str(value or "").strip().lower()
    if normalized in ASSET_IMAGE_SELECTION_CONFIG_KEYS:
        return cast(AssetImageKind, normalized)
    return None
