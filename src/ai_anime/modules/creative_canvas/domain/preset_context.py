"""Pure context rules shared by Creative Canvas preset builders."""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from ai_anime.modules.production.public import (
    NO_CHARACTER_MARKER,
    NO_PROP_MARKER,
)


_PRESET_MARKER_RE = re.compile(r"\{\{([^{}]+)\}\}|\[\[([^\[\]]+)\]\]")


def normalize_preset_scene_name(scene_ref: Any) -> str:
    if isinstance(scene_ref, dict):
        for key in ("scene_id", "name", "scene_name", "id", "title"):
            value = str(scene_ref.get(key) or "").strip()
            if value:
                return value
    if scene_ref:
        return str(scene_ref).strip()
    return ""


def extract_preset_visual_markers(text: str) -> tuple[list[str], list[str]]:
    identities: list[str] = []
    props: list[str] = []
    for match in _PRESET_MARKER_RE.finditer(text or ""):
        identity = (match.group(1) or "").strip()
        prop = (match.group(2) or "").strip()
        if identity:
            identities.append(identity)
        if prop:
            props.append(prop)
    return identities, props


def preset_identity_character(
    identity_id: str,
    known_characters: Iterable[str],
) -> str:
    for name in sorted((name for name in known_characters if name), key=len, reverse=True):
        if identity_id == name or identity_id.startswith(f"{name}_"):
            return name
    if "_" in identity_id:
        return identity_id.split("_", 1)[0]
    return identity_id


def preset_identity_name(identity_id: str, character: str) -> str:
    prefix = f"{character}_"
    return identity_id[len(prefix) :] if identity_id.startswith(prefix) else identity_id


def as_preset_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if value is None:
        return []
    return [value]


def preset_prop_id(item: Any) -> str:
    if isinstance(item, dict):
        return str(
            item.get("prop_id") or item.get("base_id") or item.get("id") or ""
        ).strip()
    return str(item or "").strip()


def preset_identity_id(item: Any) -> str:
    if isinstance(item, dict):
        return str(
            item.get("identity_id") or item.get("id") or item.get("name") or ""
        ).strip()
    return str(item or "").strip()


def real_preset_identity_ids(values: Iterable[str]) -> list[str]:
    return [value for value in values if value and value != NO_CHARACTER_MARKER]


def real_preset_prop_ids(values: Iterable[str]) -> list[str]:
    return [value for value in values if value and value != NO_PROP_MARKER]


def replace_preset_beat_markers(
    text: str,
    identity_markers: dict[str, dict[str, str]],
    prop_markers: dict[str, dict[str, str]],
) -> str:
    def replace_match(match: re.Match[str]) -> str:
        identity_id = str(match.group(1) or "").strip()
        prop_id = str(match.group(2) or "").strip()
        if identity_id:
            marker = identity_markers.get(identity_id)
            if marker:
                color_name = marker.get("color_name") or marker.get("color") or "assigned color"
                return f"{marker.get('tag')} ({color_name})"
            return identity_id
        if prop_id:
            marker = prop_markers.get(prop_id)
            if marker:
                marker_color = str(marker.get("marker_color") or "").strip()
                if marker_color:
                    return f"{marker.get('tag')} ({marker_color})"
                return marker.get("tag", prop_id)
            return prop_id
        return match.group(0)

    return _PRESET_MARKER_RE.sub(replace_match, text or "")
