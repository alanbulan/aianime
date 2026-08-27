"""Runtime composition for the Production bounded context."""

from typing import Any

from ai_anime.modules.model_usage.public import get_usage_meter
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
from ai_anime.modules.production.application.sketch_editing import (
    SketchEditingUseCases,
)
from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentUseCases,
)
from ai_anime.modules.production.application.sketch_marker_detection import (
    SketchMarkerDetectionUseCases,
)
from ai_anime.modules.production.application.sketch_marker_detection_task import (
    SketchMarkerDetectionTaskUseCases,
)
from ai_anime.modules.production.application.sketch_markers import (
    SketchMarkerUseCases,
)
from ai_anime.modules.production.application.sketch_regen_queue import (
    SketchRegenQueueUseCases,
)
from ai_anime.modules.production.application.video_pool import VideoPoolUseCases
from ai_anime.modules.production.application.global_video_optimization import (
    GlobalVideoOptimizationUseCases,
)
from ai_anime.modules.production.application.grid_regeneration import (
    GridRegenerationUseCases,
)
from ai_anime.modules.production.application.grid_pool import GridPoolUseCases
from ai_anime.modules.production.application.manual_sketch_regeneration import (
    ManualSketchRegenerationUseCases,
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
from ai_anime.modules.production.application.sketch_edit_execution import (
    SketchEditExecutionUseCases,
)
from ai_anime.modules.production.infrastructure.sketch_image import (
    PillowSketchImageFiles,
)
from ai_anime.modules.production.infrastructure.image_settings import (
    ExplicitProductionImageModelPolicy,
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
    TaskExecutionEpisodeVideoScheduler,
)
from ai_anime.modules.production.infrastructure.episode_export import (
    LocalEpisodeExportFiles,
)
from ai_anime.modules.production.infrastructure.episode_audio import (
    IndexTTS2EpisodeAudioPlanner,
    ModelUsageEpisodeAudioBilling,
    TaskExecutionEpisodeAudioScheduler,
)
from ai_anime.modules.production.infrastructure.voice_design_provisioning import (
    ModelUsageVoiceDesignProvisioner,
)
from ai_anime.modules.production.infrastructure.director_control_sketch import (
    AssetWorldDirectorControlFrameSource,
    TaskExecutionDirectorControlSketchScheduler,
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
from ai_anime.modules.production.infrastructure.sketch_editing import (
    LocalProductionSketchEditingWorkspace,
)
from ai_anime.modules.production.infrastructure.sketch_marker_detection import (
    GlobalVideoOptimizerSketchMarkerDetector,
    LocalSketchMarkerDetectionFiles,
)
from ai_anime.modules.production.infrastructure.sketch_marker_detection_task import (
    TaskExecutionSketchMarkerDetectionScheduler,
)
from ai_anime.modules.production.infrastructure.sketch_markers import (
    SqliteProductionSketchMarkerWorkspace,
)
from ai_anime.modules.production.infrastructure.video_pool import (
    LocalVideoPoolStorage,
    ProjectStaticMediaUrls,
)
from ai_anime.modules.production.infrastructure.global_video_optimization import (
    LocalEpisodeSketchCatalog,
    SqliteGlobalVideoOptimizationSource,
    TaskExecutionGlobalVideoOptimizationScheduler,
)
from ai_anime.modules.production.infrastructure.grid_regeneration import (
    LocalGridRegenerationPreparer,
    NanoBananaGridRegenerationPlanner,
    TaskExecutionGridRegenerationScheduler,
)
from ai_anime.modules.production.infrastructure.grid_pool import LocalGridPoolGateway
from ai_anime.modules.production.infrastructure.manual_sketch_regeneration import (
    LocalManualSketchRegenerationPreparer,
)
from ai_anime.modules.production.infrastructure.render_planning import (
    EnvironmentRenderPlanAvailability,
    LocalRenderPlanningPreparer,
    NanoBananaRenderPlanEngine,
    TaskExecutionRenderPlanScheduler,
)
from ai_anime.modules.production.infrastructure.seedance2_panel import (
    LocalSeedance2PanelGateway,
)
from ai_anime.modules.production.infrastructure.selected_regeneration import (
    LocalSelectedRegenerationPreparer,
    TaskExecutionSelectedRegenerationScheduler,
)
from ai_anime.modules.production.infrastructure.single_video import (
    LocalSingleVideoPreparer,
    MediaIoBeatAudioDurationSource,
    TaskExecutionSingleVideoScheduler,
)
from ai_anime.modules.production.infrastructure.sketch_generation import (
    LocalSketchGenerationPreparer,
    NanoBananaSketchGridPlanner,
    TaskExecutionSketchGenerationScheduler,
)
from ai_anime.modules.production.infrastructure.sketch_edit_execution import (
    TaskExecutionSketchEditExecutionScheduler,
)
from ai_anime.modules.project_workspace.public import get_user_output_dir
from ai_anime.modules.task_execution.public import project_task_submission_use_cases


def episode_audio_use_cases() -> EpisodeAudioUseCases:
    return EpisodeAudioUseCases(
        SqliteEpisodeBeatSource(),
        IndexTTS2EpisodeAudioPlanner(),
        ModelUsageEpisodeAudioBilling(),
        TaskExecutionEpisodeAudioScheduler(project_task_submission_use_cases()),
        ModelUsageVoiceDesignProvisioner(),
    )


def episode_export_use_cases() -> EpisodeExportUseCases:
    return EpisodeExportUseCases(
        SqliteEpisodeBeatSource(),
        LocalEpisodeExportFiles(),
        LocalFinalEpisodeVideoCatalog(),
    )


def episode_video_use_cases() -> EpisodeVideoUseCases:
    return EpisodeVideoUseCases(
        SqliteEpisodeBeatSource(),
        TaskExecutionEpisodeVideoScheduler(project_task_submission_use_cases()),
        LocalFinalEpisodeVideoCatalog(),
    )


def video_pool_use_cases() -> VideoPoolUseCases:
    return VideoPoolUseCases(
        LocalVideoPoolStorage(),
        ProjectStaticMediaUrls(),
    )


def global_video_optimization_use_cases() -> GlobalVideoOptimizationUseCases:
    return GlobalVideoOptimizationUseCases(
        SqliteGlobalVideoOptimizationSource(),
        LocalEpisodeSketchCatalog(),
        TaskExecutionGlobalVideoOptimizationScheduler(
            project_task_submission_use_cases()
        ),
    )


def grid_regeneration_use_cases() -> GridRegenerationUseCases:
    settings = ProjectConfigProductionSettings()
    return GridRegenerationUseCases(
        LocalGridRegenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ExplicitProductionImageModelPolicy(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            NanoBananaGridRegenerationPlanner(),
        ),
        TaskExecutionGridRegenerationScheduler(project_task_submission_use_cases()),
    )


def grid_pool_use_cases() -> GridPoolUseCases:
    return GridPoolUseCases(LocalGridPoolGateway())


def render_plan_use_cases() -> RenderPlanUseCases:
    settings = ProjectConfigProductionSettings()
    return RenderPlanUseCases(
        EnvironmentRenderPlanAvailability(),
        LocalRenderPlanningPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ExplicitProductionImageModelPolicy(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
        ),
        NanoBananaRenderPlanEngine(),
        TaskExecutionRenderPlanScheduler(project_task_submission_use_cases()),
    )


def seedance2_panel_use_cases() -> Seedance2PanelUseCases:
    return Seedance2PanelUseCases(
        LocalSeedance2PanelGateway(
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
        )
    )


def single_video_use_cases() -> SingleVideoUseCases:
    return SingleVideoUseCases(
        LocalSingleVideoPreparer(
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
            MediaIoBeatAudioDurationSource(),
        ),
        TaskExecutionSingleVideoScheduler(project_task_submission_use_cases()),
    )


def sketch_generation_use_cases() -> SketchGenerationUseCases:
    settings = ProjectConfigProductionSettings()
    return SketchGenerationUseCases(
        LocalSketchGenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ExplicitProductionImageModelPolicy(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
            LocalProductionSketchWorkspace(),
            NanoBananaSketchGridPlanner(),
        ),
        TaskExecutionSketchGenerationScheduler(project_task_submission_use_cases()),
    )


def sketch_edit_execution_use_cases() -> SketchEditExecutionUseCases:
    return SketchEditExecutionUseCases(
        TaskExecutionSketchEditExecutionScheduler(
            project_task_submission_use_cases()
        )
    )


def director_control_sketch_use_cases() -> DirectorControlSketchUseCases:
    return DirectorControlSketchUseCases(
        AssetWorldDirectorControlFrameSource(),
        TaskExecutionDirectorControlSketchScheduler(
            project_task_submission_use_cases()
        ),
    )


def selected_regeneration_use_cases() -> SelectedRegenerationUseCases:
    settings = ProjectConfigProductionSettings()
    return SelectedRegenerationUseCases(
        LocalSelectedRegenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ExplicitProductionImageModelPolicy(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
            AssetWorldRuntimePropMenuSource(),
        ),
        TaskExecutionSelectedRegenerationScheduler(
            project_task_submission_use_cases()
        ),
    )


def manual_sketch_regeneration_use_cases() -> ManualSketchRegenerationUseCases:
    settings = ProjectConfigProductionSettings()
    return ManualSketchRegenerationUseCases(
        LocalManualSketchRegenerationPreparer(
            settings,
            ProductionImageSettingsUseCases(
                settings,
                ExplicitProductionImageModelPolicy(),
            ),
            lambda store, context: production_generation_context_use_cases(
                store,
                context.owner_username,
            ),
        ),
        TaskExecutionSelectedRegenerationScheduler(
            project_task_submission_use_cases()
        ),
    )


def sketch_editing_use_cases() -> SketchEditingUseCases:
    return SketchEditingUseCases(
        LocalProductionSketchEditingWorkspace(),
        SketchPoseEditorUseCases(
            PillowSketchPoseFiles(),
            ModelSketchPoseIdentitySource(),
        ),
        SketchImageUseCases(PillowSketchImageFiles()),
    )


def production_image_settings_use_cases() -> ProductionImageSettingsUseCases:
    return ProductionImageSettingsUseCases(
        ProjectConfigProductionSettings(),
        ExplicitProductionImageModelPolicy(),
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


def sketch_marker_use_cases() -> SketchMarkerUseCases:
    return SketchMarkerUseCases(
        SqliteProductionSketchMarkerWorkspace(),
        SketchColorAssignmentUseCases(
            DomainSketchColorAssigner(),
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
            LocalProductionSketchWorkspace(),
        ),
        SketchMarkerDetectionUseCases(
            CompatibleEpisodeSource(),
            AssetWorldRuntimePropMenuSource(),
            LocalSketchMarkerDetectionFiles(),
            GlobalVideoOptimizerSketchMarkerDetector(),
            get_usage_meter(),
        ),
    )


def sketch_marker_detection_task_use_cases() -> SketchMarkerDetectionTaskUseCases:
    return SketchMarkerDetectionTaskUseCases(
        TaskExecutionSketchMarkerDetectionScheduler(
            project_task_submission_use_cases()
        )
    )


def sketch_regen_queue_use_cases() -> SketchRegenQueueUseCases:
    return SketchRegenQueueUseCases(ProjectConfigProductionSettings())
