"""Stable application API for the Production bounded context."""

from ai_anime.modules.production.application.sketch_image import (
    CropSketchCommand,
    SketchCropRejected,
    SketchImageUseCases,
)
from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseCandidatesMissing,
    SketchPoseEditorUseCases,
)


def sketch_image_use_cases() -> SketchImageUseCases:
    from ai_anime.modules.production.composition import sketch_image_use_cases as build

    return build()


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    from ai_anime.modules.production.composition import (
        sketch_pose_editor_use_cases as build,
    )

    return build()


__all__ = [
    "CropSketchCommand",
    "SketchCropRejected",
    "SketchImageUseCases",
    "SketchPoseCandidatesMissing",
    "SketchPoseEditorUseCases",
    "sketch_image_use_cases",
    "sketch_pose_editor_use_cases",
]
