"""Runtime composition for the Production bounded context."""

from typing import Any

from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsUseCases,
)
from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseEditorUseCases,
)
from ai_anime.modules.production.application.sketch_image import (
    SketchImageUseCases,
)
from ai_anime.modules.production.infrastructure.sketch_image import (
    PillowSketchImageFiles,
)
from ai_anime.modules.production.infrastructure.image_settings import (
    ConfiguredProductionImageSelections,
    ProjectConfigProductionImageSettings,
)
from ai_anime.modules.production.infrastructure.generation_context import (
    AssetWorldCharacterProjector,
    EpisodeOptimizerSketchColorAssigner,
)
from ai_anime.modules.production.infrastructure.sketch_pose import (
    ModelSketchPoseIdentitySource,
    PillowSketchPoseFiles,
)
from ai_anime.modules.project_workspace.public import get_user_output_dir


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    return SketchPoseEditorUseCases(
        PillowSketchPoseFiles(),
        ModelSketchPoseIdentitySource(),
    )


def production_image_settings_use_cases() -> ProductionImageSettingsUseCases:
    return ProductionImageSettingsUseCases(
        ProjectConfigProductionImageSettings(),
        ConfiguredProductionImageSelections(),
    )


def production_generation_context_use_cases(
    store: Any,
    username: str,
) -> ProductionGenerationContextUseCases:
    return ProductionGenerationContextUseCases(
        store,
        EpisodeOptimizerSketchColorAssigner(),
        AssetWorldCharacterProjector(get_user_output_dir(username)),
    )


def sketch_image_use_cases() -> SketchImageUseCases:
    return SketchImageUseCases(PillowSketchImageFiles())
