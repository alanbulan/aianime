"""Asset & World domain rules."""

from ai_anime.modules.asset_world.domain.character_catalog import (
    duplicate_main_character_names,
    other_main_character_names,
)
from ai_anime.modules.asset_world.domain.character_assets import (
    CHARACTER_ASSET_KINDS,
    ensure_character_asset_kind,
    find_character_identity,
    safe_character_asset_name,
)
from ai_anime.modules.asset_world.domain.character_identity import identity_id_for
from ai_anime.modules.asset_world.domain.character_voice import (
    AGE_GROUP_SLOTS,
    ALL_SLOTS,
    DEFAULT_SLOT,
    VOICE_SLOT_LABELS,
    VoiceSlotMetadata,
    voice_slot_metadata,
    voice_slot_update_fields,
)
from ai_anime.modules.asset_world.domain.prop_catalog import (
    PropCatalogScope,
    includes_global_props,
    includes_local_props,
)
from ai_anime.modules.asset_world.domain.scene_catalog import (
    compose_scene_asset_name,
    derived_scene_names,
    scene_identity,
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
    "CHARACTER_ASSET_KINDS",
    "DEFAULT_SLOT",
    "duplicate_main_character_names",
    "PresetStyleDeletionForbidden",
    "PresetStyleOverrideForbidden",
    "PropCatalogScope",
    "UnsupportedStylePreviewType",
    "VOICE_SLOT_LABELS",
    "VoiceSlotMetadata",
    "ensure_custom_style_can_be_created",
    "ensure_custom_style_can_be_deleted",
    "ensure_character_asset_kind",
    "find_character_identity",
    "identity_id_for",
    "includes_global_props",
    "includes_local_props",
    "compose_scene_asset_name",
    "derived_scene_names",
    "scene_identity",
    "other_main_character_names",
    "safe_character_asset_name",
    "style_preview_extension",
    "validate_style_preview_media_type",
    "voice_slot_metadata",
    "voice_slot_update_fields",
]
