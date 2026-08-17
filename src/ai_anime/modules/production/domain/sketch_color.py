"""Sketch marker color domain rules."""

from __future__ import annotations

import logging
from typing import Any

from ai_anime.modules.production.domain.detected_refs import (
    collect_prop_marker_ids_from_beat,
    extract_char_identities_from_markers,
    real_detected_identities,
)


BRIDGMAN_CHARACTER_PALETTE = [
    ("#FF00FF", "FLUORESCENT MAGENTA"),
    ("#00FFFF", "FLUORESCENT CYAN"),
    ("#CCFF00", "FLUORESCENT LIME"),
    ("#FF6B00", "FLUORESCENT ORANGE"),
    ("#7C4DFF", "ELECTRIC VIOLET"),
    ("#00FF66", "NEON MINT"),
    ("#00A2FF", "ELECTRIC AZURE"),
    ("#FFD400", "SIGNAL YELLOW"),
    ("#9D00FF", "NEON PURPLE"),
    ("#00FFCC", "FLUORESCENT AQUA"),
    ("#39FF14", "LASER GREEN"),
    ("#5C6BC0", "INDIGO"),
]

PROP_MARKER_PALETTE = [
    ("#B71C1C", "DEEP CRIMSON"),
    ("#6D4C41", "UMBER BROWN"),
    ("#827717", "OLIVE BRONZE"),
    ("#1B5E20", "FOREST GREEN"),
    ("#006064", "DEEP TEAL"),
    ("#0D47A1", "ROYAL BLUE"),
    ("#311B92", "DEEP INDIGO"),
    ("#7B1FA2", "DEEP ORCHID"),
    ("#880E4F", "WINE BERRY"),
    ("#3E2723", "DARK CHOCOLATE"),
]

PRIMARY_MARKER_PALETTE_SIZE = 8


def _hex_to_hue(hex_code: str) -> float:
    import colorsys

    red = int(hex_code[1:3], 16) / 255
    green = int(hex_code[3:5], 16) / 255
    blue = int(hex_code[5:7], 16) / 255
    hue, _, _ = colorsys.rgb_to_hsv(red, green, blue)
    return hue * 360


def assign_identity_sketch_colors(
    characters: list[dict[str, Any]],
    min_hue_gap: float = 60.0,
    episode_beats: list[dict[str, Any]] | None = None,
    existing_colors: dict[str, str] | None = None,
) -> dict[str, str]:
    """Assign stable sketch colors to identities used by an episode."""
    episode_keys: set[str] = set()
    if episode_beats is not None:
        for beat in episode_beats:
            episode_keys.update(
                real_detected_identities(beat.get("detected_identities") or [])
            )
            for _name, identity_id in extract_char_identities_from_markers(
                beat.get("visual_description", ""),
                strict=False,
            ).items():
                if identity_id:
                    episode_keys.add(identity_id)
    else:
        for character in characters:
            for identity in character.get("identities", []):
                identity_id = identity.get("identity_id", "")
                if identity_id:
                    episode_keys.add(identity_id)

    color_map: dict[str, str] = {
        str(identity_id): str(color)
        for identity_id, color in (existing_colors or {}).items()
        if str(identity_id).strip() and str(color).strip()
    }
    used_hexes = {
        color.strip().split(" ", 1)[0].lower()
        for color in color_map.values()
        if color.strip()
    }
    assigned_hues = [
        _hex_to_hue(hex_code)
        for hex_code in used_hexes
        if hex_code.startswith("#") and len(hex_code) == 7
    ]
    used_indices = {
        index
        for index, (hex_code, _name) in enumerate(BRIDGMAN_CHARACTER_PALETTE)
        if hex_code.lower() in used_hexes
    }

    for marker_id in sorted(episode_keys):
        if marker_id in color_map:
            continue
        available_primary = [
            index
            for index in range(
                min(
                    PRIMARY_MARKER_PALETTE_SIZE,
                    len(BRIDGMAN_CHARACTER_PALETTE),
                )
            )
            if index not in used_indices
        ]
        candidate_indices = available_primary or [
            index
            for index in range(len(BRIDGMAN_CHARACTER_PALETTE))
            if index not in used_indices
        ]

        best_index = None
        best_min_gap = -1.0
        for index in candidate_indices:
            hex_code, _ = BRIDGMAN_CHARACTER_PALETTE[index]
            hue = _hex_to_hue(hex_code)
            if not assigned_hues:
                best_index = index
                break
            minimum_gap = min(
                min(abs(hue - assigned) % 360, 360 - abs(hue - assigned) % 360)
                for assigned in assigned_hues
            )
            if minimum_gap >= min_hue_gap:
                best_index = index
                break
            if minimum_gap > best_min_gap:
                best_min_gap = minimum_gap
                best_index = index

        if best_index is not None:
            hex_code, color_name = BRIDGMAN_CHARACTER_PALETTE[best_index]
            color_map[marker_id] = f"{hex_code} {color_name}"
            assigned_hues.append(_hex_to_hue(hex_code))
            used_indices.add(best_index)
            print(f"[sketch_color] {marker_id}: {hex_code} {color_name}")
        else:
            logging.warning(
                "[assign_sketch_colors] 调色板用尽，%s 未分配颜色",
                marker_id,
            )

    return color_map


def global_prop_marker_colors(
    beats: list[dict[str, Any]],
    prop_menu: list[Any] | None = None,
    sketch_colors: dict[str, str] | None = None,
    *,
    assign_missing: bool = False,
) -> dict[str, str]:
    """Resolve persisted colors for global prop markers used by the beats."""
    active_prop_ids: list[str] = []
    seen: set[str] = set()
    for beat in beats:
        for prop_id in collect_prop_marker_ids_from_beat(beat):
            if prop_id and prop_id not in seen:
                seen.add(prop_id)
                active_prop_ids.append(prop_id)
    if not active_prop_ids:
        return {}

    colorable_prop_ids: set[str] = set()
    explicit_colors: dict[str, str] = {}
    for raw_item in prop_menu or []:
        if isinstance(raw_item, dict):
            prop_id = str(
                raw_item.get("prop_id")
                or raw_item.get("base_id")
                or raw_item.get("name")
                or ""
            ).strip()
            asset_scope = str(raw_item.get("asset_scope") or "").strip().lower()
            is_global_asset = raw_item.get("is_global_asset") is True
            marker_color = str(raw_item.get("marker_color") or "").strip()
        else:
            prop_id = str(
                getattr(raw_item, "prop_id", "")
                or getattr(raw_item, "name", "")
            ).strip()
            asset_scope = str(getattr(raw_item, "asset_scope", "")).strip().lower()
            is_global_asset = getattr(raw_item, "is_global_asset", False) is True
            marker_color = str(
                getattr(raw_item, "marker_color", "") or ""
            ).strip()
        if prop_id and (asset_scope == "global" or is_global_asset or marker_color):
            colorable_prop_ids.add(prop_id)
        if prop_id and marker_color:
            explicit_colors[prop_id] = marker_color
    if not colorable_prop_ids:
        return {}
    if not assign_missing:
        return {
            prop_id: explicit_colors[prop_id]
            for prop_id in active_prop_ids
            if prop_id in explicit_colors
        }

    used_hexes = {
        str(value or "").strip().split(" ", 1)[0].lower()
        for value in (sketch_colors or {}).values()
        if str(value or "").strip()
    }
    used_hexes.update(
        str(value or "").strip().split(" ", 1)[0].lower()
        for value in explicit_colors.values()
        if str(value or "").strip()
    )
    used_hues = [
        _hex_to_hue(hex_code)
        for hex_code in used_hexes
        if hex_code.startswith("#") and len(hex_code) == 7
    ]

    def minimum_hue_gap(candidate_hex: str) -> float:
        if not used_hues:
            return 360.0
        hue = _hex_to_hue(candidate_hex)
        gaps = []
        for used_hue in used_hues:
            difference = abs(hue - used_hue) % 360
            gaps.append(min(difference, 360 - difference))
        return min(gaps)

    unused = [
        item for item in PROP_MARKER_PALETTE if item[0].lower() not in used_hexes
    ]
    safe = [item for item in unused if minimum_hue_gap(item[0]) >= 60.0]
    available = safe or unused or list(PROP_MARKER_PALETTE)
    available = sorted(available, key=lambda item: -minimum_hue_gap(item[0]))

    colors: dict[str, str] = {}
    color_index = 0
    for prop_id in active_prop_ids:
        if prop_id not in colorable_prop_ids:
            continue
        if prop_id in explicit_colors:
            colors[prop_id] = explicit_colors[prop_id]
            continue
        hex_code, color_name = available[color_index % len(available)]
        colors[prop_id] = f"{hex_code} {color_name}"
        color_index += 1
    return colors


def apply_prop_marker_colors(
    prop_menu: list[Any],
    colors: dict[str, str],
) -> list[Any]:
    for item in prop_menu:
        if not isinstance(item, dict):
            continue
        prop_id = str(item.get("prop_id") or item.get("name") or "").strip()
        if prop_id in colors:
            item["marker_color"] = colors[prop_id]
    return prop_menu


def marker_color_change_requires_sketch_clean(
    previous: dict[str, str] | None,
    current: dict[str, str] | None,
) -> bool:
    """Return whether recoloring invalidates all existing sketches."""
    current_colors = {
        str(key): str(value)
        for key, value in (current or {}).items()
        if str(key).strip() and str(value).strip()
    }
    if not current_colors:
        return False

    previous_colors = {
        str(key): str(value)
        for key, value in (previous or {}).items()
        if str(key).strip() and str(value).strip()
    }
    if not previous_colors:
        return True

    for key, old_value in previous_colors.items():
        new_value = current_colors.get(key)
        if new_value is not None and new_value != old_value:
            return True
    return False
