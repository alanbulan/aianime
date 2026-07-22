"""Celery runner for sketch edit execute jobs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.project_context import ProjectContext
from ai_anime.task_backend.cancel import raise_if_envelope_cancel_requested
from ai_anime.task_backend.registry import register_project_task_runner
from ai_anime.task_state import get_task_manager
from ai_anime.verification.sketch_edit_execute import (
    execute_sketch_edit_batches,
    resolve_labels_jsonl,
)


def run_sketch_edit_execute(
    envelope: dict[str, Any],
    ctx: ProjectContext,
) -> dict[str, Any] | None:
    payload = envelope.get("payload") or {}
    episode = int(payload.get("episode") or envelope.get("episode") or 0)
    project_dir = Path(str(payload.get("project_dir") or ctx.output_dir))
    labels_name = str(payload.get("labels_name") or "labels.jsonl")
    labels_path = resolve_labels_jsonl(project_dir, episode, labels_name=labels_name)
    scope = envelope.get("scope")
    manager = get_task_manager()

    def check_cancel() -> None:
        raise_if_envelope_cancel_requested(
            envelope,
            task_type="sketch_edit_execute",
            scope=scope,
        )

    def update(progress: float, current_task: str) -> None:
        check_cancel()
        manager.update_progress_for_project(
            ctx,
            "sketch_edit_execute",
            episode,
            scope=scope,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    def log(message: str) -> None:
        update(0.0, message)

    update(0.01, "启动 sketch edit execute...")
    result = execute_sketch_edit_batches(
        project_dir=project_dir,
        episode_num=episode,
        labels_path=labels_path,
        progress_callback=update,
        log_callback=log,
    )
    check_cancel()
    return result


register_project_task_runner("sketch_edit_execute", run_sketch_edit_execute)
