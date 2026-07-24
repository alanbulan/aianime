"""Runtime composition for the Production bounded context."""

from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseEditorUseCases,
)
from ai_anime.modules.production.application.sketch_image import (
    SketchImageUseCases,
)
from ai_anime.modules.production.infrastructure.sketch_image import (
    PillowSketchImageFiles,
)
from ai_anime.modules.production.infrastructure.sketch_pose import (
    ModelSketchPoseIdentitySource,
    PillowSketchPoseFiles,
)


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    return SketchPoseEditorUseCases(
        PillowSketchPoseFiles(),
        ModelSketchPoseIdentitySource(),
    )


def sketch_image_use_cases() -> SketchImageUseCases:
    return SketchImageUseCases(PillowSketchImageFiles())
