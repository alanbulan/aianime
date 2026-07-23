from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any


ORDER_STEP = 10
DEFAULT_MANUAL_DURATION = 3.0
DEFAULT_VIDEO_DURATION = 5.0


def _get_value(beat: dict[str, Any] | object, name: str, default: Any = None) -> Any:
    if isinstance(beat, dict):
        return beat.get(name, default)
    return getattr(beat, name, default)


def is_manual_shot(beat: dict[str, Any] | object | None) -> bool:
    if beat is None:
        return False
    return bool(_get_value(beat, "is_manual_shot", False))


def is_manual_space_map_shot(beat: dict[str, Any] | object | None) -> bool:
    if not is_manual_shot(beat):
        return False
    visual = str(_get_value(beat, "visual_description", "") or "").strip().lower()
    return visual.startswith("[space_map")


def storyboard_beats_for_manual_sketches(
    beats: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [beat for beat in beats if not is_manual_space_map_shot(beat)]


@dataclass(frozen=True)
class ManualBeatAudio:
    audio_type: str
    speaker: str
    narration: str


def normalize_manual_beat_audio(
    *,
    audio_type: str | None,
    speaker: str | None,
    narration: str | None,
) -> ManualBeatAudio:
    normalized_type = str(audio_type or "silence").strip()
    if normalized_type not in {"silence", "narration", "dialogue"}:
        raise ValueError("audio_type must be silence, narration, or dialogue")

    normalized_text = str(narration or "").strip()
    normalized_speaker = str(speaker or "").strip()
    if normalized_type == "silence":
        return ManualBeatAudio("silence", "", "")
    if normalized_type == "narration":
        if not normalized_text:
            raise ValueError("narration manual shot requires narration_segment")
        return ManualBeatAudio("narration", "", normalized_text)
    if not normalized_text:
        raise ValueError("dialogue manual shot requires narration_segment")
    return ManualBeatAudio("dialogue", normalized_speaker, normalized_text)


def beat_order_value(beat: dict[str, Any] | object) -> int:
    shot_order = _get_value(beat, "shot_order")
    if shot_order is not None:
        try:
            return int(shot_order)
        except (TypeError, ValueError):
            pass
    beat_number = _get_value(beat, "beat_number", 0) or 0
    return int(beat_number) * ORDER_STEP


def sort_beats_for_display(
    beats: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    return sorted(
        list(beats),
        key=lambda beat: (
            beat_order_value(beat),
            int(beat.get("beat_number", 0) or 0),
        ),
    )


def pick_beats_by_number(
    beats: Iterable[dict[str, Any]],
    beat_numbers: Iterable[int],
) -> list[dict[str, Any]]:
    beats_by_number: dict[int, dict[str, Any]] = {}
    for beat in beats:
        try:
            beat_number = int(beat.get("beat_number", 0) or 0)
        except (TypeError, ValueError):
            continue
        if beat_number > 0 and beat_number not in beats_by_number:
            beats_by_number[beat_number] = beat

    picked: list[dict[str, Any]] = []
    seen: set[int] = set()
    for beat_number in beat_numbers:
        try:
            normalized = int(beat_number)
        except (TypeError, ValueError):
            continue
        if normalized in seen:
            continue
        beat = beats_by_number.get(normalized)
        if beat is not None:
            picked.append(beat)
            seen.add(normalized)
    return picked


def normalize_shot_orders(
    beats: Sequence[dict[str, Any]],
) -> list[tuple[int, int]]:
    return [
        (int(beat.get("beat_number", 0)), (index + 1) * ORDER_STEP)
        for index, beat in enumerate(sort_beats_for_display(beats))
        if beat.get("beat_number") is not None
    ]


def calculate_insert_order(
    previous_order: int | None,
    next_order: int | None,
    *,
    step: int = ORDER_STEP,
) -> int | None:
    if previous_order is None and next_order is None:
        return step
    if previous_order is None:
        normalized_next = int(next_order)
        return normalized_next // 2 if normalized_next > 1 else None
    if next_order is None:
        return int(previous_order) + step
    normalized_previous = int(previous_order)
    normalized_next = int(next_order)
    if normalized_next - normalized_previous <= 1:
        return None
    return (normalized_previous + normalized_next) // 2


def resolve_target_video_duration(
    beat: dict[str, Any],
    audio_duration: float | None = None,
    *,
    default: float = DEFAULT_VIDEO_DURATION,
) -> float:
    duration = beat.get("duration_seconds")
    if duration is not None:
        try:
            parsed = float(duration)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass
    if audio_duration is not None:
        try:
            parsed = float(audio_duration)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass
    return float(default)


def _scene_id_of(beat: dict[str, Any]) -> str:
    scene_ref = beat.get("scene_ref")
    if isinstance(scene_ref, dict):
        return str(scene_ref.get("scene_id") or "").strip()
    return ""


def group_missing_manual_shot_segments(
    beats: Sequence[dict[str, Any]],
    *,
    sketch_exists: Callable[[int], bool],
) -> list[list[int]]:
    segments: list[list[int]] = []
    current: list[int] = []
    current_scene_id = ""

    for beat in sort_beats_for_display(beats):
        beat_num = int(beat.get("beat_number", 0) or 0)
        scene_id = _scene_id_of(beat)
        missing_manual = (
            beat_num > 0 and is_manual_shot(beat) and not sketch_exists(beat_num)
        )
        if missing_manual:
            if current and scene_id != current_scene_id:
                segments.append(current)
                current = []
            current.append(beat_num)
            current_scene_id = scene_id
            continue
        if current:
            segments.append(current)
            current = []
            current_scene_id = ""

    if current:
        segments.append(current)
    return segments


__all__ = [
    "DEFAULT_MANUAL_DURATION",
    "ManualBeatAudio",
    "beat_order_value",
    "calculate_insert_order",
    "group_missing_manual_shot_segments",
    "is_manual_shot",
    "normalize_manual_beat_audio",
    "normalize_shot_orders",
    "pick_beats_by_number",
    "resolve_target_video_duration",
    "sort_beats_for_display",
    "storyboard_beats_for_manual_sketches",
]
