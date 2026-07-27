"""Creative Canvas asset-library projection rules."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote, urlencode


CREATIVE_CANVAS_SCENE_LIBRARY_ROLES = frozenset(
    {
        "scene_master",
        "scene_reverse_master",
        "scene_director_pano_360",
        "scene_3gs_master_ply",
        "scene_3gs_reverse_ply",
        "scene_3gs_pano_ply",
        "scene_3gs_custom_scene",
    }
)


def project_creative_canvas_asset_record(
    *,
    project_id: str,
    tab: str,
    kind: str,
    role: str,
    label: str,
    relative_path: str,
    url: str | None,
    exists: bool,
    sublabel: str = "",
    aspect_ratio: str = "1:1",
    meta: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    metadata = dict(meta or {})
    record: dict[str, Any] = {
        "id": f"{kind}:{role}:{relative_path}",
        "tab": tab,
        "kind": kind,
        "role": role,
        "label": label,
        "sublabel": sublabel,
        "rel_path": relative_path,
        "url": url,
        "exists": exists,
        "media_type": creative_canvas_asset_media_type(relative_path),
        "aspect_ratio": aspect_ratio,
        "meta": metadata,
    }
    slot_target = creative_canvas_slot_target_for_asset(
        kind=kind,
        role=role,
        meta=metadata,
    )
    if slot_target is not None:
        record["slot_target"] = slot_target
        record["pushable"] = bool(exists)
    director_control_bundle = creative_canvas_director_control_bundle(
        role=role,
        relative_path=relative_path,
        url=url,
    )
    if director_control_bundle is not None:
        record["director_control_bundle"] = director_control_bundle
    contexts = creative_canvas_mainline_context_for_asset(
        project_id=project_id,
        kind=kind,
        role=role,
        label=label,
        source_url=url,
        meta=metadata,
    )
    if contexts:
        record["mainline_context"] = contexts
    history_links = creative_canvas_character_asset_history_links(
        project_id,
        role,
        metadata,
    )
    if history_links is not None:
        record.update(history_links)
    return record


def project_creative_canvas_beat_context_asset(
    *,
    ref: Mapping[str, Any],
    project_id: str,
    episode: int,
    beat: int,
    beat_facts: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    relative_path = str(ref.get("rel_path") or "")
    kind = str(ref.get("kind") or "reference")
    role = str(ref.get("role") or "reference")
    if relative_path.startswith("freezone/") and not (
        _is_mainline_beat_director_control_ref(role, relative_path)
        or _is_mainline_beat_selected_background_ref(role, relative_path)
    ):
        return None
    if _is_beat_director_control_path(relative_path) and not (
        _is_mainline_beat_director_control_ref(role, relative_path)
        or _is_mainline_beat_selected_background_ref(role, relative_path)
    ):
        return None
    if _is_beat_context_metadata_ref(kind, role, relative_path):
        return None
    if role not in {
        "current_sketch",
        "current_frame",
        "current_video",
        "current_audio",
        "director_combined",
        "selected_background",
    }:
        return None

    url = ref.get("url")
    exists = bool(ref.get("exists"))
    label = str(ref.get("label") or role or kind)
    raw_meta = ref.get("meta")
    metadata = dict(raw_meta) if isinstance(raw_meta, Mapping) else {}
    merged_meta = {
        **metadata,
        **dict(beat_facts or {}),
        "episode": int(episode),
        "beat": int(beat),
    }
    record: dict[str, Any] = {
        "id": (
            f"beat:{int(episode):03d}:{int(beat):03d}:"
            f"{kind}:{role}:{relative_path or label}"
        ),
        "tab": _tab_for_beat_context_ref(kind, role),
        "kind": kind,
        "role": role,
        "label": label,
        "sublabel": f"EP{int(episode)} / Beat {int(beat)}",
        "rel_path": relative_path or None,
        "url": url if exists else None,
        "exists": exists,
        "media_type": str(ref.get("media_type") or "image"),
        "aspect_ratio": str(ref.get("aspect_ratio") or "1:1"),
        "meta": merged_meta,
    }
    slot_target = creative_canvas_slot_target_for_asset(
        kind=kind,
        role=role,
        meta=merged_meta,
    )
    if slot_target is not None:
        record["slot_target"] = slot_target
        record["pushable"] = bool(exists)
    director_control_bundle = creative_canvas_director_control_bundle(
        role=role,
        relative_path=relative_path,
        url=str(url) if exists and url is not None else None,
    )
    if director_control_bundle is not None:
        record["director_control_bundle"] = director_control_bundle
    contexts = creative_canvas_mainline_context_for_asset(
        project_id=project_id,
        kind=kind,
        role=role,
        label=label,
        source_url=str(url) if exists and url is not None else None,
        meta=merged_meta,
    )
    if contexts:
        record["mainline_context"] = contexts
    return record


def creative_canvas_asset_media_type(relative_path: str) -> str:
    suffix = PurePosixPath(relative_path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return "image"
    if suffix in {".mp4", ".mov", ".webm"}:
        return "video"
    if suffix in {".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"}:
        return "audio"
    if suffix in {".json", ".txt", ".md"}:
        return "text"
    return "file"


def creative_canvas_slot_target_for_asset(
    *,
    kind: str,
    role: str,
    meta: Mapping[str, Any],
) -> dict[str, Any] | None:
    episode = meta.get("episode")
    beat = meta.get("beat")
    beat_roles = {
        "current_sketch": "sketch",
        "current_frame": "frame",
        "director_combined": "director_render",
        "current_video": "video",
        "current_audio": "beat_audio",
    }
    if role in beat_roles and episode and beat:
        return {"kind": beat_roles[role], "episode": episode, "beat": beat}

    character = meta.get("character")
    identity_id = meta.get("identity_id")
    identity_roles = {
        "character_identity": "identity",
        "identity_costume": "identity_costume",
        "identity_portrait": "identity_portrait",
    }
    if role in identity_roles and character and identity_id:
        return {
            "kind": identity_roles[role],
            "character": character,
            "identity_id": identity_id,
        }
    if role in {"character_portrait", "character_reference"} and character:
        return {"kind": "portrait", "character": character}

    prop_id = meta.get("prop_id")
    if (kind == "prop" or role.startswith("prop_")) and prop_id:
        return {"kind": "prop_ref", "prop_id": prop_id}

    scene_id = meta.get("scene_id") or meta.get("scene")
    if (
        role
        in {
            "scene_master",
            "scene_360",
            "scene_reverse_master",
            "scene_spatial_layout",
            "scene_director_pano_360",
            "scene_3gs_active_ply",
            "scene_3gs_master_ply",
            "scene_3gs_reverse_ply",
            "scene_3gs_pano_ply",
            "scene_3gs_custom_scene",
            "scene_3gs_collision_glb",
        }
        and scene_id
    ):
        return {"kind": role, "scene_id": scene_id}
    return None


def creative_canvas_mainline_context_for_asset(
    *,
    project_id: str,
    kind: str,
    role: str,
    label: str,
    source_url: str | None,
    meta: Mapping[str, Any],
) -> list[dict[str, Any]]:
    def base(context_kind: str, **extra: Any) -> dict[str, Any]:
        values = {
            "kind": context_kind,
            "projectId": project_id,
            "episode": meta.get("episode"),
            "beat": meta.get("beat"),
            "character": meta.get("character"),
            "identityId": meta.get("identity_id"),
            "sceneId": meta.get("scene_id") or meta.get("scene"),
            "propId": meta.get("prop_id"),
            "voiceId": meta.get("voice_id") or meta.get("slot"),
            "markerColor": meta.get("marker_color"),
            "visualDescription": meta.get("visual_description"),
            "narrationSegment": meta.get("narration_segment"),
            "detectedIdentities": meta.get("detected_identities"),
            "detectedProps": meta.get("detected_props"),
            "sketchColors": meta.get("sketch_colors"),
            "propMarkerColors": meta.get("prop_marker_colors"),
            "role": role,
            "label": label,
            "sourceUrl": source_url,
            **extra,
        }
        return {
            key: value for key, value in values.items() if value not in (None, "", [])
        }

    if role in {
        "character_identity",
        "character_portrait",
        "identity_portrait",
        "identity_costume",
    }:
        return [base("identity")]
    if role in {"character_voice", "character_age_group_voice", "identity_voice"}:
        return [base("voice", audioRole="character_voice")]
    if kind == "scene" or role.startswith("scene_"):
        return [base("scene", plyKind=meta.get("ply_kind"))]
    if kind == "prop" or role.startswith("prop_"):
        return [base("prop")]
    context_kind_by_role = {
        "current_sketch": "sketch",
        "current_frame": "frame",
        "current_video": "video",
        "director_combined": "director_combined",
        "selected_background": "selected_background",
    }
    if role in context_kind_by_role:
        return [base(context_kind_by_role[role])]
    if role == "current_audio":
        return [base("audio", audioRole="beat_audio")]
    return []


def creative_canvas_director_control_bundle(
    *,
    role: str,
    relative_path: str | None,
    url: str | None,
) -> dict[str, Any] | None:
    if role != "director_combined":
        return None
    relative = str(relative_path or "").strip()
    combined_url = str(url or "").strip()
    combined_url_path = combined_url.split("?", 1)[0]
    if not relative.endswith("/combined.png") or not combined_url_path.endswith(
        "/combined.png"
    ):
        return None
    relative_base = relative[: -len("/combined.png")]
    url_base = combined_url_path[: -len("/combined.png")]
    return {
        "schema_version": "director_control_bundle_v1",
        "rel_paths": {
            "combined": f"{relative_base}/combined.png",
            "env_only": f"{relative_base}/env_only.png",
            "frame_meta": f"{relative_base}/frame_meta.json",
        },
        "urls": {
            "combined": f"{url_base}/combined.png",
            "env_only": f"{url_base}/env_only.png",
            "frame_meta": f"{url_base}/frame_meta.json",
        },
    }


def creative_canvas_character_asset_history_links(
    project_id: str,
    role: str,
    meta: Mapping[str, Any],
) -> dict[str, str] | None:
    character = str(meta.get("character") or "").strip()
    if not character:
        return None
    kind_by_role = {
        "character_identity": "identity",
        "identity_costume": "identity_costume",
        "identity_portrait": "identity_portrait",
        "character_portrait": "portrait",
        "character_reference": "portrait",
    }
    asset_kind = kind_by_role.get(role)
    if not asset_kind:
        return None
    query = {"kind": asset_kind}
    identity_id = str(meta.get("identity_id") or "").strip()
    if asset_kind != "portrait":
        if not identity_id:
            return None
        query["identity_id"] = identity_id
    base = (
        f"/api/v1/projects/{quote(project_id, safe='')}/characters/"
        f"{quote(character, safe='')}"
    )
    return {
        "history_url": f"{base}/asset-history?{urlencode(query)}",
        "restore_url": f"{base}/asset-history/restore",
    }


def is_creative_canvas_scene_library_role(role: str) -> bool:
    return role in CREATIVE_CANVAS_SCENE_LIBRARY_ROLES


def _tab_for_beat_context_ref(kind: str, role: str) -> str:
    if kind == "director":
        return "director"
    if kind in {"identity", "portrait"} or role.startswith("character_"):
        return "characters"
    if kind == "scene" or role.startswith("scene_"):
        return "scenes"
    if kind == "prop" or role.startswith("prop_"):
        return "props"
    return "beat"


def _is_beat_director_control_path(relative_path: str) -> bool:
    return relative_path.startswith(
        "director_control_frames/ep"
    ) or relative_path.startswith("freezone/director_control_frames/ep")


def _is_mainline_beat_director_control_ref(role: str, relative_path: str) -> bool:
    return (
        role == "director_combined"
        and _is_beat_director_control_path(relative_path)
        and relative_path.endswith("/combined.png")
    )


def _is_mainline_beat_selected_background_ref(
    role: str,
    relative_path: str,
) -> bool:
    return (
        role == "selected_background"
        and _is_beat_director_control_path(relative_path)
        and relative_path.endswith("/selected_background.png")
    )


def _is_beat_context_metadata_ref(kind: str, role: str, relative_path: str) -> bool:
    if role in {"director_blocking", "director_color_ref"}:
        return True
    if relative_path.startswith("director_blockings/"):
        return True
    return kind == "director" and relative_path.endswith(".json")


__all__ = [
    "CREATIVE_CANVAS_SCENE_LIBRARY_ROLES",
    "creative_canvas_asset_media_type",
    "creative_canvas_character_asset_history_links",
    "creative_canvas_director_control_bundle",
    "creative_canvas_mainline_context_for_asset",
    "creative_canvas_slot_target_for_asset",
    "is_creative_canvas_scene_library_role",
    "project_creative_canvas_asset_record",
    "project_creative_canvas_beat_context_asset",
]
