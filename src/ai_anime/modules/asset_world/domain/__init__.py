"""Asset & World domain rules."""

from ai_anime.modules.asset_world.domain.character_voice import (
    AGE_GROUP_SLOTS,
    ALL_SLOTS,
    DEFAULT_SLOT,
    VOICE_SLOT_LABELS,
    VoiceSlotMetadata,
    voice_slot_metadata,
    voice_slot_update_fields,
)
from ai_anime.modules.asset_world.domain.styles import (
    PresetStyleDeletionForbidden,
    PresetStyleOverrideForbidden,
    UnsupportedStylePreviewType,
    ensure_custom_style_can_be_created,
    ensure_custom_style_can_be_deleted,
    style_preview_extension,
    validate_style_preview_media_type,
)

__all__ = [
    "AGE_GROUP_SLOTS",
    "ALL_SLOTS",
    "DEFAULT_SLOT",
    "PresetStyleDeletionForbidden",
    "PresetStyleOverrideForbidden",
    "UnsupportedStylePreviewType",
    "VOICE_SLOT_LABELS",
    "VoiceSlotMetadata",
    "ensure_custom_style_can_be_created",
    "ensure_custom_style_can_be_deleted",
    "style_preview_extension",
    "validate_style_preview_media_type",
    "voice_slot_metadata",
    "voice_slot_update_fields",
]
