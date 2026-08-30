"""Public contract of the Quality Verification module."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

from ai_anime.modules.verification.application.schemas import (
    ColorVerifyRequest,
    CompareRequest,
    ConsistencyVerifyRequest,
    ContinuityRequest,
    ScoreBatchRequest,
    SketchEditExecuteRequest,
    SketchScoreRequest,
    SketchSelectRequest,
    VerifyRequest,
)
from ai_anime.modules.verification.application.model_tasks import (
    ScheduleVerificationModelTask,
    ScheduledVerificationTask,
)


def verification_model_task_scheduler() -> ScheduleVerificationModelTask:
    from ai_anime.modules.task_execution.public import (
        project_task_submission_use_cases,
    )

    return ScheduleVerificationModelTask(project_task_submission_use_cases())

if TYPE_CHECKING:
    from ai_anime.modules.verification.infrastructure.consistency_verifier import (
        ConsistencyVerifier,
    )
    from ai_anime.modules.verification.infrastructure.continuity_verifier import (
        ContinuityVerifier,
    )
    from ai_anime.modules.verification.infrastructure.episode_reviewer import (
        EpisodeReviewer,
    )
    from ai_anime.modules.verification.infrastructure.failure_registry import (
        load_negative_clause_for_project,
    )
    from ai_anime.modules.verification.infrastructure.frame_verifier import FrameVerifier
    from ai_anime.modules.verification.infrastructure.image_verifier import (
        ImageVerifier,
        resolve_verification_scene_context,
    )
    from ai_anime.modules.verification.infrastructure.report_formatter import (
        format_color_verify_report,
        format_consistency_report,
        format_episode_overview_report,
        format_verification_report,
        save_verify_report,
    )
    from ai_anime.modules.verification.infrastructure.similarity_detector import (
        detect_similarity,
    )
    from ai_anime.modules.verification.infrastructure.sketch_color_verifier import (
        verify_episode_sketch_colors,
    )
    from ai_anime.modules.verification.infrastructure.sketch_comparer import SketchComparer
    from ai_anime.modules.verification.infrastructure.sketch_edit_execute import (
        execute_sketch_edit_batches,
        resolve_labels_jsonl,
    )
    from ai_anime.modules.verification.infrastructure.sketch_edit_label_validation import (
        LabelsValidationError,
        validate_labels_jsonl,
    )
    from ai_anime.modules.verification.infrastructure.sketch_scorer import SketchScorer
    from ai_anime.modules.verification.infrastructure.sketch_selector import (
        run_sketch_select,
    )
    from ai_anime.modules.verification.infrastructure.utils import (
        find_frame_for_beat,
        find_sketch_for_beat,
        load_all_beats,
    )
    from ai_anime.modules.verification.infrastructure.task_services import (
        run_verification_model_operation,
    )

_INFRASTRUCTURE = "ai_anime.modules.verification.infrastructure"

_LAZY_EXPORTS = {
    "ConsistencyVerifier": (f"{_INFRASTRUCTURE}.consistency_verifier", "ConsistencyVerifier"),
    "ContinuityVerifier": (f"{_INFRASTRUCTURE}.continuity_verifier", "ContinuityVerifier"),
    "EpisodeReviewer": (f"{_INFRASTRUCTURE}.episode_reviewer", "EpisodeReviewer"),
    "FrameVerifier": (f"{_INFRASTRUCTURE}.frame_verifier", "FrameVerifier"),
    "ImageVerifier": (f"{_INFRASTRUCTURE}.image_verifier", "ImageVerifier"),
    "LabelsValidationError": (
        f"{_INFRASTRUCTURE}.sketch_edit_label_validation",
        "LabelsValidationError",
    ),
    "SketchComparer": (f"{_INFRASTRUCTURE}.sketch_comparer", "SketchComparer"),
    "SketchScorer": (f"{_INFRASTRUCTURE}.sketch_scorer", "SketchScorer"),
    "detect_similarity": (f"{_INFRASTRUCTURE}.similarity_detector", "detect_similarity"),
    "execute_sketch_edit_batches": (
        f"{_INFRASTRUCTURE}.sketch_edit_execute",
        "execute_sketch_edit_batches",
    ),
    "find_frame_for_beat": (f"{_INFRASTRUCTURE}.utils", "find_frame_for_beat"),
    "find_sketch_for_beat": (f"{_INFRASTRUCTURE}.utils", "find_sketch_for_beat"),
    "format_color_verify_report": (
        f"{_INFRASTRUCTURE}.report_formatter",
        "format_color_verify_report",
    ),
    "format_consistency_report": (
        f"{_INFRASTRUCTURE}.report_formatter",
        "format_consistency_report",
    ),
    "format_episode_overview_report": (
        f"{_INFRASTRUCTURE}.report_formatter",
        "format_episode_overview_report",
    ),
    "format_verification_report": (
        f"{_INFRASTRUCTURE}.report_formatter",
        "format_verification_report",
    ),
    "load_all_beats": (f"{_INFRASTRUCTURE}.utils", "load_all_beats"),
    "load_negative_clause_for_project": (
        f"{_INFRASTRUCTURE}.failure_registry",
        "load_negative_clause_for_project",
    ),
    "resolve_labels_jsonl": (
        f"{_INFRASTRUCTURE}.sketch_edit_execute",
        "resolve_labels_jsonl",
    ),
    "resolve_verification_scene_context": (
        f"{_INFRASTRUCTURE}.image_verifier",
        "resolve_verification_scene_context",
    ),
    "run_sketch_select": (f"{_INFRASTRUCTURE}.sketch_selector", "run_sketch_select"),
    "run_verification_model_operation": (
        f"{_INFRASTRUCTURE}.task_services",
        "run_verification_model_operation",
    ),
    "save_verify_report": (f"{_INFRASTRUCTURE}.report_formatter", "save_verify_report"),
    "validate_labels_jsonl": (
        f"{_INFRASTRUCTURE}.sketch_edit_label_validation",
        "validate_labels_jsonl",
    ),
    "verify_episode_sketch_colors": (
        f"{_INFRASTRUCTURE}.sketch_color_verifier",
        "verify_episode_sketch_colors",
    ),
}


def __getattr__(name: str) -> Any:
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = target
    value = getattr(import_module(module_name), attribute_name)
    globals()[name] = value
    return value


__all__ = [
    "ColorVerifyRequest",
    "CompareRequest",
    "ConsistencyVerifier",
    "ConsistencyVerifyRequest",
    "ContinuityRequest",
    "ContinuityVerifier",
    "EpisodeReviewer",
    "FrameVerifier",
    "ImageVerifier",
    "LabelsValidationError",
    "ScoreBatchRequest",
    "ScheduleVerificationModelTask",
    "ScheduledVerificationTask",
    "SketchComparer",
    "SketchEditExecuteRequest",
    "SketchScoreRequest",
    "SketchScorer",
    "SketchSelectRequest",
    "VerifyRequest",
    "detect_similarity",
    "execute_sketch_edit_batches",
    "find_frame_for_beat",
    "find_sketch_for_beat",
    "format_color_verify_report",
    "format_consistency_report",
    "format_episode_overview_report",
    "format_verification_report",
    "load_all_beats",
    "load_negative_clause_for_project",
    "resolve_labels_jsonl",
    "resolve_verification_scene_context",
    "run_sketch_select",
    "run_verification_model_operation",
    "save_verify_report",
    "validate_labels_jsonl",
    "verify_episode_sketch_colors",
    "verification_model_task_scheduler",
]
