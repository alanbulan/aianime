"""Creative Canvas preset reference values and context projection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _compact_preset_context(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value not in (None, "", [])}


def preset_ref_mainline_context(ref: dict[str, Any]) -> list[dict[str, Any]]:
    role = str(ref.get("role") or "")
    kind = str(ref.get("kind") or "")
    meta = ref.get("meta") if isinstance(ref.get("meta"), dict) else {}
    label = str(ref.get("label") or "")
    url = ref.get("url")

    def base(context_kind: str, **extra: Any) -> dict[str, Any]:
        return {
            **_compact_preset_context(
                {
                    "kind": context_kind,
                    "episode": meta.get("episode"),
                    "beat": meta.get("beat"),
                    "character": meta.get("character"),
                    "identityId": meta.get("identity_id"),
                    "sceneId": meta.get("scene_id") or meta.get("scene"),
                    "propId": meta.get("prop_id"),
                    "markerColor": meta.get("marker_color"),
                    "role": role,
                    "label": label,
                    "sourceUrl": url,
                    **extra,
                }
            )
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
    if role == "current_sketch":
        return [base("sketch")]
    if role == "current_frame":
        return [base("frame")]
    if role == "current_video":
        return [base("video")]
    if role == "current_audio":
        return [base("audio", audioRole="beat_audio")]
    if role == "director_combined":
        return [base("director_combined")]
    if role == "selected_background":
        return [base("selected_background")]
    return []


@dataclass
class PresetRef:
    kind: str
    role: str
    label: str
    rel_path: str | None = None
    url: str | None = None
    exists: bool = False
    media_type: str = "image"
    aspect_ratio: str = "1:1"
    meta: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        payload = {
            "kind": self.kind,
            "role": self.role,
            "label": self.label,
            "rel_path": self.rel_path,
            "url": self.url,
            "exists": self.exists,
            "media_type": self.media_type,
            "aspect_ratio": self.aspect_ratio,
            "meta": self.meta,
        }
        contexts = preset_ref_mainline_context(payload)
        if contexts:
            payload["mainline_context"] = contexts
        return payload
