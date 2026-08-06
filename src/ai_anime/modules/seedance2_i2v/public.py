"""Public contract of the Seedance Image-to-Video module."""

from ai_anime.modules.seedance2_i2v.assets import (
    append_seedance2_user_reference_assets,
    build_seedance2_project_assets,
    selected_reference_paths,
)
from ai_anime.modules.seedance2_i2v import panel_service
from ai_anime.modules.seedance2_i2v.models import (
    Seedance2I2VMode,
    dump_seedance2_config,
    parse_seedance2_config,
)
from ai_anime.modules.seedance2_i2v.panel_service import (
    generate_seedance2_prompt_for_panel,
)
from ai_anime.modules.seedance2_i2v.pipeline import (
    prepare_seedance2_generation_inputs,
)
from ai_anime.modules.seedance2_i2v.voice_clone import (
    build_reference_audio_url,
    file_sha256,
    narration_style_prompt,
    normalize_seedance2_audio_type,
    resolve_character_voice,
    resolve_narrator_source,
)
from ai_anime.modules.seedance2_i2v.voice_reference_service import (
    dialogue_voice_reference_rows,
    resolve_narrator_reference_status,
)

__all__ = [
    "Seedance2I2VMode",
    "append_seedance2_user_reference_assets",
    "build_reference_audio_url",
    "build_seedance2_project_assets",
    "dialogue_voice_reference_rows",
    "dump_seedance2_config",
    "file_sha256",
    "generate_seedance2_prompt_for_panel",
    "narration_style_prompt",
    "normalize_seedance2_audio_type",
    "parse_seedance2_config",
    "panel_service",
    "prepare_seedance2_generation_inputs",
    "resolve_character_voice",
    "resolve_narrator_reference_status",
    "resolve_narrator_source",
    "selected_reference_paths",
]
