"""Cloud task families owned by the Task Execution domain."""

from __future__ import annotations

from typing import Literal

CloudTaskKind = Literal["text", "image", "video", "audio", "story"]

_EXPLICIT_KINDS: dict[str, CloudTaskKind] = {
    "ingest_fast": "story",
    "build_characters": "story",
    "build_scenes": "story",
    "build_props": "story",
    "build_episodes": "story",
    "identity_planner": "story",
    "episode_scene_planner": "story",
    "episode_prop_planner": "story",
    "freezone_analyze": "story",
    "freezone_video_story": "story",
    "character_portrait": "image",
    "identity_image": "image",
    "scene_reference_asset": "image",
    "prop_reference_asset": "image",
    "batch_prop_ref": "image",
    "selected_regen": "image",
    "grid_regenerate": "image",
    "sketch_generation": "image",
    "sketch_regen": "image",
    "mainline_sketch_from_context": "image",
    "mainline_frame_from_context": "image",
    "sketch_edit_execute": "image",
    "freezone_gen": "image",
    "freezone_edit": "image",
    "freezone_mask_edit": "image",
    "single_video": "video",
    "compose_episode": "video",
    "global_optimize_video": "video",
    "freezone_video_gen": "video",
    "audio_generation": "audio",
    "indextts2_audio_generation": "audio",
    "audio_generation_indextts2": "audio",
    "freezone_audio_speech": "audio",
    "freezone_audio_eleven_music": "audio",
}


def cloud_task_kind(task_type: str) -> CloudTaskKind:
    normalized = str(task_type or "").strip().lower()
    explicit = _EXPLICIT_KINDS.get(normalized)
    if explicit is not None:
        return explicit
    if any(token in normalized for token in ("audio", "speech", "music", "tts")):
        return "audio"
    if any(token in normalized for token in ("video", "compose")):
        return "video"
    if any(
        token in normalized
        for token in ("image", "portrait", "sketch", "render", "reference")
    ):
        return "image"
    if any(token in normalized for token in ("story", "graph", "analyze", "planner")):
        return "story"
    return "text"


__all__ = ["CloudTaskKind", "cloud_task_kind"]
