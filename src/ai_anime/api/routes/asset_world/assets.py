"""Unified asset lookup endpoints."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Depends

from ai_anime.api.routes.identity_access.dependencies import get_api_user
from ai_anime.api.deps import make_sqlite_store_for_context, resolve_project_scope
from ai_anime.modules.production.public import (
    real_detected_identities,
    real_detected_props,
)
from ai_anime.modules.narrative_planning.public import beat_scene_id

router = APIRouter()

VALID_REFERENCE_TYPES = {"identity", "scene", "prop"}
_PROP_MARKER_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")


def _json_list(value: object) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        try:
            raw = json.loads(str(value or "[]"))
        except (TypeError, ValueError, json.JSONDecodeError):
            raw = []
    return [str(item or "").strip() for item in raw if str(item or "").strip()]


def _marked_props(visual_description: object) -> set[str]:
    return {
        match.strip()
        for match in _PROP_MARKER_PATTERN.findall(str(visual_description or ""))
        if match.strip()
    }


def _build_asset_reference_index(beats: Iterable[object]) -> dict[str, Any]:
    references: dict[str, dict[str, list[dict[str, int]]]] = {
        "identity": {},
        "scene": {},
        "prop": {},
    }
    scene_co_occurrences: dict[str, dict[str, set[str]]] = {}

    def append_reference(
        asset_type: str,
        asset_id: str,
        reference: dict[str, int],
    ) -> None:
        references[asset_type].setdefault(asset_id, []).append(reference)

    for beat in beats:
        episode = int(getattr(beat, "episode_number", 0) or 0)
        beat_number = int(getattr(beat, "beat_number", 0) or 0)
        reference = {"episode": episode, "beat_number": beat_number}
        scene_id = str(beat_scene_id(beat) or "").strip()
        detected_identities = {
            str(item or "").strip()
            for item in real_detected_identities(
                _json_list(getattr(beat, "detected_identities_json", "[]"))
            )
            if str(item or "").strip()
        }
        detected_props = {
            str(item or "").strip()
            for item in real_detected_props(
                _json_list(getattr(beat, "detected_props_json", "[]"))
            )
            if str(item or "").strip()
        }
        detected_props.update(
            _marked_props(getattr(beat, "visual_description", ""))
        )

        for identity_id in sorted(detected_identities):
            append_reference("identity", identity_id, reference)
        for prop_id in sorted(detected_props):
            append_reference("prop", prop_id, reference)
        if scene_id:
            append_reference("scene", scene_id, reference)
            bucket = scene_co_occurrences.setdefault(
                scene_id,
                {"identities": set(), "props": set()},
            )
            bucket["identities"].update(detected_identities)
            bucket["props"].update(detected_props)

    return {
        "references": references,
        "scene_co_occurrences": {
            scene_id: {
                "identities": sorted(bucket["identities"]),
                "props": sorted(bucket["props"]),
            }
            for scene_id, bucket in scene_co_occurrences.items()
        },
    }


async def _load_asset_reference_index(resolved) -> dict[str, Any]:
    store = await make_sqlite_store_for_context(resolved.ctx)
    try:
        beats = await store.list_visual_beats()
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()
    return _build_asset_reference_index(beats)


@router.get("/projects/{project}/assets/references")
async def get_project_asset_references(
    project: str,
    user: dict = Depends(get_api_user),
):
    """Return the complete project asset-reference index in one request."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    return {"ok": True, "data": await _load_asset_reference_index(resolved)}


@router.get("/projects/{project}/assets/{asset_type}/{asset_id}/references")
async def get_asset_references(
    project: str,
    asset_type: str,
    asset_id: str,
    user: dict = Depends(get_api_user),
):
    """Return beat references for a character identity, scene, or prop asset.

    Matching follows the persisted beat contract:
    - identity: ``detected_identities`` stores ``identity_id``.
    - scene: ``scene_ref.scene_id`` stores the scene ``name``.
    - prop: ``detected_props`` stores the prop ``name`` / episode prop id.
    """
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    normalized_type = str(asset_type or "").strip().lower()
    target_id = str(asset_id or "").strip()
    if normalized_type not in VALID_REFERENCE_TYPES:
        return {"ok": False, "error": f"Unsupported asset type: {asset_type}"}
    if not target_id:
        return {"ok": False, "error": "Asset id is required"}

    index = await _load_asset_reference_index(resolved)
    references_by_type = index["references"]
    references = references_by_type[normalized_type].get(target_id, [])
    data: dict[str, object] = {"beats": references}
    if normalized_type == "scene":
        co_occurrence = index["scene_co_occurrences"].get(
            target_id,
            {"identities": [], "props": []},
        )
        data["co_identities"] = co_occurrence["identities"]
        data["co_props"] = co_occurrence["props"]
    return {"ok": True, "data": data}
