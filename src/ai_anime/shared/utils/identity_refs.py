"""Pure helpers for remapping persisted character and identity references."""

from __future__ import annotations

import json
import re
from typing import Any


def remap_character_asset_path(path: Any, old_name: str, new_name: str) -> str:
    value = str(path or "")
    if not value or not old_name or old_name == new_name:
        return value
    pattern = re.compile(
        r"(?P<prefix>(?:^|[/\\])assets[/\\]characters[/\\])"
        + re.escape(old_name)
        + r"(?P<suffix>[/\\]|$)"
    )
    return pattern.sub(
        lambda match: (
            match.group("prefix") + new_name + match.group("suffix")
        ),
        value,
    )


def remap_identity_id(identity_id: Any, old_name: str, new_name: str) -> str:
    value = str(identity_id or "")
    if value == old_name:
        return new_name
    prefix = f"{old_name}_"
    if value.startswith(prefix):
        return f"{new_name}_{value[len(prefix):]}"
    return value


def remap_id_list(raw_json: str | None, old_name: str, new_name: str) -> str | None:
    try:
        values = json.loads(raw_json or "[]")
    except (TypeError, ValueError):
        return None
    if not isinstance(values, list):
        return None
    remapped = [remap_identity_id(item, old_name, new_name) for item in values]
    return json.dumps(remapped, ensure_ascii=False) if remapped != values else None


def remap_default_map(
    raw_json: str | None,
    old_name: str,
    new_name: str,
) -> str | None:
    try:
        mapping = json.loads(raw_json or "{}")
    except (TypeError, ValueError):
        return None
    if not isinstance(mapping, dict):
        return None
    remapped = {
        (new_name if str(key) == old_name else str(key)): remap_identity_id(
            value,
            old_name,
            new_name,
        )
        for key, value in mapping.items()
    }
    return json.dumps(remapped, ensure_ascii=False) if remapped != mapping else None


def remap_keyed_by_identity(
    raw_json: str | None,
    old_name: str,
    new_name: str,
) -> str | None:
    try:
        mapping = json.loads(raw_json or "{}")
    except (TypeError, ValueError):
        return None
    if not isinstance(mapping, dict):
        return None
    remapped = {
        remap_identity_id(key, old_name, new_name): value
        for key, value in mapping.items()
    }
    return json.dumps(remapped, ensure_ascii=False) if remapped != mapping else None


def remap_object_field(
    raw_json: str | None,
    field: str,
    old_name: str,
    new_name: str,
) -> str | None:
    try:
        items = json.loads(raw_json or "[]")
    except (TypeError, ValueError):
        return None
    if not isinstance(items, list):
        return None
    remapped: list[Any] = []
    for item in items:
        if not isinstance(item, dict) or field not in item:
            remapped.append(item)
            continue
        updated = dict(item)
        updated[field] = remap_identity_id(item[field], old_name, new_name)
        remapped.append(updated)
    return json.dumps(remapped, ensure_ascii=False) if remapped != items else None


def remap_identity_markers(
    text: str | None,
    old_name: str,
    new_name: str,
) -> str | None:
    value = str(text or "")
    if not value:
        return None
    pattern = re.compile(r"\{\{" + re.escape(old_name) + r"(_[^}]*)?\}\}")
    remapped = pattern.sub(
        lambda match: "{{" + new_name + (match.group(1) or "") + "}}",
        value,
    )
    return remapped if remapped != value else None
