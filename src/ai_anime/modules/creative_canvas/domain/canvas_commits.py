"""Creative Canvas canonical-slot commit rules."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


CREATIVE_CANVAS_SCENE_SLOT_KINDS = frozenset(
    {
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
)
CREATIVE_CANVAS_GLOBAL_SLOT_KINDS = frozenset(
    {
        "identity",
        "identity_costume",
        "identity_portrait",
        "portrait",
        "prop_ref",
        *CREATIVE_CANVAS_SCENE_SLOT_KINDS,
    }
)


@dataclass(frozen=True)
class CreativeCanvasImpactBeat:
    episode: int
    beat: int
    visual_description: str
    scene_id: str
    detected_identities: tuple[str, ...]
    detected_props: tuple[str, ...]


def is_global_creative_canvas_slot(target: Mapping[str, Any]) -> bool:
    return target.get("kind") in CREATIVE_CANVAS_GLOBAL_SLOT_KINDS


def creative_canvas_slot_asset_key(target: Mapping[str, Any]) -> str | None:
    kind = target.get("kind")
    if kind in {"identity", "identity_costume", "identity_portrait"}:
        return f"{kind}:{target.get('character')}:{target.get('identity_id')}"
    if kind == "portrait":
        return f"portrait:{target.get('character')}"
    if kind in CREATIVE_CANVAS_SCENE_SLOT_KINDS:
        return f"{kind}:{target.get('scene_id')}"
    if kind == "prop_ref":
        return f"prop_ref:{target.get('prop_id')}"
    return None


def compute_creative_canvas_slot_impact(
    beats: Sequence[CreativeCanvasImpactBeat],
    target: Mapping[str, Any],
) -> list[dict[str, Any]]:
    if not is_global_creative_canvas_slot(target):
        return []

    kind = target.get("kind")
    impacted: list[dict[str, Any]] = []
    for beat in beats:
        hit = False
        if kind in {"identity", "identity_costume", "identity_portrait"}:
            identity_id = str(target.get("identity_id") or "")
            hit = (
                identity_id in beat.visual_description
                or identity_id in beat.detected_identities
            )
        elif kind == "portrait":
            character = str(target.get("character") or "")
            hit = (
                f"{{{{{character}_" in beat.visual_description
                or f"{{{{{character}}}}}" in beat.visual_description
                or any(
                    identity == character or identity.startswith(f"{character}_")
                    for identity in beat.detected_identities
                )
            )
        elif kind in CREATIVE_CANVAS_SCENE_SLOT_KINDS:
            scene_id = str(target.get("scene_id") or "")
            hit = scene_id == beat.scene_id or scene_id in beat.visual_description
        elif kind == "prop_ref":
            prop_id = str(target.get("prop_id") or "")
            hit = prop_id in beat.visual_description or prop_id in beat.detected_props
        if hit:
            impacted.append(
                {
                    "episode": beat.episode,
                    "beat": beat.beat,
                    "visual_description": beat.visual_description,
                }
            )

    impacted.sort(key=lambda item: (item["episode"], item["beat"]))
    return impacted


__all__ = [
    "CREATIVE_CANVAS_GLOBAL_SLOT_KINDS",
    "CREATIVE_CANVAS_SCENE_SLOT_KINDS",
    "CreativeCanvasImpactBeat",
    "compute_creative_canvas_slot_impact",
    "creative_canvas_slot_asset_key",
    "is_global_creative_canvas_slot",
]
