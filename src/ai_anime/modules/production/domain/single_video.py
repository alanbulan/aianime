"""Pure rules for scheduling one Beat video."""

from __future__ import annotations

from typing import Any


_SEEDANCE_PRO_DIALOGUE_BACKENDS = {
    "seedance_pro",
    "newapi_seedance-1.5-pro",
}


def seedance_pro_dialogue_error(
    beats: list[dict[str, Any]],
    video_backend: str,
) -> str | None:
    if video_backend not in _SEEDANCE_PRO_DIALOGUE_BACKENDS:
        return None

    non_dialogue = [
        int(beat.get("beat_number", 0))
        for beat in beats
        if beat.get("audio_type", "narration") != "dialogue"
    ]
    if not non_dialogue:
        return None

    preview = "、".join(str(number) for number in non_dialogue[:8])
    suffix = " 等" if len(non_dialogue) > 8 else ""
    return (
        "Seedance 1.5 有声只允许用于 dialogue beat；当前包含非 dialogue Beat: "
        f"{preview}{suffix}"
    )


def seedance2_initial_prompt(beat: dict[str, Any], video_mode: str) -> str:
    if video_mode == "keyframe":
        return str(beat.get("keyframe_prompt") or "").strip()
    return str(beat.get("video_prompt") or beat.get("keyframe_prompt") or "").strip()


def legacy_video_prompt(beat: dict[str, Any], video_mode: str) -> str:
    if video_mode == "keyframe":
        return str(beat.get("keyframe_prompt") or "").strip()
    return str(beat.get("video_prompt") or "").strip()


def missing_video_prompt_error(beat_num: int) -> str:
    return f"Beat {beat_num} 缺少视频提示词，请先点击“生成本 Beat 提示词”。"
