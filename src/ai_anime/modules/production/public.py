"""Stable application API for the Production bounded context."""

from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseCandidatesMissing,
    SketchPoseEditorUseCases,
)


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    from ai_anime.modules.production.composition import (
        sketch_pose_editor_use_cases as build,
    )

    return build()


__all__ = [
    "SketchPoseCandidatesMissing",
    "SketchPoseEditorUseCases",
    "sketch_pose_editor_use_cases",
]
