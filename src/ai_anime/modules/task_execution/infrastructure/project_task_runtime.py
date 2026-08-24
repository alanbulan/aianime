"""Runtime adapters used by project task execution."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_DEFAULT_PROJECT_TASK_TIMEOUT_SECONDS = 30 * 60
_LONG_MEDIA_TASK_TIMEOUT_SECONDS = 2 * 60 * 60
_SCRIPT_WRITER_TIMEOUT_SECONDS = 2 * 60 * 60
_SCRIPT_WORKFLOW_TIMEOUT_SECONDS = 8 * 60 * 60
_PRODUCTION_WORKFLOW_TIMEOUT_SECONDS = 24 * 60 * 60
_LONG_RUNNING_TASK_TYPES = frozenset(
    {
        "script_writer",
        "literal_script_writer",
        "script_workflow",
        "production_workflow",
    }
)
_LONG_MEDIA_TASK_TYPES = frozenset({"selected_regen", "sketch_regen"})


def project_task_timeout_seconds(task_type: str | None = None) -> int:
    normalized_task_type = str(task_type or "").strip()
    if normalized_task_type == "production_workflow":
        default_timeout = _PRODUCTION_WORKFLOW_TIMEOUT_SECONDS
    elif normalized_task_type == "script_workflow":
        default_timeout = _SCRIPT_WORKFLOW_TIMEOUT_SECONDS
    elif normalized_task_type in _LONG_MEDIA_TASK_TYPES:
        default_timeout = _LONG_MEDIA_TASK_TIMEOUT_SECONDS
    elif normalized_task_type in _LONG_RUNNING_TASK_TYPES:
        default_timeout = _SCRIPT_WRITER_TIMEOUT_SECONDS
    else:
        default_timeout = _DEFAULT_PROJECT_TASK_TIMEOUT_SECONDS
    raw_value = os.environ.get("AI_ANIME_PROJECT_TASK_TIMEOUT_S")
    if raw_value:
        try:
            return int(raw_value)
        except ValueError:
            logger.warning(
                "Invalid AI_ANIME_PROJECT_TASK_TIMEOUT_S=%r; using default",
                raw_value,
            )
    return default_timeout


def ensure_builtin_runners_registered() -> None:
    from ai_anime.modules.task_execution.infrastructure.runners import (  # noqa: F401
        audio,
        character_image,
        episode_assets,
        freezone,
        graph_build,
        identity,
        ingest,
        prop_reference,
        production_workflow,
        render,
        scene_reference,
        script,
        script_workflow,
        sketch,
        sketch_edit_execute,
        stage_asset,
        style_preview,
        video,
    )


def project_task_run_context(task_id: str):
    from ai_anime.modules.task_execution.infrastructure.task_state import (
        project_task_run_context as task_run_context,
    )

    return task_run_context(task_id)


__all__ = [
    "ensure_builtin_runners_registered",
    "project_task_run_context",
    "project_task_timeout_seconds",
]
