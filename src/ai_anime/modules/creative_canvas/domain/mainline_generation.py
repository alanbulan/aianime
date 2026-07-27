"""Pure rules for Creative Canvas mainline generation."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Mapping


def normalize_mainline_aspect_ratio(value: object) -> str:
    raw = str(value or "").strip()
    if raw in {"16:9", "16-9", "landscape"}:
        return "16:9"
    if raw in {"", "2:3", "2-3", "portrait"}:
        return "2:3"
    raise ValueError("aspect_ratio must be '2:3' or '16:9'")


def normalize_mainline_frame_quality(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "medium"
    if raw in {"low", "medium", "high"}:
        return raw
    raise ValueError("quality must be low, medium, or high")


def mainline_mode_key(aspect_ratio: object, *, is_sketch: bool) -> str:
    normalized = normalize_mainline_aspect_ratio(aspect_ratio)
    if normalized == "16:9":
        return "1x1_16-9_sketch" if is_sketch else "1x1_16-9"
    return "1x1_2-3_sketch" if is_sketch else "1x1_2-3"


def infer_scene_id_from_master_path(path: Path, project_dir: Path) -> str:
    try:
        rel_parts = path.relative_to(project_dir).parts
    except ValueError:
        rel_parts = path.parts
    for index in range(len(rel_parts) - 1):
        if rel_parts[index] == "scenes" and index + 1 < len(rel_parts):
            return rel_parts[index + 1]
    return path.parent.name or "the target scene"


def build_scene_360_prompt(scene_id: str) -> str:
    normalized_scene_id = (scene_id or "").strip() or "the target scene"
    return (
        "Generate a 360-degree equirectangular panorama image in exact 2:1 "
        f"aspect ratio for scene `{normalized_scene_id}`.\n\n"
        "INPUT IMAGE ROLE:\n"
        "- Reference image 1 = MASTER VISUAL BIBLE.\n"
        "- It controls art style, material style, linework, color palette, lighting mood, and fixed scene design.\n"
        "- Reference image 1 is NOT the final camera view.\n"
        "- Do NOT copy its single frontal composition. Use it only as visual/style/material evidence while constructing a full 360-degree continuous environment.\n\n"
        "LAYER MODE: FULL ENVIRONMENT\n"
        "- Generate the complete environment and fixed fixtures only.\n"
        "- No people, no characters, no story action, and no temporary story props.\n\n"
        "PROJECTION REQUIREMENTS:\n"
        "- Correct equirectangular spherical panorama projection.\n"
        "- Output must be one continuous 2:1 panorama, suitable for a VR/360 panorama viewer.\n"
        "- Camera is fixed at the center of the scene at normal human eye height.\n"
        "- Full 360-degree environment around the camera.\n"
        "- Left and right edges must connect seamlessly with no visible seam.\n"
        "- Horizon must be level and centered.\n"
        "- Use normal VR panorama projection: no single flat wide shot, no cubemap atlas, no borders, no multi-panel sheet.\n"
        "- Geometry must remain stable after spherical wrapping.\n"
        "- Ceiling and floor poles must be clean continuous surfaces, with no black holes, labels, mirrors, sliced objects, or heavy stretching.\n\n"
        "NEGATIVE REQUIREMENTS:\n"
        "- Not a normal wide-angle illustration.\n"
        "- Not fisheye lens.\n"
        "- Not cubemap faces.\n"
        "- No labels, no UI, no watermark.\n"
        "- No broken seam, no duplicated doorway at seam, no mirrored left/right halves.\n"
        "- No photorealism drift if the reference is stylized."
    )


def beat_context_as_prompt_beat(beat_context: Mapping[str, object] | None) -> dict:
    context = dict(beat_context or {})
    scene_id = (
        context.get("scene_id")
        or context.get("sceneId")
        or context.get("scene_name")
        or context.get("sceneName")
        or ""
    )
    scene_ref = {"scene_id": scene_id, "name": scene_id} if scene_id else None
    visual_description = (
        context.get("visual_description")
        or context.get("visualDescription")
        or context.get("content")
        or ""
    )
    detected_identities = (
        context.get("detected_identities") or context.get("detectedIdentities") or []
    )
    if str(context.get("source") or "").strip().lower() == "standalone":
        visual_description = standalone_prompt_visual_description(
            str(visual_description or ""), context
        )
        identity_map = standalone_prompt_identity_map(context)
        detected_identities = [
            identity_map.get(str(item).strip(), str(item).strip())
            for item in detected_identities
            if str(item).strip()
        ]

    return {
        "episode_number": context.get("episode") or context.get("episode_number"),
        "beat_number": context.get("beat") or context.get("beat_number"),
        "scene_ref": scene_ref,
        "visual_description": visual_description,
        "narration_segment": (
            context.get("narration_segment") or context.get("narrationSegment") or ""
        ),
        "detected_identities": detected_identities,
        "detected_props": context.get("detected_props")
        or context.get("detectedProps")
        or [],
    }


def is_standalone_beat_context(beat_context: Mapping[str, object] | None) -> bool:
    return str((beat_context or {}).get("source") or "").strip().lower() == "standalone"


def list_text_values(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def standalone_sketch_colors(beat_context: Mapping[str, object]) -> dict[str, str]:
    value = beat_context.get("sketch_colors") or beat_context.get("sketchColors") or {}
    return dict(value) if isinstance(value, dict) else {}


def standalone_prop_marker_colors(
    beat_context: Mapping[str, object],
) -> dict[str, str]:
    value = (
        beat_context.get("prop_marker_colors")
        or beat_context.get("propMarkerColors")
        or {}
    )
    return dict(value) if isinstance(value, dict) else {}


def standalone_identity_prompt_parts(identity_name: str) -> tuple[str, str, str]:
    identity_name = identity_name.strip()
    if "_" in identity_name:
        char_name, suffix = identity_name.split("_", 1)
        char_name = char_name.strip()
        suffix = suffix.strip()
        if char_name and suffix:
            return char_name, suffix, identity_name
    return identity_name, identity_name, f"{identity_name}_{identity_name}"


def standalone_prompt_identity_map(
    beat_context: Mapping[str, object],
) -> dict[str, str]:
    identity_names = list_text_values(
        beat_context.get("detected_identities") or beat_context.get("detectedIdentities")
    )
    return {
        identity_name: standalone_identity_prompt_parts(identity_name)[2]
        for identity_name in identity_names
    }


def standalone_prompt_visual_description(
    visual_description: str,
    beat_context: Mapping[str, object],
) -> str:
    identity_map = standalone_prompt_identity_map(beat_context)
    if not identity_map:
        return visual_description

    def replace_marker(match: re.Match[str]) -> str:
        marker = str(match.group(1) or "").strip()
        return "{{" + identity_map.get(marker, marker) + "}}"

    return re.sub(r"\{\{([^}]+)\}\}", replace_marker, visual_description)


def standalone_character_map(beat_context: Mapping[str, object]) -> dict[str, dict]:
    sketch_colors = standalone_sketch_colors(beat_context)
    identity_names = list_text_values(
        beat_context.get("detected_identities") or beat_context.get("detectedIdentities")
    )
    character_map: dict[str, dict] = {}
    for identity_name in identity_names:
        char_name, suffix, _prompt_identity_id = standalone_identity_prompt_parts(
            identity_name
        )
        entry = character_map.setdefault(
            char_name,
            {
                "base_prompt": char_name,
                "reference_mode": "prompt_only",
                "sketch_color": "",
                "identity_appearances": {},
                "identity_sketch_colors": {},
            },
        )
        color = sketch_colors.get(identity_name) or sketch_colors.get(char_name) or ""
        entry["identity_appearances"][suffix] = identity_name
        if color:
            entry["identity_sketch_colors"][suffix] = color
            entry["sketch_color"] = entry["sketch_color"] or color
    return character_map
