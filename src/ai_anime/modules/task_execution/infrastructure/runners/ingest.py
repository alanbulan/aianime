"""Celery runner for fast novel ingest."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.modules.story_intake.public import IngestionTask
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.public import await_envelope_with_cancel_watch
from ai_anime.modules.task_execution.public import register_project_task_runner
from ai_anime.task_state import get_task_manager


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

    store = await make_cognee_store_for_context(
        ctx,
        text_model=task.text_model,
        embedding_model=task.embedding_model,
    )

    def update(progress: float, task: str) -> None:
        manager.update_progress_for_project(
            ctx,
            "ingest_fast",
            0,
            progress=progress,
            current_task=task,
            logs=[task],
        )

    try:
        result = await store.ingest_novel_fast(
            str(task.novel_path),
            rebuild=bool(task.config.get("rebuild", False)),
            on_progress=update,
            on_log=lambda message: update(0.0, message),
        )
        return {
            **result,
            "model": task.text_model,
            "embedding_model": task.embedding_model,
        }
    finally:
        await store.close()


register_project_task_runner("ingest_fast", run_ingest_fast)
