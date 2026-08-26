"""Stable application API for the Production bounded context."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ai_anime.modules.production.infrastructure.media_generation_settings import (
        DEFAULT_VIDEO_RESOLUTION,
        FFMPEG_PATH,
        IMAGE_DEFAULT_HEIGHT,
        IMAGE_DEFAULT_STYLE,
        IMAGE_DEFAULT_WIDTH,
        INDEXTTS2_RECORD_PROVIDER,
        INDEXTTS2_TIMEOUT_SECONDS,
        MODE_CONFIG,
        OPENAI_IMAGE_QUALITY,
        OPENAI_SKETCH_IMAGE_QUALITY,
        VIDEO_CODEC,
        apply_style_reference,
        get_grid_generation_config,
        get_render_generation_config,
        get_sketch_generation_config,
        get_style_labels,
        get_style_preset,
        get_tts_config,
        get_video_config,
        list_available_styles,
    )
    from ai_anime.modules.production.infrastructure.media_generation import (
        nanobanana_grid,
        pool_indexer,
    )
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        build_color_appearance_map,
        get_global_video_optimizer,
        prepare_global_optimizer_input,
    )
    from ai_anime.modules.production.infrastructure.indextts2_beat_audio_task import (
        IndexTTS2AudioGenerationPlan,
        build_indextts2_audio_generation_plan,
        collect_indextts2_voice_prereq_errors,
        run_indextts2_beat_audio_generation,
    )
    from ai_anime.modules.production.infrastructure.voice_design_provisioning import (
        VoiceDesignModelUnavailable,
        provision_voice_design_requirements,
    )
    from ai_anime.modules.production.infrastructure.seedance2_assets import (
        Seedance2ResolvedAsset,
        append_seedance2_user_reference_assets,
        build_seedance2_project_assets,
        selected_reference_paths,
    )
    from ai_anime.modules.production.infrastructure.seedance2_panel_service import (
        generate_seedance2_prompt_for_panel,
    )
    from ai_anime.modules.production.infrastructure.seedance2_pipeline import (
        prepare_seedance2_generation_inputs,
    )
    from ai_anime.modules.production.infrastructure.seedance2_voice import (
        DEFAULT_NARRATION_STYLE,
        NARRATION_STYLES,
        build_reference_audio_url,
        file_sha256,
        narration_style_prompt,
        resolve_character_voice,
        resolve_narrator_source,
    )
    from ai_anime.modules.production.infrastructure.seedance2_voice_references import (
        dialogue_voice_reference_rows,
        resolve_narrator_reference_status,
    )
    from ai_anime.modules.production.infrastructure.media_generation.grid_splitter import (
        combine_to_grid,
    )
    from ai_anime.modules.production.infrastructure.media_generation.image_generator import (
        create_image_generator,
        generate_character_reference_unified,
        generate_identity_image_unified,
    )
    from ai_anime.modules.production.infrastructure.media_generation.indextts2 import (
        IndexTTS2Client,
    )
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_character import (
        NanoBananaCharacterGenerator,
    )
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
        REGEN_MODE_CONFIGS,
        SKETCH_DEFAULT_MODE_KEY,
        NanoBananaGridGenerator,
        _call_newapi_image_api,
        _resolve_scene_prop_asset_refs,
        character_grid_split,
        create_grid_generator,
        filter_character_map_by_precomputed,
        generate_reference_edit_image,
        generate_text_to_image,
        get_sketch_nxn_modes,
        load_precomputed_panel_detected,
        normalize_image_size,
        perfect_grid_split,
        regenerate_selected_beats,
        scene_grid_split,
        sketch_grid_split,
        sketch_pass1_mode_key,
        sketch_scene_grid_split,
    )
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_prop import (
        PROP_REF_IMAGE_SIZE,
        build_prop_reference_prompt,
        generate_prop_reference,
    )
    from ai_anime.modules.production.infrastructure.media_generation.pool_indexer import (
        build_beat_sketch_paths,
        compute_beat_content_hash,
        is_pool_image_stale,
        load_pool_index,
        rebuild_pool_index,
        save_grid_and_split,
        save_pool_index,
    )
    from ai_anime.modules.production.infrastructure.media_generation.prompt_builder import (
        PromptComponents,
        PromptMode,
        UnifiedPromptBuilder,
        create_prompt_context,
    )
    from ai_anime.modules.production.infrastructure.media_generation.render_identity_guard import (
        render_ai_detection_error,
    )
    from ai_anime.modules.production.infrastructure.media_generation.scene_reference_images import (
        build_scene_reference_prompt,
        generate_scene_reference_image,
    )
    from ai_anime.modules.production.infrastructure.media_generation.sketch_color_detector import (
        detect_sketch_colors,
    )
    from ai_anime.modules.production.infrastructure.media_generation.style_analyzer import (
        StyleAnalyzer,
    )
    from ai_anime.modules.production.infrastructure.media_generation.tts_generator import (
        TTSResult,
        create_tts_generator,
    )
    from ai_anime.modules.production.infrastructure.media_generation.video_composer import (
        SceneAsset,
        VideoComposer,
        create_video_composer,
        normalize_video_title,
    )
    from ai_anime.modules.production.infrastructure.media_generation.video_generator import (
        ShotReference,
        create_video_generator,
    )

from ai_anime.modules.production.application.director_control_sketch import (
    DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND,
    DirectorControlSketchUnavailable,
    DirectorControlSketchUseCases,
    GenerateDirectorControlSketchCommand,
    ScheduledDirectorControlSketch,
)
from ai_anime.modules.production.application.episode_audio import (
    INDEXTTS2_AUDIO_TASK_TYPE,
    AudioVoicePrerequisitesMissing,
    EpisodeAudioBillingQuote,
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
    EpisodeAudioGenerationNotRequired,
    EpisodeAudioGenerationPlan,
    EpisodeAudioUseCases,
    GenerateEpisodeAudioCommand,
    ScheduledEpisodeAudio,
)
from ai_anime.modules.production.application.episode_export import (
    EpisodeExportUseCases,
    EpisodeFileExport,
    EpisodeScriptBeatsMissing,
    EpisodeSubtitlesMissing,
    EpisodeTextExport,
    FinalEpisodeVideoMissing,
)
from ai_anime.modules.production.application.episode_video import (
    ComposeEpisodeVideoCommand,
    EpisodeBeatsMissing,
    EpisodeVideoUseCases,
    FinalEpisodeVideoStatus,
    ScheduledEpisodeVideo,
)
from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsRejected,
    ProductionImageSettingsUseCases,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
)
from ai_anime.modules.production.application.image_generation_usage import (
    ImageGenerationGuardQuery,
    ImageGenerationUsageUseCases,
)
from ai_anime.modules.production.application.sketch_editing import (
    CropCurrentSketchCommand,
    CurrentSketchMissing,
    SaveSketchEditorCommand,
    SketchBeatMissing,
    SketchCropSourceQuery,
    SketchCropSourceView,
    SketchCropRejected,
    SketchEditingUseCases,
    SketchEditorQuery,
    SketchEditorSaveRejected,
    SketchPoseCandidatesMissing,
)
from ai_anime.modules.production.application.sketch_marker_detection_task import (
    AI_IDENTITY_DETECTION_TASK_TYPE,
    ScheduleSketchMarkerDetectionCommand,
    ScheduledSketchMarkerDetection,
    SketchMarkerDetectionTaskUseCases,
)
from ai_anime.modules.production.application.sketch_markers import (
    AssignProjectSketchColorsCommand,
    DetectProjectSketchMarkersCommand,
    SketchColorAssignmentResult,
    SketchColorMarkersMissing,
    SketchColorPersistenceFailed,
    SketchEpisodeBeatsMissing,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchMarkerDetectionResult,
    SketchMarkerUseCases,
)
from ai_anime.modules.production.application.model_selection import (
    resolve_episode_video_resolution,
    resolve_video_generation_model,
    resolve_video_generation_route,
)
from ai_anime.modules.production.application.sketch_regen_queue import (
    ReplaceSketchRegenQueueCommand,
    SketchRegenQueueResult,
    SketchRegenQueueUseCases,
)
from ai_anime.modules.production.application.video_pool import (
    AddGeneratedVideoCommand,
    SelectedVideoPoolEntry,
    VideoPoolEntryUnavailable,
    VideoPoolListing,
    VideoPoolUseCases,
)
from ai_anime.modules.production.application.global_video_optimization import (
    GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    GlobalVideoOptimizationUseCases,
    OptimizeEpisodeVideoCommand,
    ScheduledGlobalVideoOptimization,
)
from ai_anime.modules.production.application.grid_regeneration import (
    GRID_REGENERATION_TASK_TYPE,
    GridRegenerationRejected,
    GridRegenerationUseCases,
    RegenerateGridCommand,
    ScheduledGridRegeneration,
)
from ai_anime.modules.production.application.grid_pool import (
    BeatSketchCandidates,
    CutGridCommand,
    CutGridResult,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolListing,
    GridPoolPreviewRejected,
    GridPoolPromptRejected,
    GridPoolSelectionRejected,
    GridPoolUploadRejected,
    GridPoolUseCases,
    GridPrompt,
    GridPromptQuery,
    GridSketchPreview,
    GridSketchPreviewCommand,
    RebuiltGridPool,
    SelectedGridPoolImage,
    SelectGridPoolImageCommand,
    UploadedBeatPoolImage,
    UploadedGridImage,
    UploadBeatPoolImageCommand,
    UploadGridImageCommand,
)
from ai_anime.modules.production.application.manual_sketch_regeneration import (
    GenerateMissingManualSketchesCommand,
    ManualSketchRegenerationRejected,
    ManualSketchRegenerationUseCases,
    ScheduledManualSketchRegeneration,
)
from ai_anime.modules.production.application.render_planning import (
    BuildRenderPlanCommand,
    ExecutedRenderPlan,
    ExecuteRenderPlanCommand,
    PlannedRenderEpisode,
    RenderPlanConflict,
    RenderPlanFeatureDisabled,
    RenderPlanRejected,
    RenderPlanUseCases,
)
from ai_anime.modules.production.application.seedance2_panel import (
    CropSeedance2AssetCommand,
    RemoveSeedance2AssetCommand,
    Seedance2PanelBeatMissing,
    Seedance2PanelOperationRejected,
    Seedance2PanelQuery,
    Seedance2PanelUseCases,
    TrimSeedance2AudioAssetCommand,
    UploadSeedance2AssetCommand,
)
from ai_anime.modules.production.application.seedance2_config import (
    Seedance2I2VMode,
    Seedance2VideoConfig,
    dump_seedance2_config,
    parse_seedance2_config,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SELECTED_RENDER_REGEN_TASK_TYPE,
    SELECTED_SKETCH_REGEN_TASK_TYPE,
    RegenerateSelectedBeatsCommand,
    ScheduledSelectedRegeneration,
    SelectedRegenerationKind,
    SelectedRegenerationRejected,
    SelectedRegenerationUseCases,
)
from ai_anime.modules.production.application.single_video import (
    SINGLE_VIDEO_TASK_TYPE,
    GenerateSingleVideoCommand,
    ScheduledSingleVideo,
    SingleVideoRejected,
    SingleVideoUseCases,
)
from ai_anime.modules.production.application.sketch_generation import (
    SKETCH_GENERATION_TASK_TYPE,
    GenerateSketchesCommand,
    ScheduledSketchGeneration,
    SketchGenerationRejected,
    SketchGenerationUseCases,
)
from ai_anime.modules.production.application.sketch_edit_execution import (
    SKETCH_EDIT_EXECUTION_TASK_TYPE,
    ScheduledSketchEditExecution,
    SketchEditExecutionTask,
    SketchEditExecutionUseCases,
)
from ai_anime.modules.production.domain.detected_refs import (
    NO_CHARACTER_MARKER,
    NO_PROP_MARKER,
    build_episode_identity_alias_map,
    canonicalize_visual_identity_markers,
    collect_prop_marker_ids_from_beat,
    complete_detected_refs_from_visual_description,
    extract_char_identities_from_markers,
    extract_prop_ids_from_markers,
    normalize_detected_identities,
    normalize_detected_props,
    real_detected_identities,
    real_detected_props,
)
from ai_anime.modules.production.domain.seedance2_dialogue import (
    normalize_seedance2_audio_type,
)
from ai_anime.modules.production.domain.voice_design import VoiceDesignRequirement
from ai_anime.modules.production.domain.video_model import (
    grok_video_ratio,
    grok_video_resolution,
    happyhorse_ratio,
    happyhorse_resolution,
    is_grok_video_model,
    is_happyhorse_model,
    is_seedance2_model,
    video_api_resolution,
    video_resolution,
)
from ai_anime.modules.production.domain.sketch_color import (
    BRIDGMAN_CHARACTER_PALETTE,
    PROP_MARKER_PALETTE,
    assign_identity_sketch_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)
from ai_anime.modules.production.domain.render_planning import RenderPlanGrid
from ai_anime.modules.production.infrastructure.grid_pool_models import (
    GridEntry,
    PoolImage,
    PoolIndex,
)

_MEDIA_GENERATION = "ai_anime.modules.production.infrastructure.media_generation"
_MEDIA_SETTINGS = "ai_anime.modules.production.infrastructure.media_generation_settings"

_LAZY_MODULES = {
    "nanobanana_grid": f"{_MEDIA_GENERATION}.nanobanana_grid",
    "pool_indexer": f"{_MEDIA_GENERATION}.pool_indexer",
}

_LAZY_EXPORTS = {
    "DEFAULT_NARRATION_STYLE": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "DEFAULT_NARRATION_STYLE",
    ),
    "NARRATION_STYLES": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "NARRATION_STYLES",
    ),
    "Seedance2ResolvedAsset": (
        "ai_anime.modules.production.infrastructure.seedance2_assets",
        "Seedance2ResolvedAsset",
    ),
    "build_color_appearance_map": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "build_color_appearance_map",
    ),
    "append_seedance2_user_reference_assets": (
        "ai_anime.modules.production.infrastructure.seedance2_assets",
        "append_seedance2_user_reference_assets",
    ),
    "build_reference_audio_url": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "build_reference_audio_url",
    ),
    "build_seedance2_project_assets": (
        "ai_anime.modules.production.infrastructure.seedance2_assets",
        "build_seedance2_project_assets",
    ),
    "collect_indextts2_voice_prereq_errors": (
        "ai_anime.modules.production.infrastructure.indextts2_beat_audio_task",
        "collect_indextts2_voice_prereq_errors",
    ),
    "build_indextts2_audio_generation_plan": (
        "ai_anime.modules.production.infrastructure.indextts2_beat_audio_task",
        "build_indextts2_audio_generation_plan",
    ),
    "IndexTTS2AudioGenerationPlan": (
        "ai_anime.modules.production.infrastructure.indextts2_beat_audio_task",
        "IndexTTS2AudioGenerationPlan",
    ),
    "dialogue_voice_reference_rows": (
        "ai_anime.modules.production.infrastructure.seedance2_voice_references",
        "dialogue_voice_reference_rows",
    ),
    "file_sha256": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "file_sha256",
    ),
    "generate_seedance2_prompt_for_panel": (
        "ai_anime.modules.production.infrastructure.seedance2_panel_service",
        "generate_seedance2_prompt_for_panel",
    ),
    "get_global_video_optimizer": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "get_global_video_optimizer",
    ),
    "narration_style_prompt": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "narration_style_prompt",
    ),
    "prepare_seedance2_generation_inputs": (
        "ai_anime.modules.production.infrastructure.seedance2_pipeline",
        "prepare_seedance2_generation_inputs",
    ),
    "prepare_global_optimizer_input": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "prepare_global_optimizer_input",
    ),
    "resolve_character_voice": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "resolve_character_voice",
    ),
    "resolve_narrator_reference_status": (
        "ai_anime.modules.production.infrastructure.seedance2_voice_references",
        "resolve_narrator_reference_status",
    ),
    "resolve_narrator_source": (
        "ai_anime.modules.production.infrastructure.seedance2_voice",
        "resolve_narrator_source",
    ),
    "run_indextts2_beat_audio_generation": (
        "ai_anime.modules.production.infrastructure.indextts2_beat_audio_task",
        "run_indextts2_beat_audio_generation",
    ),
    "provision_voice_design_requirements": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "provision_voice_design_requirements",
    ),
    "VoiceDesignModelUnavailable": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "VoiceDesignModelUnavailable",
    ),
    "selected_reference_paths": (
        "ai_anime.modules.production.infrastructure.seedance2_assets",
        "selected_reference_paths",
    ),
}

_LAZY_EXPORTS.update(
    {
        "DEFAULT_VIDEO_RESOLUTION": (_MEDIA_SETTINGS, "DEFAULT_VIDEO_RESOLUTION"),
        "FFMPEG_PATH": (_MEDIA_SETTINGS, "FFMPEG_PATH"),
        "IMAGE_DEFAULT_HEIGHT": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_HEIGHT"),
        "IMAGE_DEFAULT_STYLE": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_STYLE"),
        "IMAGE_DEFAULT_WIDTH": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_WIDTH"),
        "INDEXTTS2_RECORD_PROVIDER": (
            _MEDIA_SETTINGS,
            "INDEXTTS2_RECORD_PROVIDER",
        ),
        "INDEXTTS2_TIMEOUT_SECONDS": (
            _MEDIA_SETTINGS,
            "INDEXTTS2_TIMEOUT_SECONDS",
        ),
        "MODE_CONFIG": (_MEDIA_SETTINGS, "MODE_CONFIG"),
        "OPENAI_IMAGE_QUALITY": (_MEDIA_SETTINGS, "OPENAI_IMAGE_QUALITY"),
        "OPENAI_SKETCH_IMAGE_QUALITY": (
            _MEDIA_SETTINGS,
            "OPENAI_SKETCH_IMAGE_QUALITY",
        ),
        "VIDEO_CODEC": (_MEDIA_SETTINGS, "VIDEO_CODEC"),
        "apply_style_reference": (_MEDIA_SETTINGS, "apply_style_reference"),
        "get_grid_generation_config": (
            _MEDIA_SETTINGS,
            "get_grid_generation_config",
        ),
        "get_render_generation_config": (
            _MEDIA_SETTINGS,
            "get_render_generation_config",
        ),
        "get_sketch_generation_config": (
            _MEDIA_SETTINGS,
            "get_sketch_generation_config",
        ),
        "get_style_labels": (_MEDIA_SETTINGS, "get_style_labels"),
        "get_style_preset": (_MEDIA_SETTINGS, "get_style_preset"),
        "get_tts_config": (_MEDIA_SETTINGS, "get_tts_config"),
        "get_video_config": (_MEDIA_SETTINGS, "get_video_config"),
        "list_available_styles": (_MEDIA_SETTINGS, "list_available_styles"),
        "IndexTTS2Client": (f"{_MEDIA_GENERATION}.indextts2", "IndexTTS2Client"),
        "NanoBananaCharacterGenerator": (
            f"{_MEDIA_GENERATION}.nanobanana_character",
            "NanoBananaCharacterGenerator",
        ),
        "NanoBananaGridGenerator": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "NanoBananaGridGenerator",
        ),
        "PROP_REF_IMAGE_SIZE": (
            f"{_MEDIA_GENERATION}.nanobanana_prop",
            "PROP_REF_IMAGE_SIZE",
        ),
        "PromptComponents": (
            f"{_MEDIA_GENERATION}.prompt_builder",
            "PromptComponents",
        ),
        "PromptMode": (f"{_MEDIA_GENERATION}.prompt_builder", "PromptMode"),
        "REGEN_MODE_CONFIGS": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "REGEN_MODE_CONFIGS",
        ),
        "SKETCH_DEFAULT_MODE_KEY": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "SKETCH_DEFAULT_MODE_KEY",
        ),
        "SceneAsset": (f"{_MEDIA_GENERATION}.video_composer", "SceneAsset"),
        "ShotReference": (f"{_MEDIA_GENERATION}.video_generator", "ShotReference"),
        "StyleAnalyzer": (f"{_MEDIA_GENERATION}.style_analyzer", "StyleAnalyzer"),
        "TTSResult": (f"{_MEDIA_GENERATION}.tts_generator", "TTSResult"),
        "UnifiedPromptBuilder": (
            f"{_MEDIA_GENERATION}.prompt_builder",
            "UnifiedPromptBuilder",
        ),
        "VideoComposer": (f"{_MEDIA_GENERATION}.video_composer", "VideoComposer"),
        "_call_newapi_image_api": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "_call_newapi_image_api",
        ),
        "_resolve_scene_prop_asset_refs": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "_resolve_scene_prop_asset_refs",
        ),
        "build_beat_sketch_paths": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "build_beat_sketch_paths",
        ),
        "build_prop_reference_prompt": (
            f"{_MEDIA_GENERATION}.nanobanana_prop",
            "build_prop_reference_prompt",
        ),
        "build_scene_reference_prompt": (
            f"{_MEDIA_GENERATION}.scene_reference_images",
            "build_scene_reference_prompt",
        ),
        "character_grid_split": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "character_grid_split",
        ),
        "combine_to_grid": (f"{_MEDIA_GENERATION}.grid_splitter", "combine_to_grid"),
        "compute_beat_content_hash": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "compute_beat_content_hash",
        ),
        "create_grid_generator": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "create_grid_generator",
        ),
        "create_image_generator": (
            f"{_MEDIA_GENERATION}.image_generator",
            "create_image_generator",
        ),
        "create_prompt_context": (
            f"{_MEDIA_GENERATION}.prompt_builder",
            "create_prompt_context",
        ),
        "create_tts_generator": (
            f"{_MEDIA_GENERATION}.tts_generator",
            "create_tts_generator",
        ),
        "create_video_composer": (
            f"{_MEDIA_GENERATION}.video_composer",
            "create_video_composer",
        ),
        "create_video_generator": (
            f"{_MEDIA_GENERATION}.video_generator",
            "create_video_generator",
        ),
        "detect_sketch_colors": (
            f"{_MEDIA_GENERATION}.sketch_color_detector",
            "detect_sketch_colors",
        ),
        "filter_character_map_by_precomputed": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "filter_character_map_by_precomputed",
        ),
        "generate_character_reference_unified": (
            f"{_MEDIA_GENERATION}.image_generator",
            "generate_character_reference_unified",
        ),
        "generate_identity_image_unified": (
            f"{_MEDIA_GENERATION}.image_generator",
            "generate_identity_image_unified",
        ),
        "generate_prop_reference": (
            f"{_MEDIA_GENERATION}.nanobanana_prop",
            "generate_prop_reference",
        ),
        "generate_reference_edit_image": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "generate_reference_edit_image",
        ),
        "generate_scene_reference_image": (
            f"{_MEDIA_GENERATION}.scene_reference_images",
            "generate_scene_reference_image",
        ),
        "generate_text_to_image": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "generate_text_to_image",
        ),
        "get_sketch_nxn_modes": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "get_sketch_nxn_modes",
        ),
        "is_pool_image_stale": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "is_pool_image_stale",
        ),
        "load_pool_index": (f"{_MEDIA_GENERATION}.pool_indexer", "load_pool_index"),
        "load_precomputed_panel_detected": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "load_precomputed_panel_detected",
        ),
        "normalize_image_size": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "normalize_image_size",
        ),
        "normalize_video_title": (
            f"{_MEDIA_GENERATION}.video_composer",
            "normalize_video_title",
        ),
        "perfect_grid_split": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "perfect_grid_split",
        ),
        "rebuild_pool_index": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "rebuild_pool_index",
        ),
        "regenerate_selected_beats": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "regenerate_selected_beats",
        ),
        "render_ai_detection_error": (
            f"{_MEDIA_GENERATION}.render_identity_guard",
            "render_ai_detection_error",
        ),
        "save_grid_and_split": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "save_grid_and_split",
        ),
        "save_pool_index": (f"{_MEDIA_GENERATION}.pool_indexer", "save_pool_index"),
        "scene_grid_split": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "scene_grid_split",
        ),
        "sketch_grid_split": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "sketch_grid_split",
        ),
        "sketch_pass1_mode_key": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "sketch_pass1_mode_key",
        ),
        "sketch_scene_grid_split": (
            f"{_MEDIA_GENERATION}.nanobanana_grid",
            "sketch_scene_grid_split",
        ),
    }
)


def __getattr__(name: str) -> Any:
    module_name = _LAZY_MODULES.get(name)
    if module_name is not None:
        value = import_module(module_name)
        globals()[name] = value
        return value
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = target
    value = getattr(import_module(module_name), attribute_name)
    globals()[name] = value
    return value


def episode_audio_use_cases() -> EpisodeAudioUseCases:
    from ai_anime.modules.production.composition import (
        episode_audio_use_cases as build,
    )

    return build()


def episode_export_use_cases() -> EpisodeExportUseCases:
    from ai_anime.modules.production.composition import (
        episode_export_use_cases as build,
    )

    return build()


def episode_video_use_cases() -> EpisodeVideoUseCases:
    from ai_anime.modules.production.composition import (
        episode_video_use_cases as build,
    )

    return build()


def video_pool_use_cases() -> VideoPoolUseCases:
    from ai_anime.modules.production.composition import video_pool_use_cases as build

    return build()


def global_video_optimization_use_cases() -> GlobalVideoOptimizationUseCases:
    from ai_anime.modules.production.composition import (
        global_video_optimization_use_cases as build,
    )

    return build()


def grid_regeneration_use_cases() -> GridRegenerationUseCases:
    from ai_anime.modules.production.composition import (
        grid_regeneration_use_cases as build,
    )

    return build()


def grid_pool_use_cases() -> GridPoolUseCases:
    from ai_anime.modules.production.composition import grid_pool_use_cases as build

    return build()


def render_plan_use_cases() -> RenderPlanUseCases:
    from ai_anime.modules.production.composition import render_plan_use_cases as build

    return build()


def seedance2_panel_use_cases() -> Seedance2PanelUseCases:
    from ai_anime.modules.production.composition import (
        seedance2_panel_use_cases as build,
    )

    return build()


def single_video_use_cases() -> SingleVideoUseCases:
    from ai_anime.modules.production.composition import single_video_use_cases as build

    return build()


def sketch_generation_use_cases() -> SketchGenerationUseCases:
    from ai_anime.modules.production.composition import (
        sketch_generation_use_cases as build,
    )

    return build()


def sketch_edit_execution_use_cases() -> SketchEditExecutionUseCases:
    from ai_anime.modules.production.composition import (
        sketch_edit_execution_use_cases as build,
    )

    return build()


def director_control_sketch_use_cases() -> DirectorControlSketchUseCases:
    from ai_anime.modules.production.composition import (
        director_control_sketch_use_cases as build,
    )

    return build()


def selected_regeneration_use_cases() -> SelectedRegenerationUseCases:
    from ai_anime.modules.production.composition import (
        selected_regeneration_use_cases as build,
    )

    return build()


def manual_sketch_regeneration_use_cases() -> ManualSketchRegenerationUseCases:
    from ai_anime.modules.production.composition import (
        manual_sketch_regeneration_use_cases as build,
    )

    return build()


def production_generation_context_use_cases(
    store: Any,
    username: str,
) -> ProductionGenerationContextUseCases:
    from ai_anime.modules.production.composition import (
        production_generation_context_use_cases as build,
    )

    return build(store, username)


def production_image_settings_use_cases() -> ProductionImageSettingsUseCases:
    from ai_anime.modules.production.composition import (
        production_image_settings_use_cases as build,
    )

    return build()


def image_generation_usage_use_cases() -> ImageGenerationUsageUseCases:
    from ai_anime.modules.production.composition import (
        image_generation_usage_use_cases as build,
    )

    return build()


def sketch_marker_use_cases() -> SketchMarkerUseCases:
    from ai_anime.modules.production.composition import (
        sketch_marker_use_cases as build,
    )

    return build()


def sketch_marker_detection_task_use_cases() -> SketchMarkerDetectionTaskUseCases:
    from ai_anime.modules.production.composition import (
        sketch_marker_detection_task_use_cases as build,
    )

    return build()


def sketch_regen_queue_use_cases() -> SketchRegenQueueUseCases:
    from ai_anime.modules.production.composition import (
        sketch_regen_queue_use_cases as build,
    )

    return build()


def sketch_editing_use_cases() -> SketchEditingUseCases:
    from ai_anime.modules.production.composition import (
        sketch_editing_use_cases as build,
    )

    return build()


__all__ = [
    "DEFAULT_VIDEO_RESOLUTION",
    "FFMPEG_PATH",
    "IMAGE_DEFAULT_HEIGHT",
    "IMAGE_DEFAULT_STYLE",
    "IMAGE_DEFAULT_WIDTH",
    "INDEXTTS2_RECORD_PROVIDER",
    "INDEXTTS2_TIMEOUT_SECONDS",
    "MODE_CONFIG",
    "OPENAI_IMAGE_QUALITY",
    "OPENAI_SKETCH_IMAGE_QUALITY",
    "VIDEO_CODEC",
    "AddGeneratedVideoCommand",
    "AssignProjectSketchColorsCommand",
    "AI_IDENTITY_DETECTION_TASK_TYPE",
    "DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND",
    "GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE",
    "GRID_REGENERATION_TASK_TYPE",
    "INDEXTTS2_AUDIO_TASK_TYPE",
    "IndexTTS2AudioGenerationPlan",
    "SELECTED_RENDER_REGEN_TASK_TYPE",
    "SELECTED_SKETCH_REGEN_TASK_TYPE",
    "SKETCH_GENERATION_TASK_TYPE",
    "SINGLE_VIDEO_TASK_TYPE",
    "AudioVoicePrerequisitesMissing",
    "BeatSketchCandidates",
    "BRIDGMAN_CHARACTER_PALETTE",
    "BuildRenderPlanCommand",
    "ComposeEpisodeVideoCommand",
    "CutGridCommand",
    "CutGridResult",
    "CropCurrentSketchCommand",
    "CropSeedance2AssetCommand",
    "DetectProjectSketchMarkersCommand",
    "DirectorControlSketchUnavailable",
    "DirectorControlSketchUseCases",
    "EpisodeBeatsMissing",
    "EpisodeAudioBeatMissing",
    "EpisodeAudioBillingQuote",
    "EpisodeAudioBeatsMissing",
    "EpisodeAudioGenerationNotRequired",
    "EpisodeAudioGenerationPlan",
    "EpisodeAudioUseCases",
    "EpisodeExportUseCases",
    "EpisodeFileExport",
    "EpisodeScriptBeatsMissing",
    "EpisodeSubtitlesMissing",
    "EpisodeTextExport",
    "EpisodeVideoUseCases",
    "ExecutedRenderPlan",
    "ExecuteRenderPlanCommand",
    "FinalEpisodeVideoStatus",
    "FinalEpisodeVideoMissing",
    "GenerateEpisodeAudioCommand",
    "GenerateDirectorControlSketchCommand",
    "GenerateMissingManualSketchesCommand",
    "GenerateSketchesCommand",
    "GenerateSingleVideoCommand",
    "GlobalVideoOptimizationBeatsMissing",
    "GlobalVideoOptimizationSketchesMissing",
    "GlobalVideoOptimizationUseCases",
    "GridPoolCutRejected",
    "GridEntry",
    "GridRegenerationRejected",
    "GridRegenerationUseCases",
    "GridPoolImageStale",
    "GridPoolListing",
    "GridPoolPreviewRejected",
    "GridPoolPromptRejected",
    "GridPoolSelectionRejected",
    "GridPoolUploadRejected",
    "GridPoolUseCases",
    "GridPrompt",
    "GridPromptQuery",
    "GridSketchPreview",
    "GridSketchPreviewCommand",
    "ImageGenerationGuardQuery",
    "ImageGenerationUsageUseCases",
    "ManualSketchRegenerationRejected",
    "ManualSketchRegenerationUseCases",
    "NO_CHARACTER_MARKER",
    "NO_PROP_MARKER",
    "PROP_MARKER_PALETTE",
    "ProductionGenerationContextUseCases",
    "ProductionImageSettingsRejected",
    "ProductionImageSettingsUseCases",
    "OptimizeEpisodeVideoCommand",
    "PoolImage",
    "PoolIndex",
    "PlannedRenderEpisode",
    "RegenerateGridCommand",
    "RegenerateSelectedBeatsCommand",
    "RenderPlanConflict",
    "RenderPlanFeatureDisabled",
    "RenderPlanGrid",
    "RenderPlanRejected",
    "RenderPlanUseCases",
    "ReplaceSketchRegenQueueCommand",
    "RebuiltGridPool",
    "RemoveSeedance2AssetCommand",
    "ScheduledEpisodeVideo",
    "ScheduledEpisodeAudio",
    "ScheduledGlobalVideoOptimization",
    "ScheduledGridRegeneration",
    "ScheduledManualSketchRegeneration",
    "ScheduledDirectorControlSketch",
    "ScheduledSketchGeneration",
    "ScheduledSketchEditExecution",
    "ScheduledSelectedRegeneration",
    "ScheduledSingleVideo",
    "Seedance2I2VMode",
    "Seedance2PanelBeatMissing",
    "Seedance2PanelOperationRejected",
    "Seedance2PanelQuery",
    "Seedance2PanelUseCases",
    "Seedance2ResolvedAsset",
    "Seedance2VideoConfig",
    "SelectedRegenerationKind",
    "SelectedRegenerationRejected",
    "SelectedRegenerationUseCases",
    "SelectedGridPoolImage",
    "SelectGridPoolImageCommand",
    "SingleVideoRejected",
    "SingleVideoUseCases",
    "SketchGenerationRejected",
    "SketchGenerationUseCases",
    "SKETCH_EDIT_EXECUTION_TASK_TYPE",
    "SketchEditExecutionTask",
    "SketchEditExecutionUseCases",
    "CurrentSketchMissing",
    "SaveSketchEditorCommand",
    "ScheduleSketchMarkerDetectionCommand",
    "ScheduledSketchMarkerDetection",
    "SketchBeatMissing",
    "SketchCropRejected",
    "SketchCropSourceQuery",
    "SketchCropSourceView",
    "SketchColorAssignmentResult",
    "SketchColorMarkersMissing",
    "SketchColorPersistenceFailed",
    "SketchEditingUseCases",
    "SketchEpisodeBeatsMissing",
    "SketchEditorQuery",
    "SketchEditorSaveRejected",
    "SketchMarkerDetectionFailed",
    "SketchMarkerDetectionRejected",
    "SketchMarkerDetectionResult",
    "SketchMarkerUseCases",
    "SketchMarkerDetectionTaskUseCases",
    "SketchPoseCandidatesMissing",
    "SketchRegenQueueResult",
    "SketchRegenQueueUseCases",
    "UpdateRenderImageSettingsCommand",
    "UpdateSketchImageSettingsCommand",
    "TrimSeedance2AudioAssetCommand",
    "UploadSeedance2AssetCommand",
    "UploadedBeatPoolImage",
    "UploadBeatPoolImageCommand",
    "UploadedGridImage",
    "UploadGridImageCommand",
    "SelectedVideoPoolEntry",
    "VideoPoolEntryUnavailable",
    "VideoPoolListing",
    "VideoPoolUseCases",
    "VoiceDesignRequirement",
    "VoiceDesignModelUnavailable",
    "assign_identity_sketch_colors",
    "apply_style_reference",
    "append_seedance2_user_reference_assets",
    "build_reference_audio_url",
    "build_episode_identity_alias_map",
    "build_color_appearance_map",
    "build_seedance2_project_assets",
    "build_indextts2_audio_generation_plan",
    "collect_indextts2_voice_prereq_errors",
    "collect_prop_marker_ids_from_beat",
    "canonicalize_visual_identity_markers",
    "complete_detected_refs_from_visual_description",
    "director_control_sketch_use_cases",
    "dialogue_voice_reference_rows",
    "dump_seedance2_config",
    "episode_audio_use_cases",
    "episode_export_use_cases",
    "episode_video_use_cases",
    "extract_char_identities_from_markers",
    "extract_prop_ids_from_markers",
    "file_sha256",
    "generate_seedance2_prompt_for_panel",
    "get_global_video_optimizer",
    "get_grid_generation_config",
    "grok_video_ratio",
    "grok_video_resolution",
    "global_video_optimization_use_cases",
    "grid_regeneration_use_cases",
    "grid_pool_use_cases",
    "happyhorse_ratio",
    "happyhorse_resolution",
    "global_prop_marker_colors",
    "image_generation_usage_use_cases",
    "is_grok_video_model",
    "is_happyhorse_model",
    "is_seedance2_model",
    "marker_color_change_requires_sketch_clean",
    "manual_sketch_regeneration_use_cases",
    "narration_style_prompt",
    "normalize_detected_identities",
    "normalize_detected_props",
    "normalize_seedance2_audio_type",
    "parse_seedance2_config",
    "prepare_seedance2_generation_inputs",
    "prepare_global_optimizer_input",
    "production_generation_context_use_cases",
    "production_image_settings_use_cases",
    "provision_voice_design_requirements",
    "real_detected_identities",
    "real_detected_props",
    "render_plan_use_cases",
    "resolve_episode_video_resolution",
    "resolve_video_generation_model",
    "resolve_video_generation_route",
    "resolve_character_voice",
    "resolve_narrator_reference_status",
    "resolve_narrator_source",
    "run_indextts2_beat_audio_generation",
    "selected_reference_paths",
    "sketch_generation_use_cases",
    "sketch_edit_execution_use_cases",
    "sketch_editing_use_cases",
    "sketch_marker_use_cases",
    "sketch_marker_detection_task_use_cases",
    "sketch_regen_queue_use_cases",
    "video_api_resolution",
    "seedance2_panel_use_cases",
    "selected_regeneration_use_cases",
    "video_resolution",
    "single_video_use_cases",
    "video_pool_use_cases",
    "DEFAULT_NARRATION_STYLE",
    "NARRATION_STYLES",
    "IndexTTS2Client",
    "NanoBananaCharacterGenerator",
    "NanoBananaGridGenerator",
    "PROP_REF_IMAGE_SIZE",
    "PromptComponents",
    "PromptMode",
    "REGEN_MODE_CONFIGS",
    "SKETCH_DEFAULT_MODE_KEY",
    "SceneAsset",
    "ShotReference",
    "StyleAnalyzer",
    "TTSResult",
    "UnifiedPromptBuilder",
    "VideoComposer",
    "_call_newapi_image_api",
    "_resolve_scene_prop_asset_refs",
    "build_beat_sketch_paths",
    "build_prop_reference_prompt",
    "build_scene_reference_prompt",
    "character_grid_split",
    "combine_to_grid",
    "compute_beat_content_hash",
    "create_grid_generator",
    "create_image_generator",
    "create_prompt_context",
    "create_tts_generator",
    "create_video_composer",
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
    "get_render_generation_config",
    "get_sketch_generation_config",
    "get_style_labels",
    "get_style_preset",
    "get_tts_config",
    "get_video_config",
    "is_pool_image_stale",
    "load_pool_index",
    "load_precomputed_panel_detected",
    "list_available_styles",
    "nanobanana_grid",
    "normalize_image_size",
    "normalize_video_title",
    "perfect_grid_split",
    "pool_indexer",
    "rebuild_pool_index",
    "regenerate_selected_beats",
    "render_ai_detection_error",
    "save_grid_and_split",
    "save_pool_index",
    "scene_grid_split",
    "sketch_grid_split",
    "sketch_pass1_mode_key",
    "sketch_scene_grid_split",
]
