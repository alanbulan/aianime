"""Stable application API for the Production bounded context."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ai_anime.modules.production.application.visual_asset_readiness import (
        EpisodeVisualAssetReadiness,
        inspect_episode_visual_assets,
    )
    from ai_anime.modules.production.infrastructure.visual_asset_readiness import (
        inspect_project_episode_visual_assets,
    )
    from ai_anime.modules.production.infrastructure.media_generation_settings import (
        DEFAULT_VIDEO_RESOLUTION,
        FFMPEG_PATH,
        IMAGE_DEFAULT_HEIGHT,
        IMAGE_DEFAULT_STYLE,
        IMAGE_DEFAULT_WIDTH,
        MODE_CONFIG,
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
    from ai_anime.modules.production.infrastructure.media_generation import pool_indexer
    from ai_anime.modules.production.infrastructure.global_video_optimizer import (
        build_color_appearance_map,
        get_global_video_optimizer,
        prepare_global_optimizer_input,
    )
    from ai_anime.modules.production.infrastructure.episode_audio_generation import (
        build_episode_audio_generation_plan,
        collect_episode_audio_prereq_errors,
        run_episode_audio_generation,
    )
    from ai_anime.modules.production.infrastructure.episode_composition import (
        episode_bgm_path,
        episode_composition_is_current,
        generate_episode_bgm,
        write_episode_composition_manifest,
    )
    from ai_anime.modules.production.infrastructure.voice_design_provisioning import (
        VoiceDesignModelUnavailable,
        VoiceDesignProvisioningFailed,
        build_character_voice_requirement,
        provision_missing_character_voices,
        provision_voice_design_requirements,
    )
    from ai_anime.modules.production.infrastructure.video_reference_assets import (
        VideoReferenceAsset,
        append_user_video_reference_assets,
        build_video_reference_assets,
        selected_reference_paths,
    )
    from ai_anime.modules.production.infrastructure.video_reference_panel_service import (
        generate_video_prompt_for_panel,
    )
    from ai_anime.modules.production.infrastructure.video_reference_pipeline import (
        VideoReferencePrereqError,
        collect_video_reference_prereq_errors,
        prepare_video_reference_generation_inputs,
    )
    from ai_anime.modules.production.infrastructure.video_reference_voice import (
        DEFAULT_NARRATION_STYLE,
        NARRATION_STYLES,
        build_reference_audio_url,
        file_sha256,
        narration_style_prompt,
        resolve_character_voice,
        resolve_narrator_source,
    )
    from ai_anime.modules.production.infrastructure.video_reference_voice_references import (
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
    from ai_anime.modules.production.infrastructure.media_generation.speech_synthesis import (
        SpeechSynthesisClient,
    )
    from ai_anime.modules.production.infrastructure.media_generation.character_image_generator import (
        CharacterImageGenerator,
    )
    from ai_anime.modules.production.infrastructure.media_generation.image_grid import (
        REGEN_MODE_CONFIGS,
        SKETCH_DEFAULT_MODE_KEY,
        ImageGridGenerator,
        call_image_generation_api,
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
    from ai_anime.modules.production.infrastructure.media_generation.prop_image_generator import (
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
        stale_canonical_sketch_numbers,
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
    EPISODE_AUDIO_TASK_TYPE,
    AudioVoicePrerequisitesMissing,
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
    DeletedVideoPoolEntry,
    SelectedVideoPoolEntry,
    VideoPoolEntryInUse,
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
    DeleteGridPoolImageCommand,
    DeletedGridPoolImage,
    GridPoolDeleteRejected,
    GridPoolCutRejected,
    GridPoolImageStale,
    GridPoolImageInUse,
    GridPoolImageUnavailable,
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
from ai_anime.modules.production.application.video_reference_panel import (
    CropVideoReferenceAssetCommand,
    RemoveVideoReferenceAssetCommand,
    VideoReferencePanelBeatMissing,
    VideoReferencePanelOperationRejected,
    VideoReferencePanelQuery,
    VideoReferencePanelUseCases,
    TrimVideoReferenceAudioAssetCommand,
    UploadVideoReferenceAssetCommand,
)
from ai_anime.modules.production.application.video_config import (
    VideoReferenceMode,
    BeatVideoConfig,
    dump_video_config,
    explicit_video_mode,
    parse_video_config,
    video_model_role_for_beat,
    video_model_role_for_mode,
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
    authoritative_detected_refs_for_beat,
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
from ai_anime.modules.production.domain.video_dialogue import (
    normalize_video_audio_type,
)
from ai_anime.modules.production.domain.voice_design import VoiceDesignRequirement
from ai_anime.modules.production.domain.video_model import (
    normalize_video_generation_duration,
    normalize_video_ratio,
    uses_advanced_reference_video_workflow,
    uses_reference_video_workflow,
    validate_video_resolution_duration,
    video_api_resolution,
    video_resolution,
)
from ai_anime.modules.production.domain.sketch_color import (
    BRIDGMAN_CHARACTER_PALETTE,
    PROP_MARKER_PALETTE,
    assign_identity_sketch_colors,
    global_prop_marker_colors,
)
from ai_anime.modules.production.domain.render_planning import RenderPlanGrid
from ai_anime.modules.production.infrastructure.grid_pool_models import (
    GridEntry,
    PoolImage,
    PoolIndex,
)

_MEDIA_GENERATION = "ai_anime.modules.production.infrastructure.media_generation"
_MEDIA_SETTINGS = "ai_anime.modules.production.infrastructure.media_generation_settings"


def video_model_workflow(model: str | None) -> str:
    """Return the workflow explicitly declared by the desktop model catalog."""

    from ai_anime.modules.model_usage.public import runtime_model_capability

    capability = runtime_model_capability(model)
    return str(getattr(capability, "video_workflow", None) or "standard")


def video_model_uses_advanced_reference_workflow(model: str | None) -> bool:
    return uses_advanced_reference_video_workflow(video_model_workflow(model))


def video_model_uses_reference_workflow(model: str | None) -> bool:
    return uses_reference_video_workflow(video_model_workflow(model))

_LAZY_MODULES = {
    "pool_indexer": f"{_MEDIA_GENERATION}.pool_indexer",
}

_LAZY_EXPORTS = {
    "EpisodeVisualAssetReadiness": (
        "ai_anime.modules.production.application.visual_asset_readiness",
        "EpisodeVisualAssetReadiness",
    ),
    "inspect_episode_visual_assets": (
        "ai_anime.modules.production.application.visual_asset_readiness",
        "inspect_episode_visual_assets",
    ),
    "inspect_project_episode_visual_assets": (
        "ai_anime.modules.production.infrastructure.visual_asset_readiness",
        "inspect_project_episode_visual_assets",
    ),
    "DEFAULT_NARRATION_STYLE": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "DEFAULT_NARRATION_STYLE",
    ),
    "NARRATION_STYLES": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "NARRATION_STYLES",
    ),
    "VideoReferenceAsset": (
        "ai_anime.modules.production.infrastructure.video_reference_assets",
        "VideoReferenceAsset",
    ),
    "build_color_appearance_map": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "build_color_appearance_map",
    ),
    "append_user_video_reference_assets": (
        "ai_anime.modules.production.infrastructure.video_reference_assets",
        "append_user_video_reference_assets",
    ),
    "build_reference_audio_url": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "build_reference_audio_url",
    ),
    "build_video_reference_assets": (
        "ai_anime.modules.production.infrastructure.video_reference_assets",
        "build_video_reference_assets",
    ),
    "build_character_voice_requirement": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "build_character_voice_requirement",
    ),
    "collect_video_reference_prereq_errors": (
        "ai_anime.modules.production.infrastructure.video_reference_pipeline",
        "collect_video_reference_prereq_errors",
    ),
    "collect_episode_audio_prereq_errors": (
        "ai_anime.modules.production.infrastructure.episode_audio_generation",
        "collect_episode_audio_prereq_errors",
    ),
    "build_episode_audio_generation_plan": (
        "ai_anime.modules.production.infrastructure.episode_audio_generation",
        "build_episode_audio_generation_plan",
    ),
    "dialogue_voice_reference_rows": (
        "ai_anime.modules.production.infrastructure.video_reference_voice_references",
        "dialogue_voice_reference_rows",
    ),
    "file_sha256": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "file_sha256",
    ),
    "generate_video_prompt_for_panel": (
        "ai_anime.modules.production.infrastructure.video_reference_panel_service",
        "generate_video_prompt_for_panel",
    ),
    "get_global_video_optimizer": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "get_global_video_optimizer",
    ),
    "narration_style_prompt": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "narration_style_prompt",
    ),
    "prepare_video_reference_generation_inputs": (
        "ai_anime.modules.production.infrastructure.video_reference_pipeline",
        "prepare_video_reference_generation_inputs",
    ),
    "prepare_global_optimizer_input": (
        "ai_anime.modules.production.infrastructure.global_video_optimizer",
        "prepare_global_optimizer_input",
    ),
    "resolve_character_voice": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "resolve_character_voice",
    ),
    "resolve_narrator_reference_status": (
        "ai_anime.modules.production.infrastructure.video_reference_voice_references",
        "resolve_narrator_reference_status",
    ),
    "resolve_narrator_source": (
        "ai_anime.modules.production.infrastructure.video_reference_voice",
        "resolve_narrator_source",
    ),
    "run_episode_audio_generation": (
        "ai_anime.modules.production.infrastructure.episode_audio_generation",
        "run_episode_audio_generation",
    ),
    "provision_voice_design_requirements": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "provision_voice_design_requirements",
    ),
    "provision_missing_character_voices": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "provision_missing_character_voices",
    ),
    "VoiceDesignModelUnavailable": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "VoiceDesignModelUnavailable",
    ),
    "VoiceDesignProvisioningFailed": (
        "ai_anime.modules.production.infrastructure.voice_design_provisioning",
        "VoiceDesignProvisioningFailed",
    ),
    "VideoReferencePrereqError": (
        "ai_anime.modules.production.infrastructure.video_reference_pipeline",
        "VideoReferencePrereqError",
    ),
    "selected_reference_paths": (
        "ai_anime.modules.production.infrastructure.video_reference_assets",
        "selected_reference_paths",
    ),
}

_LAZY_EXPORTS.update(
    {
        "episode_bgm_path": (
            "ai_anime.modules.production.infrastructure.episode_composition",
            "episode_bgm_path",
        ),
        "episode_composition_is_current": (
            "ai_anime.modules.production.infrastructure.episode_composition",
            "episode_composition_is_current",
        ),
        "generate_episode_bgm": (
            "ai_anime.modules.production.infrastructure.episode_composition",
            "generate_episode_bgm",
        ),
        "write_episode_composition_manifest": (
            "ai_anime.modules.production.infrastructure.episode_composition",
            "write_episode_composition_manifest",
        ),
        "DEFAULT_VIDEO_RESOLUTION": (_MEDIA_SETTINGS, "DEFAULT_VIDEO_RESOLUTION"),
        "FFMPEG_PATH": (_MEDIA_SETTINGS, "FFMPEG_PATH"),
        "IMAGE_DEFAULT_HEIGHT": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_HEIGHT"),
        "IMAGE_DEFAULT_STYLE": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_STYLE"),
        "IMAGE_DEFAULT_WIDTH": (_MEDIA_SETTINGS, "IMAGE_DEFAULT_WIDTH"),
        "MODE_CONFIG": (_MEDIA_SETTINGS, "MODE_CONFIG"),
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
        "SpeechSynthesisClient": (
            f"{_MEDIA_GENERATION}.speech_synthesis",
            "SpeechSynthesisClient",
        ),
        "CharacterImageGenerator": (
            f"{_MEDIA_GENERATION}.character_image_generator",
            "CharacterImageGenerator",
        ),
        "ImageGridGenerator": (
            f"{_MEDIA_GENERATION}.image_grid",
            "ImageGridGenerator",
        ),
        "PROP_REF_IMAGE_SIZE": (
            f"{_MEDIA_GENERATION}.prop_image_generator",
            "PROP_REF_IMAGE_SIZE",
        ),
        "PromptComponents": (
            f"{_MEDIA_GENERATION}.prompt_builder",
            "PromptComponents",
        ),
        "PromptMode": (f"{_MEDIA_GENERATION}.prompt_builder", "PromptMode"),
        "REGEN_MODE_CONFIGS": (
            f"{_MEDIA_GENERATION}.image_grid",
            "REGEN_MODE_CONFIGS",
        ),
        "SKETCH_DEFAULT_MODE_KEY": (
            f"{_MEDIA_GENERATION}.image_grid",
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
        "call_image_generation_api": (
            f"{_MEDIA_GENERATION}.image_grid",
            "call_image_generation_api",
        ),
        "_resolve_scene_prop_asset_refs": (
            f"{_MEDIA_GENERATION}.image_grid",
            "_resolve_scene_prop_asset_refs",
        ),
        "build_beat_sketch_paths": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "build_beat_sketch_paths",
        ),
        "build_prop_reference_prompt": (
            f"{_MEDIA_GENERATION}.prop_image_generator",
            "build_prop_reference_prompt",
        ),
        "build_scene_reference_prompt": (
            f"{_MEDIA_GENERATION}.scene_reference_images",
            "build_scene_reference_prompt",
        ),
        "character_grid_split": (
            f"{_MEDIA_GENERATION}.image_grid",
            "character_grid_split",
        ),
        "combine_to_grid": (f"{_MEDIA_GENERATION}.grid_splitter", "combine_to_grid"),
        "compute_beat_content_hash": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "compute_beat_content_hash",
        ),
        "stale_canonical_sketch_numbers": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "stale_canonical_sketch_numbers",
        ),
        "create_grid_generator": (
            f"{_MEDIA_GENERATION}.image_grid",
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
            f"{_MEDIA_GENERATION}.image_grid",
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
            f"{_MEDIA_GENERATION}.prop_image_generator",
            "generate_prop_reference",
        ),
        "generate_reference_edit_image": (
            f"{_MEDIA_GENERATION}.image_grid",
            "generate_reference_edit_image",
        ),
        "generate_scene_reference_image": (
            f"{_MEDIA_GENERATION}.scene_reference_images",
            "generate_scene_reference_image",
        ),
        "generate_text_to_image": (
            f"{_MEDIA_GENERATION}.image_grid",
            "generate_text_to_image",
        ),
        "get_sketch_nxn_modes": (
            f"{_MEDIA_GENERATION}.image_grid",
            "get_sketch_nxn_modes",
        ),
        "is_pool_image_stale": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "is_pool_image_stale",
        ),
        "load_pool_index": (f"{_MEDIA_GENERATION}.pool_indexer", "load_pool_index"),
        "load_precomputed_panel_detected": (
            f"{_MEDIA_GENERATION}.image_grid",
            "load_precomputed_panel_detected",
        ),
        "normalize_image_size": (
            f"{_MEDIA_GENERATION}.image_grid",
            "normalize_image_size",
        ),
        "normalize_video_title": (
            f"{_MEDIA_GENERATION}.video_composer",
            "normalize_video_title",
        ),
        "perfect_grid_split": (
            f"{_MEDIA_GENERATION}.image_grid",
            "perfect_grid_split",
        ),
        "rebuild_pool_index": (
            f"{_MEDIA_GENERATION}.pool_indexer",
            "rebuild_pool_index",
        ),
        "regenerate_selected_beats": (
            f"{_MEDIA_GENERATION}.image_grid",
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
            f"{_MEDIA_GENERATION}.image_grid",
            "scene_grid_split",
        ),
        "sketch_grid_split": (
            f"{_MEDIA_GENERATION}.image_grid",
            "sketch_grid_split",
        ),
        "sketch_pass1_mode_key": (
            f"{_MEDIA_GENERATION}.image_grid",
            "sketch_pass1_mode_key",
        ),
        "sketch_scene_grid_split": (
            f"{_MEDIA_GENERATION}.image_grid",
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


def video_reference_panel_use_cases() -> VideoReferencePanelUseCases:
    from ai_anime.modules.production.composition import (
        video_reference_panel_use_cases as build,
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
    "EpisodeVisualAssetReadiness",
    "DEFAULT_VIDEO_RESOLUTION",
    "FFMPEG_PATH",
    "IMAGE_DEFAULT_HEIGHT",
    "IMAGE_DEFAULT_STYLE",
    "IMAGE_DEFAULT_WIDTH",
    "MODE_CONFIG",
    "VIDEO_CODEC",
    "AddGeneratedVideoCommand",
    "AssignProjectSketchColorsCommand",
    "AI_IDENTITY_DETECTION_TASK_TYPE",
    "DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND",
    "GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE",
    "GRID_REGENERATION_TASK_TYPE",
    "EPISODE_AUDIO_TASK_TYPE",
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
    "DeleteGridPoolImageCommand",
    "DeletedGridPoolImage",
    "DeletedVideoPoolEntry",
    "CropCurrentSketchCommand",
    "CropVideoReferenceAssetCommand",
    "DetectProjectSketchMarkersCommand",
    "DirectorControlSketchUnavailable",
    "DirectorControlSketchUseCases",
    "EpisodeBeatsMissing",
    "EpisodeAudioBeatMissing",
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
    "GridPoolDeleteRejected",
    "GridEntry",
    "GridRegenerationRejected",
    "GridRegenerationUseCases",
    "GridPoolImageStale",
    "GridPoolImageInUse",
    "GridPoolImageUnavailable",
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
    "RemoveVideoReferenceAssetCommand",
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
    "VideoReferenceMode",
    "VideoReferencePanelBeatMissing",
    "VideoReferencePanelOperationRejected",
    "VideoReferencePanelQuery",
    "VideoReferencePanelUseCases",
    "VideoReferenceAsset",
    "BeatVideoConfig",
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
    "TrimVideoReferenceAudioAssetCommand",
    "UploadVideoReferenceAssetCommand",
    "UploadedBeatPoolImage",
    "UploadBeatPoolImageCommand",
    "UploadedGridImage",
    "UploadGridImageCommand",
    "SelectedVideoPoolEntry",
    "VideoPoolEntryUnavailable",
    "VideoPoolEntryInUse",
    "VideoPoolListing",
    "VideoPoolUseCases",
    "VoiceDesignRequirement",
    "VoiceDesignModelUnavailable",
    "VoiceDesignProvisioningFailed",
    "VideoReferencePrereqError",
    "assign_identity_sketch_colors",
    "apply_style_reference",
    "append_user_video_reference_assets",
    "authoritative_detected_refs_for_beat",
    "build_reference_audio_url",
    "build_episode_identity_alias_map",
    "build_color_appearance_map",
    "build_video_reference_assets",
    "build_character_voice_requirement",
    "build_episode_audio_generation_plan",
    "collect_episode_audio_prereq_errors",
    "collect_video_reference_prereq_errors",
    "collect_prop_marker_ids_from_beat",
    "canonicalize_visual_identity_markers",
    "complete_detected_refs_from_visual_description",
    "director_control_sketch_use_cases",
    "dialogue_voice_reference_rows",
    "dump_video_config",
    "explicit_video_mode",
    "episode_bgm_path",
    "episode_composition_is_current",
    "episode_audio_use_cases",
    "episode_export_use_cases",
    "episode_video_use_cases",
    "extract_char_identities_from_markers",
    "extract_prop_ids_from_markers",
    "file_sha256",
    "generate_video_prompt_for_panel",
    "generate_episode_bgm",
    "get_global_video_optimizer",
    "get_grid_generation_config",
    "global_video_optimization_use_cases",
    "grid_regeneration_use_cases",
    "grid_pool_use_cases",
    "global_prop_marker_colors",
    "image_generation_usage_use_cases",
    "inspect_episode_visual_assets",
    "inspect_project_episode_visual_assets",
    "manual_sketch_regeneration_use_cases",
    "narration_style_prompt",
    "normalize_detected_identities",
    "normalize_detected_props",
    "normalize_video_generation_duration",
    "normalize_video_ratio",
    "normalize_video_audio_type",
    "parse_video_config",
    "prepare_video_reference_generation_inputs",
    "prepare_global_optimizer_input",
    "production_generation_context_use_cases",
    "production_image_settings_use_cases",
    "provision_missing_character_voices",
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
    "run_episode_audio_generation",
    "selected_reference_paths",
    "sketch_generation_use_cases",
    "sketch_edit_execution_use_cases",
    "sketch_editing_use_cases",
    "sketch_marker_use_cases",
    "sketch_marker_detection_task_use_cases",
    "sketch_regen_queue_use_cases",
    "video_api_resolution",
    "video_model_uses_advanced_reference_workflow",
    "video_model_role_for_beat",
    "video_model_role_for_mode",
    "video_model_uses_reference_workflow",
    "video_model_workflow",
    "video_reference_panel_use_cases",
    "selected_regeneration_use_cases",
    "video_resolution",
    "validate_video_resolution_duration",
    "single_video_use_cases",
    "video_pool_use_cases",
    "write_episode_composition_manifest",
    "DEFAULT_NARRATION_STYLE",
    "NARRATION_STYLES",
    "SpeechSynthesisClient",
    "CharacterImageGenerator",
    "ImageGridGenerator",
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
    "call_image_generation_api",
    "_resolve_scene_prop_asset_refs",
    "build_beat_sketch_paths",
    "build_prop_reference_prompt",
    "build_scene_reference_prompt",
    "character_grid_split",
    "combine_to_grid",
    "compute_beat_content_hash",
    "stale_canonical_sketch_numbers",
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
