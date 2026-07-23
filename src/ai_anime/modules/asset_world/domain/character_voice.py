"""Character voice slot rules."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

DEFAULT_SLOT = "default"
AGE_GROUP_SLOTS = ("child", "youth", "middle", "elder")
ALL_SLOTS = (DEFAULT_SLOT, *AGE_GROUP_SLOTS)
VOICE_SLOT_LABELS = {
    DEFAULT_SLOT: "默认（兜底）",
    "child": "幼年",
    "youth": "青年",
    "middle": "中年",
    "elder": "老年",
}


@dataclass(frozen=True)
class VoiceSlotMetadata:
    path: str = ""
    sha256: str = ""
    updated_at: str = ""


def voice_slot_metadata(character: Any, slot: str) -> VoiceSlotMetadata:
    if slot == DEFAULT_SLOT:
        return VoiceSlotMetadata(
            path=getattr(character, "reference_audio_path", "") or "",
            sha256=getattr(character, "reference_audio_sha256", "") or "",
            updated_at=getattr(character, "reference_audio_updated_at", "") or "",
        )

    samples = getattr(character, "voice_samples_by_age_group", None) or {}
    entry = samples.get(slot) if isinstance(samples, Mapping) else None
    if not isinstance(entry, Mapping):
        return VoiceSlotMetadata()
    return VoiceSlotMetadata(
        path=entry.get("path", "") or "",
        sha256=entry.get("sha256", "") or "",
        updated_at=entry.get("updated_at", "") or "",
    )


def voice_slot_update_fields(
    character: Any,
    slot: str,
    *,
    path: str,
    sha256: str,
    updated_at: str,
) -> dict[str, Any]:
    if slot == DEFAULT_SLOT:
        return {
            "reference_audio_path": path,
            "reference_audio_sha256": sha256,
            "reference_audio_updated_at": updated_at,
        }

    samples = dict(getattr(character, "voice_samples_by_age_group", None) or {})
    if path:
        samples[slot] = {
            "path": path,
            "sha256": sha256,
            "updated_at": updated_at,
        }
    else:
        samples.pop(slot, None)
    return {"voice_samples_by_age_group": samples}
