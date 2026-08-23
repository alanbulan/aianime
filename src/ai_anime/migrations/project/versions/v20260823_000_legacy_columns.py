"""Add columns required by the current project schema to legacy databases."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

from ..helpers import add_column_if_missing

VERSION = "20260823_000_legacy_columns"


async def apply(db: aiosqlite.Connection, project_dir: Path) -> None:
    _ = project_dir
    columns = {
        "episodes": {
            "beat_source_text": "TEXT DEFAULT ''",
            "adapted_content": "TEXT DEFAULT ''",
            "scene_menu_json": "TEXT DEFAULT '[]'",
            "prop_menu_json": "TEXT DEFAULT '[]'",
            "identity_default_map_json": "TEXT DEFAULT '{}'",
        },
        "beats": {
            "detected_identities_json": "TEXT DEFAULT '[]'",
            "detected_props_json": "TEXT DEFAULT '[]'",
            "scene_ref_json": "TEXT DEFAULT ''",
            "audio_type": "TEXT DEFAULT 'narration'",
            "speaker": "TEXT DEFAULT ''",
            "speaker_kind": "TEXT DEFAULT 'character'",
            "time_of_day": "TEXT DEFAULT ''",
            "video_mode": "TEXT DEFAULT 'first_frame'",
            "video_prompt": "TEXT DEFAULT ''",
            "keyframe_prompt": "TEXT DEFAULT ''",
            "shot_order": "INTEGER",
            "duration_seconds": "REAL",
            "is_manual_shot": "INTEGER DEFAULT 0",
            "seedance2_config_json": "TEXT NOT NULL DEFAULT '{}'",
        },
        "scenes": {
            "spatial_layout_image": "TEXT DEFAULT ''",
            "base_scene_id": "TEXT DEFAULT ''",
            "variant_id": "TEXT DEFAULT ''",
            "time_of_day": "TEXT DEFAULT ''",
            "variant_prompt": "TEXT DEFAULT ''",
        },
        "characters": {
            "reference_audio_path": "TEXT DEFAULT ''",
            "reference_audio_sha256": "TEXT DEFAULT ''",
            "reference_audio_updated_at": "TEXT DEFAULT ''",
            "voice_samples_by_age_group_json": "TEXT DEFAULT '{}'",
        },
    }
    for table, definitions in columns.items():
        for name, definition in definitions.items():
            await add_column_if_missing(db, table, name, definition)


__all__ = ["VERSION", "apply"]
