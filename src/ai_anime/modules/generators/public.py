"""Public contract of the Media Generation module."""

from ai_anime.modules.generators import (
    create_grid_generator,
    generate_character_reference_unified,
    generate_identity_image_unified,
    nanobanana_grid,
    pool_indexer,
)

from ai_anime.modules.generators.grid_splitter import (
    combine_to_grid,
)

from ai_anime.modules.generators.image_generator import (
    generate_character_reference_unified,
    generate_identity_image_unified,
)

from ai_anime.modules.generators.indextts2 import (
    IndexTTS2Client,
)

from ai_anime.modules.generators.nanobanana_character import (
    NanoBananaCharacterGenerator,
)

from ai_anime.modules.generators.nanobanana_grid import (
    _call_newapi_image_api,
    _resolve_scene_prop_asset_refs,
    character_grid_split,
    filter_character_map_by_precomputed,
    generate_reference_edit_image,
    generate_text_to_image,
    get_sketch_nxn_modes,
    load_precomputed_panel_detected,
    NanoBananaGridGenerator,
    normalize_image_size,
    perfect_grid_split,
    REGEN_MODE_CONFIGS,
    regenerate_selected_beats,
    scene_grid_split,
    SKETCH_DEFAULT_MODE_KEY,
    sketch_grid_split,
    sketch_pass1_mode_key,
    sketch_scene_grid_split,
)

from ai_anime.modules.generators.nanobanana_prop import (
    build_prop_reference_prompt,
    generate_prop_reference,
    PROP_REF_IMAGE_SIZE,
)

from ai_anime.modules.generators.pool_indexer import (
    build_beat_sketch_paths,
    compute_beat_content_hash,
    is_pool_image_stale,
    load_pool_index,
    rebuild_pool_index,
    save_grid_and_split,
    save_pool_index,
)

from ai_anime.modules.generators.prompt_builder import (
    create_prompt_context,
    PromptComponents,
    PromptMode,
    UnifiedPromptBuilder,
)

from ai_anime.modules.generators.render_identity_guard import (
    render_ai_detection_error,
)

from ai_anime.modules.generators.scene_reference_images import (
    build_scene_reference_prompt,
    generate_scene_reference_image,
)

from ai_anime.modules.generators.sketch_color_detector import (
    detect_sketch_colors,
)

from ai_anime.modules.generators.style_analyzer import (
    StyleAnalyzer,
)

from ai_anime.modules.generators.tts_generator import (
    TTSResult,
)

from ai_anime.modules.generators.video_generator import (
    create_video_generator,
    ShotReference,
)

__all__ = [
    "_call_newapi_image_api",
    "_resolve_scene_prop_asset_refs",
    "build_beat_sketch_paths",
    "build_prop_reference_prompt",
    "build_scene_reference_prompt",
    "character_grid_split",
    "combine_to_grid",
    "compute_beat_content_hash",
    "create_grid_generator",
    "create_prompt_context",
    "create_video_generator",
    "detect_sketch_colors",
    "filter_character_map_by_precomputed",
    "generate_character_reference_unified",
    "generate_identity_image_unified",
    "generate_prop_reference",
    "generate_reference_edit_image",
    "generate_scene_reference_image",
    "generate_text_to_image",
    "get_sketch_nxn_modes",
    "IndexTTS2Client",
    "is_pool_image_stale",
    "load_pool_index",
    "load_precomputed_panel_detected",
    "nanobanana_grid",
    "NanoBananaCharacterGenerator",
    "NanoBananaGridGenerator",
    "normalize_image_size",
    "perfect_grid_split",
    "pool_indexer",
    "PromptComponents",
    "PromptMode",
    "PROP_REF_IMAGE_SIZE",
    "rebuild_pool_index",
    "REGEN_MODE_CONFIGS",
    "regenerate_selected_beats",
    "render_ai_detection_error",
    "save_grid_and_split",
    "save_pool_index",
    "scene_grid_split",
    "ShotReference",
    "SKETCH_DEFAULT_MODE_KEY",
    "sketch_grid_split",
    "sketch_pass1_mode_key",
    "sketch_scene_grid_split",
    "StyleAnalyzer",
    "TTSResult",
    "UnifiedPromptBuilder",
]

