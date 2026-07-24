"""Runtime composition for the Production bounded context."""

from typing import Any

from ai_anime.modules.production.application.director_control_sketch import (
    DirectorControlSketchUseCases,
)
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
from ai_anime.modules.production.application.video_backend_catalog import (
    VideoBackendCatalogUseCases,
)
from ai_anime.modules.production.application.global_video_optimization import (
    GlobalVideoOptimizationUseCases,
)
from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationUseCases,
)
from ai_anime.modules.production.application.render_planning import (
    RenderPlanUseCases,
)
from ai_anime.modules.production.application.seedance2_panel import (
    Seedance2PanelUseCases,
)
from ai_anime.modules.production.application.selected_regeneration import (
    SelectedRegenerationUseCases,
)
from ai_anime.modules.production.application.single_video import (
    SingleVideoUseCases,
)
from ai_anime.modules.production.application.sketch_generation import (
    SketchGenerationUseCases,
)
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
from ai_anime.modules.production.infrastructure.director_control_sketch import (
    AssetWorldDirectorControlFrameSource,
    TaskBackendDirectorControlSketchScheduler,
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
from ai_anime.modules.production.infrastructure.video_backend_catalog import (
    ConfiguredVideoBackendSource,
)
from ai_anime.modules.production.infrastructure.global_video_optimization import (
    LocalEpisodeSketchCatalog,
    SqliteGlobalVideoOptimizationSource,
    TaskBackendGlobalVideoOptimizationScheduler,
)
from ai_anime.modules.production.infrastructure.grid_regeneration import (
    LocalGridRegenerationPreparer,
    NanoBananaGridRegenerationPlanner,
    TaskBackendGridRegenerationScheduler,
)
from ai_anime.modules.production.infrastructure.render_planning import (
    EnvironmentRenderPlanAvailability,
    LocalRenderPlanningPreparer,
    NanoBananaRenderPlanEngine,
    TaskBackendRenderPlanScheduler,
)
from ai_anime.modules.production.infrastructure.seedance2_panel import (
    LocalSeedance2PanelGateway,
)
from ai_anime.modules.production.infrastructure.selected_regeneration import (
    LocalSelectedRegenerationPreparer,
    TaskBackendSelectedRegenerationScheduler,
)
from ai_anime.modules.production.infrastructure.single_video import (
    LocalSingleVideoPreparer,
    MediaIoBeatAudioDurationSource,
    TaskBackendSingleVideoScheduler,
)
from ai_anime.modules.production.infrastructure.sketch_generation import (
    LocalSketchGenerationPreparer,
    NanoBananaSketchGridPlanner,
    TaskBackendSketchGenerationScheduler,
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


def video_backend_catalog_use_cases() -> VideoBackendCatalogUseCases:
    return VideoBackendCatalogUseCases(ConfiguredVideoBackendSource())


def global_video_optimization_use_cases() -> GlobalVideoOptimizationUseCases:
    from ai_anime import ports

    return GlobalVideoOptimizationUseCases(
        SqliteGlobalVideoOptimizationSource(),
        LocalEpisodeSketchCatalog(),
        TaskBackendGlobalVideoOptimizationScheduler(ports.get_task_backend),
    )


def grid_regeneration_use_cases() -> GridRegenerationUseCases:
    from ai_anime import ports

    settings = ProjectConfigProductionSettings()
    return GridRegenerationUseCases(
        LocalGridRegenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ConfiguredProductionImageSelections(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            NanoBananaGridRegenerationPlanner(),
        ),
        TaskBackendGridRegenerationScheduler(ports.get_task_backend),
    )


def render_plan_use_cases() -> RenderPlanUseCases:
    from ai_anime import ports

    settings = ProjectConfigProductionSettings()
    return RenderPlanUseCases(
        EnvironmentRenderPlanAvailability(),
        LocalRenderPlanningPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ConfiguredProductionImageSelections(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
        ),
        NanoBananaRenderPlanEngine(),
        TaskBackendRenderPlanScheduler(ports.get_task_backend),
    )


def seedance2_panel_use_cases() -> Seedance2PanelUseCases:
    return Seedance2PanelUseCases(
        LocalSeedance2PanelGateway(
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
        )
    )


def single_video_use_cases() -> SingleVideoUseCases:
    from ai_anime import ports

    return SingleVideoUseCases(
        LocalSingleVideoPreparer(
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
            MediaIoBeatAudioDurationSource(),
        ),
        TaskBackendSingleVideoScheduler(ports.get_task_backend),
    )


def sketch_generation_use_cases() -> SketchGenerationUseCases:
    from ai_anime import ports

    settings = ProjectConfigProductionSettings()
    return SketchGenerationUseCases(
        LocalSketchGenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ConfiguredProductionImageSelections(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
            LocalProductionSketchWorkspace(),
            NanoBananaSketchGridPlanner(),
        ),
        TaskBackendSketchGenerationScheduler(ports.get_task_backend),
    )


def director_control_sketch_use_cases() -> DirectorControlSketchUseCases:
    from ai_anime import ports

    return DirectorControlSketchUseCases(
        AssetWorldDirectorControlFrameSource(),
        TaskBackendDirectorControlSketchScheduler(ports.get_task_backend),
    )


def selected_regeneration_use_cases() -> SelectedRegenerationUseCases:
    from ai_anime import ports

    settings = ProjectConfigProductionSettings()
    return SelectedRegenerationUseCases(
        LocalSelectedRegenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ConfiguredProductionImageSelections(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
        ),
        TaskBackendSelectedRegenerationScheduler(ports.get_task_backend),
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
