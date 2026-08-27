"""Sketch marker detection domain rules."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from ai_anime.modules.production.domain.detected_refs import (
    NO_CHARACTER_MARKER,
    NO_PROP_MARKER,
    collect_prop_marker_ids_from_beat,
    complete_detected_refs_from_visual_description,
    real_detected_identities,
    real_detected_props,
)


@dataclass(frozen=True)
class SketchDetectionFrame:
    beat_number: int
    path: Path


@dataclass(frozen=True)
class ClassifiedSketchMarkers:
    identities: dict[int, list[str]]
    props: dict[int, list[str]]
    total_identities: int
    total_props: int


def sketch_detection_grid_shape(count: int) -> tuple[int, int]:
    if count <= 1:
        return 1, 1
    if count <= 4:
        return 2, 2
    if count <= 9:
        return 3, 3
    if count <= 16:
        return 4, 4
    return 5, 5


def map_grid_panel_detections(
    frames: list[SketchDetectionFrame],
    panel_detections: Mapping[Any, list[str]] | None,
) -> dict[int, list[str]]:
    detections: dict[int, list[str]] = {}
    for raw_panel_index, marker_ids in (panel_detections or {}).items():
        try:
            panel_index = int(raw_panel_index)
        except (TypeError, ValueError):
            continue
        if 1 <= panel_index <= len(frames):
            beat_number = frames[panel_index - 1].beat_number
            detections[beat_number] = list(marker_ids or [])
    return detections


def split_detected_marker_keys(
    detected_keys: list[str],
    beats: list[Any],
    characters: list[Any],
    allowed_prop_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> tuple[list[str], list[str]]:
    """Split detected colors into valid episode identity and prop markers."""
    identity_ids: set[str] = set()
    for character in characters or []:
        identities = (
            character.get("identities", [])
            if isinstance(character, dict)
            else getattr(character, "identities", [])
        ) or []
        for identity in identities:
            identity_id = str(
                identity.get("identity_id", "")
                if isinstance(identity, dict)
                else getattr(identity, "identity_id", "")
            ).strip()
            if identity_id:
                identity_ids.add(identity_id)

    semantic_prop_ids = {
        prop_id
        for beat in beats or []
        for prop_id in collect_prop_marker_ids_from_beat(beat)
        if prop_id
    }
    allowed_props = {
        str(prop_id or "").strip()
        for prop_id in (allowed_prop_ids or [])
        if str(prop_id or "").strip()
    }
    prop_ids = semantic_prop_ids & allowed_props if allowed_props else set()

    detected_identities: list[str] = []
    detected_props: list[str] = []
    for key in detected_keys or []:
        marker = str(key or "").strip()
        if not marker:
            continue
        if marker in identity_ids:
            detected_identities.append(marker)
        elif marker in prop_ids:
            detected_props.append(marker)
    return (
        list(dict.fromkeys(detected_identities)),
        list(dict.fromkeys(detected_props)),
    )


def classify_sketch_marker_detections(
    *,
    frames: list[SketchDetectionFrame],
    detections: Mapping[int, list[str]],
    beats: list[Any],
    characters: list[Any],
    allowed_prop_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> ClassifiedSketchMarkers:
    beats_by_number = {
        int(
            (beat.get("beat_number") if isinstance(beat, dict) else getattr(beat, "beat_number", 0))
            or 0
        ): beat
        for beat in beats or []
    }
    allowed_identity_ids: set[str] = set()
    for character in characters or []:
        character_identities = (
            character.get("identities", [])
            if isinstance(character, dict)
            else getattr(character, "identities", [])
        ) or []
        for identity in character_identities:
            identity_id = str(
                identity.get("identity_id", "")
                if isinstance(identity, dict)
                else getattr(identity, "identity_id", "")
            ).strip()
            if identity_id:
                allowed_identity_ids.add(identity_id)

    identities: dict[int, list[str]] = {}
    props: dict[int, list[str]] = {}
    total_identities = 0
    total_props = 0
    for frame in frames:
        if frame.beat_number in identities:
            continue
        detected_identities, detected_props = split_detected_marker_keys(
            detections.get(frame.beat_number, []),
            beats,
            characters,
            allowed_prop_ids=allowed_prop_ids,
        )
        beat = beats_by_number.get(frame.beat_number, {})
        visual_description = str(
            beat.get("visual_description", "")
            if isinstance(beat, dict)
            else getattr(beat, "visual_description", "")
        )
        detected_identities, detected_props = (
            complete_detected_refs_from_visual_description(
                visual_description=visual_description,
                detected_identities=detected_identities,
                detected_props=detected_props,
                allowed_identity_ids=allowed_identity_ids,
                allowed_prop_ids=allowed_prop_ids,
            )
        )
        detected_identities = real_detected_identities(detected_identities)
        detected_props = real_detected_props(detected_props)
        total_identities += len(detected_identities)
        total_props += len(detected_props)
        identities[frame.beat_number] = detected_identities or [NO_CHARACTER_MARKER]
        props[frame.beat_number] = detected_props or [NO_PROP_MARKER]
    return ClassifiedSketchMarkers(
        identities=identities,
        props=props,
        total_identities=total_identities,
        total_props=total_props,
    )
