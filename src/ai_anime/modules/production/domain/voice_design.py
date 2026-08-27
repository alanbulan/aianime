"""Rules for describing automatically provisioned production voices."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

VoiceDesignTarget = Literal[
    "project_narrator",
    "character_slot",
    "identity",
]

_AGE_LABELS = {
    "child": "幼年",
    "youth": "青年",
    "middle": "中年",
    "elder": "老年",
}


@dataclass(frozen=True)
class VoiceDesignRequirement:
    """One missing voice and the project binding that should receive it."""

    key: str
    target: VoiceDesignTarget
    label: str
    voice_prompt: str
    preview_text: str
    language: str = "zh"
    character_name: str = ""
    identity_id: str = ""
    slot: str = ""
    additional_slots: tuple[str, ...] = ()


def infer_voice_design_language(text: str) -> str:
    """Infer the provider language code from the preview text."""

    value = str(text or "")
    if re.search(r"[\u3040-\u30ff]", value):
        return "ja"
    if re.search(r"[\uac00-\ud7af]", value):
        return "ko"
    if re.search(r"[\u3400-\u9fff]", value):
        return "zh"
    if re.search(r"[A-Za-z]", value):
        return "en"
    return "zh"


def voice_design_preview(text: str) -> str:
    """Keep the actual production line within the voice-design contract."""

    return str(text or "").strip()[:1024]


def build_character_voice_prompt(
    *,
    character_name: str,
    gender: str = "",
    age_group: str = "",
    role: str = "",
    description: str = "",
    identity_name: str = "",
) -> str:
    """Build a voice prompt from persisted character facts."""

    subject = f"为角色“{str(character_name or '').strip()}”设计声线"
    traits = [
        value
        for value in (
            _AGE_LABELS.get(str(age_group or "").strip(), ""),
            str(gender or "").strip(),
        )
        if value
    ]
    parts = [subject]
    if traits:
        parts.append(f"基础声线：{' '.join(traits)}")
    clean_identity = str(identity_name or "").strip()
    if clean_identity:
        parts.append(f"当前身份：{clean_identity}")
    clean_role = str(role or "").strip()
    if clean_role:
        parts.append(f"角色定位：{clean_role}")
    clean_description = str(description or "").strip()
    if clean_description:
        parts.append(f"角色设定：{clean_description}")
    parts.append("保持口语自然、发音清晰，并符合角色设定")
    return "；".join(parts)[:2048]


def build_narrator_voice_prompt(narration_style_prompt: str) -> str:
    """Build a narrator voice prompt from the selected narration style."""

    style = str(narration_style_prompt or "").strip()
    parts = ["设计适合本作品的解说人声线"]
    if style:
        parts.append(style)
    parts.append("发音清晰自然，叙事节奏稳定")
    return "；".join(parts)[:2048]


__all__ = [
    "VoiceDesignRequirement",
    "VoiceDesignTarget",
    "build_character_voice_prompt",
    "build_narrator_voice_prompt",
    "infer_voice_design_language",
    "voice_design_preview",
]
