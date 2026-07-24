"""Pure Beat Director Stage rules."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def _director_entities(
    *,
    snapshot: object,
    actors: object,
    props: object,
    stagings: object,
) -> tuple[dict[str, Any], object, object, object]:
    normalized_snapshot = snapshot if isinstance(snapshot, dict) else {}
    normalized_actors = (
        actors if isinstance(actors, list) else normalized_snapshot.get("actors") or []
    )
    normalized_props = (
        props if isinstance(props, list) else normalized_snapshot.get("props") or []
    )
    normalized_stagings = (
        stagings
        if isinstance(stagings, list)
        else normalized_snapshot.get("stagings") or []
    )
    legacy_props = (
        [*normalized_props, *normalized_stagings]
        if isinstance(normalized_props, list) and isinstance(normalized_stagings, list)
        else normalized_props
    )
    return (
        normalized_snapshot,
        normalized_actors,
        normalized_stagings,
        legacy_props,
    )


def director_control_scope(episode_num: int, beat_num: int) -> str:
    return (
        f"director_control_to_sketch:ep{int(episode_num):03d}:beat_{int(beat_num):02d}"
    )


def same_scene_beat_options(
    beat_scenes: Sequence[tuple[int, str]],
    scene_name: str,
) -> list[dict[str, Any]]:
    return [
        {"beat": beat_num, "label": f"Beat {beat_num}", "scene_id": scene_name}
        for beat_num, candidate_scene in sorted(
            beat_scenes,
            key=lambda item: item[0],
        )
        if candidate_scene == scene_name
    ]


def director_overlay_payload(
    *,
    episode_num: int,
    beat_num: int,
    scene_name: str,
    beat: Mapping[str, Any],
    frame_aspect: object,
    source: object,
    frame_meta: object,
    snapshot: object,
    camera: object,
    actors: object,
    props: object,
    stagings: object,
    command_log: object,
    deleted_keys: object,
    saved_at: str,
) -> dict[str, Any]:
    (
        normalized_snapshot,
        normalized_actors,
        normalized_stagings,
        legacy_props,
    ) = _director_entities(
        snapshot=snapshot,
        actors=actors,
        props=props,
        stagings=stagings,
    )
    normalized_frame_meta = frame_meta if isinstance(frame_meta, dict) else {}
    normalized_source = source
    if not isinstance(normalized_source, dict):
        meta_source = normalized_frame_meta.get("source")
        normalized_source = meta_source if isinstance(meta_source, dict) else {}

    identities = beat.get("detected_identities") or []
    detected_props = beat.get("detected_props") or []
    return {
        "schema_version": "director_stage_overlay_v1",
        "scene_id": scene_name,
        "episode": int(episode_num),
        "beat": int(beat_num),
        "frame_aspect": str(frame_aspect or "16:9"),
        "source": normalized_source,
        "frame_meta": normalized_frame_meta,
        "snapshot": normalized_snapshot,
        "camera": normalized_snapshot.get("camera") or camera or {},
        "actors": normalized_actors,
        "props": legacy_props,
        "stagings": normalized_stagings,
        "command_log": command_log if isinstance(command_log, list) else [],
        "deleted_keys": deleted_keys if isinstance(deleted_keys, list) else [],
        "beat_context": {
            "detected_identities": [
                str(item) for item in identities if str(item).strip()
            ],
            "detected_props": [
                str(item) for item in detected_props if str(item).strip()
            ],
        },
        "saved_at": saved_at,
    }


def overlay_detected_props(payload: Mapping[str, Any]) -> list[str]:
    beat_context = payload.get("beat_context")
    beat_context = beat_context if isinstance(beat_context, Mapping) else {}
    detected = beat_context.get("detected_props")
    detected = detected if isinstance(detected, list) else []
    overlay_props = payload.get("props")
    overlay_props = overlay_props if isinstance(overlay_props, list) else []
    labels = [
        str(item.get("label") or item.get("prop_id") or "").strip()
        for item in overlay_props
        if isinstance(item, dict)
        and str(item.get("type") or "").strip() != "prop_staging"
        and str(item.get("category") or "").strip() != "staging"
    ]
    return list(dict.fromkeys(str(item) for item in [*detected, *labels] if item))


def director_control_frame_meta(
    *,
    submitted_meta: Mapping[str, Any],
    scene_name: str,
    episode_num: int,
    beat_num: int,
    frame_aspect: object,
    snapshot: object,
    actors: object,
    props: object,
    stagings: object,
) -> dict[str, Any]:
    (
        _snapshot,
        normalized_actors,
        normalized_stagings,
        legacy_props,
    ) = _director_entities(
        snapshot=snapshot,
        actors=actors,
        props=props,
        stagings=stagings,
    )
    meta = dict(submitted_meta)
    meta.setdefault("scene_id", scene_name)
    meta.setdefault("episode", int(episode_num))
    meta.setdefault("beat", int(beat_num))
    meta.setdefault("frame_aspect", str(frame_aspect or "16:9"))
    meta.setdefault("actors", normalized_actors)
    meta.setdefault("props", legacy_props)
    meta.setdefault("stagings", normalized_stagings)
    return meta
