"""Stable application API for the Production bounded context."""

from typing import Any

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
    EpisodeAudioBeatMissing,
    EpisodeAudioBeatsMissing,
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
from ai_anime.modules.production.application.sketch_image import (
    CropSketchCommand,
    SketchCropRejected,
    SketchImageUseCases,
)
from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseCandidatesMissing,
    SketchPoseEditorUseCases,
)
from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentResult,
    SketchColorAssignmentUseCases,
    SketchColorMarkersMissing,
)
from ai_anime.modules.production.application.sketch_marker_detection import (
    DetectSketchMarkersCommand,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchMarkerDetectionResult,
    SketchMarkerDetectionUseCases,
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
from ai_anime.modules.production.application.video_backend_catalog import (
    VideoBackendCatalogUseCases,
    VideoBackendOption,
)
from ai_anime.modules.production.application.global_video_optimization import (
    GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE,
    GlobalVideoOptimizationBeatsMissing,
    GlobalVideoOptimizationSketchesMissing,
    GlobalVideoOptimizationUseCases,
    OptimizeEpisodeVideoCommand,
    ScheduledGlobalVideoOptimization,
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
from ai_anime.modules.production.domain.video_backend import (
    DEFAULT_VIDEO_BACKEND,
    grok_video_ratio,
    grok_video_resolution,
    happyhorse_ratio,
    happyhorse_resolution,
    is_grok_video_backend,
    is_happyhorse_backend,
    is_seedance2_backend,
    seedance2_api_resolution,
    seedance2_resolution,
)
from ai_anime.modules.production.domain.sketch_color import (
    BRIDGMAN_CHARACTER_PALETTE,
    PROP_MARKER_PALETTE,
    assign_identity_sketch_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)


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


def video_backend_catalog_use_cases() -> VideoBackendCatalogUseCases:
    from ai_anime.modules.production.composition import (
        video_backend_catalog_use_cases as build,
    )

    return build()


def global_video_optimization_use_cases() -> GlobalVideoOptimizationUseCases:
    from ai_anime.modules.production.composition import (
        global_video_optimization_use_cases as build,
    )

    return build()


def seedance2_panel_use_cases() -> Seedance2PanelUseCases:
    from ai_anime.modules.production.composition import seedance2_panel_use_cases as build

    return build()


def single_video_use_cases() -> SingleVideoUseCases:
    from ai_anime.modules.production.composition import single_video_use_cases as build

    return build()


def sketch_generation_use_cases() -> SketchGenerationUseCases:
    from ai_anime.modules.production.composition import (
        sketch_generation_use_cases as build,
    )

    return build()


def director_control_sketch_use_cases() -> DirectorControlSketchUseCases:
    from ai_anime.modules.production.composition import (
        director_control_sketch_use_cases as build,
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


def sketch_color_assignment_use_cases(store: Any) -> SketchColorAssignmentUseCases:
    from ai_anime.modules.production.composition import (
        sketch_color_assignment_use_cases as build,
    )

    return build(store)


def sketch_marker_detection_use_cases(
    store: Any,
    usage_meter: Any,
) -> SketchMarkerDetectionUseCases:
    from ai_anime.modules.production.composition import (
        sketch_marker_detection_use_cases as build,
    )

    return build(store, usage_meter)


def sketch_regen_queue_use_cases() -> SketchRegenQueueUseCases:
    from ai_anime.modules.production.composition import (
        sketch_regen_queue_use_cases as build,
    )

    return build()


def sketch_image_use_cases() -> SketchImageUseCases:
    from ai_anime.modules.production.composition import sketch_image_use_cases as build

    return build()


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    from ai_anime.modules.production.composition import (
        sketch_pose_editor_use_cases as build,
    )

    return build()


__all__ = [
    "AddGeneratedVideoCommand",
    "DEFAULT_VIDEO_BACKEND",
    "DIRECTOR_CONTROL_TO_SKETCH_TASK_KIND",
    "GLOBAL_VIDEO_OPTIMIZATION_TASK_TYPE",
    "INDEXTTS2_AUDIO_TASK_TYPE",
    "SKETCH_GENERATION_TASK_TYPE",
    "SINGLE_VIDEO_TASK_TYPE",
    "AudioVoicePrerequisitesMissing",
    "BRIDGMAN_CHARACTER_PALETTE",
    "ComposeEpisodeVideoCommand",
    "CropSketchCommand",
    "CropSeedance2AssetCommand",
    "DetectSketchMarkersCommand",
    "DirectorControlSketchUnavailable",
    "DirectorControlSketchUseCases",
    "EpisodeBeatsMissing",
    "EpisodeAudioBeatMissing",
    "EpisodeAudioBeatsMissing",
    "EpisodeAudioUseCases",
    "EpisodeExportUseCases",
    "EpisodeFileExport",
    "EpisodeScriptBeatsMissing",
    "EpisodeSubtitlesMissing",
    "EpisodeTextExport",
    "EpisodeVideoUseCases",
    "FinalEpisodeVideoStatus",
    "FinalEpisodeVideoMissing",
    "GenerateEpisodeAudioCommand",
    "GenerateDirectorControlSketchCommand",
    "GenerateSketchesCommand",
    "GenerateSingleVideoCommand",
    "GlobalVideoOptimizationBeatsMissing",
    "GlobalVideoOptimizationSketchesMissing",
    "GlobalVideoOptimizationUseCases",
    "ImageGenerationGuardQuery",
    "ImageGenerationUsageUseCases",
    "PROP_MARKER_PALETTE",
    "ProductionGenerationContextUseCases",
    "ProductionImageSettingsRejected",
    "ProductionImageSettingsUseCases",
    "OptimizeEpisodeVideoCommand",
    "ReplaceSketchRegenQueueCommand",
    "RemoveSeedance2AssetCommand",
    "ScheduledEpisodeVideo",
    "ScheduledEpisodeAudio",
    "ScheduledGlobalVideoOptimization",
    "ScheduledDirectorControlSketch",
    "ScheduledSketchGeneration",
    "ScheduledSingleVideo",
    "Seedance2PanelBeatMissing",
    "Seedance2PanelOperationRejected",
    "Seedance2PanelQuery",
    "Seedance2PanelUseCases",
    "SingleVideoRejected",
    "SingleVideoUseCases",
    "SketchGenerationRejected",
    "SketchGenerationUseCases",
    "SketchCropRejected",
    "SketchColorAssignmentResult",
    "SketchColorAssignmentUseCases",
    "SketchColorMarkersMissing",
    "SketchImageUseCases",
    "SketchMarkerDetectionFailed",
    "SketchMarkerDetectionRejected",
    "SketchMarkerDetectionResult",
    "SketchMarkerDetectionUseCases",
    "SketchPoseCandidatesMissing",
    "SketchPoseEditorUseCases",
    "SketchRegenQueueResult",
    "SketchRegenQueueUseCases",
    "UpdateRenderImageSettingsCommand",
    "UpdateSketchImageSettingsCommand",
    "TrimSeedance2AudioAssetCommand",
    "UploadSeedance2AssetCommand",
    "SelectedVideoPoolEntry",
    "VideoPoolEntryUnavailable",
    "VideoPoolListing",
    "VideoPoolUseCases",
    "VideoBackendCatalogUseCases",
    "VideoBackendOption",
    "assign_identity_sketch_colors",
    "director_control_sketch_use_cases",
    "episode_audio_use_cases",
    "episode_export_use_cases",
    "episode_video_use_cases",
    "grok_video_ratio",
    "grok_video_resolution",
    "global_video_optimization_use_cases",
    "happyhorse_ratio",
    "happyhorse_resolution",
    "global_prop_marker_colors",
    "image_generation_usage_use_cases",
    "is_grok_video_backend",
    "is_happyhorse_backend",
    "is_seedance2_backend",
    "marker_color_change_requires_sketch_clean",
    "production_generation_context_use_cases",
    "production_image_settings_use_cases",
    "sketch_color_assignment_use_cases",
    "sketch_generation_use_cases",
    "sketch_image_use_cases",
    "sketch_marker_detection_use_cases",
    "sketch_pose_editor_use_cases",
    "sketch_regen_queue_use_cases",
    "seedance2_api_resolution",
    "seedance2_panel_use_cases",
    "seedance2_resolution",
    "single_video_use_cases",
    "video_backend_catalog_use_cases",
    "video_pool_use_cases",
]
