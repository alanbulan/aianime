"""Detected character and prop reference rules."""

from __future__ import annotations

import re
from typing import Any


NO_CHARACTER_MARKER = "__NO_CHARACTER__"
NO_PROP_MARKER = "__NO_PROP__"


def build_episode_identity_alias_map(
    episode: Any,
    characters: list[Any] | tuple[Any, ...] | None,
) -> dict[str, str]:
    """Build unambiguous visible-name -> episode identity mappings.

    The episode's explicit default identity wins.  Without one, a character is
    safe to infer only when exactly one of its identities belongs to the
    episode.  Character aliases share that same mapping.
    """

    allowed_identity_ids = {
        str(identity_id or "").strip()
        for identity_id in (getattr(episode, "identity_ids", None) or [])
        if str(identity_id or "").strip()
    }
    default_map = {
        str(name or "").strip(): str(identity_id or "").strip()
        for name, identity_id in (
            getattr(episode, "identity_default_map", None) or {}
        ).items()
        if str(name or "").strip() and str(identity_id or "").strip()
    }
    aliases: dict[str, str] = {}
    for character in characters or []:
        character_name = str(getattr(character, "name", "") or "").strip()
        if not character_name:
            continue
        episode_identities = [
            str(getattr(identity, "identity_id", "") or "").strip()
            for identity in (getattr(character, "identities", None) or [])
            if str(getattr(identity, "identity_id", "") or "").strip()
            and (
                not allowed_identity_ids
                or str(getattr(identity, "identity_id", "") or "").strip()
                in allowed_identity_ids
            )
        ]
        default_identity_id = default_map.get(character_name, "")
        if default_identity_id and (
            not allowed_identity_ids or default_identity_id in allowed_identity_ids
        ):
            identity_id = default_identity_id
        elif len(episode_identities) == 1:
            identity_id = episode_identities[0]
        else:
            continue
        for token in (
            character_name,
            *(
                str(alias or "").strip()
                for alias in (getattr(character, "aliases", None) or [])
            ),
            identity_id,
        ):
            if token:
                aliases[token] = identity_id
    return aliases


def canonicalize_visual_identity_markers(
    visual_description: str,
    identity_aliases: dict[str, str] | None,
) -> str:
    """Wrap unambiguous bare character references in canonical markers.

    Existing character and prop markers are protected.  A single combined
    regular expression performs replacement in one pass so newly inserted
    markers cannot be rewritten by a shorter alias.
    """

    text = str(visual_description or "")
    aliases = {
        str(alias or "").strip(): str(identity_id or "").strip()
        for alias, identity_id in (identity_aliases or {}).items()
        if str(alias or "").strip() and str(identity_id or "").strip()
    }
    if not text or not aliases:
        return text
    alias_pattern = re.compile(
        "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))
    )
    protected_pattern = re.compile(r"(\{\{[^}]+\}\}|\[\[[^\]]+\]\])")
    parts = protected_pattern.split(text)
    for index in range(0, len(parts), 2):
        parts[index] = alias_pattern.sub(
            lambda match: f"{{{{{aliases[match.group(0)]}}}}}",
            parts[index],
        )
    return "".join(parts)


def _dedupe_non_empty(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def normalize_detected_identities(
    values: list[Any] | tuple[Any, ...] | None,
) -> list[str]:
    """Normalize detected identity IDs, preserving the explicit no-character marker."""
    result = _dedupe_non_empty(values)
    real_ids = [item for item in result if item != NO_CHARACTER_MARKER]
    return real_ids or ([NO_CHARACTER_MARKER] if NO_CHARACTER_MARKER in result else [])


def normalize_detected_props(
    values: list[Any] | tuple[Any, ...] | None,
) -> list[str]:
    """Normalize detected prop IDs, preserving the explicit no-prop marker."""
    result = _dedupe_non_empty(values)
    real_ids = [item for item in result if item != NO_PROP_MARKER]
    return real_ids or ([NO_PROP_MARKER] if NO_PROP_MARKER in result else [])


def real_detected_identities(
    values: list[Any] | tuple[Any, ...] | None,
) -> list[str]:
    """Return only concrete identity IDs from a detected_identities payload."""
    return [
        item
        for item in normalize_detected_identities(values)
        if item != NO_CHARACTER_MARKER
    ]


def real_detected_props(values: list[Any] | tuple[Any, ...] | None) -> list[str]:
    """Return only concrete prop IDs from a detected_props payload."""
    return [
        item for item in normalize_detected_props(values) if item != NO_PROP_MARKER
    ]


def _extract_identity_marker_ids(visual_description: str) -> list[str]:
    return list(
        extract_char_identities_from_markers(
            visual_description,
            strict=False,
        ).values()
    )


def complete_detected_refs_from_visual_description(
    *,
    visual_description: str,
    detected_identities: list[Any] | tuple[Any, ...] | None = None,
    detected_props: list[Any] | tuple[Any, ...] | None = None,
    allowed_identity_ids: set[str] | list[str] | tuple[str, ...] | None = None,
    allowed_prop_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> tuple[list[str], list[str]]:
    identity_ids = {str(item or "").strip() for item in (allowed_identity_ids or [])}
    prop_ids = {str(item or "").strip() for item in (allowed_prop_ids or [])}

    # The screenplay markers are the production source of truth.  Color
    # detection is only a fallback for legacy/manual beats without markers;
    # unioning both sources lets a false-positive sketch color silently add a
    # different character to Render, Seedance references and voice checks.
    marker_identities = _extract_identity_marker_ids(visual_description)
    if marker_identities:
        completed_identities = [
            identity_id
            for identity_id in marker_identities
            if identity_id and (not identity_ids or identity_id in identity_ids)
        ]
    else:
        completed_identities = [
            identity_id
            for identity_id in real_detected_identities(detected_identities)
            if not identity_ids or identity_id in identity_ids
        ]

    marker_props = extract_prop_ids_from_markers(
        visual_description,
        strict=False,
    )
    if marker_props:
        completed_props = [
            prop_id
            for prop_id in marker_props
            if prop_id and (not prop_ids or prop_id in prop_ids)
        ]
    else:
        completed_props = [
            prop_id
            for prop_id in real_detected_props(detected_props)
            if not prop_ids or prop_id in prop_ids
        ]

    return (
        normalize_detected_identities(completed_identities or [NO_CHARACTER_MARKER]),
        normalize_detected_props(completed_props or [NO_PROP_MARKER]),
    )


def authoritative_detected_refs_for_beat(
    beat: Any,
    *,
    allowed_identity_ids: set[str] | list[str] | tuple[str, ...] | None = None,
    allowed_prop_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> tuple[list[str], list[str]]:
    """Resolve the references every downstream production stage must use."""

    if isinstance(beat, dict):
        visual_description = str(beat.get("visual_description", "") or "")
        detected_identities = beat.get("detected_identities")
        detected_props = beat.get("detected_props")
    else:
        visual_description = str(
            getattr(beat, "visual_description", "") or ""
        )
        detected_identities = getattr(beat, "detected_identities", None)
        detected_props = getattr(beat, "detected_props", None)
    return complete_detected_refs_from_visual_description(
        visual_description=visual_description,
        detected_identities=detected_identities,
        detected_props=detected_props,
        allowed_identity_ids=allowed_identity_ids,
        allowed_prop_ids=allowed_prop_ids,
    )


def extract_char_identities_from_markers(
    visual_desc: str,
    *,
    strict: bool = True,
) -> dict[str, str]:
    """从 visual_description 的 {{}} marker 提取 {角色名: identity_id}。

    Args:
        strict: True 时遇到无身份后缀的 marker 抛 ValueError
    """
    result = {}
    for marker in re.findall(r"\{\{([^}]+)\}\}", visual_desc):
        if "_" in marker:
            char_name = marker.split("_", 1)[0]
            result[char_name] = marker
        elif strict:
            raise ValueError(
                f"marker '{{{{{marker}}}}}' 缺少身份后缀，"
                f"应为 '{{{{{marker}_身份名}}}}' 格式"
            )
    return result


def extract_prop_ids_from_markers(
    visual_desc: str,
    *,
    strict: bool = False,
) -> list[str]:
    """从 visual_description 的 [[prop_id]] marker 提取 prop_id 列表。"""
    result: list[str] = []
    seen: set[str] = set()
    for marker in re.findall(r"\[\[([^\]]+)\]\]", visual_desc):
        prop_id = str(marker or "").strip()
        if not prop_id:
            if strict:
                raise ValueError("marker '[[ ]]' 不能为空")
            continue
        if prop_id in seen:
            continue
        seen.add(prop_id)
        result.append(prop_id)
    return result


def collect_prop_marker_ids_from_beat(value: Any) -> list[str]:
    """从单个 beat 收集出场道具 marker key。

    道具锚点和身份锚点保持一致：只读取 visual_description 里的 [[prop_id]]。
    """
    if isinstance(value, dict):
        visual_desc = str(value.get("visual_description", "") or "")
    else:
        visual_desc = str(getattr(value, "visual_description", "") or "")
    return extract_prop_ids_from_markers(visual_desc, strict=False)


__all__ = [
    "NO_CHARACTER_MARKER",
    "NO_PROP_MARKER",
    "authoritative_detected_refs_for_beat",
    "build_episode_identity_alias_map",
    "canonicalize_visual_identity_markers",
    "collect_prop_marker_ids_from_beat",
    "complete_detected_refs_from_visual_description",
    "extract_char_identities_from_markers",
    "extract_prop_ids_from_markers",
    "normalize_detected_identities",
    "normalize_detected_props",
    "real_detected_identities",
    "real_detected_props",
]
