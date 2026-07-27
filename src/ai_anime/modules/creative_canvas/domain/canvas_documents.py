"""Creative Canvas document graph rules."""

from __future__ import annotations

import hashlib


def first_text_value(source: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = str(source.get(key) or "").strip()
        if value:
            return value
    return ""


def _string_id_set(value: object) -> set[str]:
    if isinstance(value, (list, tuple, set)):
        items = value
    elif value is None:
        return set()
    else:
        items = [value]
    out: set[str] = set()
    for item in items:
        if isinstance(item, dict):
            text = (
                item.get("identity_id")
                or item.get("identityId")
                or item.get("prop_id")
                or item.get("propId")
                or item.get("id")
            )
        else:
            text = item
        text = str(text or "").strip()
        if text:
            out.add(text)
    return out


def detected_reference_ids_from_beat_context_data(
    data: dict,
    role: str,
) -> set[str] | None:
    if role == "identity":
        snake_key = "detected_identities"
        camel_key = "detectedIdentities"
    elif role == "prop":
        snake_key = "detected_props"
        camel_key = "detectedProps"
    else:
        return None

    edit_fields = data.get("beat_edit_fields")
    if isinstance(edit_fields, dict) and snake_key in edit_fields:
        return _string_id_set(edit_fields.get(snake_key))

    snapshot = data.get("snapshot")
    if isinstance(snapshot, dict) and camel_key in snapshot:
        return _string_id_set(snapshot.get(camel_key))

    for key in (snake_key, camel_key):
        if key in data:
            return _string_id_set(data.get(key))

    contexts = data.get("mainline_context")
    if isinstance(contexts, list):
        for item in contexts:
            if isinstance(item, dict) and item.get("kind") == "beat" and camel_key in item:
                return _string_id_set(item.get(camel_key))
    return None


def _reference_id_from_edge(edge: dict, role: str) -> str:
    data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
    target = data.get("reference_target")
    if isinstance(target, dict):
        if role == "identity":
            value = target.get("identity_id") or target.get("identityId")
        else:
            value = target.get("prop_id") or target.get("propId")
        value = str(value or "").strip()
        if value:
            return value
    handle = str(edge.get("targetHandle") or "")
    prefix = f"{role}:"
    if handle.startswith(prefix):
        return handle[len(prefix) :].strip()
    return ""


def _reference_id_from_node(node: dict, role: str) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    source = data.get("__freezone_source")
    meta = (
        source.get("meta")
        if isinstance(source, dict) and isinstance(source.get("meta"), dict)
        else {}
    )
    if role == "identity":
        value = first_text_value(meta, ("identity_id", "identityId", "character"))
    elif role == "prop":
        value = first_text_value(meta, ("prop_id", "propId"))
    else:
        return ""
    if value:
        return value

    contexts = data.get("mainline_context")
    if isinstance(contexts, list):
        for context in contexts:
            if not isinstance(context, dict):
                continue
            kind = str(context.get("kind") or "").strip()
            if role == "identity" and kind == "identity":
                value = first_text_value(
                    context,
                    ("identityId", "identity_id", "character"),
                )
            elif role == "prop" and kind == "prop":
                value = first_text_value(context, ("propId", "prop_id"))
            else:
                value = ""
            if value:
                return value
    return ""


def _reference_target_for_role(role: str, ref_id: str) -> dict:
    if role == "identity":
        return {"kind": "identity", "identity_id": ref_id}
    return {"kind": "prop", "prop_id": ref_id}


def _synced_reference_edge_id(
    *,
    source_id: str,
    target_id: str,
    role: str,
    ref_id: str,
    existing_ids: set[str],
) -> str:
    digest = hashlib.sha256(
        f"{source_id}\0{target_id}\0{role}\0{ref_id}".encode("utf-8")
    )
    base_id = f"edge_{role}_{digest.hexdigest()[:16]}"
    edge_id = base_id
    suffix = 2
    while edge_id in existing_ids:
        edge_id = f"{base_id}_{suffix}"
        suffix += 1
    existing_ids.add(edge_id)
    return edge_id


def _synced_reference_edge(
    *,
    source_id: str,
    target_id: str,
    role: str,
    ref_id: str,
    existing_ids: set[str],
) -> dict:
    label = "Identity" if role == "identity" else "Prop"
    return {
        "id": _synced_reference_edge_id(
            source_id=source_id,
            target_id=target_id,
            role=role,
            ref_id=ref_id,
            existing_ids=existing_ids,
        ),
        "source": source_id,
        "target": target_id,
        "targetHandle": f"{role}:{ref_id}",
        "data": {
            "edgeKind": "role_binding",
            "role": role,
            "label": label,
            "reference_target": _reference_target_for_role(role, ref_id),
        },
    }


def sync_frame_context_reference_edges(payload: dict) -> None:
    nodes = [node for node in payload.get("nodes") or [] if isinstance(node, dict)]
    edges = [edge for edge in payload.get("edges") or [] if isinstance(edge, dict)]
    node_by_id = {str(node.get("id")): node for node in nodes if node.get("id")}
    frame_skill_ids = {
        node_id
        for node_id, node in node_by_id.items()
        if ((node.get("data") if isinstance(node.get("data"), dict) else {}) or {}).get(
            "skill_id"
        )
        == "freezone.frame_from_context"
    }
    if not frame_skill_ids:
        return

    allowed_by_skill: dict[str, dict[str, set[str] | None]] = {}
    for edge in edges:
        data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        if data.get("role") != "beat_context":
            continue
        skill_id = str(edge.get("target") or "")
        if skill_id not in frame_skill_ids:
            continue
        context_node = node_by_id.get(str(edge.get("source") or ""))
        context_data = (
            context_node.get("data")
            if context_node and isinstance(context_node.get("data"), dict)
            else {}
        )
        allowed_by_skill[skill_id] = {
            "identity": detected_reference_ids_from_beat_context_data(
                context_data,
                "identity",
            ),
            "prop": detected_reference_ids_from_beat_context_data(
                context_data,
                "prop",
            ),
        }
    if not allowed_by_skill:
        return

    pruned_edges: list[dict] = []
    for edge in edges:
        target = str(edge.get("target") or "")
        data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        role = str(data.get("role") or "")
        allowed = allowed_by_skill.get(target, {}).get(role)
        if role in {"identity", "prop"} and allowed is not None:
            ref_id = _reference_id_from_edge(edge, role)
            if ref_id and ref_id not in allowed:
                continue
        pruned_edges.append(edge)

    source_by_role_ref: dict[str, dict[str, str]] = {"identity": {}, "prop": {}}
    for node in nodes:
        source_id = str(node.get("id") or "").strip()
        if not source_id:
            continue
        for role in ("identity", "prop"):
            ref_id = _reference_id_from_node(node, role)
            if ref_id:
                source_by_role_ref[role].setdefault(ref_id, source_id)

    existing_ids = {str(edge.get("id") or "") for edge in pruned_edges if edge.get("id")}
    existing_refs_by_skill_role: dict[tuple[str, str], set[str]] = {}
    for edge in pruned_edges:
        target = str(edge.get("target") or "")
        data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        role = str(data.get("role") or "")
        if role not in {"identity", "prop"}:
            continue
        ref_id = _reference_id_from_edge(edge, role)
        if ref_id:
            existing_refs_by_skill_role.setdefault((target, role), set()).add(ref_id)

    for skill_id, allowed_by_role in allowed_by_skill.items():
        for role in ("identity", "prop"):
            allowed = allowed_by_role.get(role)
            if allowed is None:
                continue
            existing_refs = existing_refs_by_skill_role.setdefault((skill_id, role), set())
            for ref_id in sorted(allowed):
                if ref_id in existing_refs:
                    continue
                source_id = source_by_role_ref[role].get(ref_id)
                if not source_id:
                    continue
                pruned_edges.append(
                    _synced_reference_edge(
                        source_id=source_id,
                        target_id=skill_id,
                        role=role,
                        ref_id=ref_id,
                        existing_ids=existing_ids,
                    )
                )
                existing_refs.add(ref_id)
    payload["edges"] = pruned_edges


def is_preset_managed_canvas_node(node: dict) -> bool:
    """Return whether the current protocol explicitly grants preset ownership."""
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    if not isinstance(data, dict):
        return False
    return data.get("preset_managed") is True


def merge_restored_preset_canvas(
    new_payload: dict,
    existing_payload: dict | None,
) -> dict:
    """Refresh preset-managed graph while preserving user experiment nodes."""
    if not isinstance(existing_payload, dict):
        return new_payload

    new_nodes = [n for n in new_payload.get("nodes") or [] if isinstance(n, dict)]
    new_edges = [e for e in new_payload.get("edges") or [] if isinstance(e, dict)]
    new_node_ids = {str(n.get("id")) for n in new_nodes if n.get("id")}
    new_edge_ids = {str(e.get("id")) for e in new_edges if e.get("id")}

    preserved_nodes: list[dict] = []
    for node in existing_payload.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or "")
        if not node_id:
            preserved_nodes.append(node)
            continue
        if node_id in new_node_ids:
            continue
        if is_preset_managed_canvas_node(node):
            continue
        preserved_nodes.append(node)

    final_node_ids = new_node_ids | {
        str(node.get("id")) for node in preserved_nodes if node.get("id")
    }
    preset_managed_node_ids = {
        str(node.get("id"))
        for node in [*new_nodes, *preserved_nodes]
        if node.get("id") and is_preset_managed_canvas_node(node)
    }
    preserved_edges: list[dict] = []
    for edge in existing_payload.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        edge_id = str(edge.get("id") or "")
        if edge_id and edge_id in new_edge_ids:
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        if source not in final_node_ids or target not in final_node_ids:
            continue
        edge_data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        if (
            source in preset_managed_node_ids
            and target in preset_managed_node_ids
            and edge_data.get("edgeKind") != "role_binding"
        ):
            continue
        preserved_edges.append(edge)

    new_payload["nodes"] = [*new_nodes, *preserved_nodes]
    new_payload["edges"] = [*new_edges, *preserved_edges]
    new_payload["viewport"] = existing_payload.get("viewport") or new_payload.get(
        "viewport"
    )
    return new_payload


def stamp_canvas_mainline_context_project_id(payload: dict, project_id: str) -> None:
    def stamp_contexts(value: object) -> None:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and item.get("kind") and not item.get("projectId"):
                    item["projectId"] = project_id

    stamp_contexts(payload.get("mainline_context"))
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        for ref in metadata.get("references") or []:
            if isinstance(ref, dict):
                stamp_contexts(ref.get("mainline_context"))
    for node in payload.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        data = node.get("data")
        if isinstance(data, dict):
            stamp_contexts(data.get("mainline_context"))


__all__ = [
    "detected_reference_ids_from_beat_context_data",
    "first_text_value",
    "is_preset_managed_canvas_node",
    "merge_restored_preset_canvas",
    "stamp_canvas_mainline_context_project_id",
    "sync_frame_context_reference_edges",
]
