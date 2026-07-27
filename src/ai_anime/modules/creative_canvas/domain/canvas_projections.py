"""Creative Canvas projected-subgraph rules."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from typing import Any

from ai_anime.modules.creative_canvas.domain.canvas_documents import (
    is_preset_managed_canvas_node,
)


def _is_replaceable_projection_node(node: dict, projection_key: str) -> bool:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    if data.get("user_spawned") is True:
        return False
    return (
        data.get("preset_managed") is True
        and data.get("projection_key") == projection_key
    )


def _is_replaceable_projection_edge(edge: dict, projection_key: str) -> bool:
    data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
    if data.get("user_spawned") is True:
        return False
    return (
        data.get("preset_managed") is True
        and data.get("projection_key") == projection_key
    )


def _archive_projection_node(node: dict) -> dict:
    archived = dict(node)
    data = dict(
        archived.get("data") if isinstance(archived.get("data"), dict) else {}
    )
    projection_key = data.get("projection_key")
    data.pop("preset_managed", None)
    data.pop("projection_key", None)
    if isinstance(projection_key, str) and projection_key:
        data["source_projection_key"] = projection_key
    data["projection_archived"] = True
    data["user_spawned"] = True
    archived["data"] = data
    return archived


def _user_owned_projection_node(node: dict) -> dict:
    """Return a user-owned node with projection management fields removed."""
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    if not isinstance(data, dict) or data.get("user_spawned") is not True:
        return node
    projection_key = data.get("projection_key")
    if not projection_key and data.get("preset_managed") is not True:
        return node
    cleaned = dict(node)
    next_data = dict(data)
    next_data.pop("preset_managed", None)
    next_data.pop("projection_key", None)
    if isinstance(projection_key, str) and projection_key:
        next_data.setdefault("source_projection_key", projection_key)
    cleaned["data"] = next_data
    return cleaned


def merge_projected_preset_canvas(
    *,
    incoming_payload: dict,
    existing_payload: dict | None,
    projection_key: str,
) -> dict:
    """Refresh one projected preset subgraph without deleting user work.

    Only backend-owned nodes and edges matching ``projection_key`` are
    replaceable. User-spawned nodes, ordinary nodes, other projections, and
    user edges are preserved. If a user edge still points at an old preset
    node that the new projection no longer emits, the old node is archived
    into user-owned data instead of leaving a dangling edge.
    """
    if not isinstance(existing_payload, dict):
        return incoming_payload

    incoming_nodes = [
        node
        for node in incoming_payload.get("nodes") or []
        if isinstance(node, dict)
    ]
    incoming_edges = [
        edge
        for edge in incoming_payload.get("edges") or []
        if isinstance(edge, dict)
    ]
    incoming_node_ids = {
        node.get("id")
        for node in incoming_nodes
        if isinstance(node.get("id"), str)
    }
    existing_nodes = [
        node
        for node in existing_payload.get("nodes") or []
        if isinstance(node, dict)
    ]
    existing_edges = [
        edge
        for edge in existing_payload.get("edges") or []
        if isinstance(edge, dict)
    ]

    user_edge_endpoints: set[str] = set()
    for edge in existing_edges:
        if _is_replaceable_projection_edge(edge, projection_key):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if isinstance(source, str):
            user_edge_endpoints.add(source)
        if isinstance(target, str):
            user_edge_endpoints.add(target)

    merged_nodes: list[dict] = []
    existing_replaceable_nodes_by_id = {
        node.get("id"): node
        for node in existing_nodes
        if isinstance(node.get("id"), str)
        and _is_replaceable_projection_node(node, projection_key)
    }
    next_incoming_nodes: list[dict] = []
    for node in incoming_nodes:
        node_id = node.get("id")
        existing_node = existing_replaceable_nodes_by_id.get(node_id)
        if isinstance(existing_node, dict) and node.get("type") == existing_node.get(
            "type"
        ):
            updated_node = dict(node)
            for layout_key in (
                "position",
                "style",
                "width",
                "height",
                "parentId",
                "extent",
            ):
                if layout_key in existing_node:
                    value = existing_node[layout_key]
                    updated_node[layout_key] = (
                        dict(value) if isinstance(value, dict) else value
                    )
            next_incoming_nodes.append(updated_node)
            continue
        next_incoming_nodes.append(node)

    for node in existing_nodes:
        node_id = node.get("id")
        if not _is_replaceable_projection_node(node, projection_key):
            merged_nodes.append(_user_owned_projection_node(node))
            continue
        if node_id in incoming_node_ids:
            continue
        if isinstance(node_id, str) and node_id in user_edge_endpoints:
            merged_nodes.append(_archive_projection_node(node))
    merged_nodes.extend(next_incoming_nodes)

    final_node_ids = {
        node.get("id") for node in merged_nodes if isinstance(node.get("id"), str)
    }
    merged_edges: list[dict] = []
    for edge in existing_edges:
        if _is_replaceable_projection_edge(edge, projection_key):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if isinstance(source, str) and source not in final_node_ids:
            continue
        if isinstance(target, str) and target not in final_node_ids:
            continue
        merged_edges.append(edge)
    merged_edges.extend(incoming_edges)

    merged = dict(existing_payload)
    merged["nodes"] = merged_nodes
    merged["edges"] = merged_edges
    metadata = dict(
        existing_payload.get("metadata")
        if isinstance(existing_payload.get("metadata"), dict)
        else {}
    )
    incoming_metadata = (
        incoming_payload.get("metadata")
        if isinstance(incoming_payload.get("metadata"), dict)
        else {}
    )
    projections = dict(
        metadata.get("projections")
        if isinstance(metadata.get("projections"), dict)
        else {}
    )
    incoming_projections = (
        incoming_metadata.get("projections")
        if isinstance(incoming_metadata.get("projections"), dict)
        else {}
    )
    if projection_key in incoming_projections:
        projections[projection_key] = incoming_projections[projection_key]
    metadata["projections"] = projections
    metadata["last_projection_key"] = projection_key
    merged["metadata"] = metadata
    return merged


def remove_projected_preset_canvas(
    *,
    existing_payload: dict,
    projection_key: str,
) -> dict:
    """Remove one projected preset subgraph while preserving user work.

    Matching preset-managed projection nodes and edges are removed.
    User-spawned nodes are preserved even when they carry the same projection
    key as provenance; edges dangling after projection removal are dropped.
    """
    if not isinstance(existing_payload, dict):
        return existing_payload

    existing_nodes = [
        node
        for node in existing_payload.get("nodes") or []
        if isinstance(node, dict)
    ]
    existing_edges = [
        edge
        for edge in existing_payload.get("edges") or []
        if isinstance(edge, dict)
    ]
    kept_nodes = [
        _user_owned_projection_node(node)
        for node in existing_nodes
        if not _is_replaceable_projection_node(node, projection_key)
    ]
    kept_node_ids = {
        node.get("id") for node in kept_nodes if isinstance(node.get("id"), str)
    }

    kept_edges: list[dict] = []
    for edge in existing_edges:
        if _is_replaceable_projection_edge(edge, projection_key):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if isinstance(source, str) and source not in kept_node_ids:
            continue
        if isinstance(target, str) and target not in kept_node_ids:
            continue
        kept_edges.append(edge)

    merged = dict(existing_payload)
    merged["nodes"] = kept_nodes
    merged["edges"] = kept_edges
    metadata = dict(
        existing_payload.get("metadata")
        if isinstance(existing_payload.get("metadata"), dict)
        else {}
    )
    projections = dict(
        metadata.get("projections")
        if isinstance(metadata.get("projections"), dict)
        else {}
    )
    projections.pop(projection_key, None)
    metadata["projections"] = projections
    if metadata.get("last_projection_key") == projection_key:
        metadata.pop("last_projection_key", None)
    merged["metadata"] = metadata
    return merged


_PRESET_FACTS_SIGNATURE_OMIT_KEYS = {
    "created_at",
    "createdAt",
    "dragging",
    "measured",
    "position",
    "revision",
    "resizing",
    "selected",
    "updated_at",
    "updatedAt",
}


def _canonical_preset_facts_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _canonical_preset_facts_value(raw_value)
            for key, raw_value in sorted(value.items())
            if key not in _PRESET_FACTS_SIGNATURE_OMIT_KEYS
            and not (isinstance(key, str) and key.startswith("__runtime"))
        }
    if isinstance(value, list):
        return [_canonical_preset_facts_value(item) for item in value]
    return value


def preset_facts_signature(payload: Mapping[str, Any]) -> str:
    nodes = [
        node
        for node in payload.get("nodes") or []
        if isinstance(node, dict) and is_preset_managed_canvas_node(node)
    ]
    preset_node_ids = {str(node.get("id")) for node in nodes if node.get("id")}
    edges: list[dict] = []
    for edge in payload.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if (
            data.get("preset_managed") is True
            or source in preset_node_ids
            or target in preset_node_ids
        ):
            edges.append(edge)
    canonical = {
        "nodes": sorted(
            (_canonical_preset_facts_value(node) for node in nodes),
            key=lambda node: (
                str(node.get("id") or "") if isinstance(node, dict) else ""
            ),
        ),
        "edges": sorted(
            (_canonical_preset_facts_value(edge) for edge in edges),
            key=lambda edge: (
                str(edge.get("source") or "") if isinstance(edge, dict) else "",
                str(edge.get("target") or "") if isinstance(edge, dict) else "",
                str(edge.get("id") or "") if isinstance(edge, dict) else "",
            ),
        ),
    }
    return _stable_json_digest(canonical)


def stamp_preset_facts_signature(payload: dict, signature: str) -> None:
    metadata = payload.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
        payload["metadata"] = metadata
    preset = metadata.setdefault("preset", {})
    if not isinstance(preset, dict):
        preset = {}
        metadata["preset"] = preset
    preset["facts_signature"] = signature


def stamp_projection_key(payload: dict, projection_key: str) -> None:
    nodes = [
        node
        for node in payload.get("nodes") or []
        if isinstance(node, dict) and is_preset_managed_canvas_node(node)
    ]
    preset_node_ids = {str(node.get("id")) for node in nodes if node.get("id")}
    for node in nodes:
        data = node.setdefault("data", {})
        if isinstance(data, dict):
            data["preset_managed"] = True
            data["projection_key"] = projection_key
    for edge in payload.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        data = edge.setdefault("data", {})
        if not isinstance(data, dict):
            data = {}
            edge["data"] = data
        if (
            data.get("preset_managed") is True
            or source in preset_node_ids
            or target in preset_node_ids
        ):
            data["preset_managed"] = True
            data["projection_key"] = projection_key


def default_push_target_for_preset(request: Mapping[str, Any]) -> dict[str, Any]:
    scope = request.get("scope")
    if scope == "episode":
        return {"kind": "manual", "episode": request.get("episode")}
    if scope == "beat":
        slot = request.get("primary_slot") or "render"
        return {
            "kind": "director_render" if slot == "render" else slot,
            "episode": request.get("episode"),
            "beat": request.get("beat"),
        }

    asset_kind = request.get("asset_kind")
    if scope == "asset" and asset_kind in {"identity", "portrait", "character"}:
        if asset_kind in {"portrait", "character"}:
            return {"kind": "portrait", "character": request.get("character")}
        return {
            "kind": "identity",
            "character": request.get("character"),
            "identity_id": request.get("identity_id"),
        }
    if scope == "asset" and asset_kind in {
        "scene",
        "scene_master",
        "scene_reverse_master",
        "scene_spatial_layout",
        "scene_360",
        "scene_director_pano_360",
        "scene_3gs_active_ply",
        "scene_3gs_master_ply",
        "scene_3gs_reverse_ply",
        "scene_3gs_pano_ply",
        "scene_3gs_custom_scene",
        "scene_3gs_collision_glb",
    }:
        scene_id = (
            request.get("asset_id")
            or request.get("identity_id")
            or request.get("character")
        )
        scene_kind = "scene_master" if asset_kind == "scene" else asset_kind
        return {"kind": scene_kind, "scene_id": scene_id}
    if scope == "asset" and asset_kind in {"prop", "prop_ref"}:
        prop_id = (
            request.get("asset_id")
            or request.get("identity_id")
            or request.get("character")
        )
        return {"kind": "prop_ref", "prop_id": prop_id}
    return {"kind": "manual"}


def projection_group_label(request: Mapping[str, Any]) -> str:
    scope = request.get("scope")
    episode = request.get("episode")
    beat = request.get("beat")
    if scope == "beat" and episode is not None and beat is not None:
        return f"EP{episode}/B{beat}"
    if scope == "episode" and episode is not None:
        return f"EP{episode}"
    if scope == "asset":
        for key in ("character", "asset_id", "identity_id", "asset_kind"):
            value = request.get(key)
            if value:
                return str(value)
    return str(request.get("projection_key") or "")


def stamp_projection_metadata(
    payload: dict,
    *,
    projection_key: str,
    preset_key: str,
    request: Mapping[str, Any],
    facts_signature: str,
    last_synced_at: str,
) -> None:
    metadata = payload.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
        payload["metadata"] = metadata
    metadata.pop("preset", None)
    projections = metadata.setdefault("projections", {})
    if not isinstance(projections, dict):
        projections = {}
        metadata["projections"] = projections
    projections[projection_key] = {
        "projection_key": projection_key,
        "preset_key": preset_key,
        "scope": request.get("scope"),
        "request": dict(request),
        "facts_signature": facts_signature,
        "last_synced_at": last_synced_at,
    }
    metadata["last_projection_key"] = projection_key


def projection_facts_signature_from_payload(
    payload: Mapping[str, Any] | None,
    projection_key: str,
) -> str:
    if not isinstance(payload, Mapping):
        return ""
    metadata = payload.get("metadata")
    if not isinstance(metadata, Mapping):
        return ""
    projections = metadata.get("projections")
    if not isinstance(projections, Mapping):
        return ""
    projection = projections.get(projection_key)
    if not isinstance(projection, Mapping):
        return ""
    signature = projection.get("facts_signature")
    return signature if isinstance(signature, str) else ""


def preset_facts_signature_from_payload(
    payload: Mapping[str, Any] | None,
) -> str:
    if not isinstance(payload, Mapping):
        return ""
    metadata = payload.get("metadata")
    preset = metadata.get("preset") if isinstance(metadata, Mapping) else None
    if not isinstance(preset, Mapping):
        return ""
    signature = preset.get("facts_signature")
    return signature if isinstance(signature, str) else ""


def _projection_group_id(projection_key: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", projection_key).strip("_").lower()
    if not slug:
        slug = _projection_key_digest(projection_key)[:12]
    if len(slug) > 48:
        slug = f"{slug[:35]}_{_projection_key_digest(projection_key)[:12]}"
    return f"projection_group_{slug}"


def _projection_key_digest(projection_key: str) -> str:
    return _stable_json_digest({"projection_key": projection_key})


def _stable_json_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _node_display_size(node: dict) -> tuple[float, float]:
    style = node.get("style") if isinstance(node.get("style"), dict) else {}
    raw_width = node.get("width") or style.get("width")
    raw_height = node.get("height") or style.get("height")
    try:
        width = float(raw_width)
    except (TypeError, ValueError):
        width = 320.0
    try:
        height = float(raw_height)
    except (TypeError, ValueError):
        height = 180.0
    return max(1.0, width), max(1.0, height)


def wrap_projection_payload_in_group(
    payload: dict,
    *,
    projection_key: str,
    label: str,
) -> dict:
    nodes = [node for node in payload.get("nodes") or [] if isinstance(node, dict)]
    child_nodes = [
        node
        for node in nodes
        if node.get("type") != "groupNode"
        and _is_replaceable_projection_node(node, projection_key)
    ]
    if not child_nodes:
        return payload

    bounds = {
        "min_x": float("inf"),
        "min_y": float("inf"),
        "max_x": float("-inf"),
        "max_y": float("-inf"),
    }
    for node in child_nodes:
        position = node.get("position") if isinstance(node.get("position"), dict) else {}
        try:
            x = float(position.get("x") or 0)
        except (TypeError, ValueError):
            x = 0.0
        try:
            y = float(position.get("y") or 0)
        except (TypeError, ValueError):
            y = 0.0
        width, height = _node_display_size(node)
        bounds["min_x"] = min(bounds["min_x"], x)
        bounds["min_y"] = min(bounds["min_y"], y)
        bounds["max_x"] = max(bounds["max_x"], x + width)
        bounds["max_y"] = max(bounds["max_y"], y + height)

    if not all(
        map(
            lambda value: value != float("inf") and value != float("-inf"),
            bounds.values(),
        )
    ):
        return payload

    side_padding = 20
    top_padding = 34
    bottom_padding = 20
    group_x = round(bounds["min_x"] - side_padding)
    group_y = round(bounds["min_y"] - top_padding)
    group_width = round(
        max(220, bounds["max_x"] - bounds["min_x"] + side_padding * 2)
    )
    group_height = round(
        max(
            140,
            bounds["max_y"]
            - bounds["min_y"]
            + top_padding
            + bottom_padding,
        )
    )
    group_id = _projection_group_id(projection_key)
    group_node = {
        "id": group_id,
        "type": "groupNode",
        "position": {"x": group_x, "y": group_y},
        "style": {"width": group_width, "height": group_height},
        "data": {
            "label": label,
            "displayName": label,
            "preset_managed": True,
            "projection_key": projection_key,
        },
    }

    child_ids = {str(node.get("id")) for node in child_nodes if node.get("id")}
    next_nodes: list[dict] = []
    inserted_group = False
    for node in nodes:
        if not inserted_group and str(node.get("id") or "") in child_ids:
            next_nodes.append(group_node)
            inserted_group = True
        if str(node.get("id") or "") not in child_ids:
            if node.get("id") != group_id:
                next_nodes.append(node)
            continue
        updated = dict(node)
        position = (
            updated.get("position")
            if isinstance(updated.get("position"), dict)
            else {}
        )
        try:
            x = float(position.get("x") or 0)
        except (TypeError, ValueError):
            x = 0.0
        try:
            y = float(position.get("y") or 0)
        except (TypeError, ValueError):
            y = 0.0
        updated["parentId"] = group_id
        updated["extent"] = "parent"
        updated["position"] = {
            "x": round(x - group_x),
            "y": round(y - group_y),
        }
        next_nodes.append(updated)

    if not inserted_group:
        next_nodes.insert(0, group_node)
    payload["nodes"] = next_nodes
    return payload


__all__ = [
    "default_push_target_for_preset",
    "merge_projected_preset_canvas",
    "preset_facts_signature",
    "preset_facts_signature_from_payload",
    "projection_facts_signature_from_payload",
    "projection_group_label",
    "remove_projected_preset_canvas",
    "stamp_preset_facts_signature",
    "stamp_projection_key",
    "stamp_projection_metadata",
    "wrap_projection_payload_in_group",
]
