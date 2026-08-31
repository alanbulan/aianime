"""Pure task execution metadata and usage projections."""

from __future__ import annotations

from typing import Any

_PROJECT_TASK_RESOURCE_KINDS = {
    "ingest_fast": "ingest",
    "build_characters": "script",
    "build_scenes": "script",
    "build_props": "script",
    "build_episodes": "script",
    "script_writer": "script",
    "beat_video_prompt": "script",
    "identity_planner": "portrait",
    "episode_scene_planner": "script",
    "episode_prop_planner": "script",
    "character_portrait": "portrait",
    "identity_image": "portrait",
    "scene_reference_asset": "render",
    "prop_reference_asset": "render",
    "batch_prop_ref": "render",
    "stage_asset": "render",
    "style_preview": "render",
    "freezone_image_to_3gs": "render",
    "sketch_generation": "sketch",
    "sketch_regen": "sketch",
    "mainline_sketch_from_context": "sketch",
    "mainline_frame_from_context": "render",
    "sketch_edit_execute": "sketch",
    "action_sketch": "sketch",
    "selected_regen": "render",
    "grid_regenerate": "render",
    "single_video": "video",
    "compose_episode": "video",
    "global_optimize_video": "script",
    "audio_generation": "tts",
    "episode_audio_generation": "tts",
    "freezone_video_gen": "video",
    "freezone_analyze": "video",
    "freezone_video_story": "video",
    "freezone_image_reverse_prompt": "script",
    "freezone_story_script": "script",
}


def resource_kind_for_task(task_type: str) -> str:
    return _PROJECT_TASK_RESOURCE_KINDS.get(str(task_type or "").strip(), "")


def _positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _episode_ref(episode: int) -> str:
    return f"ep{episode:03d}" if episode > 0 else "project"


def _beat_ref(episode: int, beat_num: int, *, scope: Any = None) -> str:
    ref = f"{_episode_ref(episode)}:beat{beat_num:03d}"
    clean_scope = str(scope or "").strip()
    return f"{ref}:{clean_scope}" if clean_scope else ref


def _int_list(value: Any) -> list[int]:
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        values: list[Any] = [value]
    else:
        try:
            values = list(value)
        except TypeError:
            values = [value]
    out: list[int] = []
    for item in values:
        parsed = _positive_int(item)
        if parsed is not None and parsed not in out:
            out.append(parsed)
    return out


def _beat_numbers_from_result(result: Any) -> list[int]:
    if not isinstance(result, dict):
        return []
    for key in ("beat_numbers", "updated_beats", "generated_beats"):
        beats = _int_list(result.get(key))
        if beats:
            return beats
    beat_num = _positive_int(result.get("beat_num") or result.get("beat"))
    if beat_num:
        return [beat_num]
    items = result.get("items")
    if isinstance(items, list):
        beats: list[int] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            for key in ("beat_num", "beat"):
                parsed = _positive_int(item.get(key))
                if parsed is not None and parsed not in beats:
                    beats.append(parsed)
        return beats
    return []


def resource_refs_for_task_success(
    *,
    task_type: str,
    episode: int,
    beat_num: Any = None,
    scope: Any = None,
    result: Any = None,
) -> list[str]:
    kind = resource_kind_for_task(task_type)
    if not kind or kind == "ingest":
        return []
    if kind == "script":
        return [_episode_ref(episode)]

    explicit_beat = _positive_int(beat_num)
    if explicit_beat is not None:
        return [_beat_ref(episode, explicit_beat, scope=scope)]

    beats = _beat_numbers_from_result(result)
    if beats:
        return [_beat_ref(episode, beat, scope=scope) for beat in beats]

    clean_scope = str(scope or "").strip()
    if clean_scope:
        return [f"{_episode_ref(episode)}:{clean_scope}"]
    return [f"{_episode_ref(episode)}:{task_type}"]


def completion_metadata_with_provider_task_id(
    metadata: dict[str, Any],
    result: Any,
) -> dict[str, Any]:
    completion_metadata = dict(metadata)
    provider_task_id = ""
    if isinstance(result, dict):
        provider_task_id = str(result.get("provider_task_id") or "").strip()
    if provider_task_id:
        completion_metadata["provider_task_id"] = provider_task_id
    return completion_metadata


__all__ = [
    "completion_metadata_with_provider_task_id",
    "resource_kind_for_task",
    "resource_refs_for_task_success",
]
