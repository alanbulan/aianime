"""Runtime composition for the Production bounded context."""

from typing import Any

from ai_anime.modules.production.application.episode_audio import (
    EpisodeAudioUseCases,
)
from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.episode_video import (
    EpisodeVideoUseCases,
)
from ai_anime.modules.production.application.episode_export import (
    EpisodeExportUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.image_generation_usage import (
    ImageGenerationUsageUseCases,
)
from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseEditorUseCases,
)
from ai_anime.modules.production.application.sketch_image import (
    SketchImageUseCases,
)
from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentUseCases,
)
from ai_anime.modules.production.application.sketch_marker_detection import (
    SketchMarkerDetectionUseCases,
)
from ai_anime.modules.production.application.sketch_regen_queue import (
    SketchRegenQueueUseCases,
)
from ai_anime.modules.production.application.video_pool import VideoPoolUseCases
from ai_anime.modules.production.infrastructure.sketch_image import (
    PillowSketchImageFiles,
)
from ai_anime.modules.production.infrastructure.image_settings import (
    ConfiguredProductionImageSelections,
    ProjectConfigProductionSettings,
)
from ai_anime.modules.production.infrastructure.image_generation_usage import (
    ConfiguredOperatorPasswordVerifier,
    SqliteProductionImageUsage,
)
from ai_anime.modules.production.infrastructure.generation_context import (
    AssetWorldCharacterProjector,
    CompatibleEpisodeSource,
)
from ai_anime.modules.production.infrastructure.episode_video import (
    LocalFinalEpisodeVideoCatalog,
    SqliteEpisodeBeatSource,
    TaskBackendEpisodeVideoScheduler,
)
from ai_anime.modules.production.infrastructure.episode_export import (
    LocalEpisodeExportFiles,
)
from ai_anime.modules.production.infrastructure.episode_audio import (
    IndexTTS2VoicePrerequisiteChecker,
    TaskBackendEpisodeAudioScheduler,
)
from ai_anime.modules.production.infrastructure.sketch_color import (
    AssetWorldRuntimePropMenuSource,
    DomainSketchColorAssigner,
    LocalProductionSketchWorkspace,
)
from ai_anime.modules.production.infrastructure.sketch_pose import (
    ModelSketchPoseIdentitySource,
    PillowSketchPoseFiles,
)
from ai_anime.modules.production.infrastructure.sketch_marker_detection import (
    GlobalVideoOptimizerSketchMarkerDetector,
    LocalSketchMarkerDetectionFiles,
)
from ai_anime.modules.production.infrastructure.video_pool import (
    LocalVideoPoolStorage,
    ProjectStaticMediaUrls,
)
from ai_anime.modules.project_workspace.public import get_user_output_dir


def episode_audio_use_cases() -> EpisodeAudioUseCases:
    from ai_anime import ports

    return EpisodeAudioUseCases(
        SqliteEpisodeBeatSource(),
        IndexTTS2VoicePrerequisiteChecker(),
        TaskBackendEpisodeAudioScheduler(ports.get_task_backend),
    )


def episode_export_use_cases() -> EpisodeExportUseCases:
    return EpisodeExportUseCases(
        SqliteEpisodeBeatSource(),
        LocalEpisodeExportFiles(),
        LocalFinalEpisodeVideoCatalog(),
    )


def episode_video_use_cases() -> EpisodeVideoUseCases:
    from ai_anime import ports

    return EpisodeVideoUseCases(
        SqliteEpisodeBeatSource(),
        TaskBackendEpisodeVideoScheduler(ports.get_task_backend),
        LocalFinalEpisodeVideoCatalog(),
    )


def video_pool_use_cases() -> VideoPoolUseCases:
    return VideoPoolUseCases(
        LocalVideoPoolStorage(),
        ProjectStaticMediaUrls(),
    )


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    return SketchPoseEditorUseCases(
        PillowSketchPoseFiles(),
        ModelSketchPoseIdentitySource(),
    )


def production_image_settings_use_cases() -> ProductionImageSettingsUseCases:
    return ProductionImageSettingsUseCases(
        ProjectConfigProductionSettings(),
        ConfiguredProductionImageSelections(),
    )


def image_generation_usage_use_cases() -> ImageGenerationUsageUseCases:
    return ImageGenerationUsageUseCases(
        SqliteProductionImageUsage(),
        ConfiguredOperatorPasswordVerifier(),
    )


def production_generation_context_use_cases(
    store: Any,
    username: str,
) -> ProductionGenerationContextUseCases:
    return ProductionGenerationContextUseCases(
        store,
        CompatibleEpisodeSource(),
        DomainSketchColorAssigner(),
        AssetWorldCharacterProjector(get_user_output_dir(username)),
    )


def sketch_color_assignment_use_cases(store: Any) -> SketchColorAssignmentUseCases:
    return SketchColorAssignmentUseCases(
        store,
        DomainSketchColorAssigner(),
        CompatibleEpisodeSource(),
        AssetWorldRuntimePropMenuSource(),
        LocalProductionSketchWorkspace(),
    )


def sketch_marker_detection_use_cases(
    store: Any,
    usage_meter: Any,
) -> SketchMarkerDetectionUseCases:
    return SketchMarkerDetectionUseCases(
        store,
        CompatibleEpisodeSource(),
        AssetWorldRuntimePropMenuSource(),
        LocalSketchMarkerDetectionFiles(),
        GlobalVideoOptimizerSketchMarkerDetector(),
        usage_meter,
    )


def sketch_regen_queue_use_cases() -> SketchRegenQueueUseCases:
    return SketchRegenQueueUseCases(ProjectConfigProductionSettings())


def sketch_image_use_cases() -> SketchImageUseCases:
    return SketchImageUseCases(PillowSketchImageFiles())
