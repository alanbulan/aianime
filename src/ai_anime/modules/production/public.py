"""Stable application API for the Production bounded context."""

from typing import Any

from ai_anime.modules.production.application.generation_context import (
    ProductionGenerationContextUseCases,
)
from ai_anime.modules.production.application.image_settings import (
    ProductionImageSettingsRejected,
    ProductionImageSettingsUseCases,
    UpdateRenderImageSettingsCommand,
    UpdateSketchImageSettingsCommand,
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
from ai_anime.modules.production.domain.sketch_color import (
    BRIDGMAN_CHARACTER_PALETTE,
    PROP_MARKER_PALETTE,
    assign_identity_sketch_colors,
    global_prop_marker_colors,
    marker_color_change_requires_sketch_clean,
)


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


def sketch_image_use_cases() -> SketchImageUseCases:
    from ai_anime.modules.production.composition import sketch_image_use_cases as build

    return build()


def sketch_pose_editor_use_cases() -> SketchPoseEditorUseCases:
    from ai_anime.modules.production.composition import (
        sketch_pose_editor_use_cases as build,
    )

    return build()


__all__ = [
    "BRIDGMAN_CHARACTER_PALETTE",
    "CropSketchCommand",
    "DetectSketchMarkersCommand",
    "PROP_MARKER_PALETTE",
    "ProductionGenerationContextUseCases",
    "ProductionImageSettingsRejected",
    "ProductionImageSettingsUseCases",
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
    "UpdateRenderImageSettingsCommand",
    "UpdateSketchImageSettingsCommand",
    "assign_identity_sketch_colors",
    "global_prop_marker_colors",
    "marker_color_change_requires_sketch_clean",
    "production_generation_context_use_cases",
    "production_image_settings_use_cases",
    "sketch_color_assignment_use_cases",
    "sketch_image_use_cases",
    "sketch_marker_detection_use_cases",
    "sketch_pose_editor_use_cases",
]
