"""Project task runner for model-backed verification operations."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.modules.task_execution.infrastructure.task_state import get_task_manager
from ai_anime.modules.task_execution.public import (
    await_envelope_with_cancel_watch,
    register_project_task_runner,
)


def run_verification_model(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any] | None:
    return asyncio.run(
        await_envelope_with_cancel_watch(
            _run_verification_model(envelope, context),
            envelope,
            task_type="verification_model",
        )
    )


async def _run_verification_model(
    envelope: dict[str, Any],
    context: ProjectContext,
) -> dict[str, Any]:
    from ai_anime.modules.verification.public import (
        run_verification_model_operation,
    )

    payload = dict(envelope.get("payload") or {})
    operation = str(payload.pop("operation", "")).strip()
    display_name = str(payload.pop("display_name", "模型验证")).strip()
    episode = int(envelope.get("episode") or payload.pop("episode", 0) or 0)
    beat_num_raw = envelope.get("beat_num")
    beat_num = int(beat_num_raw) if beat_num_raw is not None else None
    scope = envelope.get("scope")
    manager = get_task_manager()

    if not operation:
        raise ValueError("验证任务缺少 operation")

    def update(progress: float, current_task: str) -> None:
        manager.update_progress_for_project(
            context,
            "verification_model",
            episode,
            beat_num=beat_num,
            scope=scope,
            progress=progress,
            current_task=current_task,
            logs=[current_task],
        )

    update(0.02, f"开始{display_name}...")
    result = await run_verification_model_operation(
        context=context,
        operation=operation,
        episode=episode,
        beat_num=beat_num,
        payload=payload,
        progress_callback=update,
        log_callback=lambda message: manager.update_progress_for_project(
            context,
            "verification_model",
            episode,
            beat_num=beat_num,
            scope=scope,
            logs=[message],
        ),
    )
    update(0.98, f"{display_name}完成")
    return result


register_project_task_runner("verification_model", run_verification_model)
