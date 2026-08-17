"""Celery runner for fast novel ingest."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.modules.story_intake.public import IngestionTask
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import await_envelope_with_cancel_watch
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager


def run_ingest_fast(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_ingest_fast(envelope, ctx),
            envelope,
            task_type="ingest_fast",
        )
    )


async def _run_ingest_fast(envelope: dict[str, Any], ctx: ProjectContext) -> dict[str, Any]:
    from ai_anime.shared.infrastructure.project_stores import (
        make_cognee_store_for_context,
    )

    task = IngestionTask.from_backend_payload(envelope.get("payload") or {})
    manager = get_task_manager()
    current_progress = 0.0

    store = await make_cognee_store_for_context(ctx)

    def update(progress: float, task: str) -> None:
        nonlocal current_progress
        current_progress = max(current_progress, progress)
        manager.update_progress_for_project(
            ctx,
            "ingest_fast",
            0,
            progress=current_progress,
            current_task=task,
            logs=[task],
        )

    def append_log(message: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "ingest_fast",
            0,
            progress=current_progress,
            current_task=message,
            logs=[message],
        )

    try:
        result = await store.ingest_novel_fast(
            str(task.novel_path),
            rebuild=bool(task.config.get("rebuild", False)),
            on_progress=update,
            on_log=append_log,
        )
        return result
    finally:
        await store.close()


register_project_task_runner("ingest_fast", run_ingest_fast)
