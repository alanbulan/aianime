"""Detected character and prop reference rules."""

from __future__ import annotations

import re
from typing import Any


NO_CHARACTER_MARKER = "__NO_CHARACTER__"
NO_PROP_MARKER = "__NO_PROP__"


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

    completed_identities = real_detected_identities(detected_identities)
    for identity_id in _extract_identity_marker_ids(visual_description):
        if identity_ids and identity_id not in identity_ids:
            continue
        if identity_id and identity_id not in completed_identities:
            completed_identities.append(identity_id)

    completed_props = real_detected_props(detected_props)
    for prop_id in extract_prop_ids_from_markers(visual_description, strict=False):
        if prop_ids and prop_id not in prop_ids:
            continue
        if prop_id and prop_id not in completed_props:
            completed_props.append(prop_id)

    return (
        normalize_detected_identities(completed_identities or [NO_CHARACTER_MARKER]),
        normalize_detected_props(completed_props or [NO_PROP_MARKER]),
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
    "collect_prop_marker_ids_from_beat",
    "complete_detected_refs_from_visual_description",
    "extract_char_identities_from_markers",
    "extract_prop_ids_from_markers",
    "normalize_detected_identities",
    "normalize_detected_props",
    "real_detected_identities",
    "real_detected_props",
]
