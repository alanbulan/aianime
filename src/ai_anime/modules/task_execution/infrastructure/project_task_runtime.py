"""Runtime adapters used by project task execution."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def project_task_timeout_seconds() -> int:
    raw_value = os.environ.get("AI_ANIME_PROJECT_TASK_TIMEOUT_S")
    if raw_value:
        try:
            return int(raw_value)
        except ValueError:
            logger.warning(
                "Invalid AI_ANIME_PROJECT_TASK_TIMEOUT_S=%r; using default",
                raw_value,
            )
    return 30 * 60


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
        render,
        scene_reference,
        script,
        sketch,
        sketch_edit_execute,
        stage_asset,
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
